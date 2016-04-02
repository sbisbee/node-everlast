var assert = require('assert');

var BaseStrategy = require('../..').restartStrategies.BaseStrategy;
var Supervisor = require('../..').Supervisor;

describe('BaseStrategy', function() {
  describe('process()', function() {
    it('should error emit an error to the sup', function(done) {
      var sup = new Supervisor(BaseStrategy);
      var strat = sup.getRestartStrategy();

      sup.on('error', function(err) {
        assert.ok(err);
        done();
      });

      strat.process(1);
    });
  });

  describe('mark()', function() {
    it('should work with all the same stamps', function() {
      var sup = new Supervisor(BaseStrategy, 3, 1);
      var strat = sup.getRestartStrategy();

      assert.ok(strat.mark(1, 100)); //1
      assert.ok(strat.mark(1, 100)); //1,1
      assert.ok(!strat.mark(1, 100)); //1,1,1

      assert.strictEqual(strat.log[1].length, 3);
    });

    it('should work with different stamps', function() {
      var sup = new Supervisor(BaseStrategy, 3, 1);
      var strat = sup.getRestartStrategy();

      assert.ok(strat.mark(1, 100));    //1
      assert.ok(strat.mark(1, 100));    //1,1
      assert.ok(!strat.mark(1, 200));   //1,1,2
      assert.ok(strat.mark(1, 300));    //1,2,3
      assert.ok(!strat.mark(1, 300));   //2,3,3

      assert.strictEqual(strat.log[1].length, 3);
    });

    it('emits the down event if not restart worthy', function(done) {
      //OneForOne, 3, 1
      var sup = new Supervisor();
      sup.on('down', function(ref) {
        assert.equal(ref.id, 'NOOP');
        assert.strictEqual(ref.idx, 0);
        done();
      });
      sup.startChild({ id: 'NOOP', path: 'NOOP' });
    });
  });
});
