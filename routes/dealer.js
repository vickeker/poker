const fs = require('fs');
const path = require('path');
var Hand = require('pokersolver').Hand;

const dealerFilePath = path.join(__dirname, './dealer.json')
const players = require('./players.js');

  const getCards = async () => {
    try {
        const data = fs.readFileSync(dealerFilePath);
        const cards = JSON.parse(data);
        if (!cards) {
          const err = new Error('Deck not found');
          err.status = 404;
          throw err;
        }
        return cards;
      } catch (e) {
        throw e;
      }
  };

  const getAvailableCards = async () => {
      try {
        var cards = await getCards();
        var deck = cards.deck;
        var burnt = cards.burnt;
        var flop = cards.flop;
        var river = cards.river;
        var turn = cards.turn;
        var players = Object.values(cards.players);
        var allPlayersCards = [];
        players.forEach(pl => {
            allPlayersCards = [
                ...allPlayersCards,
                ...pl
            ];
        });
        var usedCards = [...burnt, ...flop, ...river, ...turn, ...allPlayersCards];
        var availableCards = deck.filter(card => !usedCards.includes(card));
        return availableCards;
    } catch (e) {
        throw e;
      }
  }

  const dealCard = async (burn) => {
    try {
        var cards = await getCards();
        var deck = cards.deck;
        var burnt = cards.burnt;
        var flop = cards.flop;
        var river = cards.river;
        var turn = cards.turn;
        var players = Object.values(cards.players);
        var allPlayersCards = [];
        players.forEach(pl => {
            allPlayersCards = [
                ...allPlayersCards,
                ...pl
            ];
        });
        var usedCards = [...burnt, ...flop, ...river, ...turn, ...allPlayersCards];
        var availableCards = deck.filter(card => !usedCards.includes(card));
        if (burn) {
            var burningIndex = Math.floor((Math.random() * availableCards.length));
            var burningCard = availableCards[burningIndex];
            burnt = [
                ...burnt,
                burningCard
            ];
            usedCards = [
                ...usedCards,
                burningCard
            ];
            availableCards = availableCards.filter(a=>a!==burningCard);
        }
        var newCardIndex = Math.floor((Math.random() * availableCards.length));
        var newCard = availableCards[newCardIndex];
        console.log(availableCards);
        console.log(newCardIndex);
        // update burnt cards
        var data = fs.readFileSync(dealerFilePath);
        data = JSON.parse(data);
        data.burnt = burnt;
        const newDealer = data;
        fs.writeFileSync(dealerFilePath, JSON.stringify(newDealer));
        return newCard;
    } catch (e) {
      throw e;
    }
  };

  const dealFlop = async () => {
    var flopMap = [0, 1, 2];
    try {
        var promises = flopMap.map(async index => {
            return dealCard();
        });
        var flop = await Promise.all(promises);
        console.log('flop', flop);
        var data = fs.readFileSync(dealerFilePath);
        data = JSON.parse(data);
        data.flop = flop;
        const newDealer = data;
        fs.writeFileSync(dealerFilePath, JSON.stringify(newDealer));
      return flop;
    } catch (e) {
      throw e;
    }
  };

  const dealRiver = async () => {
    try {
        var river = await dealCard();
        console.log('river', river);
        var data = fs.readFileSync(dealerFilePath);
        data = JSON.parse(data);
        data.river = [river];
        const newDealer = data;
        fs.writeFileSync(dealerFilePath, JSON.stringify(newDealer));
      return river;
    } catch (e) {
      throw e;
    }
  };

  const dealerTurn = async () => {
    try {
        var turn = await dealCard();
        console.log('turn', turn);
        var data = fs.readFileSync(dealerFilePath);
        data = JSON.parse(data);
        data.turn = [turn];
        const newDealer = data;
        fs.writeFileSync(dealerFilePath, JSON.stringify(newDealer));
      return turn;
    } catch (e) {
      throw e;
    }
  };

  const isReadyToDeal = async () => {
    try {
        var data = fs.readFileSync(dealerFilePath);
        data = JSON.parse(data);
        if (data.readyToDeal) {
            return true;
        } else {
            return false;
        }
    } catch (e) {
        throw e
    }
  }

  const dealPlayerCard = async (pls) => {
      try {
        var data = fs.readFileSync(dealerFilePath);
        data = JSON.parse(data);
        data.flop = [];
        data.turn = [];
        data.river = [];
        data.players = {};
        var availableCards = await getAvailableCards();
        // console.log('gonna get playsers...');
        // var pl = await players.getPlayers();
        console.log('dealing card', pls);
        pls = pls.filter(a => a.isActive);
        var playersCards = {};
        pls.forEach(player => {
            var card1Index = Math.floor((Math.random() * availableCards.length));
            var card1 = availableCards[card1Index];
            availableCards = availableCards.filter(a=>a!==card1);
            var card2Index = Math.floor((Math.random() * availableCards.length));
            var card2 = availableCards[card2Index];
            availableCards = availableCards.filter(a=>a!==card2);
            playersCards[player.id] = [card1, card2];
        });
        // update blind start time
        var currBlind = data.currBlind;
        currBlind['startTime'] = Date.now()
        data.currBlind = currBlind;
        data.players = playersCards;
        data.readyToDeal = false;
        fs.writeFileSync(dealerFilePath, JSON.stringify(data));
        return true;
    } catch (e) {
        throw e;
      }
  }

  const updateBlinds = async () => {
    try {
        var time = Date.now();
        var data = fs.readFileSync(dealerFilePath);
        var dealer = JSON.parse(data);
        var currBlind = dealer.currBlind;
        var blindTime = dealer.blindTime*1000; // in ms
        if (time - blindTime > currBlind.startTime) {
            console.log('updating blinds')
            // time to update blinds
            var blinds = dealer.blinds;
            var newBlindIndex = currBlind.index < blinds.length-1 ? currBlind.index+1 : currBlind.index;
            var newBlind = blinds[newBlindIndex];
            newBlind.startTime = time;
            newBlind.index = newBlindIndex;
            dealer.currBlind = newBlind;
            console.log(newBlind);
            fs.writeFileSync(dealerFilePath, JSON.stringify(dealer));
            await addHistory({
                action: 'blind',
                value: {
                    smallBlind: newBlind.smallBlind,
                    bigBlind:newBlind.bigBlind
                },
                timestamp: time
            });
        }
    } catch (e) {
      throw e;
    }
  };

  const getBlinds = async () => {
    try {
        var data = fs.readFileSync(dealerFilePath);
        var dealer = JSON.parse(data);
        var blinds = dealer.currBlind;
        return blinds;
    } catch (e) {
      throw e;
    } 
  }

  const reset = async () => {
    try {
        var data = fs.readFileSync(dealerFilePath);
        data = JSON.parse(data)
        data.isStarted = true;
        data.readyToDeal = true;
        const newDealer = data;
        fs.writeFileSync(dealerFilePath, JSON.stringify(newDealer));
      return true;
    } catch (e) {
        console.log(e);
      return false;
    }
  };

  const addHistory = async (log) => {
    var data = fs.readFileSync(dealerFilePath);
    var dealer = JSON.parse(data);
    var history = dealer.history;
    history = [
        log,
        ...history
    ];
    dealer.history = history;
    fs.writeFileSync(dealerFilePath, JSON.stringify(dealer));
  }

  const updateWinner = async (pl) => {
    var data = fs.readFileSync(dealerFilePath);
    var dealer = JSON.parse(data);
    pl = pl.filter(a => a.isActive && !a.fold);
    console.log(pl);
    var playersCards = [];
    pl.forEach(player => {
        playersCards.push({
            id: player.id,
            hand: [
                dealer.players[player.id],
                ...dealer.flop,
                ...dealer.river,
                ...dealer.turn
            ]
        });
    })
    var hands = playersCards.map(a => {
        var formattedHand = a.hand.map(card => {
            return card[0] + card[1].toLowerCase();
        })
        return Hand.solve(formattedHand);
    });
    console.log(hands);
    var winner = Hand.winners(hands);
    winner = Array.isArray(winner) ? winner : [winner];
    var winnerPlayers = winner.map((value) => {
        var winnerIndex = -1;
        hands.forEach((hand, key) => {
            if(hand.toString() === value.toString()){
                winnerIndex = key;
            }
        });
        var winnerPlayer = playersCards[winnerIndex];
        return winnerPlayer.id
    });
    
    // add winner and hands to logs
    var promises = winnerPlayers.map(a => {
        console.log(a);
        var log = {
            action: "win",
            playerId: a,
            hand: winner[0].cards,
            name: winner[0].name
        }
        return addHistory(log);
    });
    await Promise.all(promises);
    // update players chips
    return winnerPlayers;
  }

const openTable = async () => {
    try {
        var data = fs.readFileSync(dealerFilePath);
        data = JSON.parse(data);
        data.flop = [];
        data.river = [];
        data.turn = [];
        data.burnt = [];
        data.players = {};
        data.history = [];
        data.isStarted = false;
        data.readyToDeal = false;
        data.currBlind = {
            ...data.blinds[0],
            index: 0,
            timestamp: Date.now()
        };
        const newDealer = data;
        fs.writeFileSync(dealerFilePath, JSON.stringify(newDealer));
        return true;
    } catch (e) {
        console.log(e);
        return false;
    }
}

const closeTable = () => {
    try {
        console.log('closing table');
        var data = fs.readFileSync(dealerFilePath);
        data = JSON.parse(data);
        data.flop = [];
        data.river = [];
        data.turn = [];
        data.burnt = [];
        data.players = {};
        data.history = [];
        data.isStarted = false;
        data.readyToDeal = false;
        const newDealer = data;
        fs.writeFileSync(dealerFilePath, JSON.stringify(newDealer));
        return true;
    } catch (e) {
        console.log(e);
        return false;
    }
}

const isGameStarted = async () => {
  var data = fs.readFileSync(dealerFilePath);
  data = JSON.parse(data);
  return data.isStarted;
}

const toSend = async (players, player) => {
  console.log('client', player)
  var data = fs.readFileSync(dealerFilePath);
  data = JSON.parse(data);
  var playerCards = data.players;
  players.forEach(pl => {
    var show = pl.showCard;
    if (!show && pl.id!==player.id) {
      delete playerCards[pl.id];
    }
  });
  data.players = playerCards;
  return data;
}

module.exports = {
    getCards,
    dealCard,
    dealFlop,
    dealerTurn,
    dealRiver,
    reset,
    dealPlayerCard,
    getBlinds,
    updateBlinds,
    updateWinner,
    addHistory,
    openTable,
    closeTable,
    isReadyToDeal,
    isGameStarted,
    toSend
};