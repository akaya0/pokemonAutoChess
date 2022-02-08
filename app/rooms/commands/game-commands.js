const Command = require('@colyseus/command').Command;
const {STATE, COST, TYPE, ITEMS, XP_PLACE, RARITY, PKM, BATTLE_RESULT, NEUTRAL_STAGE} = require('../../models/enum');
const Player = require('../../models/colyseus-models/player');
const PokemonFactory = require('../../models/pokemon-factory');
const ItemFactory = require('../../models/item-factory');
const UserMetadata = require('../../models/mongo-models/user-metadata');
const Items = require('../../models/colyseus-models/items');

class OnShopCommand extends Command {
  execute({id, index}) {
    if (id !== true && index !== true && this.state.players.has(id)) {
      const player = this.state.players.get(id);
      if (player.shop[index]) {
        const name = player.shop[index];
        const pokemon = PokemonFactory.createPokemonFromName(name);

        if (player.money >= pokemon.cost && (this.room.getBoardSize(player.board) < 8 ||
        (this.room.getPossibleEvolution(player.board, pokemon.name) && this.room.getBoardSize(player.board) == 8))) {
          player.money -= pokemon.cost;
          pokemon.positionX = this.room.getFirstAvailablePositionInBoard(player.id);
          pokemon.positionY = 0;
          player.board.set(pokemon.id, pokemon);

          if (pokemon.rarity == RARITY.MYTHICAL) {
            this.state.shop.assignShop(player);
          } else {
            player.shop[index] = '';
          }
          this.room.updateEvolution(id);
          this.room.updateEvolution(id);
        }
      }
    }
  }
}

class OnItemCommand extends Command {
  execute({playerId, id}) {
    if (this.state.players.has(playerId)) {
      const player = this.state.players.get(playerId);
      if (player.itemsProposition.includes(id)) {
        player.stuff.add(id);
      }
      while (player.itemsProposition.length > 0) {
        player.itemsProposition.pop();
      }
    }
  }
}

class OnDragDropCommand extends Command {
  execute({client, detail}) {
    /*
    client.send('info', {
      title:'Information',
      info:'Tu es un sanglier'
    });
    */
    let success = false;
    let dittoReplaced = false;
    const message = {
      'updateBoard': true,
      'updateItems': true
    };
    const playerId = client.auth.uid; ;
    if (this.state.players.has(playerId)) {
      if (detail.objType == 'pokemon') {
        message.updateItems = false;
        if (this.state.players.get(playerId).board.has(detail.id)) {
          const pokemon = this.state.players.get(playerId).board.get(detail.id);
          const x = parseInt(detail.x);
          const y = parseInt(detail.y);
          if (pokemon.name == PKM.DITTO) {
            const pokemonToClone = this.room.getPokemonByPosition(playerId, x, y);
            if (pokemonToClone && pokemonToClone.rarity != RARITY.MYTHICAL && !pokemonToClone.types.includes(TYPE.FOSSIL)) {
              dittoReplaced = true;
              const replaceDitto = PokemonFactory.createPokemonFromName(PokemonFactory.getPokemonBaseEvolution(pokemonToClone.name));
              this.state.players.get(playerId).board.delete(detail.id);
              const position = this.room.getFirstAvailablePositionInBoard(playerId);
              if (position !== undefined) {
                replaceDitto.positionX = position;
                replaceDitto.positionY = 0;
                this.state.players.get(playerId).board.set(replaceDitto.id, replaceDitto);
                success = true;
                message.updateBoard = false;
              }
            }
          } else {
            if ( y == 0 && pokemon.positionY == 0) {
              this.room.swap(playerId, pokemon, x, y);
              success = true;
            } else if (this.state.phase == STATE.PICK) {
              const teamSize = this.room.getTeamSize(this.state.players.get(playerId).board);
              if (teamSize < this.state.players.get(playerId).experienceManager.level) {
                this.room.swap(playerId, pokemon, x, y);
                success = true;
              } else if (teamSize == this.state.players.get(playerId).experienceManager.level) {
                const empty = this.room.isPositionEmpty(playerId, x, y);
                if (!empty) {
                  this.room.swap(playerId, pokemon, x, y);
                  success = true;
                  message.updateBoard = false;
                } else {
                  if ((pokemon.positionY != 0 && y != 0) || y == 0) {
                    this.room.swap(playerId, pokemon, x, y);
                    success = true;
                    message.updateBoard = false;
                  }
                }
              }
            }
          }
          this.state.players.get(playerId).synergies.update(this.state.players.get(playerId).board);
          this.state.players.get(playerId).effects.update(this.state.players.get(playerId).synergies);
          this.state.players.get(playerId).boardSize = this.room.getTeamSize(this.state.players.get(playerId).board);
        }

        if (!success && client.send) {
          client.send('DragDropFailed', message);
        }
        if (dittoReplaced) {
          this.room.updateEvolution(playerId);
          this.room.updateEvolution(playerId);
        }
      }
      if (detail.objType == 'item') {
        message.updateBoard = false;
        message.updateItems = true

        const item = detail.id;
        const player = this.state.players.get(playerId)

        if (!player.stuff.has(item)) {
          client.send('DragDropFailed', message)
          return
        }

        const x = parseInt(detail.x);
        const y = parseInt(detail.y);

        const [pokemon, id] = player.getPokemonAt(x, y)

        // check if full items
        if(pokemon.items.length >= 3){
          client.send('DragDropFailed', message);
          return
        }

        //SPECIAL CASES: create a new pokemon on item equip
        let newItemPokemon = null
        switch(pokemon.name){
          case PKM.EEVEE:
            switch(item){
              case ITEMS.WATER_STONE:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.VAPOREON)
                break
              case ITEMS.FIRE_STONE:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.FLAREON)
                break
              case ITEMS.THUNDER_STONE:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.JOLTEON)
                break
              case ITEMS.NIGHT_STONE:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.UMBREON)
                break
              case ITEMS.MOON_STONE:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.SYLVEON)
                break
              case ITEMS.LEAF_STONE:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.LEAFEON)
                break
              case ITEMS.DAWN_STONE:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.ESPEON)
                break
              case ITEMS.ICY_ROCK:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.GLACEON)
                break
            }
            newItemPokemon.items.add(item)
            break
          case PKM.DITTO:
            switch(item){
              case ITEMS.DOME_FOSSIL:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.KABUTO)
                break
              case ITEMS.HELIX_FOSSIL:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.OMANYTE)
                break
              case ITEMS.OLD_AMBER:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.AERODACTYL)
                break
              case ITEMS.ROOT_FOSSIL:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.LILEEP)
                break
              case ITEMS.CLAW_FOSSIL:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.ANORITH)
                break
              case ITEMS.SKULL_FOSSIL:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.CRANIDOS)
                break
              case ITEMS.ARMOR_FOSSIL:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.SHIELDON)
                break
              case ITEMS.PLUME_FOSSIL:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.ARCHEN)
                break
              case ITEMS.COVER_FOSSIL:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.TIRTOUGA)
                break
              case ITEMS.JAW_FOSSIL:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.TYRUNT)
                break
              case ITEMS.SAIL_FOSSIL:
                newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.AMAURA)
                break
              default:
                client.send('DragDropFailed', message);
                return
            }
            break
          case PKM.GROUDON:
            case ITEMS.RED_ORB:
              newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.PRIMALGROUDON)
              newItemPokemon.items.add(item)
            break
          case PKM.KYOGRE:
            case ITEMS.BLUE_ORB:
              newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.PRIMALKYOGRE)
              newItemPokemon.items.add(item)
            break
          case PKM.RAYQUAZA:
            case ITEMS.DELTA_ORB:
              newItemPokemon = PokemonFactory.transformPokemon(pokemon, PKM.MEGARAYQUAZA)
              newItemPokemon.items.add(item)
            break
        }

        if(newItemPokemon){
          //delete the extra pokemons
          player.board.delete(id);
          player.board.set(newItemPokemon.id, newItemPokemon);
          player.stuff.remove(item);
          player.synergies.update(player.board);
          player.effects.update(player.synergies);
          player.boardSize = this.room.getTeamSize(player.board);
          
        }
        else{
          // regular equip
          pokemon.items.add(item);
          player.stuff.remove(item);
        }
      }
    }
    
  }
}

class OnSellDropCommand extends Command {
  execute({client, detail}) {
    if (this.state.players.has(client.auth.uid) &&
      this.state.players.get(client.auth.uid).board.has(detail.pokemonId)) {
      const pokemon = this.state.players.get(client.auth.uid).board.get(detail.pokemonId);
      const player = this.state.players.get(client.auth.uid);

      if (PokemonFactory.getPokemonBaseEvolution(pokemon.name) == PKM.EEVEE) {
        player.money += COST[pokemon.rarity];
      } else if (pokemon.types.includes(TYPE.FOSSIL)) {
        player.money += 5 + COST[pokemon.rarity] * pokemon.stars;
      } else {
        player.money += COST[pokemon.rarity] * pokemon.stars;
      }

      const items = pokemon.items.getAllItems();
      items.forEach((it)=>{
        player.stuff.add(it);
      });

      player.board.delete(detail.pokemonId);

      player.synergies.update(player.board);
      player.effects.update(player.synergies);
      player.boardSize = this.room.getTeamSize(player.board);
    }
  }
}

class OnRefreshCommand extends Command {
  execute(id) {
    if (this.state.players.has(id)) {
      const player = this.state.players.get(id);
      if (player.money >= 2) {
        this.state.shop.assignShop(player);
        player.money -= 2;
      }
    }
  }
}

class OnLockCommand extends Command {
  execute(id) {
    if (this.state.players.has(id)) {
      this.state.players.get(id).shopLocked = !this.state.players.get(id).shopLocked;
    }
  }
}

class OnLevelUpCommand extends Command {
  execute(id) {
    if (this.state.players.has(id)) {
      const player = this.state.players.get(id);
      if (player.money >= 4 && player.experienceManager.canLevel()) {
        player.experienceManager.addExperience(4);
        player.money -= 4;
      }
    }
  }
}

class OnJoinCommand extends Command {
  execute({client, options, auth}) {
    UserMetadata.findOne({'uid': auth.uid}, (err, user)=>{
      if (user) {
        this.state.players.set(client.auth.uid, new Player(
            user.uid,
            user.displayName,
            user.elo,
            user.avatar,
            false,
            this.state.players.size + 1
        ));
        if (client && client.auth && client.auth.displayName) {
          console.log(`${client.auth.displayName} ${client.id} join game room`);
        }

        // console.log(this.state.players.get(client.auth.uid).tileset);
        this.state.shop.assignShop(this.state.players.get(client.auth.uid));
        if (this.state.players.size >= 8) {
        // console.log('game elligible to xp');
          this.state.elligibleToXP = true;
        }
      }
    });
  }
}

class OnLeaveCommand extends Command {
  execute({client, consented}) {
  }
}

class OnUpdateCommand extends Command {
  execute(deltaTime) {
    if (deltaTime) {
      let updatePhaseNeeded = false;
      this.state.time -= deltaTime;
      if (Math.round(this.state.time/1000) != this.state.roundTime) {
        this.state.roundTime = Math.round(this.state.time/1000);
      }
      if (this.state.time < 0) {
        updatePhaseNeeded = true;
      } else if (this.state.phase == STATE.FIGHT) {
        let everySimulationFinished = true;

        this.state.players.forEach((player, key) => {
          if (!player.simulation.finished) {
            if (everySimulationFinished) {
              everySimulationFinished = false;
            }
            player.simulation.update(deltaTime);
          }
        });

        if (everySimulationFinished) {
          updatePhaseNeeded = true;
        }
      }
      if (updatePhaseNeeded) {
        return [new OnUpdatePhaseCommand()];
      }
    }
  }
}

class OnUpdatePhaseCommand extends Command {
  execute() {
    if (this.state.phase == STATE.PICK) {
      const commands = this.checkForLazyTeam();
      if (commands.length != 0) {
        return commands;
      }
      this.initializeFightingPhase();
    } else if (this.state.phase == STATE.FIGHT) {
      this.computeLife();
      this.rankPlayers();
      this.checkDeath();
      const kickCommands = this.checkEndGame();
      if (kickCommands.length != 0) {
        return kickCommands;
      }
      this.computeIncome();
      this.initializePickingPhase();
    }
  }

  checkEndGame() {
    const commands = [];
    const numberOfPlayersAlive = this.room.getNumberOfPlayersAlive(this.state.players);

    if (numberOfPlayersAlive <= 1) {
      this.state.gameFinished = true;
      this.room.broadcast('info',
          {
            title: 'End of the game',
            info: 'We have a winner !'
          });
      // commands.push(new OnKickPlayerCommand());
    }
    return commands;
  }

  computePlayerDamage(redTeam, playerLevel, stageLevel) {
    let damage = playerLevel - 2;
    let multiplier = 1;
    if (stageLevel >= 10) {
      multiplier = 1.25;
    } else if (stageLevel >= 15) {
      multiplier = 1.5;
    } else if (stageLevel >= 20) {
      multiplier = 2.0;
    } else if (stageLevel >= 25) {
      multiplier = 3;
    } else if (stageLevel >= 30) {
      multiplier = 5;
    } else if (stageLevel >= 35) {
      multiplier = 8;
    }
    damage = damage * multiplier;
    if (redTeam.size > 0) {
      redTeam.forEach((pokemon, key) => {
        damage += pokemon.stars;
      });
    }
    damage = Math.max(Math.round(damage), 0);
    return damage;
  }

  rankPlayers() {
    const rankArray = [];
    this.state.players.forEach((player, key) => {
      if (player.alive) {
        rankArray.push({id: player.id, life: player.life});
      }
    });
    rankArray.sort(function(a, b) {
      return b.life - a.life;
    });
    rankArray.forEach((rankPlayer, index)=>{
      this.state.players.get(rankPlayer.id).rank = index + 1;
      this.state.players.get(rankPlayer.id).exp = XP_PLACE[index];
    });
  }

  computeLife() {
    this.state.players.forEach((player, key) => {
      if (player.simulation.blueTeam.size == 0) {
        if (player.opponentName != 'PVE') {
          if (player.getLastBattleResult() == BATTLE_RESULT.DEFEAT) {
            player.streak = Math.min(player.streak + 1, 5);
          } else {
            player.streak = 0;
          }
        }
        player.addBattleResult(player.opponentName, BATTLE_RESULT.DEFEAT, player.opponentAvatar);
        player.life = Math.max(0, player.life - this.computePlayerDamage(player.simulation.redTeam, player.experienceManager.level, this.state.stageLevel));
      } else if (player.simulation.redTeam.size == 0) {
        if (player.opponentName != 'PVE') {
          if (player.getLastBattleResult() == BATTLE_RESULT.WIN) {
            player.streak = Math.min(player.streak + 1, 5);
          } else {
            player.streak = 0;
          }
        }
        player.addBattleResult(player.opponentName, BATTLE_RESULT.WIN, player.opponentAvatar);
      } else {
        if (player.opponentName != 'PVE') {
          if (player.getLastBattleResult() == BATTLE_RESULT.DRAW) {
            player.streak = Math.min(player.streak + 1, 5);
          } else {
            player.streak = 0;
          }
        }
        player.addBattleResult(player.opponentName, BATTLE_RESULT.DRAW, player.opponentAvatar);
        player.life = Math.max(0, player.life - this.computePlayerDamage(player.simulation.redTeam, player.experienceManager.level, this.state.stageLevel));
      }
    });
  }

  computeIncome() {
    this.state.players.forEach((player, key) => {
      if (player.alive && !player.isBot) {
        player.interest = Math.min(Math.floor(player.money / 10), 5);
        player.money += player.interest;
        player.money += player.streak;
        if (player.getLastBattleResult() == BATTLE_RESULT.WIN) {
          player.money += 1;
        }
        player.money += 5;
        player.experienceManager.addExperience(2);

        player.board.forEach((pokemon, id) => {
          if (pokemon.positionX != 0) {
            if (pokemon.items.count(ITEMS.COIN_AMULET) != 0) {
              player.money += Math.round(Math.random() * 3) * pokemon.items.count(ITEMS.COIN_AMULET);
            }
          }
        });
      }
    });
  }

  checkDeath() {
    this.state.players.forEach((player, key) => {
      if (player.life <= 0) {
        player.alive = false;
      }
    });
  }

  initializePickingPhase() {
    this.state.phase = STATE.PICK;
    this.state.time = process.env.MODE == 'dev' ? 20000 : 30000;

    const isPVE = (this.getPVEIndex(this.state.stageLevel) >= 0);

    this.state.players.forEach((player, key) => {
      player.simulation.stop();
      if (player.alive) {
        if (player.isBot) {
          player.experienceManager.level = Math.min(9, Math.round(this.state.stageLevel/2));
        }
        if (isPVE && player.getLastBattleResult() == BATTLE_RESULT.WIN) {
          const items = ItemFactory.createRandomItems();
          // let items = process.env.MODE == 'dev' ? ItemFactory.createRandomFossils(): ItemFactory.createRandomItem();
          items.forEach((item)=>{
            player.itemsProposition.push(item);
          });
          // const item = ItemFactory.createRandomItem();
          // const item = ItemFactory.createSpecificItems([ITEMS.OLD_AMBER, ITEMS.FIRE_STONE]);
          // player.stuff.add(item);
        }
        player.opponentName = '';
        player.opponentAvatar = '';
        if (!player.shopLocked) {
          if (this.state.stageLevel == 10) {
            this.state.shop.assignFirstMythicalShop(player);
          } else if (this.state.stageLevel == 20) {
            this.state.shop.assignSecondMythicalShop(player);
          } else if (this.state.stageLevel == 2) {
            this.state.shop.assignDittoShop(player);
          } else if (this.state.stageLevel == 3) {
            this.state.shop.assignDittoShop(player);
          } else {
            this.state.shop.assignShop(player);
          }
        } else {
          player.shopLocked = false;
        }
        player.board.forEach((pokemon, key)=>{
          if (pokemon.fossilTimer !== undefined) {
            if (pokemon.fossilTimer == 0) {
              const itemsToAdd = pokemon.items.getAllItems();
              const pokemonEvolved = PokemonFactory.createPokemonFromName(pokemon.evolution);
              for (let i = 0; i < 3; i++) {
                const itemToAdd = itemsToAdd.pop();
                if (itemToAdd) {
                  pokemonEvolved.items.add(itemToAdd);
                }
              }
              pokemonEvolved.positionX = pokemon.positionX;
              pokemonEvolved.positionY = pokemon.positionY;
              player.board.delete(key);
              player.board.set(pokemonEvolved.id, pokemonEvolved);
            } else {
              pokemon.fossilTimer -= 1;
            }
          }
        });
      }
    }); ;
  }

  checkForLazyTeam() {
    const commands = [];

    this.state.players.forEach((player, key) => {
      const teamSize = this.room.getTeamSize(player.board);
      if (teamSize < player.experienceManager.level) {
        const numberOfPokemonsToMove = player.experienceManager.level - teamSize;
        for (let i = 0; i < numberOfPokemonsToMove; i++) {
          const boardSize = this.room.getBoardSizeWithoutDitto(player.board);
          if (boardSize > 0) {
            const coordinate = this.room.getFirstAvailablePositionInTeam(player.id);
            const detail = {
              'id': this.room.getFirstPokemonOnBoard(player.board).id,
              'x': coordinate[0],
              'y': coordinate[1],
              'objType': 'pokemon'
            };
            const client = {
              auth: {
                'uid': key
              }
            };
            commands.push(new OnDragDropCommand().setPayload({'client': client, 'detail': detail}));
          }
        }
      }
    });
    return commands;
  }

  getPVEIndex(stageLevel) {
    const result = NEUTRAL_STAGE.findIndex((stage)=>{
      return stage.turn == stageLevel;
    });

    return result;
  }

  initializeFightingPhase() {
    this.state.phase = STATE.FIGHT;
    this.state.time = 40000;
    this.state.stageLevel += 1;
    this.state.botManager.updateBots();

    const stageIndex = this.getPVEIndex(this.state.stageLevel);

    this.state.players.forEach((player, key) => {
      if (player.alive) {
        if (player.itemsProposition.length != 0) {
          while (player.itemsProposition.length > 0) {
            player.itemsProposition.pop();
          }
        }

        if (stageIndex != -1) {
          player.opponentName = 'PVE';
          player.opponentAvatar = NEUTRAL_STAGE[stageIndex].avatar;
          player.simulation.initialize(player.board, PokemonFactory.getNeutralPokemonsByLevelStage(this.state.stageLevel), player.effects.list, []);
        } else {
          const opponentId = this.room.computeRandomOpponent(key);
          if (opponentId) {
            player.simulation.initialize(player.board, this.state.players.get(opponentId).board, player.effects.list, this.state.players.get(opponentId).effects.list);
          }
        }
      }
    });
  }
}

module.exports = {
  OnShopCommand: OnShopCommand,
  OnDragDropCommand: OnDragDropCommand,
  OnSellDropCommand: OnSellDropCommand,
  OnRefreshCommand: OnRefreshCommand,
  OnLockCommand: OnLockCommand,
  OnLevelUpCommand: OnLevelUpCommand,
  OnJoinCommand: OnJoinCommand,
  OnLeaveCommand: OnLeaveCommand,
  OnUpdateCommand: OnUpdateCommand,
  OnUpdatePhaseCommand: OnUpdatePhaseCommand,
  OnItemCommand: OnItemCommand
};
