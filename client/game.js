'use strict';

const socket = io();

let myPlayerId = null;
let myRoomId   = null;
let lastState  = null;
let lastInfo   = null; // bettingInfo snapshot for raise builder

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
const winnerBanner  = document.getElementById('winnerBanner');
const winnerResults = document.getElementById('winnerResults');
const potInfo         = document.getElementById('potInfo');
const toCallInfo      = document.getElementById('toCallInfo');
const limitInfo       = document.getElementById('limitInfo');
const raiseInput      = document.getElementById('raiseInput');
const raiseBuilder    = document.getElementById('raiseBuilder');
const raiseLimits     = document.getElementById('raiseLimits');
const raisePresets    = document.getElementById('raisePresets');
// Desktop / mobile
const desktopLayout   = document.getElementById('desktopLayout');
const communityCards  = document.getElementById('communityCards');
const potDisplay      = document.getElementById('potDisplay');
const seatsEl         = document.getElementById('seats');
const myHandDesktop   = document.getElementById('myHandDesktop');
const mobileLayout    = document.getElementById('mobileLayout');
const mobileOpponents = document.getElementById('mobileOpponents');
const communityMobile = document.getElementById('communityCardsMobile');
const potMobile       = document.getElementById('potDisplayMobile');
const myHandStrip     = document.getElementById('myHandStrip');

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

// ── Desktop seat positions (opponents around the table) ──
// Position 0 = my seat (rendered separately in #myHandDesktop), 1-8 = opponents
const SEAT_POSITIONS = [
  null, // my seat – handled separately
  { bottom: '22%', left: '12%'  },
  { top:    '30%', left: '5%'   },
  { top:    '10%', left: '22%'  },
  { top:    '4%',  left: '50%', transform: 'translateX(-50%)' },
  { top:    '10%', right: '22%' },
  { top:    '30%', right: '5%'  },
  { bottom: '22%', right: '12%' },
  { bottom: '8%',  right: '12%' },
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

document.getElementById('foldBtn') .addEventListener('click', () => {
  raiseBuilder.classList.add('hidden');
  socket.emit('action', { type: 'fold' });
});
document.getElementById('checkBtn').addEventListener('click', () => {
  raiseBuilder.classList.add('hidden');
  socket.emit('action', { type: 'check' });
});
document.getElementById('callBtn') .addEventListener('click', () => {
  raiseBuilder.classList.add('hidden');
  socket.emit('action', { type: 'call' });
});
document.getElementById('allInBtn').addEventListener('click', () => {
  raiseBuilder.classList.add('hidden');
  socket.emit('action', { type: 'allin' });
});
// Toggle raise builder
document.getElementById('raiseBtn').addEventListener('click', () => {
  raiseBuilder.classList.toggle('hidden');
});
// Confirm raise
document.getElementById('raiseConfirm').addEventListener('click', () => {
  const amt = parseInt(raiseInput.value, 10);
  if (isNaN(amt)) { showError('Enter raise amount'); return; }
  socket.emit('action', { type: 'raise', amount: amt });
  raiseBuilder.classList.add('hidden');
});
// +/- adjusters
document.getElementById('raisePlus').addEventListener('click', () => {
  if (!lastInfo) return;
  const step = lastInfo.minRaise || 20;
  raiseInput.value = Math.min(
    parseInt(raiseInput.value || lastInfo.minRaiseTo, 10) + step,
    lastInfo.isPotLimit ? Math.floor(lastInfo.maxRaiseTo) : lastInfo.myChipsTotal
  );
});
document.getElementById('raiseMinus').addEventListener('click', () => {
  if (!lastInfo) return;
  const step = lastInfo.minRaise || 20;
  raiseInput.value = Math.max(
    parseInt(raiseInput.value || lastInfo.minRaiseTo, 10) - step,
    lastInfo.minRaiseTo
  );
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

let countdownInterval = null;
socket.on('showdown', ({ results }) => {
  if (!lastState) return;
  const lines = results.map(r => {
    const p = lastState.players[r.index];
    return `<div class="winner-line"><strong>${p ? p.name : 'Player'}</strong> wins <strong>${r.chips}</strong> with <span class="hand-name">${r.handName}</span></div>`;
  }).join('');

  if (countdownInterval) clearInterval(countdownInterval);
  let secs = 30;
  const tick = () => {
    winnerResults.innerHTML = lines + `<div class="countdown">Next hand in ${secs}s</div>`;
    if (secs <= 0) {
      clearInterval(countdownInterval);
      winnerBanner.classList.add('hidden');
    }
    secs--;
  };
  winnerBanner.classList.remove('hidden');
  tick();
  countdownInterval = setInterval(tick, 1000);
});

// ── Main render ──
function renderState(state) {
  const { stage, players, actionIndex, bettingInfo } = state;
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
    raiseBuilder.classList.add('hidden');
    if (isMobile()) mobileLayout.appendChild(waitingPanel);
  } else if (stage === 'showdown') {
    waitingPanel.classList.add('hidden');
    actionPanel.classList.add('hidden');
    raiseBuilder.classList.add('hidden');
    // Countdown handled by winnerBanner; table stays visible with face-up cards
  } else {
    waitingPanel.classList.add('hidden');
    if (isMyTurn && bettingInfo) {
      actionPanel.classList.remove('hidden');
      renderBettingInfo(bettingInfo, myPlayer);
      if (isMobile()) mobileLayout.appendChild(actionPanel);
    } else {
      actionPanel.classList.add('hidden');
      raiseBuilder.classList.add('hidden');
    }
  }
}

// ── Desktop render ──
function renderDesktop(state, myPlayer, isMyTurn) {
  const { pot, community, actionIndex, dealerIndex, players } = state;

  mobileLayout.classList.add('hidden');
  desktopLayout.classList.remove('hidden');

  // Community cards
  communityCards.innerHTML = '';
  for (const c of community) communityCards.appendChild(cardEl(c));
  potDisplay.textContent = `Pot: ${pot}`;

  // Opponent seats (absolute positioning around the table)
  seatsEl.innerHTML = '';
  const myIdx = players.findIndex(p => p.id === myPlayerId);
  const n = players.length;

  players.forEach((player, realIdx) => {
    const displayPos = ((realIdx - myIdx) + n) % n;
    if (displayPos === 0) return; // my seat rendered in #myHandDesktop

    const pos = SEAT_POSITIONS[Math.min(displayPos, SEAT_POSITIONS.length - 1)];
    if (!pos) return;

    const seat = document.createElement('div');
    seat.className = 'seat';
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
    nameEl.textContent = player.name + (player.allIn ? ' ⚡' : '') + (player.folded ? ' ✗' : '');
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

  // My hand strip (always visible, anchored above action panel)
  myHandDesktop.innerHTML = '';
  if (myPlayer && state.stage !== 'waiting') {
    const myRealIdx = players.indexOf(myPlayer);
    const isDealer  = myRealIdx === dealerIndex;
    const isActive  = myRealIdx === actionIndex;

    const cardsDiv = document.createElement('div');
    cardsDiv.className = 'my-cards';
    if (myPlayer.hand && myPlayer.hand.length > 0) {
      for (const c of myPlayer.hand) cardsDiv.appendChild(cardEl(c));
    } else if (myPlayer.cardCount > 0 && !myPlayer.folded) {
      for (let i = 0; i < myPlayer.cardCount; i++) cardsDiv.appendChild(facedownEl());
    }

    const infoDiv = document.createElement('div');
    infoDiv.className = 'my-info';
    infoDiv.innerHTML = `
      <div class="my-name">${myPlayer.name}${isDealer ? ' 🅓' : ''}</div>
      <div class="my-chips">${myPlayer.chips} chips</div>
      ${myPlayer.bet > 0 ? `<div class="my-bet">Bet: ${myPlayer.bet}</div>` : ''}
      ${myPlayer.folded ? '<div class="my-status">FOLDED</div>' : ''}
      ${myPlayer.allIn ? '<div class="my-status">ALL-IN</div>' : ''}
      ${isActive && !myPlayer.folded ? '<div class="my-status">YOUR TURN</div>' : ''}
    `;

    myHandDesktop.appendChild(cardsDiv);
    myHandDesktop.appendChild(infoDiv);
    myHandDesktop.classList.remove('hidden');
  } else {
    myHandDesktop.classList.add('hidden');
  }
}

// ── Mobile render ──
function renderMobile(state, myPlayer, isMyTurn) {
  const { pot, community, actionIndex, dealerIndex, players } = state;

  desktopLayout.classList.add('hidden');
  mobileLayout.classList.remove('hidden');

  communityMobile.innerHTML = '';
  for (const c of community) communityMobile.appendChild(cardEl(c));
  potMobile.textContent = `Pot: ${pot}`;

  // Opponents
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

  // My hand
  myHandStrip.innerHTML = '';
  if (myPlayer && state.stage !== 'waiting') {
    const myRealIdx = players.indexOf(myPlayer);
    const isDealer  = myRealIdx === dealerIndex;
    const isActive  = myRealIdx === actionIndex;

    if (myPlayer.hand && myPlayer.hand.length > 0) {
      for (const c of myPlayer.hand) {
        const el = cardEl(c); myHandStrip.appendChild(el);
      }
    } else if (myPlayer.cardCount > 0 && !myPlayer.folded) {
      for (let i = 0; i < myPlayer.cardCount; i++) myHandStrip.appendChild(facedownEl());
    }

    const infoDiv = document.createElement('div');
    infoDiv.className = 'my-info';
    infoDiv.innerHTML = `
      <div class="my-name">${myPlayer.name}${isDealer ? ' 🅓' : ''}${isActive ? ' ◀' : ''}</div>
      <div class="my-chips">${myPlayer.chips} chips</div>
      ${myPlayer.bet > 0 ? `<div class="my-bet">Bet: ${myPlayer.bet}</div>` : ''}
      ${myPlayer.folded ? '<div style="color:#e94560;font-size:.7rem">FOLDED</div>' : ''}
      ${myPlayer.allIn ? '<div style="color:#e67e22;font-size:.7rem">ALL-IN</div>' : ''}
    `;
    myHandStrip.appendChild(infoDiv);
  }
}

// ── Betting info + raise builder ──
function renderBettingInfo(info, myPlayer) {
  const { isPotLimit, potSize, currentBet, callAmount, maxRaiseTo, minRaiseTo, minRaise } = info;

  // Store for +/- handlers
  lastInfo = { ...info, myChipsTotal: myPlayer.chips + myPlayer.bet };

  // Top info row
  potInfo.textContent    = `Pot: ${potSize}`;
  toCallInfo.textContent = callAmount > 0 ? `To call: ${callAmount}` : 'No bet';
  limitInfo.innerHTML    = `<span class="limit-badge">${isPotLimit ? 'Pot Limit' : 'No Limit'}</span>`;

  // Show/hide check vs call
  document.getElementById('checkBtn').classList.toggle('hidden', callAmount > 0);
  document.getElementById('callBtn').classList.toggle('hidden', callAmount === 0);
  document.getElementById('callBtn').textContent = `Call ${callAmount}`;

  // Hide All-In button pre-flop (pot limit — all-in would violate pot limit cap)
  document.getElementById('allInBtn').classList.toggle('hidden', isPotLimit);

  // Label Raise vs Bet
  const isBet = currentBet === 0;
  document.getElementById('raiseBtn').textContent = isBet ? 'Bet' : 'Raise';
  document.getElementById('raiseConfirm').textContent = isBet ? 'Bet' : 'Raise';

  // Max for no-limit = all their chips total
  const myTotal = myPlayer.chips + myPlayer.bet;
  const maxTo   = isPotLimit ? Math.floor(maxRaiseTo) : myTotal;

  // Limits display
  raiseLimits.innerHTML = `
    <span>Min: <strong>${minRaiseTo}</strong></span>
    <span>${isPotLimit ? `Max (pot): <strong>${maxTo}</strong>` : `All-in: <strong>${myTotal}</strong>`}</span>
  `;

  // Preset buttons
  raisePresets.innerHTML = '';
  const presets = buildPresets(isPotLimit, potSize, callAmount, minRaiseTo, maxTo, myTotal);
  for (const { label, value } of presets) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => { raiseInput.value = value; });
    raisePresets.appendChild(btn);
  }

  // Pre-fill raise input with min raise
  raiseInput.value = minRaiseTo;
  raiseInput.min   = minRaiseTo;
  raiseInput.max   = maxTo;
  raiseInput.step  = minRaise || 20;
}

function buildPresets(isPotLimit, pot, callAmount, minTo, maxTo, myTotal) {
  const presets = [];
  presets.push({ label: 'Min', value: minTo });

  if (!isPotLimit) {
    // Half pot
    const halfPot = Math.max(minTo, Math.floor(pot / 2));
    if (halfPot > minTo && halfPot < myTotal) presets.push({ label: '½ Pot', value: halfPot });
    // Full pot
    const fullPot = Math.max(minTo, pot);
    if (fullPot > minTo && fullPot < myTotal) presets.push({ label: 'Pot', value: fullPot });
    // 2x pot
    const twoPot = Math.max(minTo, pot * 2);
    if (twoPot > fullPot && twoPot < myTotal) presets.push({ label: '2× Pot', value: twoPot });
  } else {
    // Pot limit: only preset is the max
    if (maxTo > minTo) presets.push({ label: 'Max (Pot)', value: maxTo });
  }

  // All-in (only if different from max)
  if (myTotal > minTo && myTotal !== maxTo) presets.push({ label: 'All-in', value: myTotal });

  return presets;
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

window.addEventListener('resize', () => { if (lastState) renderState(lastState); });
