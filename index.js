var express = require('express');
var app = express();
var http = require('http').createServer(app);;
var io = require('socket.io')(http);

app.get('/', function(req, res){
    res.sendFile(__dirname + '/game.html');
});

app.use(express.static('public'));

io.on('connection', function(socket){
  console.log('connected');
  
  socket.on('add-color', function(color){
    console.log(color);
    io.emit('add-color', color);
  });
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});