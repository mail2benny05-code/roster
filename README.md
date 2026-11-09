# RallyQ 🏓

A pickleball schedule generator that creates balanced, fair rosters in seconds.

## Features

- **Gender-based** and **Mixed** roster modes
- Fair sit-out rotation — everyone sits out evenly across all rounds
- Partnership rotation — same pair never back-to-back
- Live leaderboard while entering scores, before the round robin is finished
- Swap players on unscored courts during play, or reshuffle remaining rounds while preserving recorded scores
- Export schedule as a PNG image
- Share a read-only final results page with a link, including standings and highlights
- Auth via Netlify Identity (or Cloudflare Access)

Results links contain a snapshot of the standings and highlights in the URL. On the hosted app, clicking **Share results link** sends that URL to CleanURI to create a shorter link. CleanURI stores the destination URL, including the encoded results, and anyone with the short link can view the snapshot. If shortening fails, the app offers the full link. Changes to scores require a new link. Links created on `localhost` are only reachable from that computer.

## Tech stack

React 19 · TypeScript · Vite 8 · Tailwind CSS v4

## Local development

```bash
npm install
npm run dev
```

The app opens at `http://localhost:5173`. Login is bypassed locally via `.env.local`:

```
VITE_AUTH_PROVIDER=cloudflare
```

## Deployment (Netlify)

1. Push this repo to GitHub
2. In Netlify → **Add new site → Import an existing project** → select the repo
3. Build settings are auto-detected from `netlify.toml`:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. Enable **Netlify Identity** (Site settings → Identity → Enable)
5. Invite users via Identity → **Invite users**

## Environment variables

| Variable | Values | Effect |
|---|---|---|
| `VITE_AUTH_PROVIDER` | `cloudflare` | Skips Netlify Identity; logout → `/cdn-cgi/access/logout` |
| *(unset)* | — | Uses Netlify Identity widget |
