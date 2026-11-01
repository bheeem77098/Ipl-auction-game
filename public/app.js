const socket = io();
let roomCode = "", isHost = false, lastRoom = null, activePanel = "live";
let playerId = localStorage.getItem("iplPlayerId") || "";
let selectedXI = [];          // player ids in batting order (my current selection)
let replayTimer = null, lastSimKey = null, replaying = false;
const photoCache = new Map();
const $ = id => document.getElementById(id);

socket.on("connect", () => {
  const savedRoom = localStorage.getItem("iplRoomCode"), token = localStorage.getItem("iplPlayerToken");
  if (savedRoom && token) socket.emit("reconnectRoom", { code: savedRoom, token });
});

// ---------- helpers
function show(id) { ["home", "lobby", "auction", "xi", "finished"].forEach(x => $(x).classList.toggle("hidden", x !== id)); }
function toast(s) { $("toast").textContent = s; $("toast").style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => $("toast").style.display = "none", 3200); }
function initials(n) { return n.split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase(); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function money(n) { return `₹${Number(n || 0).toFixed(2)} Cr`; }
const franchise = code => FRANCHISES.find(f => f.code === code);
const isOverseas = p => p.country !== "India";
const canBowl = p => p.bowl >= 50;
function teamBadge(code, extra = "") {
  const f = franchise(code);
  return f ? `<span class="tbadge ${extra}" style="background:${f.color};color:${f.text}">${esc(code)}</span>` : "";
}
function avatar(p) {
  const f = franchise(p.team);
  return f ? `<div class="avatar team" style="background:${f.color};color:${f.text}">${esc(f.code)}</div>` : `<div class="avatar">${esc(initials(p.name))}</div>`;
}
const teamName = p => (p.team ? `${p.team} · ${p.name}` : p.name);
const me = () => lastRoom && lastRoom.players.find(p => p.id === playerId);

async function playerPhoto(name) {
  if (photoCache.has(name)) return photoCache.get(name);
  photoCache.set(name, "");
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replaceAll(" ", "_"))}`);
    if (!res.ok) return "";
    const data = await res.json();
    const url = data.thumbnail?.source || "";
    photoCache.set(name, url);
    return url;
  } catch { return ""; }
}
function setPhoto(el, name) {
  if (!el) return;
  playerPhoto(name).then(url => {
    if (url) { el.style.backgroundImage = `linear-gradient(180deg,#07101a22,#07101a99),url("${url}")`; el.classList.add("has-photo"); }
  });
}
function hydratePhotos() {
  document.querySelectorAll(".mini-player-photo").forEach(el => {
    playerPhoto(el.dataset.player).then(url => { if (url) { el.style.backgroundImage = `url("${url}")`; el.textContent = ""; } });
  });
}

// ---------- navigation inside auction
function setPanel(name) {
  activePanel = name;
  document.querySelectorAll(".side-link").forEach(b => b.classList.toggle("active", b.dataset.panel === name));
  ["live", "upcoming", "mine", "teams", "budget"].forEach(x => $(`${x}Panel`).classList.toggle("hidden", x !== name));
  if (lastRoom && name !== "live") renderDetails(lastRoom);
}
document.querySelectorAll(".side-link").forEach(b => b.onclick = () => setPanel(b.dataset.panel));

// ---------- buttons
$("create").onclick = () => socket.emit("create", { name: $("name").value.trim() || "Host" });
$("join").onclick = () => socket.emit("join", { code: $("roomCode").value.trim(), name: $("name").value.trim() || "Player", token: localStorage.getItem("iplPlayerToken") || "" });
$("start").onclick = () => socket.emit("start");
$("share").onclick = async () => {
  const url = location.origin + "?room=" + roomCode;
  try { await navigator.clipboard.writeText(url); toast("Invite link copied! Share it with your friends."); }
  catch { toast("Room code: " + roomCode + " — share this with friends."); }
};
$("endAuction").onclick = () => {
  if (confirm("End the auction now? The current lot is settled and everyone moves on to picking their playing XI.")) socket.emit("endAuction", {});
};
$("autoXI").onclick = () => socket.emit("suggestXI");
$("clearXI").onclick = () => { if (!me()?.xiLocked) { selectedXI = []; renderXI(lastRoom); } };
$("lockXI").onclick = () => {
  const m = me();
  if (m?.xiLocked) socket.emit("unlockXI");
  else socket.emit("lockXI", { ids: selectedXI });
};
$("startSeason").onclick = () => {
  const waiting = lastRoom.players.filter(p => !p.xiLocked).length;
  if (!waiting || confirm(`${waiting} team(s) have not locked an XI. Their best XI will be picked automatically. Start the season?`)) socket.emit("startSeason");
};
$("backHome").onclick = () => {
  // forget this room so the browser does not auto-rejoin it, then return to the home screen
  try { localStorage.removeItem("iplRoomCode"); localStorage.removeItem("iplPlayerToken"); localStorage.removeItem("iplPlayerId"); } catch {}
  location.href = location.pathname;
};
$("resimulate").onclick = () => socket.emit("resimulate");
$("skipReplay").onclick = () => finishReplay();
document.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
  const r = lastRoom;
  if (r) socket.emit("bid", { amount: Number((r.bid + Number(b.dataset.add)).toFixed(2)) });
});

// ---------- socket events
socket.on("joined", d => {
  roomCode = d.code; isHost = d.host;
  localStorage.setItem("iplRoomCode", d.code);
  if (d.token) {
    localStorage.setItem("iplPlayerToken", d.token);
    playerId = d.token.slice(0, 12);
    localStorage.setItem("iplPlayerId", playerId);
  }
  $("code").textContent = roomCode; $("sideRoom").textContent = roomCode;
  $("start").classList.toggle("hidden", !isHost);
  $("waiting").classList.toggle("hidden", isHost);
  show("lobby");
});
socket.on("errorMsg", toast);
socket.on("needTopUp", list => {
  const text = list.map(t => `• ${t.name}: has ${t.have}, needs ${t.need} more`).join("\n");
  if (confirm(`Some teams do not have 11 players yet:\n\n${text}\n\nEnd the auction anyway? They will be given free replacement players from the unsold pool.`)) socket.emit("endAuction", { force: true });
});
socket.on("myXI", ids => { selectedXI = ids.slice(); if (lastRoom) renderXI(lastRoom); });
socket.on("suggestedXI", ids => { selectedXI = ids.slice(); renderXI(lastRoom); toast("Best XI picked. Reorder by tapping, then lock it in."); });

socket.on("room", r => {
  const prev = lastRoom;
  lastRoom = r;
  $("count").textContent = `${r.players.length} / ${FRANCHISES.length}`;

  if (r.status === "waiting") { renderLobby(r); show("lobby"); return; }
  if (r.status === "auction") { show("auction"); renderAuction(r); if (activePanel !== "live") renderDetails(r); return; }
  if (r.status === "xi") { show("xi"); renderXI(r); return; }
  if (r.status === "simulated") { show("finished"); renderSeason(r, prev); }
});

// ---------- lobby
function renderLobby(r) {
  const mine = r.players.find(p => p.id === playerId);
  $("myTeamLabel").textContent = mine?.team ? `You: ${mine.team}` : "Pick one";
  $("teamGrid").innerHTML = FRANCHISES.map(f => {
    const owner = r.players.find(p => p.team === f.code);
    const taken = owner && owner.id !== playerId, selected = owner && owner.id === playerId;
    return `<button class="team-btn ${selected ? "selected" : ""}" data-team="${f.code}" ${taken ? "disabled" : ""} style="--tc:${f.color};--tt:${f.text}">
      <b>${f.code}</b><small>${esc(f.name)}</small><em>${owner ? (selected ? "YOUR TEAM" : esc(owner.name)) : "AVAILABLE"}</em></button>`;
  }).join("");
  document.querySelectorAll("[data-team]").forEach(b => b.onclick = () => socket.emit("pickTeam", { code: b.dataset.team }));
  $("roster").innerHTML = r.players.map((p, i) => `<div class="slot">${avatar(p)}<div><b>${esc(p.name)}</b><small>${p.team ? esc(franchise(p.team).name) : "NO FRANCHISE YET"} · ${i === 0 ? "HOST" : "PLAYER"} · ${p.online ? "CONNECTED" : "OFFLINE"}</small></div></div>`).join("")
    + Array.from({ length: Math.max(0, FRANCHISES.length - r.players.length) }, () => '<div class="slot"><div class="avatar">+</div><div><b>Waiting...</b><small>OPEN SLOT</small></div></div>').join("");
}

// ---------- auction
function renderAuction(r) {
  const m = r.players.find(p => p.id === playerId);
  $("endAuction").classList.toggle("hidden", !isHost);
  if (!r.current) return;
  const c = r.current;
  $("lotNo").textContent = `LOT ${String(r.lot).padStart(2, "0")} / ${r.totalLots || r.lot}`;
  $("timer").textContent = r.seconds;
  $("myPurse").textContent = money(m?.purse ?? 120);
  $("upcomingCount").textContent = r.upcoming?.length || 0;
  $("playerName").textContent = c.name; $("initial").textContent = initials(c.name);
  $("role").textContent = c.role.toUpperCase(); $("country").textContent = c.country.toUpperCase();
  $("playerMeta").textContent = `${c.country} · ${c.role}${isOverseas(c) ? " · Overseas" : ""}`;
  setPhoto($("currentPlayerArt"), c.name);
  const s = [["BATTING", c.bat], ["BOWLING", canBowl(c) ? c.bowl : "—"], ["BASE PRICE", money(c.base)], ["TYPE", isOverseas(c) ? "Overseas" : "Indian"]];
  $("stats").innerHTML = s.map(x => `<div class="stat"><small>${x[0]}</small><b>${x[1]}</b></div>`).join("");
  $("bid").textContent = money(r.bid);
  const leader = r.players.find(p => p.id === r.leader);
  $("leader").textContent = leader ? `Leading bid: ${teamName(leader)}` : "No bids yet";
  $("mySquad").innerHTML = m?.squad.map(p => `<span class="chip">${esc(p.name)} · ₹${p.paid}Cr</span>`).join("") || '<span class="muted">No players bought yet</span>';
  $("squadCount").textContent = `${m?.squad.length || 0} players · ${m ? m.squad.filter(isOverseas).length : 0} overseas`;
  $("liveRoster").innerHTML = r.players.map(p => `<div class="liveperson">${avatar(p)}<div><b>${esc(p.team || p.name)} <span class="owner">${p.team ? esc(p.name) : ""}</span></b><small>${p.squad.length} players · ₹${p.purse.toFixed(1)}Cr</small></div></div>`).join("");
  $("activity").innerHTML = r.log.slice().reverse().map(esc).join("<br>");

  const blocked = !m || m.squad.length >= 25 || (isOverseas(c) && m.squad.filter(isOverseas).length >= 8);
  $("bidBase").classList.toggle("hidden", !!r.leader);
  document.querySelectorAll("[data-add]").forEach(b => {
    const amount = Number((r.bid + Number(b.dataset.add)).toFixed(2));
    b.disabled = blocked || amount > m.maxBid || r.leader === playerId;
    b.style.opacity = b.disabled ? ".4" : "1";
  });
}
function playerRow(p, extra = "") {
  return `<div class="player-row"><div class="mini-player-photo" data-player="${esc(p.name)}">${initials(p.name)}</div><div class="player-row-main"><b>${esc(p.name)}</b><small>${esc(p.role || "")} · ${esc(p.country || "")}</small></div><strong>${extra || money(p.base)}</strong></div>`;
}
function renderDetails(r) {
  const m = r.players.find(p => p.id === playerId);
  const upcoming = r.upcoming || [];
  $("upcomingList").innerHTML = upcoming.length ? upcoming.map(p => playerRow(p, money(p.base))).join("") : '<div class="empty-state">No upcoming players. The auction is complete.</div>';
  $("myBudgetLine").textContent = `Spent: ${money(120 - (m?.purse ?? 120))} · Remaining: ${money(m?.purse ?? 120)} · Squad: ${m?.squad.length || 0} players`;
  $("mySquadFull").innerHTML = m?.squad.length ? m.squad.map(p => playerRow(p, `Paid ${money(p.paid)}`)).join("") : '<div class="empty-state">You have not bought any players yet.</div>';
  $("allSquads").innerHTML = r.players.map(p => `<div class="team-card"><div class="team-card-head"><div><b>${esc(teamName(p))}</b><small>${p.online ? "● ONLINE" : "○ OFFLINE"} · ${p.squad.length} players</small></div><strong>${money(p.purse)}</strong></div><div class="team-player-list">${p.squad.length ? p.squad.map(x => `<span class="chip">${esc(x.name)} · ${x.paid} Cr</span>`).join("") : '<span class="muted">No purchases yet</span>'}</div></div>`).join("");
  $("budgets").innerHTML = r.players.map(p => {
    const spent = 120 - p.purse, pct = Math.max(0, Math.min(100, (p.purse / 120) * 100));
    return `<div class="budget-card"><div class="team-card-head"><b>${esc(teamName(p))} ${p.id === playerId ? "(YOU)" : ""}</b><strong>${money(p.purse)}</strong></div><div class="budget-track"><span style="width:${pct}%"></span></div><div class="budget-meta"><span>Spent ${money(spent)}</span><span>Remaining ${money(p.purse)}</span></div></div>`;
  }).join("");
  hydratePhotos();
}

// ---------- playing XI
function xiChecks(m) {
  const squad = m.squad, rules = m.rules || { size: 11, maxOverseas: 4, needKeeper: true, needBowlers: 5 };
  const xi = selectedXI.map(id => squad.find(p => p.id === id)).filter(Boolean);
  const overseas = xi.filter(isOverseas).length, bowlers = xi.filter(canBowl).length, keeper = xi.some(p => p.role === "Wicketkeeper");
  return {
    rules, xi, overseas, bowlers, keeper,
    items: [
      [`Players ${xi.length}/${rules.size}`, xi.length === rules.size],
      [`Overseas ${overseas}/${rules.maxOverseas}`, overseas <= rules.maxOverseas],
      [rules.needKeeper ? "Wicketkeeper" : "Wicketkeeper (not required)", !rules.needKeeper || keeper],
      [`Bowling options ${bowlers}/${rules.needBowlers}`, bowlers >= rules.needBowlers],
    ],
  };
}
function renderXI(r) {
  const m = r.players.find(p => p.id === playerId);
  if (!m) return;
  selectedXI = selectedXI.filter(id => m.squad.some(p => p.id === id));
  const f = franchise(m.team);
  $("xiTeam").innerHTML = f ? `<div class="xi-teamcard" style="--tc:${f.color};--tt:${f.text}"><b>${esc(f.name)}</b><small>${esc(m.name)} · ${m.squad.length} players in squad</small></div>` : "";
  const c = xiChecks(m);
  $("xiStatus").innerHTML = c.items.map(([t, ok]) => `<span class="check ${ok ? "ok" : "bad"}">${ok ? "✓" : "•"} ${t}</span>`).join("");
  const locked = m.xiLocked;
  $("xiList").innerHTML = m.squad.slice().sort((a, b) => Math.max(b.bat, b.bowl) - Math.max(a.bat, a.bowl)).map(p => {
    const idx = selectedXI.indexOf(p.id);
    return `<button class="xi-row ${idx >= 0 ? "picked" : ""}" data-xi="${p.id}" ${locked ? "disabled" : ""}>
      <span class="xi-num">${idx >= 0 ? idx + 1 : ""}</span>
      <div class="mini-player-photo" data-player="${esc(p.name)}">${initials(p.name)}</div>
      <div class="player-row-main"><b>${esc(p.name)}</b><small>${esc(p.role)} · ${isOverseas(p) ? "✈ Overseas" : "Indian"}</small></div>
      <div class="xi-rate"><span>BAT <b>${p.bat}</b></span><span>BOWL <b>${canBowl(p) ? p.bowl : "—"}</b></span></div></button>`;
  }).join("");
  document.querySelectorAll("[data-xi]").forEach(b => b.onclick = () => {
    const id = Number(b.dataset.xi), i = selectedXI.indexOf(id);
    if (i >= 0) selectedXI.splice(i, 1);
    else if (selectedXI.length < c.rules.size) selectedXI.push(id);
    else return toast(`You already picked ${c.rules.size} players. Tap one to remove it first.`);
    renderXI(lastRoom);
  });
  $("lockXI").textContent = locked ? "🔓 UNLOCK TO EDIT XI" : "🔒 LOCK PLAYING XI";
  $("lockXI").disabled = !locked && !c.items.every(x => x[1]);
  $("lockXI").style.opacity = $("lockXI").disabled ? ".5" : "1";
  $("autoXI").disabled = $("clearXI").disabled = locked;
  const ready = r.players.filter(p => p.xiLocked).length;
  $("readyCount").textContent = `${ready} / ${r.players.length} ready`;
  $("readyList").innerHTML = r.players.map(p => `<div class="liveperson">${avatar(p)}<div><b>${esc(p.team || p.name)} <span class="owner">${esc(p.name)}</span></b><small>${p.xiLocked ? "✓ XI LOCKED" : "PICKING…"}</small></div></div>`).join("");
  $("startSeason").classList.toggle("hidden", !isHost);
  $("xiWait").textContent = locked ? "Your XI is locked. The season starts when every team is ready." : "Pick 11 players in batting order, then lock your XI.";
  hydratePhotos();
}

// ---------- season replay + results
function simKey(s) { return s.matches.map(m => `${m.first.runs}-${m.second.runs}`).join(",").slice(0, 400); }
function renderSeason(r, prev) {
  const s = r.simulation, key = simKey(s);
  $("resimulate").classList.toggle("hidden", !isHost);
  const animate = prev && (prev.status === "xi" || (prev.status === "simulated" && lastSimKey !== key));
  const alreadyShowing = lastSimKey === key && (replaying || !$("results").classList.contains("hidden"));
  lastSimKey = key;
  if (alreadyShowing) return;
  if (animate) startReplay(s); else showResults(s);
}
const matchRow = m => `<div class="match-row ${m.stage !== "League" ? "playoff" : ""}"><div class="mr-top"><b>${m.stage !== "League" ? `<em>${esc(m.stage.toUpperCase())}</em> ` : `<small>#${m.no}</small> `}${teamBadge(m.first.code)} ${m.first.runs}/${m.first.wkts} <span class="vs">v</span> ${teamBadge(m.second.code)} ${m.second.runs}/${m.second.wkts}</b><span>${esc(m.result)}</span></div><div class="mr-sub">★ ${esc(m.pom || "")} · ${esc(m.first.top.bat)} · ${esc(m.second.top.bat)}</div></div>`;
function startReplay(s) {
  clearTimeout(replayTimer); replaying = true;
  $("seasonEyebrow").textContent = "SEASON IN PROGRESS"; $("seasonTitle").innerHTML = "PLAYING THE<br><em>MATCHES…</em>";
  $("results").classList.add("hidden"); $("results").innerHTML = "";
  $("replay").classList.remove("hidden"); $("replayFeed").innerHTML = "";
  let i = 0;
  const total = s.matches.length;
  const step = () => {
    if (i >= total) return finishReplay(s);
    const m = s.matches[i++];
    $("replayFeed").insertAdjacentHTML("afterbegin", matchRow(m));
    $("replayLabel").textContent = `${m.stage === "League" ? "League" : m.stage} · match ${i} of ${total}`;
    $("replayBar").style.width = `${(i / total) * 100}%`;
    replayTimer = setTimeout(step, m.stage === "League" ? 70 : 1400);
  };
  replayTimer = setTimeout(step, 400);
  window.__sim = s;
}
function finishReplay(s) {
  clearTimeout(replayTimer); replaying = false;
  const sim = s || window.__sim || lastRoom?.simulation;
  if (sim) showResults(sim);
}
function showResults(s) {
  $("replay").classList.add("hidden");
  $("results").classList.remove("hidden");
  $("seasonEyebrow").textContent = "SEASON COMPLETE"; $("seasonTitle").innerHTML = "THE FINAL<br><em>VERDICT.</em>";
  renderTournament(s);
}
function capCard(label, emoji, top, unit) {
  if (!top.length) return `<div class="award-card"><div class="eyebrow">${emoji} ${label}</div><p>Not enough player statistics</p></div>`;
  const t = top[0];
  const sub = unit === "runs" ? `${t.runs} runs · SR ${t.sr} · ${t.inns} inns · HS ${t.best}` : `${t.wkts} wickets · Econ ${t.econ} · ${t.overs} ov`;
  const rest = top.slice(1).map((x, i) => `<li><span>${i + 2}. ${esc(x.player)} ${teamBadge(x.team)}</span><b>${unit === "runs" ? x.runs : x.wkts}</b></li>`).join("");
  return `<div class="award-card ${unit === "runs" ? "orange" : "purple"}"><div class="eyebrow">${emoji} ${label}</div><h3>${esc(t.player)}</h3><p>${teamBadge(t.team)} ${esc(t.owner)}<br>${sub}</p><ul class="cap-list">${rest}</ul></div>`;
}
function renderTournament(t) {
  const champion = `<div class="champion-card"><div class="eyebrow">🏆 CHAMPIONS</div><h2>${esc(t.champion.name)}</h2><p>${teamBadge(t.champion.code)} Owner: ${esc(t.champion.owner)}</p></div>`;
  const runner = `<div class="runner-card"><div class="eyebrow">🥈 RUNNER-UP</div><h2>${esc(t.runnerUp.name)}</h2><p>${teamBadge(t.runnerUp.code)} Owner: ${esc(t.runnerUp.owner)}</p></div>`;
  const hasPlayoffs = t.table.length >= 4;
  const rows = t.table.map((x, i) => `<tr class="${hasPlayoffs && i < 4 ? "qual" : ""}"><td>${i + 1}</td><td>${teamBadge(x.code)} ${esc(x.owner)}</td><td>${x.played}</td><td>${x.wins}</td><td>${x.losses}</td><td><b>${x.points}</b></td><td>${x.nrr > 0 ? "+" : ""}${x.nrr.toFixed(3)}</td></tr>`).join("");
  const playoffs = t.matches.filter(m => m.stage !== "League").map(matchRow).join("");
  const league = t.matches.filter(m => m.stage === "League").map(matchRow).join("");
  const xis = Object.entries(t.xis).map(([code, names]) => `<div class="team-card"><div class="team-card-head"><b>${teamBadge(code)} ${esc(franchise(code)?.name || code)}</b></div><div class="team-player-list">${names.map((n, i) => `<span class="chip">${i + 1}. ${esc(n)}</span>`).join("")}</div></div>`).join("");
  $("results").innerHTML = `<div class="tournament-results">${champion}${runner}
    <div class="award-grid">${capCard("ORANGE CAP", "🧡", t.orangeTop, "runs")}${capCard("PURPLE CAP", "💜", t.purpleTop, "wkts")}</div>
    <h3>Playoffs</h3><div class="match-list">${playoffs}</div>
    <h3>Points Table</h3><div class="table-wrap"><table><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>Pts</th><th>NRR</th></tr></thead><tbody>${rows}</tbody></table></div>
    <details><summary>All league matches (${t.matches.filter(m => m.stage === "League").length})</summary><div class="match-list">${league}</div></details>
    <details><summary>Playing XIs used</summary>${xis}</details>
    <p class="hint">${esc(t.note)}</p></div>`;
}

const params = new URLSearchParams(location.search);
if (params.get("room")) { $("roomCode").value = params.get("room"); $("name").value = "Player"; }
