const fs = require('fs');
const path = require('path');
const dealer = require('./dealer.js');
const playersFilePath = path.join(__dirname, './players.json');

const getPlayers = async () => {
  try {
    const data = fs.readFileSync(playersFilePath);
    const players = JSON.parse(data);
    if (!players) {
      const err = new Error('Players not found');
      err.status = 404;
      throw err;
    }
    return players;
  } catch (e) {
    console.log(e);
  }
};

const getPlayer = async (id) => {
    try {
      const data = fs.readFileSync(playersFilePath);
      const players = JSON.parse(data);
      const player = players.find(player => player.id === id);
      if (!player) {
        const err = new Error('Player not found');
        err.status = 404;
        throw err;
      }
      return player;
    } catch (e) {
      throw e;
    }
  };

  const addPlayer = async (player) => {
    try {
      const data = fs.readFileSync(playersFilePath);
      const players = JSON.parse(data);
      const newPlayer = {
        id: player.id,
        name: player.name,
        chipValue: player.chipValue,
        dealer: false,
        smallBlind: false,
        bigBlind: false,
        avatar: null,
        fold: false,
        check: false,
        call: true,
        raise: 0,
        showCard: false,
        isActive: player.isActive,
        isPlayerTurn: false,
        connectionIndex: player.connectionIndex
      };
      players.push(newPlayer);
      fs.writeFileSync(playersFilePath, JSON.stringify(players));
      return true;
    } catch (e) {
      throw e;
    }
  };

  const updatePlayer = async (playerData) => {
    try {
      const data = fs.readFileSync(playersFilePath);
      const players = JSON.parse(data);
      const player = players.find(player => parseInt(player.id) === parseInt(playerData.id));
      if (!player) {
        const err = new Error('Player not found');
        err.status = 404;
        throw err;
      }
      const newPlayersData = {
        ...player,
        ...playerData,
        id: playerData.id
      };
      const newPlayers = players.map(player => {
        if (parseInt(player.id) === parseInt(playerData.id)) {
          return newPlayersData;
        } else {
          return player;
        }
      });
      fs.writeFileSync(playersFilePath, JSON.stringify(newPlayers));
      return newPlayers;
    } catch (e) {
      throw e;
    }
  };

  const deletePlayer = async (id) => {
    try {
      const data = fs.readFileSync(playersFilePath);
      const players = JSON.parse(data);
      const player = players.find(player => player.id === id);
      if (!player) {
        const err = new Error('Player players not found');
        err.status = 404;
        throw err;
      }
      const newPlayers = players.map(player => {
        if (player.id === id) {
          return null;
        } else {
          return player;
        }
      })
      .filter(player => player !== null);
      fs.writeFileSync(playersFilePath, JSON.stringify(newPlayers));
      return true;
    } catch (e) {
      throw e;
    }
  };

  const nextPlayer = async (id) => {
    const data = fs.readFileSync(playersFilePath);
    var players = JSON.parse(data);
    players = players.filter(a => a.isActive && !a.fold && a.chipValue > 0);
    var currIndex = players.findIndex(a => a.id === id);
    var nextPlayerIndex = currIndex + 1 <= players.length-1 ? currIndex + 1 : 0; 
    var nextPlayer = players[nextPlayerIndex];
    var promises = players.map(async pl => {
      var isPlayerTurn = pl.id === nextPlayer.id ? true : false;
      return updatePlayer({
        id: pl.id,
        isPlayerTurn: isPlayerTurn
      });
    });
    Promise.all(promises);
  }

  const moveDealer = async (id = null) => {
    const blinds = await dealer.getBlinds();
    const data = fs.readFileSync(playersFilePath);
    var players = JSON.parse(data);
    players = players.filter(a => a.isActive);
    if (!id) {
      var currDealerIndex = players.findIndex(a => a.dealer === true);
      var newIndex = currDealerIndex + 1 <= players.length-1 ? currDealerIndex + 1 : 0;
      var nextDealer = players[newIndex];
      var currSBIndex = players.findIndex(a => a.smallBlind === true);
      var newSBIndex = currSBIndex + 1 <= players.length-1 ? currSBIndex + 1 : 0;
      var nextSB = players[newSBIndex];
    } else {
      // new game, dealer id is passed as paraneter
      var nextDealer = players.find(pl => pl.id ===id);
      var dealerIndex = players.findIndex(pl => pl.id === id);
      var newSBIndex = dealerIndex + 1 <= players.length-1 ? dealerIndex + 1 : 0;
      var nextSB = players[newSBIndex];
    }
    var newBBIndex = newSBIndex + 1 <= players.length-1 ? newSBIndex + 1 : 0;
    var nextBB = players[newBBIndex];
    var newTurnIndex = newBBIndex + 1 <= players.length-1 ? newBBIndex + 1 : 0;
    var newTurnPlayer = players[newTurnIndex];

    if (nextDealer && nextSB && nextBB && newTurnPlayer && blinds && players.length > 0) {
      var promises = players.map(async pl => {
        var dl = pl.id === nextDealer.id ? true : false;
        var sb = pl.id === nextSB.id ? true : false;
        var bb = pl.id === nextBB.id ? true : false;
        var turn = pl.id === newTurnPlayer.id ? true : false;
        var initBet = 0;
        if (sb) initBet = blinds.smallBlind;
        if (bb) initBet = blinds.bigBlind;
        return updatePlayer({
          id: pl.id,
          dealer: dl,
          chipValue: pl.chipValue - initBet,
          smallBlind: sb,
          bigBlind: bb,
          betValue: initBet,
          isPlayerTurn: turn,
          raise: 0,
          call: false,
          fold: false,
          check: false
        });
      });
      await Promise.all(promises);
    }
  }

  const updateActivePlayer = async () => {
    const data = fs.readFileSync(playersFilePath);
    var players = JSON.parse(data);
    players = players.filter(a => a.isActive);
    var promises = players.map(async pl => {
      if (pl.chipValue <= 0) {
          return updatePlayer({
          id: pl.id,
          isActive: false
        });
      }
    });
    await Promise.all(promises)
  }

  const resetPlayerCallRaise = async () => {
    const data = fs.readFileSync(playersFilePath);
    var players = JSON.parse(data);
    players = players.filter(a => a.isActive && !a.fold);
    var promises = players.map(async pl => {
        return updatePlayer({
          id: pl.id,
          raise: 0,
          call: false,
          check: false
        });
    });
    await Promise.all(promises);
  }

  const updateWinners = async (winners) => {
    const data = fs.readFileSync(playersFilePath);
    var players = JSON.parse(data);
    var potValue = 0;
    players.forEach(pl => {
      potValue += pl.betValue;
    });
    var updatePromises = winners.map(id => {
      winValue = Math.floor(potValue / winners.length);
      var pl = players.find(a => parseInt(a.id) === parseInt(id));
      return updatePlayer({
        id: id,
        chipValue: pl.chipValue + winValue,
      });
    });
    await Promise.all(updatePromises);
    players = players.filter(a => a.isActive && !a.fold);
    var updateShowCard = players.map(pl => {
      return updatePlayer({
        id: pl.id,
        showCard: true
      });
    });
    await Promise.all(updateShowCard);
  }

  const start = async (initChipValue) => {
    const data = fs.readFileSync(playersFilePath);
    var players = JSON.parse(data);
    players = players.filter(pl => pl.isActive);
    if (players.length > 1) {
      var promises = players.map(pl => {
        return updatePlayer({
          id: pl.id,
          chipValue: initChipValue,
          raise: 0,
          call: false,
          fold: false,
          check: false,
          betValue: 0,
          showCard: false,
          isPlayerTurn: false,
          dealer: false,
          smallBlind: false,
          bigBlind: false
        });
      });
      await Promise.all(promises);
      return true;
    } else {
      return false;
    }

  }

  const hideCards = async () => {
    const data = fs.readFileSync(playersFilePath);
    var players = JSON.parse(data);
    players = players.filter(pl => pl.isActive);
    var updateShowCard = players.map(pl => {
      return updatePlayer({
        id: pl.id,
        showCard: false
      });
    });
    await Promise.all(updateShowCard);
  }

  const reset = async () => {
    const data = [];
    fs.writeFileSync(playersFilePath, JSON.stringify(data));
  }

module.exports = {
  getPlayers,
  getPlayer,
  addPlayer,
  updatePlayer,
  deletePlayer,
  nextPlayer,
  moveDealer,
  updateActivePlayer,
  resetPlayerCallRaise,
  updateWinners,
  start,
  hideCards,
  reset
};