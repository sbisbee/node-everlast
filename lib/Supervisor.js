var util = require('util');
var EventEmitter = require('events').EventEmitter;
var spawn = require('child_process').spawn;

var restartStrategies = require('./restartStrategies');

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

//while dirty, this is the fastest way to do a deep clone
var cloneObject = function(obj) {
  return JSON.parse(JSON.stringify(obj));
};

var extendObject = function(dst, src) {
  var i;

  if(typeof src === 'object') {
    for(i in src) {
      if(src.hasOwnProperty(i)) {
        dst[i] = src[i];
      }
    }
  }

  return dst;
};

var Supervisor = function(restartStrategy, maxR, maxT) {
  var onStopped = function(ref) {
    var err;
    var fun;

    this.emit('debug', [ 'onStopped', ref.idx, this.children[ref.idx].state ]);

    switch(this.children[ref.idx].state) {
      case CHILD_STATES.stopped:
        //TODO implement maxRetries and maxTime
        if(this.restartStrategy) {
          this.restartStrategy.process(ref.idx);
        }
        else {
          this.emit('debug', 'no restartStrategy onStopped');
        }

        break;

      case CHILD_STATES.restarting:
        err = this.startChild.call(this, ref.idx);

        if(err) {
          this.emit('error', err);
        }
        break;

      default:
        this.emit('error', new Error('onStopped unexpected event state'));
        return;
    }
  };

  EventEmitter.call(this);

  //list of child specs
  this.children = [];

  //the strat will take care of default maxR and maxT
  this.restartStrategy = new (restartStrategy || restartStrategies.OneForOne)(this, maxR, maxT);

  this.on('stopped', onStopped.bind(this));
};

util.inherits(Supervisor, EventEmitter);

/*
 * Starts the child. If a spec is passed, then a new child is added and
 * started. If a number is passed, then we attempt to start an existing child
 * at that index - this only works if the child is stopped or as part of the
 * restarting flow.
 *
 * It is not recommended that you attempt to start an existing child yourself -
 * calling restartChild() is safer.
 *
 * On success, returns false
 * On failure, returns Error
 */
Supervisor.prototype.startChild = function(spec) {
  var args;
  var idx;
  var env;

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
    else if(this.children[idx].state !== CHILD_STATES.stopped &&
        this.children[idx].state !== CHILD_STATES.restarting) {
      return new Error('That child is not stopped or restarting');
    }

    this.children[idx].process.removeAllListeners();
    this.children[idx].process = null;
  }
  else if(this.checkChildSpecs([ spec ])) {
    idx = this.children.push(cloneObject(spec)) - 1;
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

  //make sure we pass on the current process's env vars, plus our own
  env = extendObject(this.children[idx].env || {}, cloneObject(process.env));
  env.EVERLAST_ID = this.children[idx].id;
  env.EVERLAST_IDX = idx;

  this.children[idx].state = CHILD_STATES.running;

  this.children[idx].process = spawn('node', args, { env: env });
  this.children[idx].process.on('exit', onExit.bind(this));
  this.children[idx].process.stdout.pipe(process.stdout);
  this.children[idx].process.stderr.pipe(process.stderr);

  this.emit('running', {
    id: this.children[idx].id,
    idx: idx,
    pid: this.children[idx].process.pid });

  return false;
};

/*
 * Takes the child index and restarts it, but only if it's running or stopped.
 *
 * If the child is already stopped, then a 'stopped' event is still emitted and
 * 'false' is returned.
 *
 * If success, returns false
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

  this.emit('debug', ['stopChild()', idx, this.children[idx].state]);

  if(this.children[idx].state >= CHILD_STATES.stopping) {
    this.emit('stopped', {
      id: this.children[idx].id,
      idx: idx,
      pid: this.children[idx].process.pid });

    return false;
  }

  if(this.children[idx].state < CHILD_STATES.running) {
    return new Error('Cannot stop a child before it is running');
  }

  if(this.children[idx].state !== CHILD_STATES.restarting) {
    this.children[idx].state = CHILD_STATES.stopping;
  }

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

  if(this.children[idx].state !== CHILD_STATES.running &&
      this.children[idx].state !== CHILD_STATES.stopped) {
    return new Error('Child must be running or stopped');
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
 * Assumes you will never want to start another child, whether it's already
 * added or not.
 *
 * Iterates right-to-left across the children and stops them. If stopChild()
 * returns an error then it will be emit()'d.
 *
 * You can pass an array of indexes to ignore. Ex., if you want to stop all
 * children except indexes 2 and 5, then `sup.stopAllChildren([2, 5])`
 *
 * WARNING: This unsets the restart strategy.
 *
 * Returns false on success, stopChild() errors will be emit()'d
 * Returns Error on failure, such as if you pass a non-null and non-array
 */

Supervisor.prototype.stopAllChildren = function(idxIgnores) {
  var idx;
  var err;

  if(!idxIgnores) {
    idxIgnores = [];
  }
  else if(!util.isArray(idxIgnores)) {
    return new Error('idxIgnores must be an array or null');
  }

  this.restartStrategy = null;

  for(idx = this.children.length - 1; idx >= 0; idx--) {
    if(this.children[idx] && idxIgnores.indexOf(idx) < 0) {
      this.emit('debug', ['stopAllChildren()', idx]);

      err = this.stopChild(idx);

      if(err) {
        this.emit('error', err);
      }
    }
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
 *   - path = string
 *   - args = array
 *
 *   - process = ChildProcess object, added by supervisor only
 *   - state = current CHILD_STATES, touched by supervisor only
 */
Supervisor.prototype.checkChildSpecs = function(specs) {
  var i;
  var val;
  var key;
  var ranOnce = false;

  if(!util.isArray(specs)) {
    throw new TypeError('specs must be an array');
  }

  //loop the array - would Array.forEach but we want to return mid-loop
  for(i = 0; i < specs.length; i++) {
    ranOnce = false;

    //loop the spec object's properties
    for(key in specs[i]) {
      if(specs[i].hasOwnProperty(key)) {
        //we saw at least one property
        ranOnce = true;

        switch(key) {
          case 'id':
          case 'path':
            if(!specs[i][key] || typeof specs[i][key] !== 'string') {
              return false;
            }
            break;

          case 'args':
            //optional
            if(specs[i][key] && !Array.isArray(specs[i][key])) {
              return false;
            }
            break;

          case 'env':
            //optional
            if(specs[i][key] && specs[i][key].constructor !== Object) {
              return false;
            }
            break;

          //unexpected property - might be a typo
          default:
            return false;
        }
      }
    }

    if(!ranOnce) {
      return false;
    }
  }

  return true;
};

Supervisor.prototype.getRestartStrategy = function() {
  return this.restartStrategy;
};

module.exports = Supervisor;
