/*
 * The base RestartStrategy. Actual implementations inherit from it - don't use
 * it directly.
 *
 * @param {Supervisor} sup
 * @param {Number} maxR The number of restarts to allow within an interval.
 * @param {Number} maxT The max time that maxR restarts can occur.
 */
var BaseStrategy = function(sup, maxR, maxT) {
  this.sup = sup;
  this.maxR = maxR || 3;
  this.maxT = maxT || 1;

  //idx => [timestamps, ...]
  this.log = {};
};

/*
 * Implements the given strategy, using only external Supervisor functions.
 *
 * @param {Number} idx the index of the child that was stopped
 */
BaseStrategy.prototype.process = function() {
  this.sup.emit('error', new Error('Restart strategy is not implemented'));
};

/*
 * Record a stop/restart for the given idx. Detects whether a restart should
 * happen.
 *
 * @param {Number} idx The child index.
 * @param {Number} now The current time in ms.
 * @returns {Boolean} True if a child should be restarted, false if it should
 * be left alone (it's to be considered down).
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

  //only need to keep the last maxR num entries
  this.log[idx] = this.log[idx].slice(-this.maxR);

  return !(tail && head - tail <= this.maxT);
};

module.exports = BaseStrategy;
