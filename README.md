# Serve Target

Courtside opponent serve-receive tracker for KCHS volleyball. One tap per
serve: who passed it and how good. Live target call, match history, opponent
scouting carryover, CSV export.

## Run it locally

    npm install
    npm run dev

Open the printed URL. Data is stored in the browser's localStorage.

## Deploy (free, Cloudflare Pages)

1. Push this folder to a GitHub repo.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo.
3. Build command: `npm run build` — Output directory: `dist`.
4. Every push to `main` deploys automatically. Use a branch + its preview URL
   to test changes on the actual iPad before merging.

## Put it on the iPad

1. Open the deployed URL in **Safari** (not Chrome — the home-screen install
   and its storage exemption are a Safari thing on iOS).
2. Share → **Add to Home Screen**. Opens full screen, works offline after the
   first load (PWA), and home-screen apps are exempt from Safari's 7-day
   storage eviction.
3. Settings → Display & Brightness → Auto-Lock → Never (game days).
4. Optional: Guided Access (Settings → Accessibility) locks a student manager
   into the app.

## Data rules

- Data lives on the device (localStorage). No login, no server, no sync.
- The live match saves every 1.5s and on screen-lock/app-switch.
- **Export the season CSV after each match and email it to yourself.** The
  iPad is the working copy, not the archive.
- Never clear Safari website data on the match iPad.
- Don't deploy changes on game day; test on a preview branch first.

## Rating scale

3 = perfect pass · 2 = playable · 1 = broken · ACE = 0. Low average = bad
passer = your serving target. Red means they're breaking down.
