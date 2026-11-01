const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FRANCHISES = require('./public/franchises.js');
const PLAYERS = require('./players.js');
const R = require('./rules.js');
const { runSeason } = require('./sim.js');

const app = express(), server = http.createServer(app), io = new Server(server);
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data', 'rooms.json');
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

const LOT_SECONDS = Number(process.env.LOT_SECONDS) || 20; // seconds per lot (set LOT_SECONDS=5 to test quickly)
const rooms = new Map();
const sockets = new Map();
const roomCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const franchiseOf = code => FRANCHISES.find(f => f.code === code);

// ---------- persistence (debounced so the 1-second auction tick does not hammer the disk)
let saveTimer = null;
function saveRooms() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const data = [...rooms.values()].map(r => ({ ...r, timer: undefined }));
      fs.writeFileSync(DATA_FILE, JSON.stringify(data));
    } catch (e) { console.error('Could not save rooms:', e.message); }
  }, 400);
}
try {
  if (fs.existsSync(DATA_FILE)) {
    for (const r of JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))) {
      r.timer = null;
      if (r.status === 'finished') r.status = 'xi'; // rooms saved by the old version
      r.players.forEach(p => { p.online = false; p.socketId = null; p.team = p.team || null; p.xi = p.xi || null; p.xiLocked = !!p.xiLocked; });
      rooms.set(r.code, r);
    }
  }
} catch (e) { console.error('Room recovery failed:', e.message); }

const getRoom = s => rooms.get(s.data.room);
const isHost = (r, s) => r.hostToken === s.data.playerToken;
const me = (r, s) => r.players.find(p => p.token === s.data.playerToken);
const label = p => (p.team ? `${p.team} (${p.name})` : p.name);

function attachPlayer(s, r, p) {
  p.online = true; p.socketId = s.id;
  s.data.room = r.code; s.data.playerToken = p.token;
  s.join(r.code);
  sockets.set(s.id, { room: r.code, token: p.token });
  if (p.token === r.hostToken) r.hostSocket = s.id;
}

// ---------- what clients see
function pub(r) {
  return {
    code: r.code,
    host: r.players.find(p => p.token === r.hostToken)?.id,
    players: r.players.map(p => ({
      id: p.id, name: p.name, online: p.online, purse: p.purse, squad: p.squad,
      team: p.team, xiLocked: p.xiLocked,
      maxBid: R.maxBid(p), rules: r.status === 'xi' ? R.xiRules(p.squad) : null,
    })),
    status: r.status, current: r.current, bid: r.bid, leader: r.leader, seconds: r.seconds,
    lot: r.lot, totalLots: r.pool.length, upcoming: r.pool.slice(r.lot), sold: r.sold, unsold: r.unsold,
    log: r.log.slice(-12), simulation: r.simulation,
  };
}
function emit(r) { saveRooms(); io.to(r.code).emit('room', pub(r)); }
function sendMyXI(s, p) { if (p.xi) s.emit('myXI', p.xi); }

// ---------- auction
function settleCurrent(r) {
  if (!r.current) return;
  const w = r.leader && r.players.find(p => p.id === r.leader);
  if (w) {
    w.purse = +(w.purse - r.bid).toFixed(2);
    w.squad.push({ ...r.current, paid: r.bid });
    r.sold.push({ ...r.current, buyer: label(w), paid: r.bid });
    r.log.push(`${r.current.name} SOLD to ${label(w)} for ₹${r.bid.toFixed(2)} Cr`);
  } else {
    r.unsold.push(r.current);
    r.log.push(`${r.current.name} went UNSOLD`);
  }
  r.current = null; r.leader = null;
}

function nextLot(r) {
  clearInterval(r.timer);
  if (r.lot >= r.pool.length) return finishAuction(r);
  r.current = r.pool[r.lot++];
  r.bid = r.current.base; r.leader = null; r.seconds = LOT_SECONDS; r.status = 'auction';
  emit(r);
  r.timer = setInterval(() => {
    if (r.status !== 'auction') return;
    if (--r.seconds <= 0) {
      clearInterval(r.timer);
      settleCurrent(r);
      emit(r);
      setTimeout(() => { if (rooms.has(r.code) && r.status === 'auction') nextLot(r); }, 2200);
    } else emit(r);
  }, 1000);
}

// Give every team that is below 11 players free replacement picks from the leftover pool.
function topUpSquads(r) {
  const leftover = [...r.unsold, ...r.pool.slice(r.lot)];
  const taken = new Set();
  const needy = () => r.players.filter(p => p.squad.length < R.MIN_SQUAD);
  let progress = true;
  while (progress && needy().length && taken.size < leftover.length) {
    progress = false;
    for (const p of needy().sort(() => Math.random() - 0.5)) {
      const needKeeper = !p.squad.some(x => x.role === 'Wicketkeeper');
      const needBowlers = p.squad.filter(R.canBowl).length < 5;
      const overseas = p.squad.filter(R.isOverseas).length;
      const open = leftover.filter(x => !taken.has(x.id) && !(R.isOverseas(x) && overseas >= R.MAX_OVERSEAS_SQUAD));
      // keep XI-eligible squads: once a team has 4 overseas players, prefer Indian replacements
      const preferred = overseas >= R.MAX_OVERSEAS_XI ? open.filter(x => !R.isOverseas(x)) : open;
      const pick = (preferred.length ? preferred : open)
        .map(x => ({ x, v: R.strength(x) + (needKeeper && x.role === 'Wicketkeeper' ? 30 : 0) + (needBowlers && R.canBowl(x) ? 15 : 0) }))
        .sort((a, b) => b.v - a.v)[0];
      if (!pick) continue;
      progress = true;
      taken.add(pick.x.id);
      p.squad.push({ ...pick.x, paid: 0, auto: true });
      r.log.push(`${pick.x.name} added to ${label(p)} as a free replacement pick`);
    }
  }
}

function finishAuction(r) {
  clearInterval(r.timer);
  settleCurrent(r);
  r.pool = r.pool.slice(0, r.lot); // nothing left to auction
  r.status = 'xi';
  r.log.push('Auction closed. Time to pick your playing XI!');
  emit(r);
}

// ---------- season
function runTheSeason(r) {
  const teams = r.players.map(p => {
    const squad = p.squad.slice();
    let ids = p.xi && p.xiLocked && !R.validateXI(squad, p.xi) ? p.xi : R.autoPickXI(squad);
    const xi = ids.map(id => squad.find(x => x.id === id)).filter(Boolean);
    // a team with fewer than 11 players is padded with club cricketers
    for (let i = 1; xi.length < 11; i++) xi.push({ id: `sub${p.id}${i}`, name: `Club Cricketer ${i} (${p.team})`, role: 'Batter', country: 'India', bat: 30, bowl: 25 });
    p.xi = xi.map(x => x.id); p.xiLocked = true;
    return { id: p.id, code: p.team, name: franchiseOf(p.team).name, owner: p.name, xi };
  });
  r.simulation = runSeason(teams);
  r.status = 'simulated';
  r.log.push(`Season complete! ${r.simulation.champion.code} are the champions.`);
  emit(r);
}

io.on('connection', s => {
  s.on('create', ({ name }) => {
    const c = roomCode(), token = crypto.randomBytes(24).toString('hex');
    const p = { id: token.slice(0, 12), token, name: (name || 'Host').slice(0, 18), online: true, socketId: s.id, purse: R.PURSE, squad: [], team: null, xi: null, xiLocked: false };
    const r = { code: c, hostToken: token, hostSocket: s.id, players: [p], status: 'waiting', current: null, bid: 0, leader: null, seconds: 20, lot: 0, pool: PLAYERS.map(x => ({ ...x })), sold: [], unsold: [], log: [], timer: null, simulation: null };
    rooms.set(c, r);
    attachPlayer(s, r, p);
    s.emit('joined', { code: c, host: true, token });
    emit(r);
  });

  s.on('join', ({ code: c, name, token }) => {
    const r = rooms.get((c || '').toUpperCase());
    if (!r) return s.emit('errorMsg', 'Room not found. Check the code.');
    let p = token && r.players.find(x => x.token === token);
    if (!p) {
      if (r.status !== 'waiting') return s.emit('errorMsg', 'This auction has started. Rejoin using the same browser/device that joined earlier.');
      if (r.players.length >= FRANCHISES.length) return s.emit('errorMsg', `Room is full (${FRANCHISES.length} franchises).`);
      const fresh = crypto.randomBytes(24).toString('hex');
      p = { id: fresh.slice(0, 12), token: fresh, name: (name || 'Player').slice(0, 18), online: false, socketId: null, purse: R.PURSE, squad: [], team: null, xi: null, xiLocked: false };
      r.players.push(p);
    } else if (name && p.name !== name && r.status === 'waiting') p.name = name.slice(0, 18);
    attachPlayer(s, r, p);
    s.emit('joined', { code: r.code, host: p.token === r.hostToken, token: p.token });
    sendMyXI(s, p);
    emit(r);
  });

  s.on('reconnectRoom', ({ code: c, token }) => {
    const r = rooms.get((c || '').toUpperCase());
    if (!r || !token) return;
    const p = r.players.find(x => x.token === token);
    if (!p) return;
    attachPlayer(s, r, p);
    s.emit('joined', { code: r.code, host: p.token === r.hostToken, token: p.token });
    sendMyXI(s, p);
    emit(r);
  });

  // ----- franchise selection (lobby)
  s.on('pickTeam', ({ code }) => {
    const r = getRoom(s), p = r && me(r, s);
    if (!p || r.status !== 'waiting') return;
    if (!franchiseOf(code)) return;
    const owner = r.players.find(x => x.team === code);
    if (owner && owner !== p) return s.emit('errorMsg', `${code} is already taken by ${owner.name}.`);
    p.team = code;
    emit(r);
  });

  s.on('start', () => {
    const r = getRoom(s);
    if (!r || !isHost(r, s) || r.status !== 'waiting') return;
    if (r.players.length < 2) return s.emit('errorMsg', 'At least 2 players must join.');
    const missing = r.players.filter(p => !p.team);
    if (missing.length) return s.emit('errorMsg', `Waiting for ${missing.map(p => p.name).join(', ')} to pick a franchise.`);
    r.status = 'auction';
    r.log.push('Auction started! Good luck.');
    r.pool.sort(() => Math.random() - 0.5);
    r.lot = 0;
    nextLot(r);
  });

  s.on('bid', ({ amount }) => {
    const r = getRoom(s);
    if (!r || r.status !== 'auction' || !r.current) return;
    const p = me(r, s);
    if (!p || r.leader === p.id) return;
    const n = Number(amount);
    const minimum = r.leader ? r.bid + 0.01 : r.bid; // the first bid may be at the base price
    if (!Number.isFinite(n) || n < minimum || n > R.maxBid(p)) return;
    if (p.squad.length >= R.MAX_SQUAD) return s.emit('errorMsg', `Squad full (${R.MAX_SQUAD} players).`);
    if (R.isOverseas(r.current) && p.squad.filter(R.isOverseas).length >= R.MAX_OVERSEAS_SQUAD) return s.emit('errorMsg', `You already have ${R.MAX_OVERSEAS_SQUAD} overseas players.`);
    r.bid = +n.toFixed(2); r.leader = p.id; r.seconds = LOT_SECONDS;
    r.log.push(`${label(p)} bids ₹${r.bid.toFixed(2)} Cr`);
    emit(r);
  });

  // ----- host ends the auction early
  s.on('endAuction', ({ force } = {}) => {
    const r = getRoom(s);
    if (!r || !isHost(r, s) || r.status !== 'auction') return;
    const short = r.players.filter(p => p.squad.length + (r.leader === p.id ? 1 : 0) < R.MIN_SQUAD);
    if (short.length && !force) {
      return s.emit('needTopUp', short.map(p => ({ name: label(p), have: p.squad.length, need: R.MIN_SQUAD - p.squad.length })));
    }
    clearInterval(r.timer);
    settleCurrent(r);
    topUpSquads(r);
    finishAuction(r);
  });

  // ----- playing XI
  s.on('suggestXI', () => {
    const r = getRoom(s), p = r && me(r, s);
    if (!p || r.status !== 'xi') return;
    s.emit('suggestedXI', R.autoPickXI(p.squad));
  });

  s.on('lockXI', ({ ids }) => {
    const r = getRoom(s), p = r && me(r, s);
    if (!p || r.status !== 'xi') return;
    const err = R.validateXI(p.squad, ids);
    if (err) return s.emit('errorMsg', err);
    p.xi = ids; p.xiLocked = true;
    s.emit('myXI', p.xi);
    if (r.players.every(x => x.xiLocked)) return runTheSeason(r); // everyone is ready: play the season
    emit(r);
  });

  s.on('unlockXI', () => {
    const r = getRoom(s), p = r && me(r, s);
    if (!p || r.status !== 'xi') return;
    p.xiLocked = false;
    emit(r);
  });

  // host does not want to wait: auto-pick for anyone who has not locked an XI
  s.on('startSeason', () => {
    const r = getRoom(s);
    if (!r || !isHost(r, s) || r.status !== 'xi') return;
    runTheSeason(r);
  });

  s.on('resimulate', () => {
    const r = getRoom(s);
    if (!r || !isHost(r, s) || r.status !== 'simulated') return;
    runTheSeason(r);
  });

  s.on('disconnect', () => {
    const ref = sockets.get(s.id);
    if (!ref) return;
    const r = rooms.get(ref.room);
    sockets.delete(s.id);
    if (!r) return;
    const p = r.players.find(x => x.token === ref.token);
    if (p) { p.online = false; p.socketId = null; }
    if (r.hostToken === ref.token) r.hostSocket = null;
    emit(r);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Auction Battle running on ${port}`));
