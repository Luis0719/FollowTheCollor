var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var flash = require('connect-flash');

var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

game = {
  leader: null,
  hasGameStarted: false,
  readyPlayers: 0,
  playersOnGame: 0,
  colorSequence: [],
  round: 1,
  changingLeader: false,
  finishedPlayers: 0
}

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
  // if (game.hasGameStarted && !game.changingLeader){
  //   console.log("The game has already started");
  //   socket.disconnect();
  //   return;
  // }

  console.log('connected with id: ' + socket.id);

  socket.on('disconnect', function () {
    if (!game.hasGameStarted){
      io.sockets.emit('lobby-remove-player', socket.id);
    }

    if (!game.changingLeader && game.hasGameStarted && socket.id == game.leader.id){
      console.log(`Leader with ID ${socket.id} disconnected. Initiating process to select new leader.`);
      game.leader = get_leader();
      console.log(`New leader: ${game.leader.id}`);
      game.changingLeader = true;
      game.colorSequence = [];
      game.round = 1;

      game.playersOnGame--;
      console.log(`${game.playersOnGame} players left`);

      io.sockets.emit('usr-leader-disconnected');
      setTimeout(function() { 
        io.sockets.emit('usr-leader-chosed', game.leader.playername); 
        game.leader.emit('redirect', `http://localhost:3000/leader?name=${game.leader.playername}`);

        setTimeout(function(){
          game.leader.emit('ld-set-players', JSON.stringify(parse_players()));

          if (game.playersOnGame <= 1){
            console.log(`The leader won the match`);
            game.leader.emit('ld-won');
          }
        }, 3000);
      }, 4000);
    }else{
      console.log(`${socket.id} disconnected`);
      game.changingLeader = false;

      if (game.hasGameStarted){
        game.playersOnGame--;
        console.log(`${game.playersOnGame} players left`);
        game.leader.emit('ld-usr-lost', socket.id, socket.playername);

        if (game.playersOnGame <= 1){
          console.log(`The leader won the match`);
          game.leader.emit('ld-won');
        }
      }
    }
  });

  // Lobby functions
  socket.on('lobby-register-player', function(playername) {
    socket.playername = playername
    console.log(`${socket.playername} registered`);

    io.sockets.emit('lobby-add-player', socket.id, socket.playername);
  });

  socket.on('lobby-player-ready', function() {
    game.readyPlayers++;

    var sockets = io.sockets.sockets;
    
    if (game.readyPlayers == Object.keys(sockets).length){
      game.leader = get_leader();
      game.leader.isLeader = true;

      for (let socketId in sockets){
        if(!sockets[socketId].isLeader)
          sockets[socketId].emit('redirect', `http://localhost:3000/player?name=${sockets[socketId].playername}`);
      }

      // Make sure the leader is the last one to be redirected. Otherwise the socket.on('disconnect') may cause problems
      game.leader.emit('redirect', `http://localhost:3000/leader?name=${game.leader.playername}`);

      console.log(`${game.readyPlayers} ready players`)
    }
  });
  // End of Lobby functions

  // Gameplay functions
  socket.on('ld-register', function(playername) {
    console.log(`Setting leader with ID = ${socket.id} name = ${playername}`)
    game.leader = socket;
    game.leader.playername = playername;
    game.leader.isLeader = true;
    
    game.playersOnGame++;
    // Start game if all players are on the game-view
    request_start_game();
  });

  socket.on('usr-register', function(playername) {
    console.log(`Player ${playername} is ready`);
    
    socket.playername = playername;

    game.playersOnGame++;
    // Start game if all players are on the game-view
    request_start_game();
  });
  
  socket.on('ld-choice', function(color) {    
    game.colorSequence.push(color);
    console.log(`Leader chosed ${color}`);
    console.log(`New color sequence: ${game.colorSequence}`);

    game.finishedPlayers = 0;
    io.sockets.emit('usr-start-turn', game.round, color);
  });

  socket.on('usr-choice', function(color, choice_number) {
    color_class = "correct";
    
    // Validate user choice
    if (color != game.colorSequence[choice_number]){
      socket.emit('usr-wrong-choice');
      color_class = "wrong";
      socket.disconnect();
    }else{
      console.log(`${choice_number} choice vs ${game.round} round`);
      if (choice_number >= game.round-1){
        socket.emit('usr-finished-turn');
        
        game.finishedPlayers++;
      }
    }
  
    console.log(`${socket.playername} choice #${choice_number} = ${color} was ${color_class}`);
    // Notify leader of the players choice
    game.leader.emit('ld-user-choice', socket.id, color, color_class);

    if (game.finishedPlayers >= game.playersOnGame-1){
      console.log(`Round #${game.round} finished.`);
      game.round++;
      game.leader.emit('ld-start-turn', game.round);
    }
  });
});
// End of Gameplay functions

function request_start_game(){
  console.log(`${game.playersOnGame} total players vs ${game.readyPlayers} ready players`)
  if(game.playersOnGame >= game.readyPlayers){
    game.hasGameStarted = true;
    console.log("Starting game");
    console.log(parse_players());
    game.leader.emit('ld-set-players', JSON.stringify(parse_players()));
  }
}

function get_leader(){
    let leader;
    var sockets = io.sockets.sockets;
  
    for (let socketId in sockets){
      console.log(`Found process with ID=${socketId}`);
      
      let curr_socket = sockets[socketId];
      if (typeof(leader) == 'undefined'){
        leader = curr_socket;
      }else{
        if (curr_socket.id > leader.id){
          leader = curr_socket;
        }
      }
    }
  
    console.log(`New leader with the highest Id selected ${leader.id}`);
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


serv_port = process.env.PORT || 3000;
http.listen(serv_port, function(){
  console.log(`Server listening on *:${serv_port}`);
});