const tmi = require('tmi.js');
const axios = require('axios').default;
const moment = require('moment');
const { JsonFileManager } = require('./JsonFileManager');

const DATE_FORMAT = 'YYYY-MM-DD';
// compensate for streams that go past midnight
const HOUR_OFFSET = 7;
const adminUsernames = process.env.ADMIN_USERNAMES && process.env.ADMIN_USERNAMES.split(',') || ['thabawss'];
const channels = process.env.CHANNELS.split(',');
const shouldFetchDailyRanks = !!process.env.FETCH_DAILY_RANKS;
const opts = {
  identity: {
    username: adminUsernames[0],
    password: 'oauth:b1ekhrwqpbfnr0y860akwqp2wkvyx7'
  },
  channels,
};

const requestConfig = {
  headers: {
    'X-Riot-Token': process.env.RIOT_TOKEN,
  }
};

const client = new tmi.client(opts);

let memes = false;

const dbFileManager = new JsonFileManager('db', {
  dailyRanks: {},
});

const getDetailsByUsername = async (username) => {
  const summonerId = await axios.get(
    encodeURI(`https://na1.api.riotgames.com/tft/summoner/v1/summoners/by-name/${username}`),
    requestConfig
  ).then(response => {
    return response.data.id;
  });

  const details = await axios.get(
    `https://na1.api.riotgames.com/tft/league/v1/entries/by-summoner/${summonerId}`,
    requestConfig
  ).then(response => {
    return response.data[0];
  });

  return details;
}

const getSortedChallengerPlayersWithRank = async () => {
  const sortedChallengerPlayersWithRank = await axios.get(
    'https://na1.api.riotgames.com/tft/league/v1/challenger',
    requestConfig
  ).then(response => {
    return response
      .data
      .entries
      .sort((a, b) => b.leaguePoints - a.leaguePoints)
      .map((player, index) => ({
        ...player,
        rank: index + 1,
      }));
  });

  return sortedChallengerPlayersWithRank;
};

const fetchDailyRanks = async (db) => {
  const usernamesToGet = ['Poltsc2', 'poltt'];
  console.log(`Fetching daily ranks for`, usernamesToGet);
  for (let username of usernamesToGet) {
    try {
      const details = await getDetailsByUsername(username);
      if (!details) {
        throw new Error(`Details were null for`, username);
      }

      if (!(details.summonerName in db.dailyRanks)) {
        db.dailyRanks[details.summonerName] = {};
      }

      const dateStr = moment().format(DATE_FORMAT);
      if (!(dateStr in db.dailyRanks[details.summonerName])) {
        db.dailyRanks[details.summonerName][dateStr] = {};
      }

      db.dailyRanks[details.summonerName][dateStr].leaguePoints = details.leaguePoints;

      const sortedChallengerPlayersWithRank = await getSortedChallengerPlayersWithRank();
      const playerIndex = sortedChallengerPlayersWithRank
        .findIndex(player => player.summonerName.toLowerCase() === username.toLowerCase());

      if (playerIndex !== -1) {
        db.dailyRanks[details.summonerName][dateStr].challengerRank = sortedChallengerPlayersWithRank[playerIndex].rank;
      }
      console.log(`Daily rank fetcher -- ${details.summonerName}, ${dateStr}`, db.dailyRanks[details.summonerName][dateStr]);
    } catch (e) {
      console.log(`Daily rank fetcher -- Failed to get details for ${username}`, e)
    }

    await sleep(5000);
  }

  console.log('Updating db with', db)

  dbFileManager.save(db);
};

const sleep = (milliseconds) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
};

(async () => {
  const db = await dbFileManager.load();

  client.on('message', onMessageHandler);
  client.on('connected', onConnectedHandler);

  client.connect();

  if (shouldFetchDailyRanks) {
    const pollingInterval = 1000 * 60 * 30; // 30 minutes
    setInterval(async () => {
      if (moment().hour() === 8) {
        fetchDailyRanks(db);
      }
    }, pollingInterval);
  }

  async function onMessageHandler (target, context, msg, self) {
    if (self) { return; } // Ignore messages from the bot

    // Remove whitespace from chat message
    const commandName = msg.trim();

    if (commandName === '!enable memes') {
      if (!adminUsernames.includes(context.username)) {
        return;
      }
      memes = true;
      client.say(target, 'fun is here');
    } else if (commandName === '!disable memes') {
      if (!adminUsernames.includes(context.username)) {
        return;
      }
      memes = false;
      client.say(target, 'fun is gone');
    } else if (commandName === '!matchhistory poltt' || commandName === '!matchhistory Poltsc2') {
      const name = commandName === '!matchhistory poltt' ? 'poltt' : 'Poltsc2';
      const puuid = name === 'poltt' ? 'siYNYoEueimODAVBDDUGHREmCcGNOP8PhTnObJAhMKncSGtH6ALOuGnfXKVFNwHVdHRBXGxFV60hIg': 'ZuB0lBVKuRJ4RzUn-MS0SCJz7ya10WOaJ6lSE_zM3F0riezgBBmia4v06Bo6cmS-tEK3S1wx8ZRlqg';
      const matchIds = await axios.get(
        `https://americas.api.riotgames.com/tft/match/v1/matches/by-puuid/${puuid}/ids?count=10`,
        requestConfig
      ).then(response => {
        const matchIds = response.data;
        return matchIds;
      });

      Promise.all(
        matchIds.map(matchId => {
          return axios.get(
            `https://americas.api.riotgames.com/tft/match/v1/matches/${matchId}`,
            requestConfig
          ).then(response => {
            return response.data;
          });
        })
      ).then(matchDetailsList => {
        matchDetailsList.reverse();
        const todayMatchDetailsList = matchDetailsList.filter(
          matchDetails => {
            const gameMoment = moment(matchDetails.info.game_datetime);
            gameMoment.subtract(HOUR_OFFSET, 'hours');
            const currentMoment = moment();
            currentMoment.subtract(HOUR_OFFSET, 'hours');
            return gameMoment.isSame(currentMoment, 'day');
          }
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
    } else if (commandName.startsWith('!rank')) {
      const sortedChallengerPlayersWithRank = await getSortedChallengerPlayersWithRank();
      const nameToFind = commandName === '!rank' ? 'Poltsc2' : commandName.slice('!rank '.length);
      const playerIndex = sortedChallengerPlayersWithRank
        .findIndex(player => player.summonerName.toLowerCase() === nameToFind.toLowerCase());

      if (playerIndex === -1) {
        console.log(nameToFind);
        try {
          const details = await getDetailsByUsername(nameToFind);
          if (!details) {
            if (memes) {
              client.say(target, `${nameToFind} nowhere to be found in NA`);
            }
          } else {
            let message = `${details.summonerName}: ${details.tier} ${details.rank}, ${details.leaguePoints} LP`;
            const dateMoment = moment();
            dateMoment.subtract(HOUR_OFFSET, 'hours');
            const dateStr = dateMoment.format(DATE_FORMAT);
            if (db.dailyRanks[details.summonerName] && db.dailyRanks[details.summonerName][dateStr]) {
              const { leaguePoints } = db.dailyRanks[details.summonerName][dateStr];
              const symbol = details.leaguePoints >= leaguePoints ? '+' : '';
              message = message + ` (${symbol}${details.leaguePoints - leaguePoints} today)`;
            }

            client.say(target, message);
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

      const details = await getDetailsByUsername(nameToFind);

      const dateMoment = moment();
      dateMoment.subtract(HOUR_OFFSET, 'hours');
      const dateStr = dateMoment.format(DATE_FORMAT);
      if (db.dailyRanks[details.summonerName] && db.dailyRanks[details.summonerName][dateStr]) {
        const { leaguePoints, challengerRank } = db.dailyRanks[details.summonerName][dateStr];
        const symbol = details.leaguePoints >= leaguePoints ? '+' : '';
        message = message + `(${symbol}${details.leaguePoints - leaguePoints} LP today`;
        if (challengerRank) {
          const player = sortedChallengerPlayersWithRank[playerIndex];
          const prefixText = player.rank <= challengerRank ? 'climbed' : 'fell';
          const singularRankChange = Math.abs(player.rank - challengerRank) === 1;
          message = message + `, ${prefixText} ${Math.abs(player.rank - challengerRank)} rank${singularRankChange ? '' : 's'} today)`;
        } else {
          message = message + `)`;
        }
      }

      client.say(target, message);
    } else {
      console.log(`* Unknown command ${commandName}`);
    }
  }
  function onConnectedHandler (addr, port) {
    console.log(`* Connected to ${addr}:${port}. Twitch channels:`, channels);
  }
})()
