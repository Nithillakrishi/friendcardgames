'use strict';

const { freshDeck } = require('./deck');
const { determineWinners } = require('./handEvaluator');

const BIG_BLIND = 20;
const SMALL_BLIND = 10;
const STARTING_CHIPS = 1000;

class Game {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.stage = 'waiting';
    this.deck = [];
    this.community = [];
    this.pot = 0;
    this.currentBet = 0;
    this.dealerIndex = -1;
    this.actionIndex = -1;
    this.minRaise = BIG_BLIND;
    // needToAct: set of player indices who still must act this street
    this.needToAct = new Set();
  }

  addPlayer(id, name) {
    if (this.players.length >= 9) return { error: 'Room full' };
    if (this.stage !== 'waiting' && this.stage !== 'showdown') return { error: 'Game in progress' };
    if (this.players.find(p => p.id === id)) return { error: 'Already in room' };
    const seat = this.players.length;
    this.players.push({
      id, name, chips: STARTING_CHIPS,
      hand: [], bet: 0, folded: false, allIn: false,
      seatIndex: seat, connected: true,
    });
    return { ok: true };
  }

  removePlayer(id) {
    const idx = this.players.findIndex(p => p.id === id);
    if (idx === -1) return;
    if (this.stage === 'waiting') {
      this.players.splice(idx, 1);
      this.players.forEach((p, i) => { p.seatIndex = i; });
    } else {
      this.players[idx].connected = false;
      this.players[idx].folded = true;
      this.needToAct.delete(idx);
      if (this._activePlayers().length <= 1) this._endRound();
    }
  }

  canStart() {
    return this.players.filter(p => p.connected).length >= 2 && this.stage === 'waiting';
  }

  startRound() {
    if (!this.canStart()) return false;
    this.deck = freshDeck();
    this.community = [];
    this.pot = 0;
    this.currentBet = BIG_BLIND;
    this.minRaise = BIG_BLIND;

    for (const p of this.players) {
      p.hand = [this.deck.pop(), this.deck.pop()];
      p.bet = 0; p.folded = false; p.allIn = false;
    }

    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    const n = this.players.length;
    const sbIdx = (this.dealerIndex + 1) % n;
    const bbIdx = (this.dealerIndex + 2) % n;

    this._postBlind(sbIdx, SMALL_BLIND);
    this._postBlind(bbIdx, BIG_BLIND);

    // Pre-flop: everyone must act. BB acts last and can raise even if no one else does.
    this.actionIndex = (bbIdx + 1) % n;
    this._resetNeedToAct();
    // BB already put in the full blind but can still raise (option)
    this.needToAct.add(bbIdx);

    this.stage = 'preflop';
    return true;
  }

  _postBlind(idx, amount) {
    const p = this.players[idx];
    const actual = Math.min(amount, p.chips);
    p.chips -= actual; p.bet += actual; this.pot += actual;
    if (p.chips === 0) p.allIn = true;
  }

  _activePlayers() { return this.players.filter(p => !p.folded); }
  _playersToAct()  { return this.players.filter(p => !p.folded && !p.allIn); }

  currentPlayer() { return this.players[this.actionIndex]; }

  bettingInfo() {
    const p = this.currentPlayer();
    if (!p) return null;
    const isPotLimit = this.stage === 'preflop';
    const callAmount = Math.min(this.currentBet - p.bet, p.chips);
    // Pot limit formula: Total Raise Amount = (3 × Last Bet) + Remaining Pot
    // = 3 × currentBet + (pot − currentBet) = 2 × currentBet + pot
    // This gives the max "raise to" level (new currentBet) for any player.
    // Cap to player's total available chips.
    const plPotMax = 2 * this.currentBet + this.pot;
    const maxRaiseTo = isPotLimit
      ? Math.min(plPotMax, p.bet + p.chips)
      : Infinity;
    const minRaiseTo = this.currentBet + this.minRaise;
    return {
      isPotLimit, potSize: this.pot, currentBet: this.currentBet,
      callAmount, maxRaiseTo, minRaiseTo, minRaise: this.minRaise,
    };
  }

  action(playerId, type, amount = 0) {
    const p = this.players[this.actionIndex];
    if (!p || p.id !== playerId) return { error: 'Not your turn' };
    if (p.folded || p.allIn)    return { error: 'Cannot act' };

    const info = this.bettingInfo();
    const toCall = info.callAmount;

    if (type === 'fold') {
      p.folded = true;
      this.needToAct.delete(this.actionIndex);
      if (this._activePlayers().length <= 1) return this._endRound();

    } else if (type === 'check') {
      if (toCall > 0) return { error: `Must call ${toCall}, raise, or fold` };
      this.needToAct.delete(this.actionIndex);

    } else if (type === 'call') {
      const actual = Math.min(toCall, p.chips);
      p.chips -= actual; p.bet += actual; this.pot += actual;
      if (p.chips === 0) p.allIn = true;
      this.needToAct.delete(this.actionIndex);

    } else if (type === 'raise') {
      // amount = total bet amount (raise TO)
      if (amount < info.minRaiseTo && p.chips + p.bet > amount)
        return { error: `Min raise to ${info.minRaiseTo}` };
      if (info.isPotLimit && amount > info.maxRaiseTo)
        return { error: `Pot limit max raise to ${Math.floor(info.maxRaiseTo)}` };
      const spend = amount - p.bet;
      if (spend > p.chips) return { error: 'Not enough chips' };
      this.minRaise = amount - this.currentBet;
      this.pot += spend; p.chips -= spend;
      p.bet = amount; this.currentBet = amount;
      if (p.chips === 0) p.allIn = true;
      // Everyone else needs to act again
      this._resetNeedToActExcept(this.actionIndex);

    } else if (type === 'allin') {
      const spend = p.chips;
      p.bet += spend; this.pot += spend; p.chips = 0; p.allIn = true;
      if (p.bet > this.currentBet) {
        this.minRaise = Math.max(this.minRaise, p.bet - this.currentBet);
        this.currentBet = p.bet;
        this._resetNeedToActExcept(this.actionIndex);
      }
      this.needToAct.delete(this.actionIndex);

    } else {
      return { error: 'Unknown action' };
    }

    return this._advance();
  }

  _resetNeedToAct() {
    this.needToAct = new Set(
      this.players
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => !p.folded && !p.allIn)
        .map(({ i }) => i)
    );
  }

  _resetNeedToActExcept(skipIdx) {
    this._resetNeedToAct();
    this.needToAct.delete(skipIdx);
  }

  _advance() {
    const active = this._activePlayers();
    if (active.length <= 1) return this._endRound();

    // Betting round over when no one needs to act
    if (this.needToAct.size === 0 || this._playersToAct().length === 0) {
      return this._nextStage();
    }

    // Find next player who needs to act
    const n = this.players.length;
    let idx = (this.actionIndex + 1) % n;
    let loops = 0;
    while (loops < n) {
      if (this.needToAct.has(idx)) { this.actionIndex = idx; break; }
      idx = (idx + 1) % n;
      loops++;
    }

    return { ok: true, next: this.actionIndex };
  }

  _nextStage() {
    const order = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    this.stage = order[order.indexOf(this.stage) + 1] || 'showdown';

    for (const p of this.players) p.bet = 0;
    this.currentBet = 0; this.minRaise = BIG_BLIND;

    if (this.stage === 'flop') {
      this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    } else if (this.stage === 'turn') {
      this.community.push(this.deck.pop());
    } else if (this.stage === 'river') {
      this.community.push(this.deck.pop());
    } else {
      return this._endRound();
    }

    // First active player left of dealer acts first post-flop
    const n = this.players.length;
    let idx = (this.dealerIndex + 1) % n;
    for (let i = 0; i < n; i++) {
      if (!this.players[idx].folded && !this.players[idx].allIn) break;
      idx = (idx + 1) % n;
    }
    this.actionIndex = idx;
    this._resetNeedToAct();

    if (this._playersToAct().length === 0) return this._nextStage();

    return { ok: true, stage: this.stage };
  }

  _endRound() {
    this.stage = 'showdown';
    const active = this._activePlayers();
    let results;

    if (active.length === 1) {
      active[0].chips += this.pot;
      results = [{ index: this.players.indexOf(active[0]), handName: 'Last standing', chips: this.pot }];
    } else {
      const winners = determineWinners(active, this.community);
      const share = Math.floor(this.pot / winners.length);
      const extra = this.pot - share * winners.length;
      results = winners.map((w, i) => {
        const player = active[w.index];
        const award = share + (i === 0 ? extra : 0);
        player.chips += award;
        return { index: this.players.indexOf(player), handName: w.handName, chips: award };
      });
    }
    // Stay in 'showdown' stage — server calls prepareNextRound() after the delay
    return { ok: true, stage: 'showdown', results, community: this.community };
  }

  // Called by server after the between-hand delay to clean up and reset
  prepareNextRound() {
    this.players = this.players.filter(p => p.chips > 0 && p.connected);
    this.players.forEach((p, i) => { p.seatIndex = i; });
    this.stage = 'waiting';
  }

  publicState(forPlayerId = null) {
    const cp = this.stage !== 'waiting' && this.stage !== 'showdown'
      ? this.bettingInfo() : null;
    // During showdown everyone's hand is revealed
    const showAll = this.stage === 'showdown';
    return {
      stage: this.stage, pot: this.pot, community: this.community,
      currentBet: this.currentBet, actionIndex: this.actionIndex,
      dealerIndex: this.dealerIndex,
      players: this.players.map(p => ({
        id: p.id, name: p.name, chips: p.chips, bet: p.bet,
        folded: p.folded, allIn: p.allIn,
        seatIndex: p.seatIndex, connected: p.connected,
        cardCount: p.hand.length,
        hand: (showAll || p.id === forPlayerId) ? p.hand : null,
      })),
      bettingInfo: cp,
    };
  }
}

module.exports = { Game, BIG_BLIND, SMALL_BLIND };
