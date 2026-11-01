# IPL Auction Battle

A private real-time cricket auction game for up to 10 friends. Each participant manages their own team.

## Run on Windows
1. Install Node.js 18 or newer.
2. Extract this ZIP.
3. Open the extracted `ipl_build` folder in Command Prompt or VS Code.
4. Run `npm install` once.
5. Run `npm start`.
6. Open `http://localhost:3000`.
7. The host creates a room; friends join with the room code or invite link.

## How a game works
1. **Lobby** – everyone joins with the room code and picks a franchise (CSK, MI, RCB, KKR, DC, SRH, PBKS, RR, LSG, GT). A franchise can belong to one player only; the host cannot start until everyone has picked.
2. **Auction** – ₹120 Cr purse, live bidding (first bid may be at base price), max 25 players, max 8 overseas. The purse always keeps enough money to reach 11 players. The host has an **End Auction Now** button; teams under 11 players get free replacement players from the unsold pool if the host confirms.
3. **Playing XI** – each player taps 11 players in batting order (max 4 overseas, a wicketkeeper, at least 5 bowling options) and locks it. "Auto-pick" suggests a best XI. When every team is locked the season starts; the host can also start early (auto-picks for teams not ready).
4. **Season** – ball-by-ball T20 simulation: double round-robin league, then Qualifier 1, Eliminator, Qualifier 2 and Final (with 2-3 teams: league + Final). Results show winner, runner-up, Orange Cap, Purple Cap (top 5 each), points table with NRR, every scorecard summary and the XIs used. The host can re-simulate with the same squads.

## Files
- `players.js` – the player pool (193 players from IPL 2024-2026 squads) with game ratings. Edit freely.
- `rules.js` – purse, squad and XI rules. `sim.js` – season engine. `server.js` – rooms and game flow. `public/` – browser app.
- Set `LOT_SECONDS=5` (environment variable) to shorten each lot while testing.

## Important game-data notes
Ratings are approximate game values, not official statistics. The simulation is random and is not a real-world prediction. Fan-made, not affiliated with BCCI, IPL or any franchise.

## Hosting
The app needs a Node.js host that supports persistent disk storage and WebSockets/Socket.IO. Keep it on a **single server instance** because room persistence currently uses a local JSON file. A hosting provider with an ephemeral filesystem can lose saved rooms on redeploy/restart; use a persistent disk or migrate the storage layer to a managed database before relying on it for long-term hosted games. Set `PORT` through the host environment.

## Test checklist
Test with at least two separate browsers/devices: create/join, start auction, bid from both clients, wait for sold/unsold, verify both purses/squads, refresh and reconnect, restart the server and recover the room, complete the auction, then run the tournament. This package has syntax and local server smoke checks; a full multi-device long-duration game test still needs to be performed in your environment.

Fan-made private game. Not affiliated with BCCI, IPL or any franchise.
