# Valorant Creator Tools

Free, static website with three tools for Valorant content creators. Everything
runs in the browser with HTML canvas. There is no backend, and uploads never
leave the user's device.

| Tool | What it makes |
| --- | --- |
| **Icon Maker** | Agent icon or uploaded image → circle / rounded / square PNG with optional black or white outline (1–16px), crop and zoom. 512×512 transparent PNG. |
| **Twitch Chat** | A chat line with username, name color, badges, custom emotes and 7TV emotes → transparent PNG at 2x / 4x / 8x. |
| **Kill Banner** | Kill-feed banner: killer and victim agents and names, gun or ability, headshot / wallbang, kill count, highlight border → transparent PNG at 2x / 4x. |

## Requirements

- [Node.js](https://nodejs.org) 18 or newer (this project was set up with Node 26 LTS).

## Commands

Run these in a terminal opened in this folder:

```powershell
npm install               # one time: installs Vite and the fonts
npm run download-assets   # downloads Valorant images into public/assets
npm run dev               # local dev server at http://localhost:5173 (auto-reloads on save)
npm run build             # production build into dist/
npm run preview           # serve dist/ locally to check the build
```

When Riot adds a new agent or weapon, run `npm run download-assets` again. It
only downloads missing files. Use `npm run download-assets -- --force` to
re-download everything.

## Project layout

```
index.html                    page shell with the three tabs
scripts/download-assets.mjs   one-off downloader (Node), writes public/assets/
public/assets/                downloaded images + manifest.json (served as-is)
public/_headers               Cloudflare cache rules
src/main.js                   loads fonts/CSS/manifest, switches tabs
src/style.css                 all styling
src/lib/canvas.js             image loading, PNG download, shape helpers
src/lib/ui.js                 buttons, toggles, dropdown picker
src/lib/seventv.js            7TV emote search / lookup
src/tools/icon-maker.js       Tool 1
src/tools/chat-maker.js       Tool 2
src/tools/kill-banner.js      Tool 3
```

## Deploying to Cloudflare Pages

The downloaded images in `public/assets` must be included in the deploy.
Commit them to git; don't ignore them.

**Option A: connect a Git repository (auto-deploys on every push)**

1. Push this folder to a GitHub or GitLab repository.
2. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git** and pick the repo.
3. Build settings:
   - Framework preset: **Vite** (or None)
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Click **Save and Deploy**.

**Option B: upload from your computer (no Git needed)**

```powershell
npm run build
npx wrangler pages deploy dist --project-name valorant-creator-tools
```

The first time, Wrangler opens a browser so you can log in to Cloudflare.

## Notes

- Valorant images come from [valorant-api.com](https://valorant-api.com).
  Valorant and its assets belong to Riot Games. This project isn't endorsed by
  Riot (see Riot's "Legal Jibber Jabber" fan content policy).
- Twitch badges are the official images from Twitch's CDN, downloaded by the asset script.
- `public/assets/killfeed/headshot.png` and `wallbang.png` are not in valorant-api.com.
  They were cropped from in-game kill feed screenshots and are committed by hand.
  The download script doesn't touch them.
- 7TV emotes load directly from 7TV's public API and CDN in the browser. Animated
  emotes export as a single still frame.
