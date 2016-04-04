node-everlast
=============

This is an event driven supervisor for Node.js designed to be used in your code
instead of a CLI. It allows you to spawn children processes based on
specifications and define restart strategies. It is inspired by Erlang's
supervisor.

For example, this would make starting and managing a worker process per core
very easy.

Other tools in this area exist, but they can be unstable, are designed to be
used from the CLI, or are weak alternatives to runit which solves a different
problem.

One major difference between this supervisor and Erlang's is that you can stop
a child, though the restart strategy will still kick in. If this is not
desirable then you can set the strategy to Never, so it'll never trigger
restarts.

Installing
----------

`npm install everlast`

Using
-----

See `./examples/run.js` for a quick code example and `./tests/Supervisor.js`
for more complicated examples. Plenty of documentation below.

Run `npm test` to run the unit tests.

Supervisor
----------

Children are defined by their specs. See **Child Spec** below.

The children are managed internally in an array. When interacting with the
supervisor you typically pass it a child index since multiple children can, and
likely will, share an id. For example:

```javascript
var everlast = require('everlast');
var sup = new everlast.Supervisor(); //uses OneForOne(3, 1) by default

sup.on('running', function(ref) {
  console.log('running:', ref);
  sup.stopChild(ref.idx);
});

sup.on('stopping', function(ref) {
  console.log('stopping:', ref);
});

sup.startChild({ id: 'http', path: './server.js' });
```

See **Child Reference** below.

Inherits from EventEmitter. Each event callback gets passed two arguments,
`ref` (child reference, schema is promised) and `context` (contextual
information about the event, no schema is promised).

These events are emitted:

  - **starting** - A child is starting.
  - **running** - A child is running, it should be considered "up".
  - **stopping** - A child is stopping, likely due to `stopChild()`.
  - **restarting** - A child is restarting, likely due to either
    `restartChild()` or the restart strategy.
  - **stopped** - A child is stopped. See the context for whether the restart
    strategy will attempt to revive the child.
  - **down** - A child is stopped and won't be restarted due to the strategy's
    constraints (max time and retries).

General events:

  - **error** - Your typical Node.js error event. The only arg is a `Error`.
    Used when an asynchronous process hits an error and can't return it to you.

All functions return `false` on success and a new `Error` on failure. See
`./src/Supervisor.js` for more detailed per function documentation.

  - **startChild(spec)** - Starts the child, validating the spec internally.

  - **stopChild(idx)** - Stops the child, then deletes it with `deleteChild()`.

  - **restartChild(idx)** - Restarts the child, settings its state to
    `restarting`.

  - **stopAllChildren(idxIgnores)** - Stops all the children from
    right-to-left, skipping any indexes in the `idxIgnores` array.

  - **deleteChild(idx)** - Deletes the child, which must be already stopped.

  - **getChild(idx)** - Retrieves the current child ref.

  - **countChildren()** - Returns a count for the children regardless of their
    statel

  - **checkChildSpecs(specs)** - Takes an array of child specs and validates
    them.

  - **getRestartStrategy()** - Returns the current restart strategy.

Child Spec
----------

This is the structure passed to `startChild()` to define how the child will
behave.

```javascript
{
  id: string,   //the id, typically something like "web-server"
  path: string, //the path to the server (ex., `process.cwd() + '/bin/run.js'`)
  args: []      //optional, passed to `child_process.spawn()`,
  env: {}       //optional, extends process.env, passed to `child_process.spawn()`
}
```

Child Reference
---------------

This is the structure passed in all child events. The index (`idx`) can then be
used to trigger further actions, such as adding more children of that type.

```javascript
{
  id: string,   //the same as the child spec you passed
  idx: int,     //the internal index of the child
  pid: int,     //the child's process's PID

  //Internal to Supervisor only (never sent outside):
  args: [],     //from child spec
  env: {},      //from child spec
  process: ChildProcess, //return value from `child_process.spawn()`
  state: int    //array index from CHILD_STATES
}
```

Restart Strategies
------------------

Each strategy tracks how often a child stops in a given time period. It then
compares this against your defined maxRestarts and maxTime to decide whether a
restart should be triggered.

If a threshold of restarts happens (`maxRestarts`) within a given time period
(`maxTime`), then the child is not restarted. For example, using `OneForOne`
with `maxRestarts=2` and `maxTime=1`, if your process stops twice in one second
it will not be restarted.

The strategies:

  - `everlast.restartStrategies.OneForOne` - If a child stops, then only that
    child will be restarted.

  - `everlast.restartStrategies.OneForAll` - If a child stops, then restart all
    children including that one.

  - `everlast.restartStrategies.RestForOne` - If a child stops, then restart it
    and the children to the right of it in the start up order, iterating from
    right-to-left (ex., child at idx 3 stops and 5 children are linked, it
    restarts 5, then 4, then 3).

  - `everlast.restartStrategies.Never` - Never triggers restarts.

  - `everlast.restartStrategies.Base` - All strategies inherit from this. Not
    meant for use in your code.

Child Spawning
--------------

Children are spawned with `child_process.spawn()`. Their stdout and stderr
streams are piped to the process's respective stdout and stderr without
modification.

If you tell it to, Supervisor will augment the log lines by replacing `%s` with
the child process's id and PID. For example:

```javascript
//parent.js
var sup = new Supervisor(null, 3, 2, true);
sup.on('running', function(ref) {
  console.log('running with pid', ref.pid);
});
sup.startChild({ id: 'foo', path: './child.js' });

//child.js
console.log('[%s] doing something');
```

The resulting output would be:

```
running with pid 123
[foo@123] doing something
```

TODO
----

A list of features that will be implemented which you might expect, especially
if you've used Erlang's supervisor.

  - Allow children to be another Supervisor, enabling multi-level trees.
