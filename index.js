const app = require("express")();
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: ["http://localhost:5050", /192\.168\.0\.\d{3}/],
  },
});

app.get("/", (_, res) => {
  res.sendFile(__dirname + "/index.html");
});

const positions = { R: 0, S: 0, P: 0 };
const users = new Map();

let round = 0;

setInterval(() => {
  calcScores();
  if (round % 10 === 0) updateLeaderboard();
  round++;
}, 100);

function getAddingScores() {
  return {
    R: positions.S - positions.P,
    S: positions.P - positions.R,
    P: positions.R - positions.S,
  };
}

function calcScores() {
  const scores = getAddingScores();
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

class User {
  constructor(socketIoClient) {
    this.socketIoClient = socketIoClient;
    this.id = socketIoClient.id;
    this._position = null;
    this._name = socketIoClient.id;
    this._score = 0;
    socketIoClient.emit("name", socketIoClient.id);
    socketIoClient.emit("positions", positions);
    users.set(this.id, this);
  }

  deregister() {
    users.delete(this.id);
    if (this._position) {
      positions[this._position] = Math.max(0, positions[this._position] - 1);
      io.emit("positions", positions);
    }
  }

  get position() {
    return this._position;
  }
  set position(position) {
    if (["R", "S", "P", null].includes(position)) {
      if (typeof positions[this._position] === "number") {
        positions[this._position] = Math.max(0, positions[this._position] - 1);
      }
      this._position = position;
      if (typeof positions[this._position] === "number") {
        positions[position] += 1;
      }
      io.emit("positions", positions);
    }
  }

  get score() {
    return this._score;
  }
  set score(score) {
    this._score = Math.max(0, score);
    this.socketIoClient.emit("score", this._score);
  }

  get name() {
    return this._name;
  }
  set name(name) {
    if (typeof name === "string" && name.length > 0 && name.length < 30) {
      this._name = name;
      this.socketIoClient.emit("name", name);
    }
  }
}

io.on("connection", (client) => {
  const user = new User(client);
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
  console.log("start on 5050");
});
