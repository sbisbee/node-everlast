var assert = require('assert');

var Base = require('../..').restartStrategies.Base;
var OneForOne = require('../..').restartStrategies.OneForOne;
var Supervisor = require('../..').Supervisor;

var validServerSpec = {
  id: 'spew-infinite',
  path: process.cwd() + '/tests/bin/spew.js'
};

describe('OneForOneStrategy', function() {
  it('exists', function() {
    assert(typeof OneForOne, 'function');
  });

  it('inherits', function() {
    assert(new OneForOne() instanceof Base);
  });

  describe('process()', function() {
    it('should restart the first 2 times, not the 3rd', function(done) {
      var sup = new Supervisor(OneForOne);
      var restartCount = 0;

      sup.on('running', function(ref) {
        restartCount++;

        if(restartCount < 3) {
          sup.stopChild(ref.idx);
        }
        else {
          done();
        }
      });

      sup.startChild(validServerSpec);
    });
  });

  describe('mark()', function() {
    it('should exist', function() {
      var strat = new OneForOne();
      assert.strictEqual(typeof strat.mark, 'function');
    });
  });
});
