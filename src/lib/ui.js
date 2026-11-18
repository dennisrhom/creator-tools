// Tiny helpers for building form controls with plain DOM (no framework).

/** el('div', { class: 'x', onclick: fn }, child1, 'text', ...) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (key in node && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** A labeled row: <label>LABEL</label> + control(s). */
export function field(label, ...controls) {
  return el('div', { class: 'field' }, el('div', { class: 'field-label' }, label), el('div', { class: 'field-control' }, ...controls));
}

/**
 * Segmented button group (like "Gun | Ability").
 * options: [{ value, label }] or plain strings.
 */
export function segmented(options, value, onChange, { ariaLabel } = {}) {
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) }));
  const root = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': ariaLabel });
  const buttons = opts.map((o) =>
    el('button', {
      type: 'button',
      role: 'radio',
      class: 'seg-btn',
      onclick: () => {
        set(o.value);
        onChange(o.value);
      },
    }, o.label)
  );
  root.append(...buttons);
  function set(v) {
    value = v;
    buttons.forEach((b, i) => {
      const on = opts[i].value === v;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
  }
  set(value);
  return Object.assign(root, { setValue: set });
}

/** A pill-shaped on/off toggle (like "Headshot"). */
export function toggleChip(label, on, onChange) {
  const btn = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(on) }, label);
  btn.addEventListener('click', () => {
    on = !on;
    btn.setAttribute('aria-pressed', String(on));
    onChange(on);
  });
  return btn;
}

/** "-  3  +" stepper. `format` changes how the number is shown (e.g. Roman numerals). */
export function stepper(value, { min = 0, max = 99, format = String } = {}, onChange) {
  const out = el('span', { class: 'stepper-value', 'aria-live': 'polite' }, format(value));
  const change = (d) => {
    value = Math.max(min, Math.min(max, value + d));
    out.textContent = format(value);
    onChange(value);
  };
  return el('div', { class: 'stepper' },
    el('button', { type: 'button', 'aria-label': 'Decrease', onclick: () => change(-1) }, '−'),
    out,
    el('button', { type: 'button', 'aria-label': 'Increase', onclick: () => change(1) }, '+')
  );
}

/** A file-picker button that hands back the chosen File. */
export function fileButton(label, accept, onFile) {
  const input = el('input', { type: 'file', accept, hidden: true });
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    input.value = ''; // allow picking the same file again
    if (f) onFile(f);
  });
  const btn = el('button', { type: 'button', class: 'btn', onclick: () => input.click() }, label);
  return el('span', {}, btn, input);
}

/**
 * Dropdown with icons and a search box.
 * items: [{ value, label, icon, group? }]
 */
export function picker({ items, value, onChange, placeholder = 'Choose…', iconShape = 'square', searchable = true }) {
  const btnIcon = el('img', { class: `picker-icon ${iconShape}`, alt: '' });
  const btnLabel = el('span', { class: 'picker-label' });
  const btn = el('button', { type: 'button', class: 'picker-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' }, btnIcon, btnLabel, el('span', { class: 'picker-caret', 'aria-hidden': 'true' }, '▾'));
  const search = el('input', { type: 'search', class: 'picker-search', placeholder: 'Search…', 'aria-label': 'Search' });
  const list = el('div', { class: 'picker-list', role: 'listbox' });
  const pop = el('div', { class: 'picker-pop', hidden: true }, searchable ? search : null, list);
  const root = el('div', { class: 'picker' }, btn, pop);

  function renderList() {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren();
    let lastGroup = null;
    for (const item of items) {
      if (q && !item.label.toLowerCase().includes(q)) continue;
      if (item.group && item.group !== lastGroup) {
        list.append(el('div', { class: 'picker-group' }, item.group));
        lastGroup = item.group;
      }
      list.append(
        el('button', {
          type: 'button',
          role: 'option',
          class: 'picker-item' + (item.value === value ? ' selected' : ''),
          'aria-selected': String(item.value === value),
          onclick: () => {
            setValue(item.value);
            close();
            onChange(item.value);
          },
        },
        item.icon ? el('img', { class: `picker-icon ${iconShape}`, src: item.icon, alt: '', loading: 'lazy' }) : null,
        el('span', {}, item.label))
      );
    }
    if (!list.children.length) list.append(el('div', { class: 'picker-empty' }, 'No matches'));
  }

  function open() {
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    search.value = '';
    renderList();
    if (searchable) search.focus();
    list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey);
  }
  function close() {
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey);
  }
  const onOutside = (e) => { if (!root.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') { close(); btn.focus(); } };

  btn.addEventListener('click', () => (pop.hidden ? open() : close()));
  search.addEventListener('input', renderList);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') list.querySelector('.picker-item')?.click();
  });

  function setValue(v) {
    value = v;
    const item = items.find((i) => i.value === v);
    btnLabel.textContent = item ? item.label : placeholder;
    if (item?.icon) { btnIcon.src = item.icon; btnIcon.hidden = false; } else btnIcon.hidden = true;
  }
  function setItems(next, v) {
    items = next;
    setValue(v ?? (items.some((i) => i.value === value) ? value : items[0]?.value));
    return value;
  }
  setValue(value);
  return Object.assign(root, { setValue, setItems, getValue: () => value });
}
