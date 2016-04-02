var util = require('util');
var BaseStrategy = require('./BaseStrategy.js');

var OneForOneStrategy = function() {
  BaseStrategy.apply(this, arguments);
};

util.inherits(OneForOneStrategy, BaseStrategy);

OneForOneStrategy.prototype.process = function(idx) {
  var err;

  if(this.mark(idx, new Date().getTime()) && (err = this.sup.startChild(idx))) {
    this.sup.emit('error', err);
  }
};

module.exports = OneForOneStrategy;
