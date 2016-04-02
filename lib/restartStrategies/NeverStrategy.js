var util = require('util');
var BaseStrategy = require('./BaseStrategy.js');

var NeverStrategy = function() {
  BaseStrategy.apply(this, arguments);
};

util.inherits(NeverStrategy, BaseStrategy);

//don't even mark times
NeverStrategy.prototype.process = function() {
  return false;
};

module.exports = NeverStrategy;
