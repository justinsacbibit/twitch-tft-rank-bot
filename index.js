const tmi = require('tmi.js');
const axios = require('axios').default;
const moment = require('moment');

const channels = process.env.CHANNELS.split(',');
const opts = {
  identity: {
    username: 'thabawsss',
    password: 'oauth:b1ekhrwqpbfnr0y860akwqp2wkvyx7'
  },
  channels,
};

// Create a client with our options
const client = new tmi.client(opts);
const riotToken = process.env.RIOT_TOKEN;

let memes = false;

// Register our event handlers (defined below)
client.on('message', onMessageHandler);
client.on('connected', onConnectedHandler);

// Connect to Twitch:
client.connect();

// Called every time a message comes in
async function onMessageHandler (target, context, msg, self) {
  if (self) { return; } // Ignore messages from the bot

  // Remove whitespace from chat message
  const commandName = msg.trim();

  // If the command is known, let's execute it
  if (commandName === '!dice') {
    const num = rollDice();
    client.say(target, `You rolled a ${num}`);
    console.log(`* Executed ${commandName} command`);
  } else if (commandName === '!enable memes') {
    if (!context.username === 'thabawss') {
      return;
    }
    memes = true;
    client.say(target, 'fun is here');
  } else if (commandName === '!disable memes') {
    if (!context.username === 'thabawss') {
      return;
    }
    memes = false;
    client.say(target, 'fun is gone');
  } else if (commandName === '!matchhistory poltt' || commandName === '!matchhistory Poltsc2') {
    const name = commandName === '!matchhistory poltt' ? 'poltt' : 'Poltsc2';
    const puuid = name === 'poltt' ? 'siYNYoEueimODAVBDDUGHREmCcGNOP8PhTnObJAhMKncSGtH6ALOuGnfXKVFNwHVdHRBXGxFV60hIg': 'ZuB0lBVKuRJ4RzUn-MS0SCJz7ya10WOaJ6lSE_zM3F0riezgBBmia4v06Bo6cmS-tEK3S1wx8ZRlqg';
    axios.get(`https://americas.api.riotgames.com/tft/match/v1/matches/by-puuid/${puuid}/ids?count=10`, {
      headers: {
        'X-Riot-Token': riotToken
      }
    }).then(response => {
      const matchIds = response.data;
      Promise.all(
        matchIds.map(matchId => {
          return axios.get(`https://americas.api.riotgames.com/tft/match/v1/matches/${matchId}`, {
            headers: {
              'X-Riot-Token': riotToken
            }
          }).then(response => {
            return response.data;
          });
        })
      ).then(matchDetailsList => {
        matchDetailsList.reverse();
        const todayMatchDetailsList = matchDetailsList.filter(
          matchDetails => moment(matchDetails.info.game_datetime).isSame(new Date(), 'day')
        );
        console.log(matchDetailsList);
        console.log(todayMatchDetailsList.length)
        let message = `Latest 10 matches for ${name} today:`;
        for (let matchDetails of todayMatchDetailsList) {
          const placement = matchDetails.info.participants.find(participant => participant.puuid === puuid).placement;
          message = message + ` ${placement}`;
        }
        client.say(target, message);
      });
    });
  } else if (commandName.startsWith('!rank')) {
    axios.get('https://na1.api.riotgames.com/tft/league/v1/challenger', {
      headers: {
        'X-Riot-Token':riotToken
      }
    }).then(async response => {
      const sortedChallengerPlayersWithRank =
        response
          .data
          .entries
          .sort((a, b) => b.leaguePoints - a.leaguePoints)
          .map((player, index) => ({
            ...player,
            rank: index + 1,
          }));
      const nameToFind = commandName === '!rank' ? 'Poltsc2' : commandName.slice('!rank '.length);
      const playerIndex = sortedChallengerPlayersWithRank
        .findIndex(player => player.summonerName.toLowerCase() === nameToFind.toLowerCase());

      if (playerIndex === -1) {
        console.log(nameToFind);
        try {
          const summonerId = await axios.get(encodeURI(`https://na1.api.riotgames.com/tft/summoner/v1/summoners/by-name/${nameToFind}`), {
            headers: {
              'X-Riot-Token':riotToken
            }
          }).then(response => {
            return response.data.id;
          });
          const details = await axios.get(`https://na1.api.riotgames.com/tft/league/v1/entries/by-summoner/${summonerId}`, {
            headers: {
              'X-Riot-Token':riotToken
            }
          }).then(response => {
            return response.data[0];
          });
          if (!details) {
            if (memes) {
              client.say(target, `${nameToFind} nowhere to be found in NA`);
            }
          } else {
            client.say(target, `${nameToFind}: ${details.tier} ${details.rank}, ${details.leaguePoints} LP, ${details.wins}W ${details.losses}L`);
          }
        } catch (e) {
          if (e.response && e.response.status && e.response.status === 404) {
            // name doesn't exist
            if (memes) {
              client.say(target, `${nameToFind} nowhere to be found in NA`);
            }
          } else {
            client.say(target, `Something went wrong..`)
          }
        }
        return;
      }

      let startIndex = 0;
      if (playerIndex === sortedChallengerPlayersWithRank.length - 1) {
        startIndex = sortedChallengerPlayersWithRank.length - 3;
      } else if (playerIndex > 0) {
        startIndex = playerIndex - 1;
      }

      const endIndex = startIndex + 3;

      const playerAndSurroundingPlayers = sortedChallengerPlayersWithRank
        .slice(startIndex, endIndex);

      console.log(
        playerAndSurroundingPlayers
          .map(player => ({
            name: player.summonerName,
            rank: player.rank,
            lp: player.leaguePoints
          }))
      );

      let message = `NA Challenger: `;
      for (let player of playerAndSurroundingPlayers) {
        if (player.rank === playerIndex + 1) {
          message = message + `>>>`;
        }
        message = message + `Rank ${player.rank}: ${player.summonerName} (${player.leaguePoints} LP).`;
        if (player.rank === playerIndex + 1) {
          message = message + `<<<`;
        }
        message = message + ` `
      }

      client.say(target, message);
    })
  } else {
    console.log(`* Unknown command ${commandName}`);
  }
}
// Function called when the "dice" command is issued
function rollDice () {
  const sides = 6;
  return Math.floor(Math.random() * sides) + 1;
}
// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}. Twitch channels:`, channels);
}
