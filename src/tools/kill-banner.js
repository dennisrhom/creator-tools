// Tool 3: Kill Banner Maker. A kill-feed style banner:
//   (count) [killer portrait | name  weapon  wallbang headshot] > [victim name | victim portrait]
//
// All proportions and colors below were measured from an in-game kill-feed
// screenshot and are expressed as fractions of the banner height H.

import { loadImage, downloadCanvas, ensureFonts, slug, trimTransparent } from '../lib/canvas.js';
import { el, field, segmented, picker, toggleChip, stepper } from '../lib/ui.js';

// Base layout at 1x. Export multiplies everything by 2 or 4.
const H = 40;
const MARGIN = 6;                    // empty space around the banner
const COUNT_R = H * 0.19;            // kill-count circle radius
const COUNT_GLOW = H * 0.2;          // soft glow around the circle
const COUNT_CX = -H * 0.26;          // circle center x, relative to the banner's left edge
const COUNT_CY = H * 0.77;           // circle center y, relative to the banner's top
const TAB_DEPTH = H * 0.32;          // highlight arrow tab, pointing left
const TAB_HALF = H * 0.3;            // half the tab's height
const MARGIN_LEFT = Math.ceil(Math.max(TAB_DEPTH, -COUNT_CX + COUNT_R + COUNT_GLOW * 0.5) + 2);
const ARROW = H * 0.34;              // how far the killer arrow points into the victim side
const K_BOX_W = H * 1.37;            // killer portrait box width
const V_BOX_W = H * 1.59;            // victim portrait box width
const BOX_SLANT = H * 0.08;          // lean of the killer portrait box's right edge
const EDGE = H * 0.11;               // highlight: thick yellow outer edge
const FRAME = H * 0.05;              // highlight: thin yellow line on the portrait's inner edge
const BORDER = H * 0.06;             // highlight: top/bottom border thickness
const BORDER_SOLID = H * 1.7;        // top/bottom border stays solid this far...
const BORDER_FADE = H * 4.2;         // ...then fades out by here
const OUTLINE = H * 0.04;            // victim portrait outline
const GUN_H = H * 0.52;              // weapon icon height (visible pixels, padding trimmed)
const GUN_MAX_W = H * 3.6;           // cap for very long weapons
const ABILITY_H = H * 0.62;          // ability icon size
const MARK_H = H * 0.62;             // headshot / wallbang height
const NAME_FONT = `700 ${Math.round(H * 0.46)}px Inter, Arial, "Segoe UI", sans-serif`;
const COUNT_FONT = `800 ${Math.round(H * 0.26)}px Barlow, Arial, "Segoe UI", sans-serif`;

// Built-in kill-feed marks (white on transparent), shipped in public/assets/killfeed/
const MARK_SRC = { headshot: '/assets/killfeed/headshot.png', wallbang: '/assets/killfeed/wallbang.png' };

// Colors sampled from the in-game screenshot.
// killer: gradient from the portrait (dark) to the arrow (bright).
// victim: gradient from the arrow (bright) to the portrait (dark).
const PALETTES = {
  red: {
    main: '#f05853',
    killer: [[0, '#301c1e'], [0.18, '#4d2526'], [0.45, '#873b3a'], [0.63, '#a94542'], [0.92, '#e25550'], [1, '#ef5854']],
    victim: [[0, '#ef5854'], [0.15, '#e25550'], [0.42, '#a94542'], [0.6, '#873b3a'], [1, '#4d2526']],
    portraitBg: '#2a1517',
  },
  teal: {
    main: '#63bfa4',
    killer: [[0, '#1b2b28'], [0.18, '#233f39'], [0.45, '#3a7062'], [0.63, '#468a78'], [0.92, '#5daa92'], [1, '#62b298']],
    victim: [[0, '#62b298'], [0.15, '#56a48d'], [0.42, '#4a8676'], [0.6, '#3c6d61'], [1, '#26423d']],
    portraitBg: '#16231f',
  },
};
const HIGHLIGHT = '#e7ed84';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const roman = (n) => ROMAN[n] ?? String(n);

export function initKillBanner(root, manifest) {
  const { agents, weapons } = manifest;
  const bySlug = (s) => agents.find((a) => a.slug === s);
  const firstOf = (...names) => names.map(bySlug).find(Boolean)?.slug ?? agents[0]?.slug;

  const state = {
    killer: { agent: firstOf('chamber'), name: 'YourName' },
    victim: { agent: firstOf('jett'), name: '' },
    mode: 'gun',                                   // 'gun' | 'ability'
    weapon: weapons.find((w) => w.slug === 'vandal')?.slug ?? weapons[0]?.slug,
    ability: null,                                 // ability slot, e.g. 'Ultimate'
    headshot: true,
    wallbang: false,
    enemyKill: false,                              // true = enemy killed your teammate (colors flip)
    highlight: 'killer',                           // 'off' | 'killer' | 'victim'
    killCount: 2,                                  // 1 = first kill (no circle, like in-game), 2-10 = II..X
    scale: 2,
  };

  // ---------- Preview ----------
  const preview = el('canvas', { class: 'kill-canvas', 'aria-label': 'Kill banner preview' });

  // ---------- Players ----------
  const agentItems = agents.map((a) => ({ value: a.slug, label: a.name, icon: a.icon }));
  const killerPicker = picker({ items: agentItems, value: state.killer.agent, iconShape: 'round', onChange: (v) => { state.killer.agent = v; refreshAbilities(); draw(); } });
  const victimPicker = picker({ items: agentItems, value: state.victim.agent, iconShape: 'round', onChange: (v) => { state.victim.agent = v; draw(); } });

  const nameInput = (side, placeholder) => {
    const input = el('input', { type: 'text', value: state[side].name, placeholder, maxlength: '20', 'aria-label': `${side} name` });
    input.addEventListener('input', () => { state[side].name = input.value; draw(); });
    return input;
  };
  const killerName = nameInput('killer', 'Name (blank = agent name)');
  const victimName = nameInput('victim', 'Name (blank = agent name)');

  const swapBtn = el('button', { type: 'button', class: 'icon-btn', title: 'Swap killer and victim', 'aria-label': 'Swap killer and victim', onclick: () => {
    [state.killer, state.victim] = [state.victim, state.killer];
    killerPicker.setValue(state.killer.agent);
    victimPicker.setValue(state.victim.agent);
    killerName.value = state.killer.name;
    victimName.value = state.victim.name;
    refreshAbilities();
    draw();
  } }, '⇄');

  // ---------- Killed with ----------
  const weaponPicker = picker({
    items: weapons.map((w) => ({ value: w.slug, label: w.name, icon: w.killIcon, group: w.category })),
    value: state.weapon,
    iconShape: 'weapon',
    onChange: (v) => { state.weapon = v; draw(); },
  });
  const abilityPicker = picker({ items: [], value: null, iconShape: 'square', searchable: false, onChange: (v) => { state.ability = v; draw(); } });
  function refreshAbilities() {
    const a = bySlug(state.killer.agent);
    const items = (a?.abilities ?? []).map((ab) => ({ value: ab.slot, label: ab.name, icon: ab.icon }));
    state.ability = abilityPicker.setItems(items, items.some((i) => i.value === state.ability) ? state.ability : items[0]?.value);
  }
  refreshAbilities();

  const modeSeg = segmented([{ value: 'gun', label: 'Gun' }, { value: 'ability', label: 'Ability' }], state.mode, (v) => {
    state.mode = v;
    weaponPicker.hidden = v !== 'gun';
    abilityPicker.hidden = v !== 'ability';
    draw();
  });
  abilityPicker.hidden = true;

  const exportBtn = el('button', { type: 'button', class: 'btn-primary', onclick: async () => {
    const c = await render(state.scale);
    const k = state.killer.name || bySlug(state.killer.agent)?.name;
    const v = state.victim.name || bySlug(state.victim.agent)?.name;
    downloadCanvas(c, `kill-${slug(k)}-${slug(v)}-${state.scale}x.png`);
  } }, 'Download PNG');

  const sizeInfo = el('p', { class: 'hint' });

  root.append(
    el('div', { class: 'tool-layout' },
      el('div', { class: 'preview-col' },
        el('div', { class: 'card preview-card checker kill-preview' }, preview),
        sizeInfo
      ),
      el('div', { class: 'controls-col' },
        el('div', { class: 'card' },
          el('div', { class: 'versus' },
            el('div', { class: 'stack' }, el('div', { class: 'field-label' }, 'Killer (ally)'), killerPicker, killerName),
            swapBtn,
            el('div', { class: 'stack' }, el('div', { class: 'field-label' }, 'Victim (enemy)'), victimPicker, victimName)
          )
        ),
        el('div', { class: 'card' },
          el('div', { class: 'card-head' }, el('h2', { class: 'card-title' }, 'Killed with'), modeSeg),
          weaponPicker,
          abilityPicker
        ),
        el('div', { class: 'card' },
          el('div', { class: 'chip-row' },
            toggleChip('Headshot', state.headshot, (on) => { state.headshot = on; draw(); }),
            toggleChip('Wallbang', state.wallbang, (on) => { state.wallbang = on; draw(); }),
            toggleChip('Enemy kill', state.enemyKill, (on) => { state.enemyKill = on; draw(); })
          ),
          field('Highlight me', segmented([
            { value: 'off', label: 'Off' }, { value: 'killer', label: 'Killer' }, { value: 'victim', label: 'Victim' },
          ], state.highlight, (v) => { state.highlight = v; draw(); })),
          field('Kill #', stepper(state.killCount, { min: 1, max: 10, format: roman }, (v) => { state.killCount = v; draw(); })),
          el('p', { class: 'hint' }, 'Kill I has no circle (like the first kill in-game); II to X show the numeral.'),
          field('Export quality', segmented([{ value: 2, label: '2x' }, { value: 4, label: '4x' }], state.scale, (v) => { state.scale = v; draw(); }))
        ),
        exportBtn
      )
    )
  );

  // ---------- Drawing ----------
  const measureCtx = document.createElement('canvas').getContext('2d');

  async function loadAll() {
    const killer = bySlug(state.killer.agent);
    const victim = bySlug(state.victim.agent);
    const iconSrc = state.mode === 'gun'
      ? weapons.find((w) => w.slug === state.weapon)?.killIcon
      : killer?.abilities.find((ab) => ab.slot === state.ability)?.icon;
    const safe = (src) => loadImage(src).catch(() => null);
    const [kImg, vImg, icon, headshot, wallbang] = await Promise.all([
      safe(killer?.killfeed), safe(victim?.killfeed), safe(iconSrc), safe(MARK_SRC.headshot), safe(MARK_SRC.wallbang),
    ]);
    // Weapon images have empty padding around the silhouette; trim it so the gun is sized by what you see.
    const shownIcon = icon && state.mode === 'gun' ? trimTransparent(icon) : icon;
    return { killer, victim, kImg, vImg, icon: shownIcon, marks: { headshot, wallbang } };
  }

  /** Measures everything and returns x positions for each part, at 1x. */
  function layout(data) {
    measureCtx.font = NAME_FONT;
    const kName = state.killer.name.trim() || data.killer?.name || '';
    const vName = state.victim.name.trim() || data.victim?.name || '';

    // Weapon icons are wide silhouettes; ability icons are square.
    let iconW = 0, iconH = 0;
    if (data.icon) {
      // (a trimmed icon is a <canvas>, which has width/height instead of naturalWidth/naturalHeight)
      const ratio = (data.icon.naturalWidth || data.icon.width) / (data.icon.naturalHeight || data.icon.height);
      if (state.mode === 'gun') {
        iconH = GUN_H;
        iconW = Math.min(iconH * ratio, GUN_MAX_W);
        iconH = iconW / ratio;
      } else {
        iconW = iconH = ABILITY_H;
      }
    }

    // Wallbang comes before headshot, like in-game.
    const marks = ['wallbang', 'headshot']
      .filter((k) => state[k] && data.marks[k])
      .map((kind) => {
        const img = data.marks[kind];
        return { kind, img, w: MARK_H * (img.naturalWidth / img.naturalHeight), h: MARK_H };
      });

    const killerStart = MARGIN_LEFT;
    const kBodyX = killerStart + K_BOX_W;          // where the colored body starts
    let x = kBodyX + H * 0.3;
    const kNameX = x; x += measureCtx.measureText(kName).width + H * 0.18;
    const iconX = x; x += iconW;
    if (marks.length) x += H * 0.35;
    for (const m of marks) { m.x = x; x += m.w + H * 0.1; }
    if (marks.length) x -= H * 0.1;
    const killerEnd = Math.max(x + H * 0.05, killerStart + BORDER_FADE);

    const tip = killerEnd + ARROW;
    const vNameX = tip + H * 0.23;
    const vBoxX = vNameX + measureCtx.measureText(vName).width + H * 0.25;
    const victimEnd = vBoxX + V_BOX_W;

    return {
      width: Math.ceil(victimEnd + MARGIN),
      height: H + MARGIN * 2,
      top: MARGIN,
      kName, vName, iconW, iconH, marks,
      killerStart, kBodyX, killerEnd, tip, victimEnd, kNameX, iconX, vNameX, vBoxX,
    };
  }

  // ----- Shapes -----
  const path = (ctx, pts) => {
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
  };
  const killerShape = (ctx, L) => {
    const t = L.top, b = t + H;
    path(ctx, [[L.killerStart, t], [L.killerEnd, t], [L.tip, t + H / 2], [L.killerEnd, b], [L.killerStart, b]]);
  };
  const victimShape = (ctx, L) => {
    const t = L.top, b = t + H;
    path(ctx, [[L.killerEnd, t], [L.victimEnd, t], [L.victimEnd, b], [L.killerEnd, b], [L.tip, t + H / 2]]);
  };
  const killerBox = (ctx, L) => {
    const t = L.top, b = t + H, x = L.killerStart;
    path(ctx, [[x, t], [x + K_BOX_W, t], [x + K_BOX_W - BOX_SLANT, b], [x, b]]);
  };
  const victimBox = (ctx, L) => {
    const t = L.top, b = t + H;
    path(ctx, [[L.vBoxX, t], [L.victimEnd, t], [L.victimEnd, b], [L.vBoxX, b]]);
  };

  function gradient(ctx, x0, x1, stops) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }

  // Portrait box: dark background, then the 2:1 killfeed art centered and cropped to the box.
  function drawPortrait(ctx, L, shape, img, boxX, boxW, bg, mirror) {
    ctx.save();
    shape(ctx, L);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.clip();
    if (img) {
      const w = H * (img.naturalWidth / img.naturalHeight);
      const x = boxX + (boxW - w) / 2;
      if (mirror) {
        ctx.translate(x + w, L.top);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, w, H);
      } else {
        ctx.drawImage(img, x, L.top, w, H);
      }
    }
    ctx.restore();
  }

  // Thin outline around the victim portrait in the victim color.
  function drawVictimOutline(ctx, L, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = OUTLINE;
    const o = OUTLINE / 2;
    ctx.strokeRect(L.vBoxX + o, L.top + o, V_BOX_W - OUTLINE, H - OUTLINE);
    ctx.restore();
  }

  // "Highlight me": thick yellow outer edge, thin yellow line on the portrait's
  // inner edge, and top/bottom borders that stay solid then fade out.
  function drawHighlight(ctx, L) {
    if (state.highlight === 'off') return;
    const killer = state.highlight === 'killer';
    const t = L.top, b = t + H;
    const edge = killer ? L.killerStart : L.victimEnd;
    const dir = killer ? 1 : -1;
    const fadeTo = edge + dir * BORDER_FADE;

    ctx.save();
    (killer ? killerShape : victimShape)(ctx, L);
    ctx.clip();
    const g = ctx.createLinearGradient(edge, 0, fadeTo, 0);
    g.addColorStop(0, HIGHLIGHT);
    g.addColorStop(BORDER_SOLID / BORDER_FADE, HIGHLIGHT);
    g.addColorStop(1, 'rgba(231, 237, 132, 0)');
    ctx.fillStyle = g;
    const x0 = Math.min(edge, fadeTo), w = Math.abs(fadeTo - edge);
    ctx.fillRect(x0, t, w, BORDER);
    ctx.fillRect(x0, b - BORDER, w, BORDER);
    ctx.fillStyle = HIGHLIGHT;
    ctx.fillRect(killer ? edge : edge - EDGE, t, EDGE, H);
    // thin line on the portrait's inner edge
    ctx.strokeStyle = HIGHLIGHT;
    ctx.lineWidth = FRAME;
    ctx.beginPath();
    if (killer) {
      ctx.moveTo(L.killerStart + K_BOX_W, t);
      ctx.lineTo(L.killerStart + K_BOX_W - BOX_SLANT, b);
    } else {
      ctx.moveTo(L.vBoxX, t);
      ctx.lineTo(L.vBoxX, b);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Arrow tab pointing left, outside the banner (killer highlight only).
  function drawHighlightTab(ctx, L) {
    if (state.highlight !== 'killer') return;
    const mid = L.top + H / 2, x = L.killerStart;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = HIGHLIGHT;
    path(ctx, [[x + 0.5, mid - TAB_HALF], [x - TAB_DEPTH, mid], [x + 0.5, mid + TAB_HALF]]);
    ctx.fill();
    ctx.restore();
  }

  // Kill number: small glowing circle (killer color) with a Roman numeral.
  // The first kill shows no circle.
  function drawKillCount(ctx, L, color) {
    if (state.killCount < 2) return;
    const cx = L.killerStart + COUNT_CX, cy = L.top + COUNT_CY;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = COUNT_GLOW;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, COUNT_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fill(); // second pass makes the glow stronger
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = COUNT_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(roman(state.killCount), cx, cy + 0.5);
    ctx.restore();
  }

  async function render(scale, target = document.createElement('canvas')) {
    await ensureFonts([NAME_FONT, COUNT_FONT]);
    const data = await loadAll();
    const L = layout(data);
    target.width = L.width * scale;
    target.height = L.height * scale;
    const ctx = target.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, L.width, L.height);
    ctx.imageSmoothingQuality = 'high';

    // Normally the killer is your ally (teal). "Enemy kill" flips it.
    const kPal = state.enemyKill ? PALETTES.red : PALETTES.teal;
    const vPal = state.enemyKill ? PALETTES.teal : PALETTES.red;

    drawHighlightTab(ctx, L);

    killerShape(ctx, L);
    ctx.fillStyle = gradient(ctx, L.kBodyX, L.tip, kPal.killer);
    ctx.fill();
    victimShape(ctx, L);
    ctx.fillStyle = gradient(ctx, L.killerEnd, L.vBoxX, vPal.victim);
    ctx.fill();

    drawPortrait(ctx, L, killerBox, data.kImg, L.killerStart, K_BOX_W, kPal.portraitBg, false);
    drawPortrait(ctx, L, victimBox, data.vImg, L.vBoxX, V_BOX_W, vPal.portraitBg, true);
    drawVictimOutline(ctx, L, vPal.main);
    drawHighlight(ctx, L);

    // Names
    const mid = L.top + H / 2;
    ctx.font = NAME_FONT;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(L.kName, L.kNameX, mid + 1);
    ctx.fillText(L.vName, L.vNameX, mid + 1);

    // Weapon (mirrored so the barrel points at the victim) or ability icon
    if (data.icon) {
      ctx.save();
      if (state.mode === 'gun') {
        ctx.translate(L.iconX + L.iconW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(data.icon, 0, mid - L.iconH / 2, L.iconW, L.iconH);
      } else {
        ctx.drawImage(data.icon, L.iconX, mid - L.iconH / 2, L.iconW, L.iconH);
      }
      ctx.restore();
    }

    // Wallbang / headshot marks
    for (const m of L.marks) ctx.drawImage(m.img, m.x, mid - m.h / 2, m.w, m.h);

    drawKillCount(ctx, L, kPal.main);
    return target;
  }

  let token = 0;
  async function draw() {
    const mine = ++token;
    const dpr = window.devicePixelRatio || 1;
    const PREVIEW_ZOOM = 1.5;
    const off = await render(PREVIEW_ZOOM * dpr);
    if (mine !== token) return; // a newer change arrived while images loaded
    preview.width = off.width;
    preview.height = off.height;
    preview.getContext('2d').drawImage(off, 0, 0);
    preview.style.width = `${off.width / dpr}px`;
    const w = Math.round((off.width / (PREVIEW_ZOOM * dpr)) * state.scale);
    const h = Math.round((off.height / (PREVIEW_ZOOM * dpr)) * state.scale);
    sizeInfo.textContent = `Export size: ${w} × ${h}px (transparent PNG)`;
  }
  draw();
}
