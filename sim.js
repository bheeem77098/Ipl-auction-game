// Ball-by-ball T20 season simulator driven by each team's chosen playing XI.
const { strength } = require('./rules');

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function pickWeighted(weights) {
  let total = 0;
  for (const w of weights) total += w;
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}

const RUN_VALUES = [0, 1, 2, 3, 4, 6];
// phase 0 = powerplay (overs 1-6), 1 = middle (7-15), 2 = death (16-20)
const phaseOf = over => (over < 6 ? 0 : over < 15 ? 1 : 2);

function ballOutcome(bat, bowl, over, pressure) {
  const diff = bat - bowl;
  const s = diff / 65 + pressure;
  const ph = phaseOf(over);
  const wicketP = clamp(0.045 * Math.exp(-diff / 65) * [0.95, 0.9, 1.3][ph] * (1 + 0.5 * pressure), 0.012, 0.16);
  if (Math.random() < wicketP) return -1;
  const w = [
    30 * Math.exp(-0.55 * s) * [1.15, 1.0, 0.8][ph],
    34 * Math.exp(-0.05 * s) * [0.85, 1.2, 0.9][ph],
    7 * [0.8, 1.2, 1.1][ph],
    1,
    14 * Math.exp(0.4 * s) * [1.35, 0.85, 1.1][ph],
    8 * Math.exp(0.7 * s) * [0.8, 0.85, 1.7][ph],
  ];
  return RUN_VALUES[pickWeighted(w)];
}

function oversText(balls) { return `${Math.floor(balls / 6)}.${balls % 6}`; }

// Plays one innings. target = runs needed to win (second innings) or undefined (first innings).
function playInnings(batTeam, bowlTeam, target) {
  const order = batTeam.xi;
  const bs = order.map(p => ({ p, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, played: false }));
  const bowlers = bowlTeam.xi.slice().sort((a, b) => b.bowl - a.bowl).slice(0, 5)
    .map(p => ({ p, balls: 0, runs: 0, wkts: 0 }));
  let striker = 0, nonStriker = 1, next = 2, runs = 0, wkts = 0, balls = 0, lastBowler = -1;
  bs[0].played = true; bs[1].played = true;

  innings:
  for (let over = 0; over < 20; over++) {
    let elig = bowlers.map((_, i) => i).filter(i => i !== lastBowler && bowlers[i].balls < 24);
    if (!elig.length) elig = bowlers.map((_, i) => i).filter(i => bowlers[i].balls < 24);
    if (!elig.length) elig = bowlers.map((_, i) => i);
    const bi = elig[pickWeighted(elig.map(i => Math.pow(bowlers[i].p.bowl, 4) * (1.2 - bowlers[i].balls / 30)))];
    const bw = bowlers[bi];
    lastBowler = bi;

    let legal = 0;
    while (legal < 6) {
      // wides / no-balls: 1 run, ball is re-bowled
      if (Math.random() < 0.045) {
        runs += 1; bw.runs += 1;
        if (target !== undefined && runs >= target) break innings;
        continue;
      }
      let pressure = 0;
      if (target !== undefined) {
        const ballsLeft = 120 - balls;
        const rrr = ((target - runs) * 6) / ballsLeft;
        pressure = clamp((rrr - 9.5) / 8, -0.15, 0.6);
      }
      const bat = bs[striker];
      const out = ballOutcome(bat.p.bat, bw.p.bowl, over, pressure);
      legal++; balls++; bw.balls++; bat.balls++;
      if (out === -1) {
        bat.out = true; bw.wkts++; wkts++;
        if (wkts === 10) break innings;
        striker = next++;
        bs[striker].played = true;
      } else {
        runs += out; bat.runs += out; bw.runs += out;
        if (out === 4) bat.fours++;
        if (out === 6) bat.sixes++;
        if (out % 2 === 1) [striker, nonStriker] = [nonStriker, striker];
        if (target !== undefined && runs >= target) break innings;
      }
    }
    [striker, nonStriker] = [nonStriker, striker];
  }
  return { runs, wkts, balls, allOut: wkts === 10, bs, bowlers };
}

function topPerformers(inn) {
  const bat = inn.bs.filter(b => b.played).sort((a, b) => b.runs - a.runs || a.balls - b.balls)[0];
  const bowl = inn.bowlers.slice().sort((a, b) => b.wkts - a.wkts || a.runs - b.runs)[0];
  return {
    bat: bat ? `${bat.p.name} ${bat.runs}${bat.out ? '' : '*'} (${bat.balls})` : '',
    bowl: bowl ? `${bowl.p.name} ${bowl.wkts}/${bowl.runs}` : '',
  };
}

function teamPower(t) {
  const bats = t.xi.map(p => p.bat).sort((a, b) => b - a).slice(0, 7);
  const bowls = t.xi.map(p => p.bowl).sort((a, b) => b - a).slice(0, 5);
  return bats.reduce((a, b) => a + b, 0) / bats.length + bowls.reduce((a, b) => a + b, 0) / bowls.length;
}

// Plays a match; records player + team stats into `ctx`. Returns a summary.
function playMatch(ctx, a, b, stage) {
  const [first, second] = Math.random() < 0.5 ? [a, b] : [b, a];
  const inn1 = playInnings(first, second);
  const inn2 = playInnings(second, first, inn1.runs + 1);

  let winner, loser, result, superOver = false;
  if (inn2.runs > inn1.runs) {
    winner = second; loser = first;
    result = `${winner.code} won by ${10 - inn2.wkts} wickets (${120 - inn2.balls} balls left)`;
  } else if (inn2.runs < inn1.runs) {
    winner = first; loser = second;
    result = `${winner.code} won by ${inn1.runs - inn2.runs} runs`;
  } else {
    superOver = true;
    const pa = teamPower(first), pb = teamPower(second);
    winner = Math.random() < 1 / (1 + Math.exp(-(pa - pb) / 25)) ? first : second;
    loser = winner === first ? second : first;
    result = `Match tied - ${winner.code} won the Super Over`;
  }

  // team stats (NRR counts an all-out innings as a full 20 overs)
  const t1 = ctx.teams.get(first.id), t2 = ctx.teams.get(second.id);
  const faced1 = inn1.allOut ? 120 : inn1.balls, faced2 = inn2.allOut ? 120 : inn2.balls;
  t1.rf += inn1.runs; t1.bf += faced1; t1.ra += inn2.runs; t1.ba += faced2;
  t2.rf += inn2.runs; t2.bf += faced2; t2.ra += inn1.runs; t2.ba += faced1;
  if (stage === 'League') {
    ctx.teams.get(winner.id).wins++; ctx.teams.get(winner.id).points += 2; ctx.teams.get(loser.id).losses++;
  }

  // player stats + player of the match
  const scores = new Map();
  const credit = (team, inn, bowlSide) => {
    for (const b of inn.bs) {
      if (!b.played) continue;
      const s = ctx.players.get(b.p.id);
      s.inns++; s.runs += b.runs; s.balls += b.balls; s.fours += b.fours; s.sixes += b.sixes;
      if (b.runs > s.best) s.best = b.runs;
      scores.set(b.p.id, (scores.get(b.p.id) || 0) + b.runs + b.sixes * 0.5 + (b.balls > 0 ? Math.max(0, (b.runs / b.balls - 1) * 10) : 0));
    }
    for (const bw of inn.bowlers) {
      const s = ctx.players.get(bw.p.id);
      s.wkts += bw.wkts; s.ballsBowled += bw.balls; s.runsConceded += bw.runs;
      scores.set(bw.p.id, (scores.get(bw.p.id) || 0) + bw.wkts * 25 + Math.max(0, 8 - (bw.balls ? bw.runs / (bw.balls / 6) : 8)) * 2);
    }
  };
  credit(first, inn1); credit(second, inn2);
  let pom = null, pomScore = -1;
  for (const [id, sc] of scores) {
    const s = ctx.players.get(id);
    const total = sc + (s.team === winner.code ? 12 : 0);
    if (total > pomScore) { pomScore = total; pom = s; }
  }

  ctx.matchNo++;
  return {
    no: ctx.matchNo, stage,
    first: { code: first.code, owner: first.owner, runs: inn1.runs, wkts: inn1.wkts, overs: oversText(inn1.balls), top: topPerformers(inn1) },
    second: { code: second.code, owner: second.owner, runs: inn2.runs, wkts: inn2.wkts, overs: oversText(inn2.balls), top: topPerformers(inn2) },
    winner: winner.code, loser: loser.code, result, superOver,
    pom: pom ? pom.name : null,
  };
}

// teams: [{ id, code, name, owner, xi: [{id,name,role,country,bat,bowl}] }]
function runSeason(teams) {
  const ctx = { matchNo: 0, teams: new Map(), players: new Map() };
  const byCode = new Map();
  for (const t of teams) {
    ctx.teams.set(t.id, { id: t.id, code: t.code, name: t.name, owner: t.owner, wins: 0, losses: 0, points: 0, rf: 0, bf: 0, ra: 0, ba: 0 });
    byCode.set(t.code, t);
    for (const p of t.xi) {
      ctx.players.set(p.id, { id: p.id, name: p.name, team: t.code, owner: t.owner, inns: 0, runs: 0, balls: 0, fours: 0, sixes: 0, best: 0, wkts: 0, ballsBowled: 0, runsConceded: 0 });
    }
  }

  const matches = [];
  // double round robin: every pair plays twice (home and away)
  for (let i = 0; i < teams.length; i++)
    for (let j = 0; j < teams.length; j++)
      if (i !== j) matches.push(playMatch(ctx, teams[i], teams[j], 'League'));

  const nrr = t => (t.bf ? t.rf / (t.bf / 6) : 0) - (t.ba ? t.ra / (t.ba / 6) : 0);
  const table = [...ctx.teams.values()]
    .map(t => ({ ...t, nrr: nrr(t), played: t.wins + t.losses }))
    .sort((a, b) => b.points - a.points || b.nrr - a.nrr);

  let champion, runnerUp;
  const T = t => byCode.get(t.code);
  if (table.length >= 4) {
    const q1 = playMatch(ctx, T(table[0]), T(table[1]), 'Qualifier 1');
    const el = playMatch(ctx, T(table[2]), T(table[3]), 'Eliminator');
    const q2 = playMatch(ctx, byCode.get(q1.loser), byCode.get(el.winner), 'Qualifier 2');
    const fin = playMatch(ctx, byCode.get(q1.winner), byCode.get(q2.winner), 'Final');
    matches.push(q1, el, q2, fin);
    champion = fin.winner; runnerUp = fin.loser;
  } else {
    const fin = playMatch(ctx, T(table[0]), T(table[1]), 'Final');
    matches.push(fin);
    champion = fin.winner; runnerUp = fin.loser;
  }

  const players = [...ctx.players.values()];
  const sr = p => (p.balls ? +(p.runs / p.balls * 100).toFixed(1) : 0);
  const econ = p => (p.ballsBowled ? +(p.runsConceded / (p.ballsBowled / 6)).toFixed(2) : 0);
  const orange = players.filter(p => p.runs > 0).sort((a, b) => b.runs - a.runs || a.balls - b.balls)
    .slice(0, 5).map(p => ({ player: p.name, team: p.team, owner: p.owner, runs: p.runs, balls: p.balls, sr: sr(p), fours: p.fours, sixes: p.sixes, inns: p.inns, best: p.best }));
  const purple = players.filter(p => p.wkts > 0).sort((a, b) => b.wkts - a.wkts || a.runsConceded - b.runsConceded)
    .slice(0, 5).map(p => ({ player: p.name, team: p.team, owner: p.owner, wkts: p.wkts, econ: econ(p), runsConceded: p.runsConceded, overs: oversText(p.ballsBowled) }));

  const info = c => ({ code: c, name: byCode.get(c).name, owner: byCode.get(c).owner });
  return {
    champion: info(champion),
    runnerUp: info(runnerUp),
    orangeCap: orange[0] || null, orangeTop: orange,
    purpleCap: purple[0] || null, purpleTop: purple,
    table: table.map(t => ({ code: t.code, name: t.name, owner: t.owner, played: t.played, wins: t.wins, losses: t.losses, points: t.points, nrr: +t.nrr.toFixed(3) })),
    matches,
    xis: Object.fromEntries(teams.map(t => [t.code, t.xi.map(p => p.name)])),
    note: 'Simulated from the auction squads and game ratings, ball by ball. For entertainment, not a real-world prediction.',
  };
}

module.exports = { runSeason, playMatch, playInnings };
