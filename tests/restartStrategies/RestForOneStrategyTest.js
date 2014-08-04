var assert = require('assert');
var util = require('util');

var Base = require('../..').restartStrategies.Base;
var RestForOne = require('../..').restartStrategies.RestForOne;
var Supervisor = require('../..').Supervisor;

var validServerSpec = {
  id: 'spew-infinite',
  path: process.cwd() + '/tests/bin/spew.js'
};

describe('RestForOneStrategy', function() {
  it('exists', function() {
    assert(typeof RestForOne, 'function');
  });

  it('inherits', function() {
    assert(new RestForOne() instanceof Base);
  });

  describe('process()', function() {
    it('should restart all children to the right of the killed one', function(done) {
      var sup = new Supervisor(RestForOne);
      var firstRun = true;

      var NUM_KIDS = 5;
      var IDX_TO_KILL = 2;

      var pidToKill;
      var lastRestarted;
      var i;

      sup.on('running', function(ref) {
        if(firstRun && ref.idx === IDX_TO_KILL) {
          pidToKill = ref.pid;
        }
        else if(ref.idx === NUM_KIDS - 1) {
          if(firstRun) {
            firstRun = false;

            process.kill(pidToKill);
          }
          else {
            done();
          }
        }
      });

      sup.on('restarting', function(ref) {
        if(typeof lastRestarted === 'undefined') {
          assert.ok(ref.idx, NUM_KIDS - 1);
        }
        else {
          assert.ok(ref.idx >= IDX_TO_KILL);
          assert.ok(ref.idx + 1 === lastRestarted);
        }

        lastRestarted = ref.idx;
      });

      for(i = 0; i < NUM_KIDS; i++) {
        sup.startChild(validServerSpec);
      }
    });
  });

  describe('mark()', function() {
    it('should exist', function() {
      var strat = new RestForOne();
      assert.strictEqual(typeof strat.mark, 'function');
    });
  });
});
