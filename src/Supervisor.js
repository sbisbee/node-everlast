var util = require('util');
var EventEmitter = require('events').EventEmitter;
var spawn = require('child_process').spawn;

// Progressive states of a child. The keys are also Supervisor events.
var CHILD_STATES = {
  //invoked childStart()
  'starting': 10,

  //as of 'start' event
  'running': 20,

  //invoked restartChild(), might be starting or stopping
  'restarting': 30,

  //invoked childStop()
  'stopping': 40,

  //as of 'stop' event, before deletion
  'stopped': 50
};

/*
 * opts:
 *   - maxRetries = int
 *   - maxTime = int
 *   - restartStrategy = object
 */
//TODO document events' args
var Supervisor = function(opts) {
  var onStopped = function(ref) {
    var err;
    var fun;

    this.emit('debug', [ 'onStopped', ref.idx, this.children[ref.idx].state ]);

    switch(this.children[ref.idx].state) {
      case CHILD_STATES.stopped:
        fun = this.deleteChild;
        break;

      case CHILD_STATES.restarting:
        fun = this.startChild;
        break;

      default:
        this.emit('error', new Error('onStopped unexpected event state'));
        return;
    }

    err = fun.call(this, ref.idx);

    if(err) {
      this.emit('error', err);
    }
  };

  EventEmitter.call(this);

  //list of child specs
  this.children = [];

  opts = opts || {};
  this.maxRetries = opts.maxRetries || 3;
  this.maxTime = opts.maxTime = 3;

  this.on('stopped', onStopped.bind(this));
};

util.inherits(Supervisor, EventEmitter);

/*
 * On success, returns false
 * On failure, returns Error
 */
Supervisor.prototype.startChild = function(spec) {
  var args;
  var idx;

  var onExit = function(code, signal) {
    if(this.children[idx].state !== CHILD_STATES.restarting) {
      this.children[idx].state = CHILD_STATES.stopped;
    }

    this.emit('stopped',
      { id: this.children[idx].id, idx: idx },
      { code: code, signal: signal });
  };

  if(typeof spec === 'number') {
    //restarting
    idx = spec;

    if(!this.children[idx]) {
      return new Error('Child not found');
    }
    else if(this.children[idx].state !== CHILD_STATES.restarting) {
      return new Error('That child is not restarting');
    }

    this.children[idx].process.removeAllListeners();
    this.children[idx].process = null;
  }
  else if(this.checkChildSpecs([ spec ])) {
    idx = this.children.push(spec) - 1;
    this.children[idx].state = CHILD_STATES.starting;
  }
  else {
    return new Error('Invalid spec');
  }

  //shouldn't be using local spec from now on - can makes things confusing
  spec = null;

  this.emit('starting', { id: this.children[idx].id });

  args = [ this.children[idx].path ];
  
  if(this.children[idx].args) {
    args = args.concat(this.children[idx].args);
  }

  this.children[idx].state = CHILD_STATES.running;

  this.children[idx].process = spawn('node', args, { stdio: 'ignore' });
  this.children[idx].process.on('exit', onExit.bind(this));

  this.emit('running', {
    id: this.children[idx].id,
    idx: idx,
    pid: this.children[idx].process.pid });

  return false;
};

/*
 * Takes the child index and stops it.
 *
 * If success, returns false (includes the child already being stopped)
 * If failure, returns Error (ex., couldn't find the child)
 */
Supervisor.prototype.stopChild = function(idx) {
  var spec;

  if(typeof idx !== 'number') {
    return new TypeError('Invalid idx');
  }
 
  if(!this.children[idx]) {
    return new Error('Child not found');
  }

  if(this.children[idx].state === CHILD_STATES.running) {
    this.emit('debug', ['stopChild()', 'was running, setting to stopping']);
    this.children[idx].state = CHILD_STATES.stopping;
  }
  else if(this.children[idx].state !== CHILD_STATES.restarting) {
    return new Error('Child is not running or restarting');
  }

  this.emit('debug', ['stopChild()', idx, this.children[idx].state]);

  this.emit('stopping', {
    id: this.children[idx].id, 
    idx: idx,
    pid: this.children[idx].process.pid });

  this.children[idx].process.kill();

  return false;
};

/*
 * Deletes the child at a given index, but only if it's stopped. Typically only
 * used by Supervisor internals.
 *
 * No child living at an index is considered a success.
 *
 * If success, return false.
 * If failure, return Error
 */
Supervisor.prototype.deleteChild = function(idx) {
  if(!this.children[idx]) {
    return false;
  }

  if(this.children[idx].state !== CHILD_STATES.stopped) {
    return new Error('Child is not stopped');
  }

  this.children[idx] = null;

  return false;
};

/*
 * If successfully starts process, return false.
 * If fails to start process, returns true.
 * If fails asynchronously fails, emits an error.
 */
Supervisor.prototype.restartChild = function(idx) {
  var err;

  if(!this.children[idx]) {
    return new Error('Child not found');
  }

  if(this.children[idx].state !== CHILD_STATES.running) {
    return new Error('Child not running');
  }

  this.children[idx].state = CHILD_STATES.restarting;

  this.emit('restarting', {
    id: this.children[idx].id,
    idx: idx });

  err = this.stopChild(idx);

  if(err) {
    this.emit('error', err);
    return err;
  }

  return false;
};

/*
 * Loops over the children and counts them. This is because we use `delete` on
 * the children array when stopping them - stopChild() speed is more important
 * than countChildren() speed, hence no array splicing in stopChild().
 */
Supervisor.prototype.countChildren = function() {
  //cannot do Array.length because we `delete` children on stop (dele
  var count = 0;

  this.children.forEach(function(kid) {
    if(kid) {
      count++;
    }
  });

  return count;
};

/*
 * child spec:
 *   - id = string
 *   - start = string (path)
 *   - args = array
 *
 *   - process = ChildProcess object, added by supervisor only
 *   - state = current CHILD_STATES, touched by supervisor only
 */
Supervisor.prototype.checkChildSpecs = function(specs) {
  if(!util.isArray(specs)) {
    throw new TypeError('specs must be an array');
  }

  //TODO implement
  return true;
};

module.exports = Supervisor;