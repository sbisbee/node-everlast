var util = require('util');
var BaseStrategy = require('./BaseStrategy.js');

var OneForAllStrategy = function() {
  BaseStrategy.apply(this, arguments);
};

util.inherits(OneForAllStrategy, BaseStrategy);

OneForAllStrategy.prototype.process = function() {
  var kidCount = this.sup.countChildren();
  var now = new Date().getTime();
  var err;
  var i;

  for(i = kidCount - 1; i >= 0; i--) {
    if(this.mark(i, now)) {
      err = this.sup.restartChild(i);

      if(err) {
        this.sup.emit('error', err);
      }
    }
  }

  return false;
};

module.exports = OneForAllStrategy;
