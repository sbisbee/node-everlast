var http = require('http');

http.createServer(function(req, res) {
  res.end("bwah\n");
}).listen(process.argv[2] || '8080', '127.0.0.1');
