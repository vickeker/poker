const players = require('./routes/players.js');
const dealer = require('./routes/dealer.js');

// websocket and http servers
var webSocketsServerPort = 3001;
var webSocketServer = require('websocket').server;
var http = require('http');
var clients = [];

/**
 * HTTP server
 */
var server = http.createServer(function(request, response) {
});
server.listen(webSocketsServerPort, function() {
    console.log((new Date()) + " Server is listening on port "
        + webSocketsServerPort);
});

var wsServer = new webSocketServer({
    httpServer: server
});

/**
 * Helper function for escaping input strings
 */
function htmlEntities(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function next (id) {
    console.log('processing next player...');
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
                console.log(index);
                console.log(pl)
                if (pl.chipValue > 0) {
                    nextPlayer = pl;
                    break;
                }
                index = index + 1 <= playing.length -1 ? index + 1 : 0;
            }
            console.log('next player', nextPlayer);
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
                        console.log('next player needs to play');
                        isEndOfPhase = false;
                    } else if (nextPlayer.raise > 0 && nextPlayer.betValue === maxBetPlayer) {
                        // Next valid player raised and has biggest bet => end of turn
                        console.log('next player has raised and is maxbet');
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
                var winners = await dealer.updateWinner(pls)
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

wsServer.on('request', function(request) {
    console.log((new Date()) + ' Connection from origin '
        + request.origin + '.');
    // accept connection - you should check 'request.origin' to
    // make sure that client is connecting from your website
    // (http://en.wikipedia.org/wiki/Same_origin_policy)
    var connection = request.accept(null, request.origin); 

    // we need to know client index to remove them on 'close' event
    var index = clients.push(connection) - 1;
    var playerName = false;
    console.log((new Date()) + ' Connection accepted.');

    // user sent some message
    connection.on('message', async function(message) {
        if (message.type === 'utf8') { // accept only text
            var payload = JSON.parse(message.utf8Data);
            console.log(payload)
            var id = payload.playerId
            var name = payload.name;
            var action = payload.action;
            var value = payload.value;
            var data = payload.data;
            var result = {};
            var error = [];
        // first message sent by user is their name
            if (playerName === false && name) {
                // remember user name
                console.log((new Date()) + ' Player is connected as: ' + name);
                
                var existingPlayers = await players.getPlayers();

                if (existingPlayers.length === 0) {
                    // opening table
                    await dealer.openTable();

                }
                console.log('players', existingPlayers);
                var isNewPlayer = existingPlayers.filter(a => a.name === name).length === 0;
                
                if (isNewPlayer) {
                    console.log('new player');
                    playerName = name;
                // add players
                    await players.addPlayer({
                        id: existingPlayers.length + 1,
                        name: name
                    });
                }
            } else if (action && value && id) { // log and broadcast the message
                console.log((new Date()) + ' Received Message from '
                            + id + ': ' + message.utf8Data);

                // postData
                if (action === 'start') {
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
                    await players.start(0);
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
                    console.log('value', value);
                    console.log('old chip value', player.chipValue);
                    console.log('old bet', player.betValue);
                    console.log('new chipValue', player.chipValue - (value - player.betValue));
                    var pls = await players.updatePlayer({
                        id: id,
                        betValue: value,  // maxbet
                        call: true,
                        chipValue: player.chipValue - (value - player.betValue),
                        raise: 0,
                        check: false,
                        isPlayerTurn: false
                    });
                    console.log('player after update', pls.find(a=>a.id===id));
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
            }

            // getData to send to client
            result['players'] = await players.getPlayers();
            result['dealer'] = await dealer.getCards();
            // console.log('result', result);
            console.log('sending result...')
            // we want to keep history of all sent messages
            var obj = {
                time: (new Date()).getTime(),
                payload: result,
                author: playerName,
            };
            // broadcast message to all connected clients
            var json = JSON.stringify({ type:'message', data: obj });
            for (var i=0; i < clients.length; i++) {
                clients[i].sendUTF(json);
            }
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