'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { Game } = require('./game/gameState');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '..', 'client')));

const rooms = {}; // roomId -> Game
const socketToRoom = {}; // socketId -> { roomId, playerId, playerName }

function getRoomId(socketId) { return socketToRoom[socketId]?.roomId; }
function getPlayerId(socketId) { return socketToRoom[socketId]?.playerId; }

function broadcastState(roomId) {
  const game = rooms[roomId];
  if (!game) return;
  const playerIds = new Set(game.players.map(p => p.id));
  for (const socket of io.sockets.sockets.values()) {
    const info = socketToRoom[socket.id];
    if (!info || info.roomId !== roomId) continue;
    // Send personalized state (with own cards) if they're a player, else generic
    const forId = playerIds.has(info.playerId) ? info.playerId : null;
    socket.emit('gameState', game.publicState(forId));
  }
}

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  socket.on('createRoom', ({ playerName }) => {
    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
    const playerId = uuidv4();
    const game = new Game(roomId);
    rooms[roomId] = game;
    const result = game.addPlayer(playerId, playerName || 'Player');
    if (result.error) { socket.emit('error', result.error); return; }

    socketToRoom[socket.id] = { roomId, playerId, playerName };
    socket.join(roomId);
    socket.emit('joined', { roomId, playerId, seatIndex: 0 });
    broadcastState(roomId);
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const game = rooms[roomId];
    if (!game) { socket.emit('error', 'Room not found'); return; }

    const playerId = uuidv4();
    const result = game.addPlayer(playerId, playerName || 'Player');
    if (result.error) { socket.emit('error', result.error); return; }

    socketToRoom[socket.id] = { roomId, playerId, playerName };
    socket.join(roomId);
    const p = game.players.find(p => p.id === playerId);
    socket.emit('joined', { roomId, playerId, seatIndex: p.seatIndex });
    broadcastState(roomId);
  });

  socket.on('startGame', () => {
    const roomId = getRoomId(socket.id);
    const game = rooms[roomId];
    if (!game) return;
    if (!game.canStart()) { socket.emit('error', 'Need at least 2 players'); return; }
    game.startRound();
    broadcastState(roomId);
  });

  socket.on('action', ({ type, amount }) => {
    const roomId = getRoomId(socket.id);
    const playerId = getPlayerId(socket.id);
    const game = rooms[roomId];
    if (!game) return;

    const result = game.action(playerId, type, amount);
    if (result && result.error) { socket.emit('error', result.error); return; }

    broadcastState(roomId);

    if (result && result.stage === 'showdown') {
      io.to(roomId).emit('showdown', {
        results: result.results,
        community: result.community,
      });
      // 30s window: hands stay face-up on the table, then reset for next hand
      setTimeout(() => {
        const g = rooms[roomId];
        if (!g) return;
        g.prepareNextRound();          // clean up broke players, set stage='waiting'
        if (g.canStart()) g.startRound();
        broadcastState(roomId);
      }, 30000);
    }
  });

  socket.on('disconnect', () => {
    const info = socketToRoom[socket.id];
    if (!info) return;
    const { roomId, playerId } = info;
    const game = rooms[roomId];
    if (game) {
      game.removePlayer(playerId);
      if (game.players.length === 0) {
        delete rooms[roomId];
      } else {
        broadcastState(roomId);
      }
    }
    delete socketToRoom[socket.id];
    console.log('disconnect', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Poker server running on http://localhost:${PORT}`));
