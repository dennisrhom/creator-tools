// Entry point: loads fonts + styles, reads the asset manifest, and wires up the tabs.

import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
import './style.css';

import { initIconMaker } from './tools/icon-maker.js';
import { initChatMaker } from './tools/chat-maker.js';
import { initKillBanner } from './tools/kill-banner.js';

const TOOLS = {
  icon: initIconMaker,
  chat: initChatMaker,
  kill: initKillBanner,
};

// manifest.json is written by scripts/download-assets.mjs
async function loadManifest() {
  try {
    const res = await fetch('/assets/manifest.json');
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch {
    document.getElementById('asset-warning').hidden = false;
    return { agents: [], weapons: [] };
  }
}

const manifestPromise = loadManifest();
const started = new Set();

async function show(tool) {
  if (!TOOLS[tool]) tool = 'icon';
  for (const tab of document.querySelectorAll('.tab')) {
    const on = tab.dataset.tool === tool;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  }
  for (const id of Object.keys(TOOLS)) {
    document.getElementById(`panel-${id}`).hidden = id !== tool;
  }
  // Each tool is built the first time you open it.
  if (!started.has(tool)) {
    started.add(tool);
    TOOLS[tool](document.getElementById(`panel-${tool}`), await manifestPromise);
  }
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    history.replaceState(null, '', `#${tab.dataset.tool}`);
    show(tab.dataset.tool);
  });
}
// Arrow keys move between tabs (standard tab keyboard behaviour).
document.querySelector('.tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const tabs = [...document.querySelectorAll('.tab')];
  const i = tabs.indexOf(document.activeElement);
  const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  next.focus();
  next.click();
});
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

show(location.hash.slice(1) || 'icon');
