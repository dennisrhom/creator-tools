// Downloads Valorant images from valorant-api.com into public/assets so the
// website serves them itself (no hotlinking).
//
// Usage:
//   npm run download-assets            -> downloads anything missing
//   npm run download-assets -- --force -> re-downloads everything
//
// Output:
//   public/assets/agents/<agent>/icon.png
//   public/assets/agents/<agent>/killfeed.png
//   public/assets/agents/<agent>/abilities/<slot>.png
//   public/assets/weapons/<weapon>.png        (the white kill-feed silhouette)
//   public/assets/twitch-badges/<badge>.png   (official Twitch chat badges)
//   public/assets/manifest.json               (list of everything, read by the site)

import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'assets');
const API = 'https://valorant-api.com/v1';
const FORCE = process.argv.includes('--force');
const CONCURRENCY = 6; // how many files download at the same time

// "KAY/O" -> "kay-o", "Brimstone" -> "brimstone"
const slugify = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch() with a few retries, because networks occasionally hiccup.
async function fetchWithRetry(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (attempt >= tries) throw new Error(`${url} failed: ${err.message}`);
      await sleep(500 * attempt);
    }
  }
}

async function getJSON(url) {
  const res = await fetchWithRetry(url);
  const body = await res.json();
  return body.data;
}

const exists = (p) => access(p).then(() => true, () => false);

let downloaded = 0;
let skipped = 0;
const failures = [];

// Saves `url` to public/assets/<relPath>. Returns the path the website uses
// ("/assets/...") or null if there was nothing to download / it failed.
async function download(url, relPath) {
  if (!url) return null;
  const dest = path.join(OUT_DIR, relPath);
  const publicPath = '/assets/' + relPath.split(path.sep).join('/');
  if (!FORCE && (await exists(dest))) {
    skipped++;
    return publicPath;
  }
  try {
    const res = await fetchWithRetry(url);
    const bytes = Buffer.from(await res.arrayBuffer());
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
    downloaded++;
    process.stdout.write(`  saved ${publicPath}\n`);
    return publicPath;
  } catch (err) {
    failures.push(err.message);
    return null;
  }
}

// Runs async jobs with at most `limit` running at once.
async function runPool(jobs, limit) {
  const results = new Array(jobs.length);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]();
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// Official Twitch global chat badges from Twitch's image CDN ("/3" = 72x72, the largest size).
const TWITCH_CDN = 'https://static-cdn.jtvnw.net/badges/v1';
const TWITCH_BADGES = [
  { id: 'broadcaster', label: 'Broadcaster', uuid: '5527c58c-fb7d-422d-b71b-f309dcb85cc1' },
  { id: 'moderator', label: 'Moderator', uuid: '3267646d-33f0-4b17-b3df-f923a41db1d0' },
  { id: 'vip', label: 'VIP', uuid: 'b817aba4-fad8-49e2-b88a-7cc744dfa6ec' },
  { id: 'subscriber', label: 'Subscriber', uuid: '5d9f2208-5dd8-11e7-8513-2ff4adfae661' },
  { id: 'founder', label: 'Founder', uuid: '511b78a9-ab37-472f-9569-457753bbe7d3' },
  { id: 'verified', label: 'Verified', uuid: 'd12a2e27-16f6-41d0-ab77-b780518f00a3' },
  { id: 'prime', label: 'Prime Gaming', uuid: 'bbbe0db0-a598-423e-86d0-f9fb98ca1933' },
  { id: 'turbo', label: 'Turbo', uuid: 'bd444ec6-8f34-4bf9-91f4-af1e3428d80f' },
  { id: 'artist', label: 'Artist', uuid: '4300a897-03dc-4e83-8c0e-c332fee7057f' },
  { id: 'staff', label: 'Staff', uuid: 'd97c37bd-a6f5-4c38-8f57-4e4bef88af34' },
];

const ABILITY_ORDER = ['Grenade', 'Ability1', 'Ability2', 'Ultimate', 'Passive'];
const WEAPON_ORDER = ['Sidearm', 'SMG', 'Shotgun', 'Rifle', 'Sniper', 'Heavy', 'Melee'];

async function main() {
  console.log('Fetching agent and weapon lists from valorant-api.com...');
  const [agentsRaw, weaponsRaw] = await Promise.all([
    getJSON(`${API}/agents?isPlayableCharacter=true`),
    getJSON(`${API}/weapons`),
  ]);
  console.log(`Found ${agentsRaw.length} agents and ${weaponsRaw.length} weapons.`);

  const jobs = [];

  // ----- Agents -----
  const agents = agentsRaw
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((a) => {
      const slug = slugify(a.displayName);
      const agent = {
        name: a.displayName,
        slug,
        role: a.role?.displayName ?? null,
        icon: null,
        killfeed: null,
        abilities: [],
      };
      jobs.push(async () => (agent.icon = await download(a.displayIcon, path.join('agents', slug, 'icon.png'))));
      jobs.push(async () => (agent.killfeed = await download(a.killfeedPortrait, path.join('agents', slug, 'killfeed.png'))));

      const abilities = [...a.abilities].sort(
        (x, y) => ABILITY_ORDER.indexOf(x.slot) - ABILITY_ORDER.indexOf(y.slot)
      );
      for (const ab of abilities) {
        if (!ab.displayIcon) continue; // some passives have no icon
        const entry = { slot: ab.slot, name: ab.displayName, icon: null };
        agent.abilities.push(entry);
        jobs.push(async () =>
          (entry.icon = await download(ab.displayIcon, path.join('agents', slug, 'abilities', `${slugify(ab.slot)}.png`)))
        );
      }
      return agent;
    });

  // ----- Weapons -----
  const weapons = weaponsRaw
    .map((w) => ({
      name: w.displayName,
      slug: slugify(w.displayName),
      category: (w.category || '').split('::').pop(),
      killIcon: null,
      _src: w.killStreamIcon,
    }))
    .sort(
      (a, b) =>
        WEAPON_ORDER.indexOf(a.category) - WEAPON_ORDER.indexOf(b.category) ||
        a.name.localeCompare(b.name)
    );
  for (const w of weapons) {
    jobs.push(async () => (w.killIcon = await download(w._src, path.join('weapons', `${w.slug}.png`))));
  }

  // ----- Twitch badges -----
  const twitchBadges = TWITCH_BADGES.map(({ id, label, uuid }) => {
    const badge = { id, label, icon: null };
    jobs.push(async () => (badge.icon = await download(`${TWITCH_CDN}/${uuid}/3`, path.join('twitch-badges', `${id}.png`))));
    return badge;
  });

  console.log(`Downloading ${jobs.length} images (${CONCURRENCY} at a time)...`);
  await runPool(jobs, CONCURRENCY);

  // Drop anything that failed so the site never points at a missing file.
  for (const a of agents) a.abilities = a.abilities.filter((ab) => ab.icon);
  const manifest = {
    source: 'https://valorant-api.com',
    generatedAt: new Date().toISOString(),
    agents: agents.filter((a) => a.icon && a.killfeed),
    weapons: weapons.filter((w) => w.killIcon).map(({ _src, ...w }) => w),
    twitchBadges: twitchBadges.filter((b) => b.icon),
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\nDone. ${downloaded} downloaded, ${skipped} already present.`);
  console.log(`Manifest: ${manifest.agents.length} agents, ${manifest.weapons.length} weapons, ${manifest.twitchBadges.length} Twitch badges.`);
  if (failures.length) {
    console.warn(`\n${failures.length} file(s) failed (run the script again to retry):`);
    for (const f of failures) console.warn('  - ' + f);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nDownload failed:', err.message);
  process.exit(1);
});
