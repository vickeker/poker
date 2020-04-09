var fs = require('fs');
// websocket and http servers
const WebSocket = require('ws');
var WebSocketServer = WebSocket.Server;
const players = require('./routes/players.js');
const dealer = require('./routes/dealer.js');

var express = require('express');

var clients = [];
var webSocketsServerPort = 3001;

// Yes, TLS is required
const serverConfig = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem'),
  };

  //init Express
var app = express(serverConfig);
//init Express Router
var router = express.Router();
// GET /ok
router.get('/status', function(req, res) {
    res.json({ status: 'server is running!' });
});
//connect path to router
app.use("/", router);
app.use(express.static('static'))

var httpsServer = app.listen(webSocketsServerPort, function() {
    console.log((new Date()) + " Server is listening on port "
        + webSocketsServerPort);
});

//  websocket server
var wsServer = new WebSocketServer({
    server: httpsServer
});


/*************** NEXT PLAYER ******************** 
 *
*/
async function next (id) {
    var pls = await players.getPlayers();
    pls = pls.filter(a => a.isActive);
    var winner = null;
    if (pls.length > 1) {
        var playing = pls.filter(a => !a.fold);
        var isEndOfPhase = true;
        if (playing.length === 1) {
            // everybody  else fold, we have a winner
            console.log('winner is', playing);
            winner = playing[0];
            isEndOfPhase = true;
        } else {
            var currPlayerIndex = playing.findIndex(a => a.id === id);
            var nextPlayerIndex = currPlayerIndex + 1 <= playing.length -1 ? currPlayerIndex + 1 : 0
            var nextPlayer = null;
            
            // if nextPlayer is All-in already, look at the next player
            var index = nextPlayerIndex;
            for (var i=0;i<=playing.length-1;i++) {
                var pl = playing[index];
                if (pl.chipValue > 0) {
                    nextPlayer = pl;
                    break;
                }
                index = index + 1 <= playing.length -1 ? index + 1 : 0;
            }
            if(!nextPlayer) {
                // all players are all-in
                isEndOfPhase = true;
            } else {
                const maxBetPlayer = playing.reduce(function(prev, current) { 
                    return (prev.betValue > current.betValue) ? prev : current 
                });
    
                if (nextPlayer.betValue < maxBetPlayer.betValue ||
                    (!nextPlayer.call && !nextPlayer.raise && !nextPlayer.check)) {
                        // Next valid player hasnt call/fold after raise
                        // or hasnt make any action yet
                        isEndOfPhase = false;
                    } else if (nextPlayer.raise > 0 && nextPlayer.betValue === maxBetPlayer) {
                        // Next valid player raised and has biggest bet => end of turn
                        isEndOfPhase = true;
                    } else {
                        isEndOfPhase = true;
                    }
            }  
        }
        
        // if isEnd = true, then go to next phase of game
        if (isEndOfPhase) {
            console.log('is end of phase, deal card...')
            var cards = await dealer.getCards();
            // is last phase
            if (cards.river.length > 0 || winner) {
                console.log('end of hand')
                // if last phase of game, find winner, and reset table
                var winners = await dealer.updateWinner(pls);
                await players.updateWinners(winners);
                await players.updateActivePlayer();
                await dealer.reset();
                await dealer.updateBlinds();
                await players.moveDealer();
            } else if (cards.turn.length > 0) {
                console.log('dealing river...')
                // deal river
                await dealer.dealRiver();
                await players.resetPlayerCallRaise();
                await players.nextPlayer(id);
            } else if (cards.flop.length > 0) {
                console.log('dealing turn...')
                // deal turn
                await dealer.dealerTurn();
                await players.resetPlayerCallRaise();
                await players.nextPlayer(id);
            } else {
                console.log('dealing flop...')
                // deal flop
                await dealer.dealFlop();
                await players.resetPlayerCallRaise();
                await players.nextPlayer(id);
            }
        } else {
            console.log('not end of phase, next player...')
            await players.nextPlayer(id);
        }
    }  else {
        // Only 1 active player (everybody else left the game)...sigh
    }

}


/*************** BROADCASTING PEER CONNECTION DETAIL ******************** 
 *
*/
// broadcast video
wsServer.broadcast = function(data, peerConnectionIndex) {
    // data can be send to a specific peer or to everybody
    if (peerConnectionIndex) {
        console.log('sending data to', peerConnectionIndex);
        clients[peerConnectionIndex].send(data);
    } else {
        console.log('sending data to everyone');
        for(var i in clients) {
            clients[i].send(data);
        }
    }
};


/*************** HANDLING WEBSOCKET EVENTS ********************/

wsServer.on('connection', function(connection) {
    console.log((new Date()) + ' new connection');

    // unused with express
    // accept connection - you should check 'request.origin' to
    // make sure that client is connecting from your website
    // (http://en.wikipedia.org/wiki/Same_origin_policy)
    // var connection = request.accept(null, request.origin); 

    // we need to know client index to remove them on 'close' event
    var index = clients.push(connection) - 1;
    var playerName = false;
    console.log((new Date()) + ' Connection accepted for connectionIndex', index);

    // user sent some message
    connection.on('message', async function(message) {
        var payload = JSON.parse(message);
        console.log(`message received from ${payload.connectionIndex}`, payload)
        var id = payload.playerId
        var action = payload.action;
        var value = payload.value;
        var data = payload.data;
        var result = {};
        var error = [];
        var authorConnectionIndex = payload.authorConnectionIndex;

        if (payload.action === 'ice' || payload.action === 'sdp') {
            var obj = {
                time: (new Date()).getTime(),
                payload: payload,
                author: playerName,
                authorConnectionIndex: authorConnectionIndex,
            };
            // broadcast message to all connected clients
            var json = JSON.stringify({ type:'message', data: obj });
            var peerConnectionIndex = payload.peerConnectionIndex || null;
            wsServer.broadcast(json, peerConnectionIndex);
            return;
        } else if (action === 'register') {
            // first message sent by user is their name
            var name = payload.value;
            // remember user name
            console.log((new Date()) + ' Player is connected as: ' + name);
            
            var existingPlayers = await players.getPlayers();

            if (existingPlayers.length === 0) {
                // opening table
                await dealer.openTable();
            }
            var player = existingPlayers.filter(a => a.name === name);
            var playerId;
            player = player && player.length > 0 && player[0];
            var isGameStarted = await dealer.isGameStarted();
            if (!player) {
                playerName = name;
                playerId= existingPlayers.length + 1;
            // add players
                await players.addPlayer({
                    id: playerId,
                    name: name,
                    isActive: !isGameStarted,
                    connectionIndex: index
                });
            } else {
                // existing player: update connectionIndex
                playerId=player.id;
                await players.updatePlayer({
                    id: playerId,
                    connectionIndex: index
                })
            }

            // send response to emitter only
            var response = {
                playerRegistered: true,
                connectionIndex: index,
                playerId: playerId
            };
            var obj = {
                time: (new Date()).getTime(),
                payload: response,
                author: name,
                authorConnectionIndex: index
            };
            var json = JSON.stringify({ type:'message', data: obj });
            clients[index].send(json);

        } else if (action === 'start') {
            value = parseInt(value);
            // start game => reset player and deal cards
            var playerReady = await players.start(value);
            var dealerReady = await dealer.reset();
            if (playerReady && dealerReady) {
                await players.moveDealer(id);
                await dealer.addHistory({
                    action:'start', timestamp: Date.now()
                });
            } else {
                error.push('Not ready to start');
            }
        } else if (action === 'reset') {
            console.log('reset')
            await players.reset();
            await dealer.closeTable();
            await dealer.addHistory({
                action:'reset', timestamp: Date.now()
            });
        } else if (action === 'pause') {
            // put the game in pause => stop blind timer    
        
        } else if (action === 'deal') {
            // start turn, deal new cards and move dealer
            if (dealer.isReadyToDeal()) {
                var updatedPlayers = await players.getPlayers();
                await dealer.dealPlayerCard(updatedPlayers);
                await players.hideCards();
                await dealer.addHistory({
                    action:'deal', timestamp: Date.now()
                });
            }
            // raise, call, fold
        } else if (action === 'raise') {
            value = parseInt(value);
            // update chipValue value and change player
            var player = await players.getPlayer(id);
            var pls = await players.updatePlayer({
                id: id,
                raise: value,
                betValue: player.betValue + value,
                chipValue: player.chipValue - value,
                call: false,
                check: false,
                isPlayerTurn: false
            });
            await next(id);
        } else if (action === 'call') {
            value = parseInt(value);
            // update chipValue value and change player
            var player = await players.getPlayer(id);
            var pls = await players.updatePlayer({
                id: id,
                betValue: value,  // maxbet
                call: true,
                chipValue: player.chipValue - (value - player.betValue),
                raise: 0,
                check: false,
                isPlayerTurn: false
            });
            await next(id);                
        } else if (action === 'fold') {
            // update fold and change player
            var player = await players.getPlayer(id);
            var pls = await players.updatePlayer({
                id: id,
                fold: true,
                call: false,
                raise: 0,
                check: false,
                isPlayerTurn: false
            });
            await next(id);
        } else if (action === 'check') {
            var pls = await players.updatePlayer({
                id: id,
                raise: 0,
                call: false,
                check: true,
                isPlayerTurn: false
            });
            await next(id);
        }

        // getPlayers to send to all client
        result['players'] = await players.getPlayers();
        for (var i=0; i < clients.length; i++) {
            // only send cards for this client
            var player = result['players'].filter(a => a.connectionIndex === i)[0];
            result['dealer'] = player ? await dealer.toSend(result['players'], player) : await dealer.getCards();
            console.log('sending result...')
            // we want to keep history of all sent messages
            var obj = {
                time: (new Date()).getTime(),
                payload: result,
                author: playerName,
                authorConnectionIndex: i
            };
            // broadcast message to all connected clients
            var json = JSON.stringify({ type:'message', data: obj });
            clients[i].send(json);
        }
    });
    // user disconnected
    connection.on('close', async function(connection) {
        if (playerName !== false) {
        console.log((new Date()) + " Peer "
            + connection.remoteAddress + " disconnected.");
        // remove user from the list of connected clients
        clients = clients.filter(a=>a.name!==playerName);
        // push back user's color to be reused by another user
        }
    });
});
