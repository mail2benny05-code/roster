# RallyQ 🏓

A pickleball schedule generator that creates balanced, fair rosters in seconds.

## Features

- **Gender-based** and **Mixed** roster modes
- Fair sit-out rotation — everyone sits out evenly across all rounds
- Partnership rotation — same pair never back-to-back
- Export schedule as a PNG image
- Auth via Netlify Identity (or Cloudflare Access)

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
