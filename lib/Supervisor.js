var assert = require('assert');
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

//dirty and fast way to do a deep clone since we only have plain objects
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
  var self = this;

  //list of child specs
  self.children = [];

  self.on('stopped', function onStopped(ref) {
    var err;

    switch(self.children[ref.idx].state) {
      case CHILD_STATES.stopped:
        //TODO implement maxRetries and maxTime
        if(self.restartStrategy) {
          self.restartStrategy.process(ref.idx);
        }

        break;

      case CHILD_STATES.restarting:
        if((err = self.startChild.call(self, ref.idx))) {
          self.emit('error', err);
        }
        break;

      default:
        self.emit('error', new Error('onStopped unexpected event state'));
        return;
    }
  });

  //the strat will take care of default maxR and maxT
  /*jshint -W056 */
  self.restartStrategy = new (restartStrategy || restartStrategies.OneForOne)(this, maxR, maxT);
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
 * @param {Object|Number} spec
 * @returns {Error|Boolean} False on success, Error on failure.
 */
Supervisor.prototype.startChild = function(spec) {
  var self = this;
  var args;
  var idx;
  var env;

  if(typeof spec === 'number') {
    //restarting
    idx = spec;

    if(!self.children[idx]) {
      return new Error('Child not found');
    }
    else if(self.children[idx].state !== CHILD_STATES.stopped &&
        self.children[idx].state !== CHILD_STATES.restarting) {
      return new Error('That child is not stopped or restarting');
    }

    self.children[idx].process.removeAllListeners();
    self.children[idx].process = null;
  }
  else if(self.checkChildSpecs([ spec ])) {
    idx = self.children.push(cloneObject(spec)) - 1;
    self.children[idx].state = CHILD_STATES.starting;
  }
  else {
    return new Error('Invalid spec');
  }

  //shouldn't be using local spec from now on - can makes things confusing
  spec = null;

  self.emit('starting', { id: self.children[idx].id });

  args = [ self.children[idx].path ];

  if(self.children[idx].args) {
    args = args.concat(self.children[idx].args);
  }

  //make sure we pass on the current process's env vars, plus our own
  env = extendObject(self.children[idx].env || {}, cloneObject(process.env));
  env.EVERLAST_ID = self.children[idx].id;
  env.EVERLAST_IDX = idx;

  self.children[idx].state = CHILD_STATES.running;

  self.children[idx].process = spawn('node', args, { env: env });
  self.children[idx].process.on('exit', function onExit(code, signal) {
    if(self.children[idx].state !== CHILD_STATES.restarting) {
      self.children[idx].state = CHILD_STATES.stopped;
    }

    self.emit('stopped',
      { id: self.children[idx].id, idx: idx },
      { code: code, signal: signal });
  });
  self.children[idx].process.stdout.pipe(process.stdout);
  self.children[idx].process.stderr.pipe(process.stderr);

  self.emit('running', {
    id: self.children[idx].id,
    idx: idx,
    pid: self.children[idx].process.pid });

  return false;
};

/*
 * Takes the child index and restarts it, but only if it's running or stopped.
 *
 * If the child is already stopped, then a 'stopped' event is still emitted and
 * 'false' is returned.
 *
 * @param {Number} idx
 * @returns {Boolean|Error} False on success, Error on failure.
 */
Supervisor.prototype.stopChild = function(idx) {
  if(typeof idx !== 'number') {
    return new TypeError('Invalid idx');
  }

  if(!this.children[idx]) {
    return new Error('Child not found');
  }

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
 * @param {Number} idx
 * @returns {Boolean|Error} False on success, Error on failure.
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
 * If fails, emits and returns an error.
 *
 * @param {Number} idx
 * @returns {Boolean|Error} False on success, Error on failure.
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
 * If an isolated stopChild() errors, then its error is emitted instead of
 * stopping the flow and it will not be in the return value. Again, safe to
 * assume that we're bringing a system down if invoked.
 *
 * WARNING: This unsets the restart strategy.
 *
 * Returns false on success, stopChild() errors will be emit()'d
 * Returns Error on failure, such as if you pass a non-null and non-array
 *
 * @param {Array} idxIgnores An array of indexes to ignore.
 * @returns {Boolean|Error} False on success, Error on failure.
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
    if(this.children[idx] && idxIgnores.indexOf(idx) < 0 && (err = this.stopChild(idx))) {
      this.emit('error', err);
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
  var key;
  var ranOnce = false;

  assert(Array.isArray(specs), 'specs must be an array');

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
