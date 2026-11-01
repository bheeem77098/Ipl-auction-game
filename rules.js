// Auction + squad rules shared by the server.
const PURSE = 120;
const MIN_SQUAD = 11;
const MAX_SQUAD = 25;
const MAX_OVERSEAS_SQUAD = 8;
const MAX_OVERSEAS_XI = 4;
const MIN_PRICE = 0.3; // cheapest base price, used to keep enough purse for a full XI

const isOverseas = p => p.country !== 'India';
const canBowl = p => p.bowl >= 50;

// Highest bid a team may place while still being able to afford a full squad of 11.
function maxBid(team) {
  const stillNeeded = Math.max(0, MIN_SQUAD - team.squad.length - 1);
  return Math.max(0, +(team.purse - stillNeeded * MIN_PRICE).toFixed(2));
}

const strength = p => (p.role === 'Bowler' ? p.bowl : p.role === 'All-rounder' ? (p.bat + p.bowl) / 2 + 10 : p.bat);

function checkXI(squad, ids, rules) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) return 'Invalid selection.';
  if (ids.length !== rules.size) return `Pick exactly ${rules.size} players.`;
  const xi = ids.map(id => squad.find(p => p.id === id));
  if (xi.some(p => !p)) return 'You can only pick players from your own squad.';
  const overseas = xi.filter(isOverseas).length;
  if (overseas > rules.maxOverseas) return `Maximum ${rules.maxOverseas} overseas players in the XI (you picked ${overseas}).`;
  if (rules.needKeeper && !xi.some(p => p.role === 'Wicketkeeper')) return 'Your XI needs a wicketkeeper.';
  const bowlers = xi.filter(canBowl).length;
  if (bowlers < rules.needBowlers) return `You need at least ${rules.needBowlers} bowling options (bowlers or all-rounders). You have ${bowlers}.`;
  return null;
}

// Best XI for the given rules; returns player ids in a sensible batting order.
function greedyPick(squad, rules) {
  const chosen = [];
  const add = p => {
    if (!p || chosen.includes(p) || chosen.length >= rules.size) return;
    if (isOverseas(p) && chosen.filter(isOverseas).length >= rules.maxOverseas) return;
    chosen.push(p);
  };
  if (rules.needKeeper) add(squad.filter(p => p.role === 'Wicketkeeper').sort((a, b) => b.bat - a.bat)[0]);
  for (const p of squad.filter(canBowl).sort((a, b) => b.bowl - a.bowl)) {
    if (chosen.filter(canBowl).length >= rules.needBowlers) break;
    add(p);
  }
  for (const p of squad.slice().sort((a, b) => strength(b) - strength(a))) add(p);
  return chosen.sort((a, b) => b.bat - a.bat).map(p => p.id);
}

// Playing XI rules for a squad: 11 players, max 4 overseas, a keeper and 5 bowling options.
// They relax automatically when a squad makes them impossible, so a team is never stuck.
function xiRules(squad) {
  const indians = squad.filter(p => !isOverseas(p)).length;
  const rules = {
    size: Math.min(11, squad.length),
    maxOverseas: Math.max(MAX_OVERSEAS_XI, 11 - indians),
    needKeeper: squad.some(p => p.role === 'Wicketkeeper'),
    needBowlers: Math.min(5, squad.filter(canBowl).length),
  };
  while (checkXI(squad, greedyPick(squad, rules), rules)) {
    if (rules.needBowlers > 0) rules.needBowlers--;
    else if (rules.needKeeper) rules.needKeeper = false;
    else break;
  }
  return rules;
}

const validateXI = (squad, ids) => checkXI(squad, ids, xiRules(squad));
const autoPickXI = squad => greedyPick(squad, xiRules(squad));

module.exports = { PURSE, MIN_SQUAD, MAX_SQUAD, MAX_OVERSEAS_SQUAD, MAX_OVERSEAS_XI, isOverseas, canBowl, maxBid, xiRules, validateXI, autoPickXI, strength };
