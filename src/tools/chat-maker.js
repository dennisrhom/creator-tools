// Tool 2: Twitch Chat Maker. Renders one chat line (badges, colored name,
// message with emotes) to a high-resolution PNG.

import { loadImage, loadFile, downloadCanvas, ensureFonts, slug } from '../lib/canvas.js';
import { el, field, segmented, fileButton } from '../lib/ui.js';
import { searchEmotes, getEmote } from '../lib/seventv.js';

// Layout sizes at 1x (matching Twitch chat proportions).
const FONT_SIZE = 13;
const LINE_H = 20;
const EMOTE_H = 28;
const BADGE = 18;
const BADGE_GAP = 3;
const FONT_FAMILY = 'Inter, "Segoe UI", Arial, sans-serif';

// Twitch's chat colors.
const BACKGROUNDS = {
  dark: { fill: '#18181b', text: '#efeff1' },
  light: { fill: '#ffffff', text: '#0e0e10' },
};

// Default name colors Twitch hands out to new users.
const NAME_COLORS = ['#FF0000', '#0000FF', '#008000', '#B22222', '#FF7F50', '#9ACD32', '#FF4500', '#2E8B57',
  '#DAA520', '#D2691E', '#5F9EA0', '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F'];

export function initChatMaker(root, manifest) {
  // Official badge images, downloaded by scripts/download-assets.mjs
  const BADGES = manifest.twitchBadges ?? [];

  const state = {
    username: 'Radiant_Andy',
    message: 'that was actually insane',
    nameColor: '#1E90FF',
    badges: new Set(['subscriber']),
    customBadge: null,     // HTMLImageElement or null
    emotes: new Map(),     // name -> { img, thumb, source }
    background: 'dark',    // 'dark' | 'light' | 'transparent'
    textTheme: 'light',    // transparent only: 'light' (white text) | 'dark' (black text)
    outline: true,         // transparent only: outline around text so it reads on video
    maxWidth: 340,         // wrap width at 1x (Twitch's chat column is about 340px)
    scale: 4,              // export multiplier
  };

  // ---------- Preview ----------
  const preview = el('canvas', { class: 'chat-canvas', 'aria-label': 'Chat preview' });
  const previewWrap = el('div', { class: 'card preview-card checker chat-preview' }, preview);
  const sizeInfo = el('p', { class: 'hint' });

  // ---------- Message ----------
  const usernameInput = el('input', { type: 'text', value: state.username, maxlength: '25', 'aria-label': 'Username' });
  usernameInput.addEventListener('input', () => { state.username = usernameInput.value; draw(); });

  const messageInput = el('textarea', { rows: '3', maxlength: '500', 'aria-label': 'Message' }, state.message);
  messageInput.addEventListener('input', () => { state.message = messageInput.value; draw(); });

  const colorInput = el('input', { type: 'color', value: state.nameColor.toLowerCase(), class: 'color-input', 'aria-label': 'Name color' });
  const swatches = el('div', { class: 'swatches' },
    NAME_COLORS.map((c) => el('button', { type: 'button', class: 'swatch', style: `background:${c}`, title: c, 'aria-label': `Name color ${c}`,
      onclick: () => setNameColor(c) }))
  );
  colorInput.addEventListener('input', () => setNameColor(colorInput.value));
  function setNameColor(c) {
    state.nameColor = c;
    colorInput.value = c.toLowerCase();
    draw();
  }

  // ---------- Badges ----------
  const badgeButtons = BADGES.map((b) => {
    const btn = el('button', { type: 'button', class: 'chip badge-chip', 'aria-pressed': String(state.badges.has(b.id)) },
      el('img', { class: 'badge-icon', src: b.icon, alt: '' }), b.label);
    btn.addEventListener('click', () => {
      state.badges.has(b.id) ? state.badges.delete(b.id) : state.badges.add(b.id);
      btn.setAttribute('aria-pressed', String(state.badges.has(b.id)));
      draw();
    });
    return btn;
  });
  const customBadgeStatus = el('span', { class: 'muted small' });
  const clearCustomBadge = el('button', { type: 'button', class: 'btn small', hidden: true, onclick: () => {
    state.customBadge = null; customBadgeStatus.textContent = ''; clearCustomBadge.hidden = true; draw();
  } }, 'Remove');
  const customBadgeRow = el('div', { class: 'row' },
    fileButton('Upload custom badge', 'image/*', async (file) => {
      try {
        state.customBadge = await loadFile(file);
        customBadgeStatus.textContent = file.name;
        clearCustomBadge.hidden = false;
        draw();
      } catch (err) { alert(err.message); }
    }),
    customBadgeStatus, clearCustomBadge
  );

  // ---------- Emotes ----------
  const emoteList = el('div', { class: 'emote-list' });
  function renderEmoteList() {
    emoteList.replaceChildren();
    if (!state.emotes.size) {
      emoteList.append(el('p', { class: 'muted small' }, 'No emotes yet. Upload one or search 7TV, then type its name in your message.'));
      return;
    }
    for (const [name, e] of state.emotes) {
      emoteList.append(el('div', { class: 'emote-chip' },
        el('button', { type: 'button', class: 'emote-insert', title: 'Add to message', onclick: () => insertWord(name) },
          el('img', { src: e.thumb, alt: '' }), el('span', {}, name)),
        el('button', { type: 'button', class: 'emote-remove', 'aria-label': `Remove ${name}`, onclick: () => {
          state.emotes.delete(name); renderEmoteList(); draw();
        } }, '×')
      ));
    }
  }
  function insertWord(word) {
    const msg = state.message.trimEnd();
    state.message = msg ? `${msg} ${word}` : word;
    messageInput.value = state.message;
    draw();
  }
  function addEmote(name, entry) {
    name = name.trim().replace(/\s+/g, '');
    if (!name) return;
    state.emotes.set(name, entry);
    renderEmoteList();
    if (!state.message.split(/\s+/).includes(name)) insertWord(name);
    else draw();
  }

  const uploadName = el('input', { type: 'text', placeholder: 'Emote name (e.g. myHype)', 'aria-label': 'Custom emote name' });
  const uploadRow = el('div', { class: 'row grow' },
    uploadName,
    fileButton('Upload emote', 'image/*', async (file) => {
      try {
        const img = await loadFile(file);
        const name = uploadName.value.trim() || file.name.replace(/\.[^.]+$/, '');
        addEmote(name, { img, thumb: img.src, source: 'upload' });
        uploadName.value = '';
      } catch (err) { alert(err.message); }
    })
  );

  const stvInput = el('input', { type: 'search', placeholder: 'Name, 7tv.app link or emote ID', 'aria-label': '7TV emote search' });
  const stvStatus = el('p', { class: 'muted small', 'aria-live': 'polite' });
  const stvResults = el('div', { class: 'stv-results' });
  const stvButton = el('button', { type: 'button', class: 'btn', onclick: runSearch }, 'Search 7TV');
  stvInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });

  async function runSearch() {
    const q = stvInput.value.trim();
    if (!q) return;
    stvStatus.textContent = 'Searching…';
    stvResults.replaceChildren();
    stvButton.disabled = true;
    try {
      const single = await getEmote(q); // returns null if q isn't a link/ID
      const results = single ? [single] : await searchEmotes(q);
      stvStatus.textContent = results.length ? 'Click an emote to add it.' : 'No emotes found.';
      for (const r of results) {
        stvResults.append(el('button', { type: 'button', class: 'stv-result', title: r.name, onclick: () => pickStv(r) },
          el('img', { src: r.thumb, alt: '', loading: 'lazy' }), el('span', {}, r.name)));
      }
    } catch (err) {
      stvStatus.textContent = `7TV lookup failed: ${err.message}`;
    } finally {
      stvButton.disabled = false;
    }
  }
  async function pickStv(r) {
    stvStatus.textContent = `Loading ${r.name}…`;
    try {
      const img = await loadImage(r.full);
      addEmote(r.name, { img, thumb: r.thumb, source: '7tv' });
      stvStatus.textContent = `Added ${r.name}${r.animated ? ' (animated emotes export as a still frame)' : ''}.`;
    } catch {
      stvStatus.textContent = `Couldn't load ${r.name}.`;
    }
  }

  // ---------- Output options ----------
  const widthInput = el('input', { type: 'range', min: '200', max: '800', step: '10', value: String(state.maxWidth), 'aria-label': 'Wrap width' });
  const widthOut = el('span', { class: 'muted small' }, `${state.maxWidth}px`);
  widthInput.addEventListener('input', () => { state.maxWidth = Number(widthInput.value); widthOut.textContent = `${state.maxWidth}px`; draw(); });

  // Text color + outline only matter on a transparent background.
  const textField = field('Text', segmented([{ value: 'light', label: 'White text' }, { value: 'dark', label: 'Black text' }], state.textTheme, (v) => { state.textTheme = v; draw(); }));
  const outlineField = field('Outline', segmented([{ value: true, label: 'On' }, { value: false, label: 'Off' }], state.outline, (v) => { state.outline = v; draw(); }));
  function setBackground(v) {
    state.background = v;
    textField.hidden = outlineField.hidden = v !== 'transparent';
    draw();
  }

  const exportBtn = el('button', { type: 'button', class: 'btn-primary', onclick: async () => {
    const canvas = await render(state.scale);
    downloadCanvas(canvas, `chat-${slug(state.username, 'user')}-${state.scale}x.png`);
  } }, 'Download PNG');

  root.append(
    el('div', { class: 'tool-layout' },
      el('div', { class: 'preview-col' }, previewWrap, sizeInfo),
      el('div', { class: 'controls-col' },
        el('div', { class: 'card' },
          el('h2', { class: 'card-title' }, 'Message'),
          field('Username', usernameInput),
          field('Message', messageInput),
          field('Name color', el('div', { class: 'stack' }, el('div', { class: 'row' }, colorInput, swatches)))
        ),
        el('div', { class: 'card' },
          el('h2', { class: 'card-title' }, 'Badges'),
          el('div', { class: 'chip-row' }, badgeButtons),
          customBadgeRow
        ),
        el('div', { class: 'card' },
          el('h2', { class: 'card-title' }, 'Emotes'),
          emoteList,
          field('Custom', uploadRow),
          field('7TV', el('div', { class: 'stack' }, el('div', { class: 'row grow' }, stvInput, stvButton), stvStatus, stvResults))
        ),
        el('div', { class: 'card' },
          el('h2', { class: 'card-title' }, 'Output'),
          field('Background', segmented([
            { value: 'dark', label: 'Twitch dark' },
            { value: 'light', label: 'Twitch light' },
            { value: 'transparent', label: 'Transparent' },
          ], state.background, setBackground)),
          textField,
          outlineField,
          field('Wrap width', el('div', { class: 'row grow' }, widthInput, widthOut)),
          field('Quality', segmented([2, 4, 8].map((n) => ({ value: n, label: `${n}x` })), state.scale, (v) => { state.scale = v; updateSizeInfo(); }))
        ),
        exportBtn
      )
    )
  );
  renderEmoteList();

  // ---------- Layout + rendering ----------
  const measureCtx = document.createElement('canvas').getContext('2d');
  const font = (bold) => `${bold ? 700 : 400} ${FONT_SIZE}px ${FONT_FAMILY}`;
  const solidBg = () => BACKGROUNDS[state.background] ?? null;
  const textColor = () => solidBg()?.text ?? (state.textTheme === 'light' ? '#efeff1' : '#0e0e10');
  const useOutline = () => !solidBg() && state.outline;

  /** Works out where every badge, word and emote goes, at 1x. */
  function layout(badgeImgs) {
    const color = textColor();
    const items = [];
    const text = (str, bold, c, gap, canBreak) => {
      measureCtx.font = font(bold);
      items.push({ kind: 'text', str, bold, color: c, w: measureCtx.measureText(str).width, h: FONT_SIZE, gap, canBreak });
    };
    measureCtx.font = font(false);
    const space = measureCtx.measureText(' ').width;

    // Badges, then "name:" stay together on the first line.
    for (const img of badgeImgs) {
      items.push({ kind: 'image', img, w: BADGE, h: BADGE, gap: items.length ? BADGE_GAP : 0, canBreak: false });
    }
    text(state.username || 'username', true, state.nameColor, items.length ? BADGE_GAP : 0, false);
    text(':', false, color, 0, false);

    // Message words: emote names become images, everything else is text.
    for (const word of state.message.split(/\s+/).filter(Boolean)) {
      const emote = state.emotes.get(word);
      if (emote) {
        const ratio = emote.img.naturalWidth / emote.img.naturalHeight || 1;
        items.push({ kind: 'image', img: emote.img, w: EMOTE_H * ratio, h: EMOTE_H, gap: space, canBreak: true });
        continue;
      }
      measureCtx.font = font(false);
      // Break up words that are longer than a whole line.
      let rest = word;
      let first = true;
      while (rest) {
        let cut = rest.length;
        while (cut > 1 && measureCtx.measureText(rest.slice(0, cut)).width > state.maxWidth) cut--;
        text(rest.slice(0, cut), false, color, first ? space : 0, true);
        rest = rest.slice(cut);
        first = false;
      }
    }

    // Flow items into lines.
    const lines = [{ items: [], w: 0, h: LINE_H }];
    for (const it of items) {
      let line = lines[lines.length - 1];
      let gap = line.items.length ? it.gap : 0;
      if (line.items.length && it.canBreak && line.w + gap + it.w > state.maxWidth) {
        line = { items: [], w: 0, h: LINE_H };
        lines.push(line);
        gap = 0;
      }
      line.items.push({ ...it, x: line.w + gap });
      line.w += gap + it.w;
      line.h = Math.max(line.h, it.h + 2);
    }
    // A solid background gets Twitch-like padding; transparent stays tight.
    const padX = solidBg() ? 10 : useOutline() ? 3 : 1;
    const padY = solidBg() ? 5 : padX;
    return {
      lines,
      padX,
      padY,
      width: Math.ceil(Math.max(...lines.map((l) => l.w)) + padX * 2),
      height: Math.ceil(lines.reduce((s, l) => s + l.h, 0) + padY * 2),
    };
  }

  async function selectedBadgeImages() {
    const imgs = await Promise.all(
      BADGES.filter((b) => state.badges.has(b.id)).map((b) => loadImage(b.icon).catch(() => null))
    );
    if (state.customBadge) imgs.push(state.customBadge);
    return imgs.filter(Boolean);
  }

  async function render(scale, target = document.createElement('canvas')) {
    await ensureFonts([font(false), font(true)]);
    const L = layout(await selectedBadgeImages());
    target.width = L.width * scale;
    target.height = L.height * scale;
    const ctx = target.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, L.width, L.height);
    if (solidBg()) {
      ctx.fillStyle = solidBg().fill;
      ctx.fillRect(0, 0, L.width, L.height);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.textBaseline = 'middle';
    const outlineColor = state.textTheme === 'light' ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';

    let y = L.padY;
    for (const line of L.lines) {
      const mid = y + line.h / 2;
      for (const it of line.items) {
        const x = L.padX + it.x;
        if (it.kind === 'text') {
          ctx.font = font(it.bold);
          if (useOutline()) {
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.strokeStyle = outlineColor;
            ctx.strokeText(it.str, x, mid + 0.5);
          }
          ctx.fillStyle = it.color;
          ctx.fillText(it.str, x, mid + 0.5);
        } else {
          ctx.drawImage(it.img, x, mid - it.h / 2, it.w, it.h);
        }
      }
      y += line.h;
    }
    return target;
  }

  let lastSize = { w: 0, h: 0 };
  function updateSizeInfo() {
    const bg = state.background === 'transparent' ? 'transparent PNG' : 'PNG';
    sizeInfo.textContent = `Export size: ${lastSize.w * state.scale} × ${lastSize.h * state.scale}px (${bg})`;
  }

  let pending = false;
  function draw() {
    // Batch rapid typing into one redraw per frame.
    if (pending) return;
    pending = true;
    requestAnimationFrame(async () => {
      pending = false;
      const PREVIEW_ZOOM = 2; // show the preview twice as big so it's readable
      const dpr = window.devicePixelRatio || 1;
      await render(PREVIEW_ZOOM * dpr, preview);
      lastSize = { w: preview.width / (PREVIEW_ZOOM * dpr), h: preview.height / (PREVIEW_ZOOM * dpr) };
      preview.style.width = `${preview.width / dpr}px`;
      preview.style.height = `${preview.height / dpr}px`;
      updateSizeInfo();
    });
  }
  // Runs last: it calls draw(), which needs everything above to exist first.
  setBackground(state.background);
}
