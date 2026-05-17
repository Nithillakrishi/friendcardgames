'use strict';

const socket = io();

let myPlayerId = null;
let myRoomId   = null;
let lastState  = null;

// ── DOM ──
const lobby           = document.getElementById('lobby');
const gameTable       = document.getElementById('gameTable');
const nameInput       = document.getElementById('nameInput');
const roomInput       = document.getElementById('roomInput');
const lobbyError      = document.getElementById('lobbyError');
const roomDisplay     = document.getElementById('roomDisplay');
const stageDisplay    = document.getElementById('stageDisplay');
const roomCode        = document.getElementById('roomCode');
const startBtn        = document.getElementById('startBtn');
const waitingPanel    = document.getElementById('waitingPanel');
const actionPanel     = document.getElementById('actionPanel');
const showdownOverlay = document.getElementById('showdownOverlay');
const showdownResults = document.getElementById('showdownResults');
const potInfo         = document.getElementById('potInfo');
const toCallInfo      = document.getElementById('toCallInfo');
const limitInfo       = document.getElementById('limitInfo');
const raiseInput      = document.getElementById('raiseInput');
const chipsDisplay    = document.getElementById('chipsDisplay');
// Desktop
const desktopLayout   = document.getElementById('desktopLayout');
const communityCards  = document.getElementById('communityCards');
const potDisplay      = document.getElementById('potDisplay');
const seatsEl         = document.getElementById('seats');
// Mobile
const mobileLayout    = document.getElementById('mobileLayout');
const mobileOpponents = document.getElementById('mobileOpponents');
const communityMobile = document.getElementById('communityCardsMobile');
const potMobile       = document.getElementById('potDisplayMobile');
const myHandStrip     = document.getElementById('myHandStrip');

// ── Mobile detection ──
function isMobile() { return window.innerWidth <= 600; }

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
  el.className = 'card back';
  return el;
}

// ── Desktop seat positions ──
const SEAT_POSITIONS = [
  { bottom: '7%',  left: '50%', transform: 'translateX(-50%)' },
  { bottom: '22%', left: '12%' },
  { top: '30%',    left: '6%'  },
  { top: '10%',    left: '22%' },
  { top: '5%',     left: '50%', transform: 'translateX(-50%)' },
  { top: '10%',    right: '22%' },
  { top: '30%',    right: '6%'  },
  { bottom: '22%', right: '12%' },
  { bottom: '7%',  right: '12%' },
];

// ── Lobby ──
document.getElementById('createBtn').addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) { lobbyError.textContent = 'Enter your name'; return; }
  socket.emit('createRoom', { playerName: name });
});
document.getElementById('joinBtn').addEventListener('click', () => {
  const name = nameInput.value.trim();
  const code = roomInput.value.trim().toUpperCase();
  if (!name) { lobbyError.textContent = 'Enter your name'; return; }
  if (!code) { lobbyError.textContent = 'Enter room code'; return; }
  socket.emit('joinRoom', { roomId: code, playerName: name });
});
roomInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('joinBtn').click(); });
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('createBtn').click(); });

// ── Game controls ──
startBtn.addEventListener('click', () => socket.emit('startGame'));
document.getElementById('foldBtn') .addEventListener('click', () => socket.emit('action', { type: 'fold' }));
document.getElementById('checkBtn').addEventListener('click', () => socket.emit('action', { type: 'check' }));
document.getElementById('callBtn') .addEventListener('click', () => socket.emit('action', { type: 'call' }));
document.getElementById('allInBtn').addEventListener('click', () => socket.emit('action', { type: 'allin' }));
document.getElementById('raiseBtn').addEventListener('click', () => {
  const amt = parseInt(raiseInput.value, 10);
  if (isNaN(amt)) { showError('Enter raise amount'); return; }
  socket.emit('action', { type: 'raise', amount: amt });
});

// ── Socket events ──
socket.on('joined', ({ roomId, playerId }) => {
  myPlayerId = playerId;
  myRoomId   = roomId;
  lobbyError.textContent = '';
  lobby.classList.add('hidden');
  gameTable.classList.remove('hidden');
  roomDisplay.textContent = `Room: ${roomId}`;
  roomCode.textContent    = roomId;
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
  if (!lastState) return;
  showdownResults.innerHTML = results.map(r => {
    const p = lastState.players[r.index];
    return `<div class="winner-line"><strong>${p ? p.name : 'Player'}</strong> wins <strong>${r.chips}</strong> chips with <span class="hand-name">${r.handName}</span></div>`;
  }).join('');
  showdownOverlay.classList.remove('hidden');
  setTimeout(() => showdownOverlay.classList.add('hidden'), 4800);
});

// ── Main render ──
function renderState(state) {
  const { stage, pot, community, actionIndex, dealerIndex, players, bettingInfo } = state;

  stageDisplay.textContent = stage;

  const myPlayer = players.find(p => p.id === myPlayerId);
  const isMyTurn = myPlayer && !myPlayer.folded
    && players[actionIndex]?.id === myPlayerId
    && stage !== 'waiting' && stage !== 'showdown';

  if (isMobile()) {
    renderMobile(state, myPlayer, isMyTurn);
  } else {
    renderDesktop(state, myPlayer, isMyTurn);
  }

  // Panels
  if (stage === 'waiting') {
    waitingPanel.classList.remove('hidden');
    actionPanel.classList.add('hidden');
    // On mobile, move panels inside mobileLayout
    if (isMobile()) {
      mobileLayout.appendChild(waitingPanel);
      mobileLayout.appendChild(actionPanel);
    }
  } else {
    waitingPanel.classList.add('hidden');
    if (isMyTurn && bettingInfo) {
      actionPanel.classList.remove('hidden');
      renderBettingInfo(bettingInfo, myPlayer);
      if (isMobile()) mobileLayout.appendChild(actionPanel);
    } else {
      actionPanel.classList.add('hidden');
    }
  }
}

// ── Desktop render ──
function renderDesktop(state, myPlayer, isMyTurn) {
  const { pot, community, actionIndex, dealerIndex, players } = state;

  mobileLayout.classList.add('hidden');
  desktopLayout.classList.remove('hidden');

  // Community
  communityCards.innerHTML = '';
  for (const c of community) communityCards.appendChild(cardEl(c));
  potDisplay.textContent = `Pot: ${pot}`;

  // Seats — reorder so current player is at position 0
  seatsEl.innerHTML = '';
  const myIdx = players.findIndex(p => p.id === myPlayerId);
  const n = players.length;

  players.forEach((player, realIdx) => {
    const displayPos = ((realIdx - myIdx) + n) % n;
    const pos = SEAT_POSITIONS[displayPos] || SEAT_POSITIONS[0];
    const seat = document.createElement('div');
    seat.className = 'seat';
    if (player.id === myPlayerId) seat.classList.add('is-me');
    if (player.folded) seat.classList.add('folded');
    if (realIdx === actionIndex && !player.folded) seat.classList.add('is-active');
    Object.entries(pos).forEach(([k, v]) => seat.style[k] = v);

    if (realIdx === dealerIndex) {
      const d = document.createElement('div');
      d.className = 'dealer-chip'; d.textContent = 'D';
      seat.appendChild(d);
    }

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

// ── Mobile render ──
function renderMobile(state, myPlayer, isMyTurn) {
  const { pot, community, actionIndex, dealerIndex, players } = state;

  desktopLayout.classList.add('hidden');
  mobileLayout.classList.remove('hidden');

  // Community
  communityMobile.innerHTML = '';
  for (const c of community) communityMobile.appendChild(cardEl(c));
  potMobile.textContent = `Pot: ${pot}`;

  // Opponents (everyone except me)
  mobileOpponents.innerHTML = '';
  players.forEach((player, realIdx) => {
    if (player.id === myPlayerId) return;
    const seat = document.createElement('div');
    seat.className = 'mob-seat';
    if (player.folded) seat.classList.add('folded');
    if (realIdx === actionIndex && !player.folded) seat.classList.add('is-active');

    if (realIdx === dealerIndex) {
      const d = document.createElement('div');
      d.className = 'mob-dealer'; d.textContent = 'D';
      seat.appendChild(d);
    }

    const nameEl = document.createElement('div');
    nameEl.className = 'mob-seat-name';
    nameEl.textContent = player.name + (player.allIn ? ' ⚡' : '') + (player.folded ? ' ✗' : '');
    seat.appendChild(nameEl);

    const chipsEl = document.createElement('div');
    chipsEl.className = 'mob-seat-chips';
    chipsEl.textContent = `${player.chips}🪙`;
    seat.appendChild(chipsEl);

    if (player.bet > 0) {
      const betEl = document.createElement('div');
      betEl.className = 'mob-seat-bet';
      betEl.textContent = `Bet: ${player.bet}`;
      seat.appendChild(betEl);
    }

    const handRow = document.createElement('div');
    handRow.className = 'hand-cards';
    if (player.hand && player.hand.length > 0) {
      for (const c of player.hand) handRow.appendChild(cardEl(c));
    } else if (player.cardCount > 0 && !player.folded) {
      for (let i = 0; i < player.cardCount; i++) handRow.appendChild(facedownEl());
    }
    seat.appendChild(handRow);
    mobileOpponents.appendChild(seat);
  });

  // My hand strip
  myHandStrip.innerHTML = '';
  if (myPlayer && myPlayer.hand && myPlayer.hand.length > 0) {
    const info = document.createElement('div');
    info.className = 'my-info';

    const myRealIdx = players.indexOf(myPlayer);
    const isDealer = myRealIdx === dealerIndex;
    const isActive = myRealIdx === actionIndex;

    info.innerHTML = `
      <div class="my-name">${myPlayer.name}${isDealer ? ' 🅓' : ''}${isActive ? ' ◀' : ''}</div>
      <div class="my-chips">${myPlayer.chips} chips</div>
      ${myPlayer.bet > 0 ? `<div class="my-bet">Bet: ${myPlayer.bet}</div>` : ''}
    `;
    for (const c of myPlayer.hand) myHandStrip.appendChild(cardEl(c));
    myHandStrip.appendChild(info);
  } else if (myPlayer && state.stage !== 'waiting') {
    // folded
    const info = document.createElement('div');
    info.className = 'my-info';
    info.innerHTML = `<div class="my-name">${myPlayer.name} [FOLDED]</div><div class="my-chips">${myPlayer.chips} chips</div>`;
    myHandStrip.appendChild(info);
  }
}

// ── Betting info panel ──
function renderBettingInfo(info, myPlayer) {
  const { isPotLimit, potSize, currentBet, callAmount, maxRaiseTo, minRaiseTo } = info;
  potInfo.textContent    = `Pot: ${potSize}`;
  toCallInfo.textContent = callAmount > 0 ? `To call: ${callAmount}` : 'No bet';
  limitInfo.textContent  = isPotLimit ? 'Pot Limit' : 'No Limit';
  chipsDisplay.textContent = `Chips: ${myPlayer.chips}`;

  const minTo = minRaiseTo;
  const maxTo = isPotLimit ? Math.floor(maxRaiseTo) : myPlayer.chips + myPlayer.bet;
  raiseInput.min         = minTo;
  raiseInput.max         = maxTo;
  raiseInput.placeholder = `Raise to ${minTo}+`;

  document.getElementById('checkBtn').classList.toggle('hidden', callAmount > 0);
  document.getElementById('callBtn').classList.toggle('hidden', callAmount === 0);
  document.getElementById('callBtn').textContent = `Call ${callAmount}`;
}

function showError(msg) {
  const old = document.getElementById('gameError');
  if (old) old.remove();
  if (!msg) return;
  const el = document.createElement('p');
  el.id = 'gameError';
  el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#e94560;color:#fff;padding:8px 20px;border-radius:8px;z-index:999;font-weight:600;max-width:90vw;text-align:center;';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Re-render on resize (desktop ↔ mobile switch)
window.addEventListener('resize', () => { if (lastState) renderState(lastState); });
