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
  var self = this;

  var onStop = function(ref) {
    var err = self.deleteChild(ref.idx);

    if(typeof err === 'object') {
      throw err;
    }
  };

  EventEmitter.call(this);

  //list of child specs
  this.children = [];

  opts = opts || {};
  this.maxRetries = opts.maxRetries || 3;
  this.maxTime = opts.maxTime = 3;

  this.on('stopped', onStop);
};

util.inherits(Supervisor, EventEmitter);

/*
 * On success, returns the child's index
 * On failure, returns Error
 */
Supervisor.prototype.startChild = function(spec) {
  var args;
  var idx;
  var self = this;

  if(!this.checkChildSpecs([spec])) {
    return new Error('Invalid spec');
  }

  spec.state = CHILD_STATES.starting;
  idx = this.children.push(spec) - 1;

  this.emit('starting', { id: spec.id });

  args = [ spec.path ];
  
  if(spec.args) {
    args = args.concat(spec.args);
  }

  spec.process = spawn('node', args, { stdio: 'ignore' });

  spec.process.on('exit', function(code, signal) {
    self.children[idx].state = CHILD_STATES.stopped;

    self.emit('stopped',
      { id: spec.id, idx: idx },
      { code: code, signal: signal });
  });

  this.children[idx].state = CHILD_STATES.running;
  this.emit('running', { id: spec.id, idx: idx });

  return idx;
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
    this.children[idx].state = CHILD_STATES.stopping;

    this.emit('stopping', {
      id: this.children[idx].id, 
      idx: idx });

    this.children[idx].process.kill();
  }

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

  delete this.children[idx];

  return false;
};

Supervisor.prototype.restartChild = function(idx) {

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
