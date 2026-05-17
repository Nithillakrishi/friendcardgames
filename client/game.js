'use strict';

const socket = io();

// ── State ──
let myPlayerId = null;
let myRoomId = null;
let mySeatIndex = null;
let lastState = null;

// ── DOM ──
const lobby = document.getElementById('lobby');
const gameTable = document.getElementById('gameTable');
const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const lobbyError = document.getElementById('lobbyError');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomDisplay = document.getElementById('roomDisplay');
const stageDisplay = document.getElementById('stageDisplay');
const roomCode = document.getElementById('roomCode');
const startBtn = document.getElementById('startBtn');
const waitingPanel = document.getElementById('waitingPanel');
const actionPanel = document.getElementById('actionPanel');
const communityCards = document.getElementById('communityCards');
const potDisplay = document.getElementById('potDisplay');
const seatsEl = document.getElementById('seats');
const potInfo = document.getElementById('potInfo');
const toCallInfo = document.getElementById('toCallInfo');
const limitInfo = document.getElementById('limitInfo');
const raiseInput = document.getElementById('raiseInput');
const chipsDisplay = document.getElementById('chipsDisplay');
const showdownOverlay = document.getElementById('showdownOverlay');
const showdownResults = document.getElementById('showdownResults');

// ── Seat positions (% of viewport) for up to 9 players ──
const SEAT_POSITIONS = [
  { bottom: '6%',  left: '50%', transform: 'translateX(-50%)' }, // 0 bottom-center (me)
  { bottom: '20%', left: '14%' },  // 1
  { top: '32%',    left: '8%'  },  // 2
  { top: '12%',    left: '22%' },  // 3
  { top: '6%',     left: '50%', transform: 'translateX(-50%)' }, // 4
  { top: '12%',    right: '22%' }, // 5
  { top: '32%',    right: '8%'  }, // 6
  { bottom: '20%', right: '14%' }, // 7
  { bottom: '6%',  right: '12%' }, // 8
];

// ── Suit symbols ──
const SUIT_SYM = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const RED_SUITS = new Set(['hearts', 'diamonds']);

function cardEl(card) {
  const el = document.createElement('div');
  el.className = 'card' + (RED_SUITS.has(card.suit) ? ' red' : '');
  el.innerHTML = `<span class="rank">${card.rank}</span><span class="suit">${SUIT_SYM[card.suit]}</span>`;
  return el;
}

function facedownEl() {
  const el = document.createElement('div');
  el.className = 'card back hidden-card';
  return el;
}

// ── Lobby actions ──
createBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) { lobbyError.textContent = 'Enter your name'; return; }
  socket.emit('createRoom', { playerName: name });
});

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  const code = roomInput.value.trim().toUpperCase();
  if (!name) { lobbyError.textContent = 'Enter your name'; return; }
  if (!code) { lobbyError.textContent = 'Enter room code'; return; }
  socket.emit('joinRoom', { roomId: code, playerName: name });
});

roomInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinBtn.click(); });
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinBtn.click(); });

// ── Game controls ──
startBtn.addEventListener('click', () => socket.emit('startGame'));
document.getElementById('foldBtn').addEventListener('click', () => socket.emit('action', { type: 'fold' }));
document.getElementById('checkBtn').addEventListener('click', () => socket.emit('action', { type: 'check' }));
document.getElementById('callBtn').addEventListener('click', () => socket.emit('action', { type: 'call' }));
document.getElementById('allInBtn').addEventListener('click', () => socket.emit('action', { type: 'allin' }));
document.getElementById('raiseBtn').addEventListener('click', () => {
  const amt = parseInt(raiseInput.value, 10);
  if (isNaN(amt)) { showError('Enter raise amount'); return; }
  socket.emit('action', { type: 'raise', amount: amt });
});

// ── Socket events ──
socket.on('joined', ({ roomId, playerId, seatIndex }) => {
  myPlayerId = playerId;
  myRoomId = roomId;
  mySeatIndex = seatIndex;
  lobbyError.textContent = '';
  lobby.classList.add('hidden');
  gameTable.classList.remove('hidden');
  roomDisplay.textContent = `Room: ${roomId}`;
  roomCode.textContent = roomId;
});

socket.on('error', msg => {
  lobbyError.textContent = msg;
  showError(msg);
});

socket.on('gameState', state => {
  lastState = state;
  renderState(state);
});

socket.on('showdown', ({ results }) => {
  showdownResults.innerHTML = results.map(r => {
    const p = lastState ? lastState.players[r.index] : { name: 'Player' };
    return `<div class="winner-line"><strong>${p ? p.name : 'Player'}</strong> wins <strong>${r.chips}</strong> chips with <span class="hand-name">${r.handName}</span></div>`;
  }).join('');
  showdownOverlay.classList.remove('hidden');
  setTimeout(() => showdownOverlay.classList.add('hidden'), 4800);
});

// ── Render ──
function renderState(state) {
  const { stage, pot, community, actionIndex, dealerIndex, players, bettingInfo } = state;

  stageDisplay.textContent = stage;
  potDisplay.textContent = `Pot: ${pot}`;

  // Community cards
  communityCards.innerHTML = '';
  for (const c of community) communityCards.appendChild(cardEl(c));

  // Seats
  renderSeats(players, actionIndex, dealerIndex);

  // Panels
  const myPlayer = players.find(p => p.id === myPlayerId);
  const isMyTurn = myPlayer && !myPlayer.folded && players[actionIndex]?.id === myPlayerId;

  if (stage === 'waiting') {
    waitingPanel.classList.remove('hidden');
    actionPanel.classList.add('hidden');
  } else {
    waitingPanel.classList.add('hidden');
    if (isMyTurn && stage !== 'showdown' && bettingInfo) {
      actionPanel.classList.remove('hidden');
      renderBettingInfo(bettingInfo, myPlayer);
    } else {
      actionPanel.classList.add('hidden');
    }
  }
}

function renderSeats(players, actionIndex, dealerIndex) {
  seatsEl.innerHTML = '';

  // Reorder so my seat is position 0
  const myIdx = players.findIndex(p => p.id === myPlayerId);
  const reordered = [];
  const n = players.length;
  for (let i = 0; i < n; i++) {
    reordered.push(players[(myIdx + i) % n]);
  }

  reordered.forEach((player, displayPos) => {
    const pos = SEAT_POSITIONS[displayPos] || SEAT_POSITIONS[0];
    const seat = document.createElement('div');
    seat.className = 'seat';
    if (player.id === myPlayerId) seat.classList.add('is-me');
    if (player.folded) seat.classList.add('folded');
    const actualIdx = players.indexOf(player);
    if (actualIdx === actionIndex && !player.folded) seat.classList.add('is-active');

    // Apply position styles
    Object.entries(pos).forEach(([k, v]) => seat.style[k] = v);

    // Dealer chip
    if (actualIdx === dealerIndex) {
      const d = document.createElement('div');
      d.className = 'dealer-chip';
      d.textContent = 'D';
      seat.appendChild(d);
    }

    // Name + chips
    const nameEl = document.createElement('div');
    nameEl.className = 'seat-name';
    nameEl.textContent = player.name + (player.allIn ? ' [ALL-IN]' : '') + (player.folded ? ' [FOLD]' : '');
    seat.appendChild(nameEl);

    const chipsEl = document.createElement('div');
    chipsEl.className = 'seat-chips';
    chipsEl.textContent = `${player.chips} chips`;
    seat.appendChild(chipsEl);

    if (player.bet > 0) {
      const betEl = document.createElement('div');
      betEl.className = 'seat-bet';
      betEl.textContent = `Bet: ${player.bet}`;
      seat.appendChild(betEl);
    }

    // Cards
    const handRow = document.createElement('div');
    handRow.className = 'hand-cards';
    if (player.hand && player.hand.length > 0) {
      for (const c of player.hand) handRow.appendChild(cardEl(c));
    } else if (player.cardCount > 0 && !player.folded) {
      for (let i = 0; i < player.cardCount; i++) handRow.appendChild(facedownEl());
    }
    seat.appendChild(handRow);

    seatsEl.appendChild(seat);
  });
}

function renderBettingInfo(info, myPlayer) {
  const { isPotLimit, potSize, currentBet, callAmount, maxRaise, minRaise } = info;
  potInfo.textContent = `Pot: ${potSize}`;
  toCallInfo.textContent = callAmount > 0 ? `To call: ${callAmount}` : 'No bet';
  limitInfo.textContent = isPotLimit ? 'Pre-flop (Pot Limit)' : 'No Limit';
  chipsDisplay.textContent = `Your chips: ${myPlayer.chips}`;

  // Set raise input constraints
  const minTo = currentBet + minRaise;
  const maxTo = isPotLimit ? Math.min(myPlayer.chips + myPlayer.bet, maxRaise + myPlayer.bet) : myPlayer.chips + myPlayer.bet;
  raiseInput.min = minTo;
  raiseInput.max = maxTo;
  raiseInput.placeholder = `Raise to ${minTo}+`;

  // Show/hide check vs call
  document.getElementById('checkBtn').classList.toggle('hidden', callAmount > 0);
  document.getElementById('callBtn').classList.toggle('hidden', callAmount === 0);
  document.getElementById('callBtn').textContent = `Call ${callAmount}`;
}

function showError(msg) {
  // Briefly flash error in action panel area
  const existing = document.getElementById('gameError');
  if (existing) existing.remove();
  if (!msg) return;
  const el = document.createElement('p');
  el.id = 'gameError';
  el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#e94560;color:#fff;padding:8px 20px;border-radius:8px;z-index:999;font-weight:600;';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
