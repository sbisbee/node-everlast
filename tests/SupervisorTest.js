var assert = require('assert');
var util = require('util');

var Supervisor = require('..').Supervisor;

var validSpec = {
  id: 'spew-brief',
  path: process.cwd() + '/tests/bin/spew.js',
  args: [ '10' ]
};

var validServerSpec = {
  id: 'spew-infinite',
  path: process.cwd() + '/tests/bin/spew.js'
};

describe('Supervisor', function() {
  describe('constructor', function() {
    it('should construct', function() {
      var sup = new Supervisor();

      assert.strictEqual(typeof sup, 'object');

      assert(util.isArray(sup.children));
      assert.strictEqual(sup.children.length, 0);
    });
  });

  describe('startChild()', function() {
    it('should add the child', function(done) {
      var sup = new Supervisor();
      var sawStarting = false;

      sup.on('starting', function() {
        sawStarting = true;
      });

      sup.on('running', function(ref) {
        assert(sawStarting);
        assert.strictEqual(ref.id, validSpec.id);
        assert.strictEqual(ref.idx, 0);

        assert.strictEqual(sup.children[0].id, validSpec.id);

        done();
      });

      assert.strictEqual(sup.startChild(validSpec), false);
    });
  });

  describe('stopChild()', function() {
    it('should stop a long running child', function(done) {
      var sup = new Supervisor();

      sup.on('running', function(ref) {
        var err;

        assert.strictEqual(ref.id, validServerSpec.id);
        assert.strictEqual(ref.idx, 0);

        err = sup.stopChild(ref.idx);

        assert.equal(err, false);
      });

      sup.on('stopped', function(ref, info) {
        assert.strictEqual(ref.id, validServerSpec.id);
        assert.strictEqual(info.code, null);
        assert.strictEqual(info.signal, 'SIGTERM');

        done();
      });

      sup.startChild(validServerSpec);
    });

    it('should stop the proper child', function(done) {
      var sup = new Supervisor();

      var startCount = 0;
      var targetNum = 4;
      var idxToStop = 2;
      var i;

      sup.on('running', function(ref) {
        if(startCount === idxToStop) {
          sup.on('stopped', function(ref) {
            assert.strictEqual(ref.idx, idxToStop);
            assert.strictEqual(ref.id, validServerSpec.id);

            done();
          });

          assert.equal(sup.stopChild(idxToStop), false);
        }

        startCount++;
      });

      for(i = 0; i < targetNum; i++) {
        sup.startChild(validServerSpec);
      }
    });
  });

  describe('restartChild()', function() {
    it('should stop the child, then start it, without a new child', function(done) {
      var firstRun = true;
      var sup = new Supervisor();
      var pid;

      sup.on('running', function(ref) {
        if(firstRun) {
          firstRun = false;
          pid = ref.pid;
          assert(!sup.restartChild(ref.idx));
        }
        else {
          assert(ref.pid !== pid);
          assert.strictEqual(ref.idx, 0);
          assert.strictEqual(sup.children[1], undefined);

          done();
        }
      });

      assert(!sup.startChild(validServerSpec));
    });

    it('should only restart the child we tell it to', function(done) {
      var firstRun = true;
      var sup = new Supervisor();
      var pid;

      sup.on('running', function(ref) {
        assert(ref.pid, sup.children[ref.idx].process.pid);

        if(firstRun) {
          if(ref.idx === 2) {
            firstRun = false;
            sup.restartChild(1);
          }
          else if(ref.idx === 1) {
            pid = ref.pid;
          }
        }
        else {
          assert.strictEqual(ref.idx, 1);
          assert(ref.pid !== pid);
          done();
        }
      });

      assert(!sup.startChild(validServerSpec));
      assert(!sup.startChild(validServerSpec));
      assert(!sup.startChild(validServerSpec));
    });
  });

  describe('stopAllChildren()', function() {
    it('should stop all children from right-to-left', function(done) {
      var numKids = 3; //total number of kids to start
      var next = numKids - 1; //the next kid idx we should see stop
      var sup = new Supervisor();
      var i;

      sup.on('running', function(ref) {
        if(ref.idx === numKids - 1) {
          sup.stopAllChildren();
        }
      });

      sup.on('stopping', function(ref) {
        assert.strictEqual(ref.idx, next);
        next--;

        if(ref.idx === 0) {
          done();
        }
      });

      for(i = 0; i < numKids; i++) {
        sup.startChild(validServerSpec);
      }
    });

    it('should skip the children we tell it to ignore', function(done) {
      var skip = 1;
      var numKids = 3;
      var sup = new Supervisor();
      var i;

      sup.on('running', function(ref) {
        if(ref.idx === numKids - 1) {
          sup.stopAllChildren([skip]);
        }
      });

      sup.on('stopping', function(ref) {
        assert(ref.idx !== skip);

        if(ref.idx === numKids - 1) {
          sup.removeAllListeners('stopping');
          sup.stopChild(skip);
          done();
        }
      });

      for(i = 0; i < numKids; i++) {
        sup.startChild(validServerSpec);
      }
    });
  });

  describe('countChildren()', function() {
    it('should count children', function() {
      var sup = new Supervisor();
      sup.startChild(validSpec);
      sup.startChild(validSpec);

      assert.strictEqual(sup.children.length, 2);
      assert.strictEqual(sup.countChildren(), 2);
    });

    it('should not count empty array slots', function(done) {
      var sup = new Supervisor();

      sup.on('stopped', function() {
        assert.strictEqual(sup.countChildren(), 2);

        sup.stopAllChildren();

        done();
      });

      sup.startChild(validSpec);
      sup.startChild(validSpec);
      sup.startChild(validSpec);

      assert.strictEqual(sup.countChildren(), 3);

      sup.stopChild(1); //middle
    });
  });
});
