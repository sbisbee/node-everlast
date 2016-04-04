var assert = require('assert');
var util = require('util');
var fs = require('fs');

var Supervisor = require('..').Supervisor;
var Never = require('..').restartStrategies.Never;

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

    it('should set the strategy', function() {
      var sup = new Supervisor(Never);
      var strat = sup.getRestartStrategy();
      assert.ok(strat instanceof Never);
    });
  });

  describe('startChild()', function() {
    it('should add the child', function(done) {
      var sup = new Supervisor(Never);
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

    it('should add the child with env variables', function(done) {
      var sup = new Supervisor(Never);

      var spec = JSON.parse(JSON.stringify(validServerSpec));
      spec.env = { BWAH: 123 };

      sup.on('running', function(ref) {
        var pid = sup.children[ref.idx].process.pid;

        assert.strictEqual(ref.id, spec.id);
        assert.ok(pid);

        fs.readFile('/proc/' + pid + '/environ', 'utf8', function(err, data) {
          if(err) {
            throw err;
          }

          assert(data.indexOf('EVERLAST_ID=' + ref.id) >= 0);
          assert(data.indexOf('EVERLAST_IDX=' + ref.idx) >= 0);
          assert(data.indexOf('BWAH=123') >= 0);

          done();
        });
      });

      assert.strictEqual(sup.startChild(spec), false);
    });
  });

  describe('stopChild()', function() {
    it('should stop a long running child', function(done) {
      var sup = new Supervisor(Never);

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
      var sup = new Supervisor(Never);

      var startCount = 0;
      var targetNum = 4;
      var idxToStop = 2;
      var i;

      sup.on('running', function() {
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
      var sup = new Supervisor(Never);
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

          sup.stopChild(0);

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
      var sup = new Supervisor(Never);

      sup.on('stopped', function(ref) {
        assert(ref.idx >= 0 && ref.idx < 3);
        assert(!sup.deleteChild(ref.idx));
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

  describe('checkChildSpecs()', function() {
    it('should accept these', function() {
      var sup = new Supervisor();
      assert.ok(sup.checkChildSpecs([ validSpec, validServerSpec ]));
      assert.ok(sup.checkChildSpecs([{ id: 'foo', path: 'bar', env: {} }]));
    });

    it('should not accept these', function() {
      var sup = new Supervisor();
      assert.ok(!sup.checkChildSpecs([{}]));
      assert.ok(!sup.checkChildSpecs([{bwah: 'foo'}]));
      assert.ok(!sup.checkChildSpecs([{path: 123}]));
      assert.ok(!sup.checkChildSpecs([{path: 123, foo: 'bar'}]));
      assert.ok(!sup.checkChildSpecs([{path: 'foo', id: 'bar', env: [] }]));
      assert.ok(!sup.checkChildSpecs([{path: 'foo', id: 'bar', args: true }]));
      assert.ok(!sup.checkChildSpecs([{path: 'foo', id: 'bar', unexpected: 'prop' }]));
    });
  });
});
