module.exports = (app) => {
    app.get('/', function(req, res){
        res.sendFile(__dirname + '/game.html');
    });
}