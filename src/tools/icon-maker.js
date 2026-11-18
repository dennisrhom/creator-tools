// Tool 1: Icon Maker. Agent icon or uploaded image -> shaped, outlined, transparent PNG.

import { loadImage, loadFile, downloadCanvas, roundRectPath, slug } from '../lib/canvas.js';
import { el, field, segmented, picker, fileButton } from '../lib/ui.js';

const SIZE = 512; // export size in pixels (square)

export function initIconMaker(root, manifest) {
  const agents = manifest.agents;
  const state = {
    source: 'agent',          // 'agent' | 'upload'
    agent: agents.find((a) => a.slug === 'jett')?.slug ?? agents[0]?.slug,
    upload: null,             // HTMLImageElement
    uploadName: 'upload',
    shape: 'circle',          // 'circle' | 'square' | 'rounded'
    outline: 'black',         // 'none' | 'black' | 'white'
    thickness: 8,             // px at 512x512
    background: 'none',       // 'none' | 'color'
    bgColor: '#ff4655',
    zoom: 1,                  // 1 = image just covers the shape
    offsetX: 0,               // pan, in canvas pixels
    offsetY: 0,
  };

  // ---------- Preview ----------
  const canvas = el('canvas', { class: 'icon-canvas', width: SIZE, height: SIZE, 'aria-label': 'Icon preview' });
  const ctx = canvas.getContext('2d');
  const hint = el('p', { class: 'hint' }, 'Drag the preview to move the image. Scroll or use the slider to zoom.');

  // ---------- Controls ----------
  const agentPicker = picker({
    items: agents.map((a) => ({ value: a.slug, label: a.name, icon: a.icon })),
    value: state.agent,
    iconShape: 'round',
    onChange: (v) => { state.agent = v; resetCrop(); draw(); },
  });

  const uploadName = el('span', { class: 'muted small' }, 'No file chosen');
  const uploadRow = el('div', { class: 'row' },
    fileButton('Upload image', 'image/*', async (file) => {
      try {
        state.upload = await loadFile(file);
        state.uploadName = file.name.replace(/\.[^.]+$/, '');
        uploadName.textContent = file.name;
        resetCrop();
        draw();
      } catch (err) { alert(err.message); }
    }),
    uploadName
  );
  // Users can also drop a file anywhere on the preview.
  canvas.addEventListener('dragover', (e) => e.preventDefault());
  canvas.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      state.upload = await loadFile(file);
      state.uploadName = file.name.replace(/\.[^.]+$/, '');
      uploadName.textContent = file.name;
      sourceSeg.setValue('upload');
      setSource('upload');
    } catch (err) { alert(err.message); }
  });

  const agentField = field('Agent', agentPicker);
  const uploadField = field('Image', uploadRow);
  function setSource(v) {
    state.source = v;
    agentField.hidden = v !== 'agent';
    uploadField.hidden = v !== 'upload';
    resetCrop();
    draw();
  }
  const sourceSeg = segmented([{ value: 'agent', label: 'Valorant agent' }, { value: 'upload', label: 'Upload' }], state.source, setSource);

  const zoomInput = el('input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1', 'aria-label': 'Zoom' });
  zoomInput.addEventListener('input', () => setZoom(Number(zoomInput.value)));
  const resetBtn = el('button', { type: 'button', class: 'btn small', onclick: () => { resetCrop(); draw(); } }, 'Reset');

  const thicknessSeg = segmented([1, 2, 4, 8, 16].map((n) => ({ value: n, label: `${n}px` })), state.thickness, (v) => { state.thickness = v; draw(); });
  const thicknessField = field('Thickness', thicknessSeg);

  const bgColor = el('input', { type: 'color', value: state.bgColor, 'aria-label': 'Background color', class: 'color-input' });
  bgColor.addEventListener('input', () => { state.bgColor = bgColor.value; draw(); });
  bgColor.hidden = true;

  const exportBtn = el('button', { type: 'button', class: 'btn-primary', onclick: () => {
    const name = state.source === 'agent' ? state.agent : slug(state.uploadName);
    downloadCanvas(canvas, `${name}-icon-${state.shape}.png`);
  } }, 'Download PNG');

  root.append(
    el('div', { class: 'tool-layout' },
      el('div', { class: 'preview-col' },
        el('div', { class: 'card preview-card checker icon-preview' }, canvas),
        hint
      ),
      el('div', { class: 'controls-col' },
        el('div', { class: 'card' },
          el('h2', { class: 'card-title' }, 'Source'),
          field('From', sourceSeg),
          agentField,
          uploadField,
          field('Zoom', el('div', { class: 'row grow' }, zoomInput, resetBtn))
        ),
        el('div', { class: 'card' },
          el('h2', { class: 'card-title' }, 'Style'),
          field('Shape', segmented([
            { value: 'circle', label: 'Circle' },
            { value: 'rounded', label: 'Rounded' },
            { value: 'square', label: 'Square' },
          ], state.shape, (v) => { state.shape = v; draw(); })),
          field('Outline', segmented([
            { value: 'none', label: 'None' },
            { value: 'black', label: 'Black' },
            { value: 'white', label: 'White' },
          ], state.outline, (v) => { state.outline = v; thicknessField.hidden = v === 'none'; draw(); })),
          thicknessField,
          field('Background', el('div', { class: 'row' },
            segmented([{ value: 'none', label: 'Transparent' }, { value: 'color', label: 'Color' }], state.background, (v) => {
              state.background = v; bgColor.hidden = v !== 'color'; draw();
            }),
            bgColor
          ))
        ),
        exportBtn,
        el('p', { class: 'hint' }, `Exports a ${SIZE}×${SIZE} transparent PNG.`)
      )
    )
  );
  uploadField.hidden = true;

  // ---------- Crop / zoom interaction ----------
  function resetCrop() {
    state.zoom = 1; state.offsetX = 0; state.offsetY = 0;
    zoomInput.value = '1';
  }
  function setZoom(z) {
    state.zoom = Math.max(1, Math.min(4, z));
    zoomInput.value = String(state.zoom);
    draw();
  }

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, ox: state.offsetX, oy: state.offsetY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    // The canvas is shown smaller than 512px, so convert screen pixels to canvas pixels.
    const k = SIZE / canvas.getBoundingClientRect().width;
    state.offsetX = drag.ox + (e.clientX - drag.x) * k;
    state.offsetY = drag.oy + (e.clientY - drag.y) * k;
    draw();
  });
  const endDrag = () => (drag = null);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(state.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  }, { passive: false });

  // ---------- Drawing ----------
  function shapePath(inset) {
    const s = SIZE - inset * 2;
    if (state.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, s / 2, 0, Math.PI * 2);
    } else {
      roundRectPath(ctx, inset, inset, s, s, state.shape === 'rounded' ? s * 0.2 : 0);
    }
  }

  let drawToken = 0;
  async function draw() {
    const token = ++drawToken;
    const img = state.source === 'agent'
      ? await loadImage(agents.find((a) => a.slug === state.agent)?.icon).catch(() => null)
      : state.upload;
    if (token !== drawToken) return; // a newer draw started while we waited

    const t = state.outline === 'none' ? 0 : state.thickness;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Everything is clipped to the shape, inset by half the outline so the stroke fits.
    ctx.save();
    shapePath(t / 2);
    ctx.clip();
    if (state.background === 'color') {
      ctx.fillStyle = state.bgColor;
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
    if (img) {
      // "cover" fit: scale so the image fills the square, then apply zoom.
      const scale = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight) * state.zoom;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      // Keep the image covering the canvas: don't allow panning past its edges.
      const maxX = (w - SIZE) / 2;
      const maxY = (h - SIZE) / 2;
      state.offsetX = Math.max(-maxX, Math.min(maxX, state.offsetX));
      state.offsetY = Math.max(-maxY, Math.min(maxY, state.offsetY));
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (SIZE - w) / 2 + state.offsetX, (SIZE - h) / 2 + state.offsetY, w, h);
    }
    ctx.restore();

    if (t > 0) {
      shapePath(t / 2);
      ctx.lineWidth = t;
      ctx.strokeStyle = state.outline === 'white' ? '#ffffff' : '#000000';
      ctx.stroke();
    }
    canvas.classList.toggle('grab', Boolean(img));
  }

  draw();
}
