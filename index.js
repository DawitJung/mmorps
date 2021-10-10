const app = require("express")();
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: [
      "http://localhost:5050",
      /192\.168\.0\.\d{3}/,
      "https://mmorps.net",
    ],
  },
});

const MIN_TIME_TO_CHANGE_POSITION = 20;

const host =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5050"
    : "https://mmorps.net";

app
  .set("views", __dirname + "/views")
  .set("view engine", "ejs")
  .get("/", (_, res) => {
    res.render("index", { host });
  });

const positions = { R: 0, S: 0, P: 0 };
const users = new Map();

let round = 0;

setInterval(() => {
  calcScores();
  if (round % 5 === 0) updateLeaderboard();
  if (round % 10 === 0) aggregatePostions();
  if (round % 100 === 0) generateRobots();
  round++;
}, 100);

function aggregatePostions() {
  const newPositions = { R: 0, P: 0, S: 0 };
  for (const [_, user] of users) {
    const position = user.position;
    if (typeof newPositions[position] === "number") {
      newPositions[position] += 1;
    }
  }
  positions.R = newPositions.R;
  positions.P = newPositions.P;
  positions.S = newPositions.S;
}

function getScores() {
  return {
    R: positions.S - positions.P,
    S: positions.P - positions.R,
    P: positions.R - positions.S,
  };
}

function calcScores() {
  const scores = getScores();
  for (const [_, user] of users) {
    if (user.position) user.score += scores[user.position];
  }
}

function updateLeaderboard() {
  const leaderboard = Array.from(users)
    .sort((a, b) => {
      return b[1].score - a[1].score;
    })
    .slice(0, 5)
    .map(([_, user]) => ({
      id: user.id,
      name: user.name,
      score: user.score,
    }));
  io.emit("leaderboard", { leaderboard, total: users.size });
}

function createUser(socketIoClient) {
  const tempName = socketIoClient.id.slice(0, 6);
  const setters = {
    position(obj, position) {
      if (
        obj.changedAt + MIN_TIME_TO_CHANGE_POSITION > Date.now() &&
        position !== null
      ) {
        socketIoClient.emit("cancel", obj.position);
      } else if (["R", "S", "P", null].includes(position)) {
        if (typeof positions[obj.position] === "number") {
          positions[obj.position] = Math.max(0, positions[obj.position] - 1);
        }
        obj.position = position;
        if (typeof positions[obj.position] === "number") {
          positions[position] += 1;
        }
        obj.changedAt = Date.now();
        io.emit("positions", positions);
      }
    },
    score(obj, score) {
      obj.score = Math.max(0, score);
      socketIoClient.emit("score", obj.score);
    },
    name(obj, name) {
      if (typeof name === "string" && name.length > 0 && name.length < 30) {
        obj.name = name;
        socketIoClient.emit("name", obj.name);
      }
    },
  };
  const newUser = new Proxy(
    {
      socketIoClient,
      id: socketIoClient.id,
      position: null,
      name: tempName,
      score: 0,
      positionChangedAt: 0,
      deregister() {
        users.delete(socketIoClient.id);
        if (this.position) {
          positions[this.position] = Math.max(0, positions[this.position] - 1);
          io.emit("positions", positions);
        }
      },
    },
    {
      set(obj, prop, value) {
        if (setters[prop]) setters[prop](obj, value);
        else obj[prop] = value;
      },
    }
  );
  socketIoClient.emit("name", tempName);
  users.set(socketIoClient.id, newUser);
  return newUser;
}

function createStubSocketIOClient() {
  return { id: Math.random() + "", emit: () => {} };
}

function generateRobots() {
  while (users.size < 20) {
    const postfix = Math.random().toString(36).slice(-4);
    const p = Math.random();
    if (p < 0.01) {
      createGeniusBot("[GeniusBot] " + postfix);
    } else if (p < 0.2) {
      createSmartBot("[SmartBot] " + postfix);
    } else if (p < 0.6) {
      createNormalBot("[NormalBot] " + postfix);
    } else {
      createDumbBot("[DumbBot] " + postfix);
    }
  }
}

function createDumbBot(name) {
  const stubSocketIOClient = createStubSocketIOClient();
  const robot = createUser(stubSocketIOClient);
  robot.name = name;
  const interval = MIN_TIME_TO_CHANGE_POSITION + Math.random() * 10000;
  setInterval(() => {
    const randomIndex = Math.floor(Math.random() * 3);
    const newPosition = ["R", "P", "S"][randomIndex];
    if (robot.position !== newPosition) {
      robot.position = newPosition;
    }
    if (Math.random() < 0.01) {
      clearInterval(interval);
      robot.deregister();
    }
  }, interval);
}

function createNormalBot(name) {
  const stubSocketIOClient = createStubSocketIOClient();
  const robot = createUser(stubSocketIOClient);
  robot.name = name;
  const time = MIN_TIME_TO_CHANGE_POSITION + Math.random() * 5000;
  const interval = setInterval(() => {
    const scores = getScores();
    const newPosition = scores.R > 0 ? "R" : scores.P > 0 ? "P" : "S";
    if (robot.position !== newPosition) {
      robot.position = newPosition;
    }
    if (Math.random() < 0.01) {
      clearInterval(interval);
      robot.deregister();
    }
  }, time);
}

function createSmartBot(name) {
  const stubSocketIOClient = createStubSocketIOClient();
  const robot = createUser(stubSocketIOClient);
  robot.name = name;
  const time = MIN_TIME_TO_CHANGE_POSITION + Math.random() * 5000;
  const interval = setInterval(() => {
    const scores = getScores();
    const maxScore = Math.max(scores.R, scores.P, scores.S);
    const newPosition =
      scores.R === maxScore ? "R" : scores.P === maxScore ? "P" : "S";
    if (robot.position !== newPosition) {
      robot.position = newPosition;
    }
    if (Math.random() < 0.01) {
      clearInterval(interval);
      robot.deregister();
    }
  }, time);
}

function createGeniusBot(name) {
  const stubSocketIOClient = createStubSocketIOClient();
  const robot = createUser(stubSocketIOClient);
  robot.name = name;
  const time = MIN_TIME_TO_CHANGE_POSITION + 10;
  const interval = setInterval(() => {
    const scores = getScores();
    const maxScore = Math.max(scores.R, scores.P, scores.S);
    const newPosition =
      scores.R === maxScore ? "R" : scores.P === maxScore ? "P" : "S";
    if (robot.position !== newPosition) {
      robot.position = newPosition;
    }
    if (Math.random() < 0.0005) {
      clearInterval(interval);
      robot.deregister();
    }
  }, time);
}

io.on("connection", (client) => {
  const user = createUser(client);
  client.on("position", (position) => {
    user.position = position;
  });
  client.on("name", (name) => {
    user.name = name;
  });
  client.on("disconnect", () => {
    user.deregister();
  });
});

server.listen(5050, () => {
  console.log("environment:", process.env.NODE_ENV);
  console.log("start on 5050");
});
