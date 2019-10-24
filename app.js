var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var flash = require('connect-flash');

var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var leader;
var hasGameStarted = false;
var readyPlayers = 0;
var playersOnGame = 0;
var colorSequence = [];
var round = 1;

// Define static folder
app.use(express.static('public'));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(flash());

// Load all routes
app.get('/', function(req, res){
  res.redirect('/login')
});

app.get('/login', function(req, res){
  res.render('site/login');
});

app.post('/login', function(req, res){
  let form = req.body;
  let sockets = io.sockets.sockets;
  let players = [];

  Object.keys(sockets).map(function(key, index) {
    players.push({
      'playername': sockets[key].playername,
      'gameid': sockets[key].id
    });
  });

  res.render('site/lobby', {'playername': form.playername, 'players': players});
});

app.get('/player', function(req, res){  
  res.render('site/player', {'playername': req.query.name});
});

app.get('/leader', function(req, res){
  res.render('site/leader', {'playername': req.query.name});
});


// Load game logic using socket.io
io.on('connection', function(socket){
  // if (hasGameStarted){
  //   console.log("The game has already started");
  //   socket.disconnect();
  //   return;
  // }

  console.log('connected with id: ' + socket.id);

  socket.on('disconnect', function () {
    if (!hasGameStarted){
      io.sockets.emit('lobby-remove-player', socket.id);
    }

    if (hasGameStarted && socket.id == leader.id){
      console.log(`Leader with ID ${socket.id} disconnected. Initiating process to select new leader.`);
      leader = get_leader();
      console.log(`New leader: ${leader.id}`);
      leader.emit('redirect', "http://localhost:3000/leader");
    }else{
      console.log(`${socket.id} disconnected`);
    }
  });

  socket.on('register-player', function(playername) {
    socket.playername = playername
    console.log(`${socket.playername} registered`);

    io.sockets.emit('lobby-add-player', socket.id, socket.playername);
  });

  socket.on('game-leader-ready', function(playername) {
    console.log(`Setting leader with ID = ${socket.id} name = ${playername}`)
    leader = socket;
    leader.playername = playername;
    leader.isLeader = true;
    
    playersOnGame++;
    // Start game if all players are on the game-view
    if(playersOnGame == readyPlayers){
      hasGameStarted = true;
      console.log("Starting game");
      console.log(parse_players());
      leader.emit('set-players', JSON.stringify(parse_players()));
    }
  });

  socket.on('game-player-ready', function(playername) {
    console.log(`Player ${playername} is ready`);
    
    socket.playername = playername;
    playersOnGame++;
    // Start game if all players are on the game-view
    if(playersOnGame == readyPlayers){
      hasGameStarted = true;
      console.log("Starting game");
      console.log(parse_players());
      leader.emit('set-players', JSON.stringify(parse_players()));
    }
  });

  socket.on('lobby-player-ready', function() {
    readyPlayers++;

    var sockets = io.sockets.sockets;
    
    if (readyPlayers == Object.keys(sockets).length){
      leader = get_leader();
      leader.isLeader = true;

      for (let socketId in sockets){
        if(!sockets[socketId].isLeader)
          sockets[socketId].emit('redirect', `http://localhost:3000/player?name=${sockets[socketId].playername}`);
      }

      // Make sure the leader is the last one to be redirected. Otherwise the socket.on('disconnect') may cause problems
      leader.emit('redirect', `http://localhost:3000/leader?name=${leader.playername}`);
    }
  });
  
  socket.on('leader-color-choice', function(color) {
    colorSequence.push(color);
    console.log(colorSequence);
  });

  socket.on('player-add-player-color', function(color) {
    leader.emit('add-player-color', socket.id, color);
  })
});

function get_leader(){
    let leader;
    var sockets = io.sockets.sockets;
  
    for (let socketId in sockets){
      let curr_socket = sockets[socketId];
      if (typeof(leader) == 'undefined'){
        leader = curr_socket;
      }else{
        if (curr_socket.id > leader.id){
          console.log(`New leader found with id: ${curr_socket.id}`);
          leader = curr_socket;
        }
      }
    }
  
    return leader;
}

function parse_players() {
  let sockets = io.sockets.sockets;
  let players = [];

  for (let socketId in sockets){
    if(!sockets[socketId].isLeader)
      players.push({
        'playername': sockets[socketId].playername,
        'id': sockets[socketId].id
      })
  }

  return players;
}


http.listen(process.env.PORT || 3000, function(){
  console.log('Server listening on *:3000');
});