var util = require('util');
var BaseStrategy = require('./BaseStrategy.js');

var OneForOneStrategy = function(sup, maxR, maxT) {
  BaseStrategy.apply(this, arguments);
};

util.inherits(OneForOneStrategy, BaseStrategy);

OneForOneStrategy.prototype.process = function(idx) {
  var err;

  this.sup.emit('debug', ['OneForOne.proc before', idx, this.log]);

  if(this.mark(idx, new Date().getTime())) {
    this.sup.emit('debug', ['OneForOne.proc START']);

    err = this.sup.startChild(idx);

    if(err) {
      this.sup.emit('error', err);
    }
  }
  else {
    this.sup.emit('debug', ['OneForOne.proc DO NOTHING']);
  }
};

module.exports = OneForOneStrategy;
