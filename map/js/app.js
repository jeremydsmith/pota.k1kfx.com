// States Worked Map: tap a state to color it in. Plain JS, no libraries.
(() => {
  'use strict';

  const KEY = 'k1kfxStates.v1';
  const KEY_PAST = 'k1kfxStates.showPast';   // '1' or '0': the "Past maps" switch
  const FILE_APP = 'k1kfx-states-worked';
  const HOLD_MS = 550;        // long press to remove
  const MOVE_PX = 14;         // a finger that slides this far is not a tap
  const NS = 'http://www.w3.org/2000/svg';

  // Small states get a tappable box off the East Coast: [code, column, row].
  const BOXES = [['VT', 0, 0], ['NH', 1, 0], ['MA', 0, 1], ['RI', 1, 1], ['CT', 0, 2],
    ['NJ', 1, 2], ['DE', 0, 3], ['MD', 1, 3], ['DC', 0, 4]];
  const BOX = { x: 985, y: 108, w: 56, h: 44, gap: 6 };

  const REWARDS = {
    5: 'Nice start!', 10: 'Double digits!', 15: 'Keep calling!', 20: 'Twenty states!',
    25: 'Halfway there!', 30: 'Thirty! Wow!', 35: 'On fire!', 40: 'Forty states!',
    45: 'So close!', 50: 'Fifty states!', 51: 'Every state plus DC!',
  };

  const $ = (id) => document.getElementById(id);
  const svg = $('map');

  // ── Saved data ──
  // { v: 1, current: { id, started, states: { TX: isoTime }, rewards: [5, 10] },
  //   past: [ { id, started, ended, states } ] }
  let data = load();
  let byCode = {};
  let found = null;           // state code outlined by "Find a state"
  let warnedNoSave = false;
  let showPast = loadShowPast();

  function newSession() {
    const now = new Date().toISOString();
    return { id: now, started: now, states: {}, rewards: [] };
  }
  function cleanStates(obj) {
    const out = {};
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) if (/^[A-Z]{2}$/.test(k)) out[k] = typeof v === 'string' ? v : new Date().toISOString();
    }
    return out;
  }
  function cleanSession(s, isPast) {
    if (!s || typeof s !== 'object') return null;
    const out = {
      id: String(s.id || s.started || new Date().toISOString()),
      started: String(s.started || s.id || new Date().toISOString()),
      states: cleanStates(s.states),
    };
    if (isPast) out.ended = String(s.ended || out.started);
    else out.rewards = Array.isArray(s.rewards) ? s.rewards.filter(Number.isFinite) : [];
    return out;
  }
  function cleanData(d) {
    if (!d || typeof d !== 'object') return null;
    return {
      v: 1,
      current: cleanSession(d.current, false) || newSession(),
      past: Array.isArray(d.past) ? d.past.map((s) => cleanSession(s, true)).filter(Boolean) : [],
    };
  }
  function load() {
    try {
      const d = cleanData(JSON.parse(localStorage.getItem(KEY)));
      if (d) return d;
    } catch {}
    return { v: 1, current: newSession(), past: [] };
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      if (!warnedNoSave) { warnedNoSave = true; toast("This browser can't save. Use Save to file."); }
    }
  }
  function loadShowPast() {
    try { return localStorage.getItem(KEY_PAST) !== '0'; } catch { return true; }
  }
  // Every state reached on an earlier map.
  function pastCodes() {
    const set = new Set();
    for (const s of data.past) for (const c of Object.keys(s.states)) set.add(c);
    return set;
  }
  const has = (code) => Object.prototype.hasOwnProperty.call(data.current.states, code);
  const count = () => Object.keys(data.current.states).filter((c) => byCode[c]).length;

  // ── Draw the map ──
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }

  async function init() {
    let map;
    try {
      const res = await fetch('data/states.json');
      map = await res.json();
    } catch {
      toast("Couldn't load the map. Check the connection and reload.", 8000);
      return;
    }
    const gStates = $('states'), gLabels = $('labels'), gBoxes = $('boxes'), gLeaders = $('leaders'), gFrames = $('frames');
    for (const f of map.insets) el('rect', { class: 'frame', x: f.x, y: f.y, width: f.w, height: f.h, rx: 8 }, gFrames);
    for (const s of map.states) {
      byCode[s.code] = s;
      const p = el('path', { id: 's-' + s.code, class: 'state', d: s.d, 'data-code': s.code }, gStates);
      el('title', {}, p).textContent = s.name;
      if (!s.boxed) {
        // Keyboard: Tab to a state, Enter adds it, Delete asks to remove it.
        p.setAttribute('tabindex', '0');
        p.setAttribute('role', 'button');
        p.setAttribute('aria-label', s.name);
        const t = el('text', { class: 'label', x: s.label[0], y: s.label[1], 'font-size': s.size }, gLabels);
        t.textContent = s.code;
      }
    }
    for (const [code, col, row] of BOXES) {
      const s = byCode[code];
      if (!s) continue;
      const x = BOX.x + col * (BOX.w + BOX.gap), y = BOX.y + row * (BOX.h + BOX.gap);
      el('line', { class: 'leader', x1: x, y1: y + BOX.h / 2, x2: s.label[0], y2: s.label[1] }, gLeaders);
      const g = el('g', { class: 'box', id: 'b-' + code, 'data-code': code, tabindex: '0', role: 'button', 'aria-label': s.name }, gBoxes);
      el('title', {}, g).textContent = s.name;
      el('rect', { x, y, width: BOX.w, height: BOX.h, rx: 9 }, g);
      el('text', { x: x + BOX.w / 2, y: y + BOX.h / 2 + 1 }, g).textContent = code;
    }
    render();
  }

  function render() {
    // Today's states are green. States from earlier maps are grey while the
    // "Past maps" switch is on. Green always wins.
    const past = pastCodes();
    let anyPast = false;
    for (const code in byCode) {
      const on = has(code);
      const wasPast = past.has(code);
      if (wasPast) anyPast = true;
      for (const t of [$('s-' + code), $('b-' + code)]) {
        if (!t) continue;
        t.classList.toggle('on', on);
        t.classList.toggle('past', !on && wasPast && showPast);
        if (t.hasAttribute('role')) t.setAttribute('aria-pressed', String(on));
      }
    }
    const sw = $('pastToggle');
    sw.toggleAttribute('hidden', !anyPast);   // nothing to show until a map has been finished
    sw.setAttribute('aria-checked', String(showPast));
    const n = count();
    $('countNum').textContent = n ? String(n) : '';
    $('countWord').textContent = n === 0 ? 'Tap a state!' : n === 1 ? 'state!' : 'states!';
  }

  function bump() {
    const g = $('count');
    g.classList.remove('bump');
    void g.getBoundingClientRect();
    g.classList.add('bump');
  }

  // ── Add, remove ──
  function add(code) {
    if (found === code) clearFound();
    if (has(code)) { toast(`Already got ${byCode[code].name}!`); return; }
    data.current.states[code] = new Date().toISOString();
    save();
    render();
    bump();
    if (count() === 1 && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    const n = count();
    if (REWARDS[n] && !data.current.rewards.includes(n)) {
      data.current.rewards.push(n);
      save();
      reward(n === 51 ? 'All 51!' : `${n} states!`, REWARDS[n]);
    }
  }
  function remove(code) {
    delete data.current.states[code];
    save();
    render();
  }

  // ── Taps and long presses ──
  const presses = new Map();
  const codeAt = (e) => { const t = e.target.closest && e.target.closest('[data-code]'); return t ? t.dataset.code : null; };

  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const code = codeAt(e);
    if (!code) return;
    // With the Find box open, a tap on the map only puts the box (and the
    // on-screen keyboard) away, so nothing gets added by accident.
    if (!findBox.hidden) { closeFind(); return; }
    // Keep getting this pointer's events even if it slides off the map, so a
    // press can never be left hanging with its timer running.
    try { svg.setPointerCapture(e.pointerId); } catch {}
    const p = { code, x: e.clientX, y: e.clientY, timer: 0, done: false };
    if (has(code)) {
      showRing(e.clientX, e.clientY);
      p.timer = setTimeout(() => { p.done = true; askRemove(code); }, HOLD_MS);
    }
    presses.set(e.pointerId, p);
  });
  svg.addEventListener('pointermove', (e) => {
    const p = presses.get(e.pointerId);
    if (p && !p.done && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_PX) endPress(e.pointerId, true);
  });
  svg.addEventListener('pointerup', (e) => {
    const p = presses.get(e.pointerId);
    if (!p) return;
    const done = p.done;
    endPress(e.pointerId, false);
    if (!done) add(p.code);
  });
  svg.addEventListener('pointercancel', (e) => endPress(e.pointerId, true));
  svg.addEventListener('lostpointercapture', (e) => endPress(e.pointerId, true));
  // Leaving the page mid-press (app switcher, notification) drops every press.
  addEventListener('blur', () => { for (const id of [...presses.keys()]) endPress(id, true); });

  // Keyboard: Enter or Space adds the focused state, Delete asks to remove it.
  svg.addEventListener('keydown', (e) => {
    const code = codeAt(e);
    if (!code || e.repeat) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(code); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && has(code)) { e.preventDefault(); askRemove(code); }
  });
  // A blue outline follows keyboard focus (never shown for taps).
  svg.addEventListener('focusin', (e) => {
    const t = e.target;
    const show = t.classList.contains('state') && t.matches(':focus-visible');
    $('focusRing').setAttribute('d', show ? byCode[t.dataset.code].d : '');
  });
  svg.addEventListener('focusout', () => $('focusRing').setAttribute('d', ''));

  // "Past maps" switch
  const pastToggle = $('pastToggle');
  function flipPast() {
    showPast = !showPast;
    try { localStorage.setItem(KEY_PAST, showPast ? '1' : '0'); } catch {}
    render();
  }
  pastToggle.addEventListener('click', flipPast);
  pastToggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) flipPast(); }
  });
  // Right-click on a laptop, or the system long press on a touch screen.
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const code = codeAt(e);
    if (code && has(code)) askRemove(code);
  });

  function endPress(id, cancel) {
    const p = presses.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    if (cancel) p.done = true;
    presses.delete(id);
    hideRing();
  }
  function showRing(x, y) {
    const r = $('ring');
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    r.style.setProperty('--hold', HOLD_MS + 'ms');
    r.hidden = false;
    r.classList.remove('go');
    void r.offsetWidth;
    r.classList.add('go');
  }
  function hideRing() { $('ring').hidden = true; $('ring').classList.remove('go'); }

  async function askRemove(code) {
    for (const p of presses.values()) { p.done = true; clearTimeout(p.timer); }
    hideRing();
    if ($('ask').open) return;
    const name = byCode[code].name;
    const back = showPast && pastCodes().has(code) ? 'grey' : 'white';
    if (await ask(`Remove ${name}?`, `${name} will turn ${back} again.`, 'Remove', 'Keep')) remove(code);
  }

  // ── Find a state ──
  const findBox = $('find'), findInput = $('findInput'), findResults = $('findResults');
  $('findBtn').addEventListener('click', () => {
    findBox.hidden = false;
    findInput.value = '';
    findResults.replaceChildren();
    findInput.focus();
  });
  $('findClose').addEventListener('click', closeFind);
  function closeFind() { findBox.hidden = true; findInput.blur(); }

  function matches(q) {
    q = q.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!q) return [];
    const list = Object.values(byCode);
    const out = [];
    const push = (s) => { if (s && !out.includes(s)) out.push(s); };
    if (q.length === 2) push(list.find((s) => s.code.toLowerCase() === q));
    list.filter((s) => s.name.toLowerCase().startsWith(q)).forEach(push);
    list.filter((s) => s.name.toLowerCase().split(' ').some((w) => w.startsWith(q))).forEach(push);
    return out.slice(0, 4);
  }
  findInput.addEventListener('input', () => {
    const q = findInput.value.trim();
    const m = matches(q);
    if (m.length === 1 && q.length >= 3) { pick(m[0].code); return; }
    findResults.replaceChildren(...m.map((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s.name;
      const small = document.createElement('small');
      small.textContent = s.code;
      b.appendChild(small);
      b.addEventListener('click', () => pick(s.code));
      return b;
    }));
    if (q && !m.length) {
      const none = document.createElement('div');
      none.className = 'none';
      none.textContent = 'No state matches that.';
      findResults.appendChild(none);
    }
  });
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const m = matches(findInput.value); if (m.length) pick(m[0].code); }
    if (e.key === 'Escape') closeFind();
  });

  function pick(code) {
    closeFind();
    clearFound();
    found = code;
    const targets = [$('s-' + code), $('b-' + code)].filter(Boolean);
    for (const t of targets) {
      t.classList.remove('flash');
      void t.getBoundingClientRect();
      t.classList.add('flash');
    }
    // The outline is its own copy of the state's shape, drawn above the labels.
    $('foundRing').setAttribute('d', byCode[code].d);
    const b = $('b-' + code);
    if (b) b.classList.add('found');
    if (has(code)) toast(`Already got ${byCode[code].name}!`);
  }
  function clearFound() {
    if (!found) return;
    const b = $('b-' + found);
    if (b) b.classList.remove('found');
    $('foundRing').setAttribute('d', '');
    found = null;
  }
  svg.addEventListener('animationend', (e) => {
    const t = e.target.closest && e.target.closest('.flash');
    if (t) t.classList.remove('flash');
  });

  // ── Menu ──
  const menu = $('menu');
  $('menuBtn').addEventListener('click', () => { updateFullLabel(); menu.showModal(); });
  menu.addEventListener('click', async (e) => {
    if (e.target === menu) { menu.close(); return; } // tap outside the sheet
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    menu.close();
    if (act === 'fresh') startFresh();
    if (act === 'save') saveFile();
    if (act === 'load') $('fileInput').click();
    if (act === 'full') toggleFull();
  });

  async function startFresh() {
    const n = count();
    const text = n
      ? `Today's ${n} ${n === 1 ? 'state' : 'states'} will be saved as a past map, and a new map starts.`
      : 'The map is already empty.';
    if (!n) { toast(text); return; }
    if (!(await ask('Start a new map?', text, 'Start fresh', 'Cancel'))) return;
    const s = data.current;
    data.past.push({ id: s.id, started: s.started, ended: new Date().toISOString(), states: s.states });
    data.current = newSession();
    clearFound();
    save();
    render();
    toast('New map. Have fun!');
  }

  function localDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function saveFile() {
    const body = JSON.stringify({ app: FILE_APP, v: 1, saved: new Date().toISOString(), current: data.current, past: data.past }, null, 1);
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `states-${localDate()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Saved to Downloads.');
  }

  $('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let incoming;
    try {
      const raw = JSON.parse(await file.text());
      if (raw.app !== FILE_APP) throw new Error('not ours');
      incoming = cleanData(raw);
      for (const s of [incoming.current, ...incoming.past]) {
        for (const c of Object.keys(s.states)) if (!byCode[c]) delete s.states[c];
      }
    } catch {
      toast("That isn't a States Worked Map file.");
      return;
    }
    const n = Object.keys(incoming.current.states).filter((c) => byCode[c]).length;
    const ok = await ask('Load this file?', `Its map has ${n} ${n === 1 ? 'state' : 'states'}. It replaces the map on screen. Past maps from the file are added to the past maps here.`, 'Load', 'Cancel');
    if (!ok) return;
    const ids = new Set(data.past.map((s) => s.id));
    for (const s of incoming.past) if (!ids.has(s.id)) data.past.push(s);
    data.current = incoming.current;
    clearFound();
    save();
    render();
    toast('Loaded.');
  });

  function updateFullLabel() {
    const b = $('fullBtn');
    b.hidden = !document.fullscreenEnabled;
    b.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
  }
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => toast("Full screen isn't available here."));
  }

  // ── Confirm dialog (resolves true or false) ──
  function ask(title, text, yes, no) {
    const d = $('ask');
    if (d.open) return Promise.resolve(false);   // one question at a time
    $('askTitle').textContent = title;
    $('askText').textContent = text;
    $('askYes').textContent = yes;
    $('askNo').textContent = no;
    return new Promise((resolve) => {
      const done = (v) => {
        $('askYes').onclick = $('askNo').onclick = d.onclick = d.oncancel = null;
        if (d.open) d.close();
        resolve(v);
      };
      $('askYes').onclick = () => done(true);
      $('askNo').onclick = () => done(false);
      d.onclick = (e) => { if (e.target === d) done(false); };
      d.oncancel = () => done(false);
      d.showModal();
      $('askNo').focus();
    });
  }

  // ── Toast and reward ──
  let toastTimer = 0;
  function toast(msg, ms = 2200) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }
  let rewardTimer = 0;
  function reward(big, small) {
    const r = $('reward');
    $('rewardBig').textContent = big;
    $('rewardSmall').textContent = small;
    r.hidden = false;
    r.classList.remove('show');
    void r.offsetWidth;
    r.classList.add('show');
    clearTimeout(rewardTimer);
    rewardTimer = setTimeout(() => { r.hidden = true; r.classList.remove('show'); }, 3000);
  }

  // ── Small screens ──
  if (Math.min(innerWidth, innerHeight) < 500) $('phoneNote').hidden = false;
  $('phoneNoteClose').addEventListener('click', () => { $('phoneNote').hidden = true; });

  // Another tab or window changed the saved map: show it.
  addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== KEY_PAST && e.key !== null) return;
    data = load();
    showPast = loadShowPast();
    render();
  });

  // Works offline after the first visit.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  init();
})();
