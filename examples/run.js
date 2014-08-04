var everlast = require('../');

var NUM_KIDS = 4;
var STARTING_PORT = 8080;

var sup = new everlast.Supervisor();

var serverSpec = {
  id: 'httpd',
  path: './server.js',
  args: [ ] };

var i;

sup.on('starting', function(ref) {
  console.log('starting:', ref);
});

sup.on('running', function(ref) {
  console.log('running:', ref);
});

sup.on('restarting', function(ref) {
  console.log('restarting:', ref);
});

sup.on('stopping', function(ref) {
  console.log('stopping:', ref);
});

sup.on('stopped', function(ref, context) {
  console.log('stopped:', ref, context);
});

for(i = 0; i < NUM_KIDS; i++) {
  serverSpec.args[0] = STARTING_PORT + i;
  sup.startChild(serverSpec);
}
