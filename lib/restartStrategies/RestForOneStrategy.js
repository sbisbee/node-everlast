var util = require('util');
var BaseStrategy = require('./BaseStrategy.js');

var RestForOneStrategy = function() {
  BaseStrategy.apply(this, arguments);
};

util.inherits(RestForOneStrategy, BaseStrategy);

RestForOneStrategy.prototype.process = function(idx) {
  var kidCount = this.sup.countChildren();
  var now = new Date().getTime();
  var err;
  var i;

  for(i = kidCount - 1; i >= idx; i--) {
    if(this.mark(i, now)) {
      err = this.sup.restartChild(i);

      if(err) {
        this.sup.emit('error', err);
      }
    }
  }

  return false;
};

module.exports = RestForOneStrategy;
