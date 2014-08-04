/*
 * The base RestartStrategy. Actual implementations inherit from it - don't use
 * it directly.
 */
var BaseStrategy = function(sup, maxR, maxT) {
  this.sup = sup;
  this.maxR = maxR || 3;
  this.maxT = maxT || 1;

  //idx => [timestamps]
  this.log = {};
};

/*
 * Implements the given strategy, using only external Supervisor functions.
 *
 * idx: the index of the child that was stopped
 */
BaseStrategy.prototype.process = function(idx) {
  this.sup.emit('error', new Error('Restart strategy is not implemented'));
};

/*
 * Record a stop/restart for the given idx. Detects whether a restart should
 * happen.
 *
 * The `now` arg must be in ms.
 *
 * Returns true if a child should be restarted
 * Returns false if a child should be left alone
 */
BaseStrategy.prototype.mark = function(idx, now) {
  var head;
  var tail;

  now = Math.floor(now / 100);

  if(!this.log[idx]) {
    this.log[idx] = [];
  }

  this.log[idx].push(now);
  head = this.log[idx][this.log[idx].length - 1];
  tail = this.log[idx][this.log[idx].length - this.maxR];

  this.log[idx] = this.log[idx].slice(-this.maxR);

  if(tail && head - tail <= this.maxT) {
    return false;
  }

  return true;
};

module.exports = BaseStrategy;
