// نظمها — المال: the money section as a plain web app (no Flutter), for
// iPhone from the home screen. Same screens, data shape and backup files as
// the app. Everything renders from the in-memory store into HTML strings.

import { ICONS } from './icons.js';
import * as S from './store.js';

const { Dates, Money, EntryType, DebtDir } = S;

// ------------------------------------------------------------------ helpers

const C = {
  primary: '#2563eb', ink: '#13234b', muted: '#6b7a99', faint: '#a3aec4', green: '#16a34a', red: '#ef4444',
  orange: '#f59e0b', purple: '#8b5cf6', teal: '#14b8a6', blue: '#3b82f6', sky: '#0ea5e9',
};

const CAT_ICONS = {
  food: 'restaurant', coffee: 'local_cafe', transport: 'directions_car', subscription: 'play_circle_fill',
  bills: 'receipt_long', electric: 'bolt', water: 'water_drop', home: 'home', shopping: 'shopping_bag',
  cart: 'shopping_cart', health: 'favorite', fun: 'celebration', education: 'school', salary: 'account_balance_wallet',
  freelance: 'laptop_mac', gift: 'card_giftcard', savings: 'savings', travel: 'flight_takeoff', car: 'directions_car_filled',
  phone: 'smartphone', other: 'category', person: 'person', group: 'groups',
};
const CATEGORY_CHOICES = ['food', 'coffee', 'transport', 'subscription', 'bills', 'electric', 'water', 'home', 'shopping', 'cart', 'health', 'fun', 'education', 'salary', 'freelance', 'gift', 'savings', 'travel', 'car', 'phone', 'other'];
const PALETTE = [0xff3b82f6, 0xff8b5cf6, 0xff14b8a6, 0xfff59e0b, 0xffef4444, 0xffec4899, 0xff22c55e, 0xfff97316, 0xff6366f1, 0xff64748b];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const glyph = (name) => `&#x${(ICONS[name] ?? ICONS.circle).toString(16)};`;
const ic = (name, style = '') => `<i class="ic"${style ? ` style="${style}"` : ''}>${glyph(name)}</i>`;
const appIcon = (key) => CAT_ICONS[key] || 'circle';
const intHex = (c) => '#' + (Number(c) & 0xffffff).toString(16).padStart(6, '0');
function tint(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v) => Math.round(v * a + 255 * (1 - a));
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}
const pct = (x) => Math.round(x * 100);
const fmt = Money.format;
const num = (minor) => `<span class="num">${Money.number(minor)}</span>`;
const money = (minor, cur) => `<span class="num">${Money.number(minor)}</span> ${Money.symbol(cur)}`;

// ------------------------------------------------------------------ events
// Handlers are registered per render ("scope") and found by id on click /
// input / change, so the HTML stays plain strings.

let scope = 'page';
let seq = 0;
const acts = {};
function reg(fn) {
  const id = `${scope}:${++seq}`;
  (acts[scope] ||= new Map()).set(id, fn);
  return id;
}
const on = (fn) => `data-a="${reg(fn)}"`;
const onInput = (fn) => `data-i="${reg(fn)}"`;
const onChange = (fn) => `data-c="${reg(fn)}"`;
const handler = (id) => (id ? acts[id.split(':')[0]]?.get(id) : null);
function withScope(sc, fn) {
  const prev = scope;
  scope = sc;
  acts[sc] = new Map();
  try { return fn(); } finally { scope = prev; }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = handler(el.dataset.a);
  if (fn) fn(e, el);
});
document.addEventListener('input', (e) => {
  const fn = handler(e.target.dataset?.i);
  if (fn) fn(e.target.value, e.target);
});
document.addEventListener('change', (e) => {
  const fn = handler(e.target.dataset?.c);
  if (fn) fn(e.target.value, e.target);
});

// ------------------------------------------------------------------ routing

const app = document.getElementById('app');
const ui = { month: Dates.monthStart(new Date()), cur: null, txFilter: 0, debtFilter: 0, query: '', catFilter: null };
const currency = () => ui.cur || S.baseCurrency();

function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path, q: new URLSearchParams(qs || ''), key: h };
}

let depth = 0;
function go(path, { replace = false } = {}) {
  if (replace) location.replace('#' + path);
  else { depth++; location.hash = path; }
}
function goBack() {
  if (depth > 0) { depth--; history.back(); } else go('/', { replace: true });
}
window.addEventListener('hashchange', () => render());

let lastKey = null;
function render() {
  const r = route();
  const same = r.key === lastKey;
  const y = window.scrollY;
  let html;
  withScope('page', () => {
    try { html = view(r); } catch (err) {
      console.error(err);
      html = `<div class="page"><div class="content"><div class="card msg err" style="margin-top:60px">حصلت مشكلة: ${esc(err.message)}</div></div></div>`;
    }
  });
  app.innerHTML = html;
  fitText(app);
  if (same) {
    app.firstElementChild?.classList.add('static');
    window.scrollTo(0, y);
  } else {
    window.scrollTo(0, 0);
  }
  lastKey = r.key;
}

function view(r) {
  const p = r.path;
  if (p === '/debts') return moneyPage(1);
  if (p === '/transactions') return transactionsPage();
  if (p === '/add') return addPage(r);
  let m;
  if ((m = p.match(/^\/debt\/(\d+)$/))) return debtDetail(+m[1]);
  if ((m = p.match(/^\/plan\/(\d+)$/))) return planDetail(+m[1]);
  if ((m = p.match(/^\/assoc\/(\d+)$/))) return assocDetail(+m[1]);
  return moneyPage(0);
}

// ------------------------------------------------------------------ shared pieces

const LANDSCAPE = `<svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfeafd"/><stop offset="1" stop-color="#f3f6fc"/></linearGradient>
<radialGradient id="sun"><stop offset="0" stop-color="#ffe8a3"/><stop offset=".45" stop-color="#fde68a" stop-opacity=".9"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/></radialGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".5" stop-color="#f3f6fc" stop-opacity="0"/><stop offset="1" stop-color="#f3f6fc"/></linearGradient>
</defs>
<rect width="400" height="220" fill="url(#sky)"/>
<circle cx="168" cy="62" r="54" fill="url(#sun)"/><circle cx="168" cy="62" r="21" fill="#fcd96b"/>
<g fill="#fff" opacity=".95"><ellipse cx="40" cy="26" rx="20" ry="8"/><ellipse cx="52" cy="21" rx="12" ry="9"/><ellipse cx="300" cy="18" rx="16" ry="6"/><ellipse cx="309" cy="14" rx="9" ry="7"/></g>
<path d="M0 150 Q 90 108 190 138 T 400 118 V220 H0Z" fill="#d9e4f7"/>
<path d="M0 172 Q 130 138 260 166 T 400 156 V220 H0Z" fill="#e5ecf9"/>
<path d="M0 178 Q 70 160 170 182 V220 H0Z" fill="#cfe7d5" opacity=".85"/>
<g fill="#5b9f78"><path d="M24 182 L44 118 L64 182Z"/><path d="M52 182 L76 98 L100 182Z"/><path d="M92 184 L108 132 L124 184Z"/></g>
<g fill="#4a8f69"><path d="M44 118 L64 182 L44 182Z"/><path d="M76 98 L100 182 L76 182Z"/><path d="M108 132 L124 184 L108 184Z"/></g>
<rect width="400" height="220" fill="url(#fade)"/>
</svg>`;

function hero({ title, subtitle, icon, color = C.primary, back = false }) {
  return `<header class="hero"><div class="hero-bg">${LANDSCAPE}</div><div class="hero-inner">
    <div class="hero-top">
      ${back ? `<button class="circle-btn" aria-label="رجوع" ${on(goBack)}>${ic('arrow_forward')}</button>` : '<img class="wordmark" src="brand/wordmark.png" alt="نظمها">'}
      <button class="circle-btn" aria-label="نقل البيانات" ${on(openBackup)}>${ic('import_export')}</button>
    </div>
    <div class="hero-title"><div class="badge" style="background:${color}">${ic(icon)}</div>
      <div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div></div>
  </div></header>`;
}

function appbar(title, actions = '') {
  return `<div class="appbar"><div class="appbar-inner">
    <button class="icon-btn" aria-label="رجوع" ${on(goBack)}>${ic('arrow_forward')}</button>
    <h2 class="ellipsis">${esc(title)}</h2>${actions}</div></div>`;
}

function pillTabs(items, selected, onPick, cls = '') {
  return `<div class="tabs ${cls}">${items.map((it, i) => {
    const label = typeof it === 'string' ? it : it.label;
    const icon = typeof it === 'string' ? '' : it.icon ? ic(it.icon) : '';
    return `<button class="${i === selected ? 'on' : ''}" ${on(() => onPick(i))}>${icon}<span>${esc(label)}</span></button>`;
  }).join('')}</div>`;
}

function sectionTitle(title, icon, { action, onAction, color } = {}) {
  return `<div class="section-title">${ic(icon, color ? `color:${color}` : '')}<h3>${esc(title)}</h3>${action ? `<button class="pill-link" ${on(onAction)}>${esc(action)}${ic('chevron_left')}</button>` : ''}</div>`;
}

const empty = (text, icon) => `<div class="empty">${ic(icon)}${esc(text)}</div>`;

function progress(value, color, thick = false) {
  const w = Math.max(0, Math.min(1, value)) * 100;
  return `<div class="progress ${thick ? 'thick' : ''}"><div style="width:${w}%;background:${color}"></div></div>`;
}

function changeLabel(p, goodWhenUp = true) {
  if (p == null) return '<span class="faint">—</span>';
  const up = p >= 0;
  const color = p === 0 ? C.muted : up === goodWhenUp ? C.green : C.red;
  return `<span class="change" style="color:${color}">${ic(up ? 'arrow_upward' : 'arrow_downward')}<span class="num">${Math.abs(p)}%</span></span>`;
}

function stat({ label, icon, color, value, unit, foot = '' }) {
  return `<div class="stat" style="background:${tint(color, 0.08)};border:1px solid ${tint(color, 0.18)}">
    <div class="top"><span style="color:${color}">${esc(label)}</span><i class="ic" style="background:${color}">${glyph(icon)}</i></div>
    <div class="val fit"><b class="num">${value}</b>${unit ? `<small>${esc(unit)}</small>` : ''}</div>
    <div class="foot">${foot}</div></div>`;
}

const STATUS = {
  upcoming: ['جاي', C.blue, 'schedule'],
  partial: ['مدفوع جزئياً', C.orange, 'timelapse'],
  late: ['متأخر', C.red, 'error'],
  done: ['مكتمل', C.green, 'check_circle'],
};
function statusChip(s) {
  const [label, color, icon] = STATUS[s];
  return `<span class="status" style="background:${tint(color, 0.12)};color:${color}">${ic(icon)}${label}</span>`;
}

/** Shrinks numbers that don't fit their box (like Flutter's FittedBox). */
function fitText(root) {
  for (const el of root.querySelectorAll('.fit')) {
    el.style.fontSize = '';
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth + 0.5 && size > 9) {
      size -= 0.5;
      el.style.fontSize = size + 'px';
    }
  }
}
window.addEventListener('resize', () => fitText(app));
// The Arabic web font is wider than the fallback: measure again once it's in.
document.fonts?.ready.then(() => fitText(app));
document.fonts?.addEventListener?.('loadingdone', () => fitText(app));

// ------------------------------------------------------------------ toast

let toastTimer = null;
function toast(text, { action, ms = 2600 } = {}) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(text)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) {
    el.querySelector('button').addEventListener('click', () => { el.remove(); action.fn(); });
  }
  document.body.appendChild(el);
  toastTimer = setTimeout(() => el.remove(), action ? 6000 : ms);
}

/** Offers to also log a debt payment as income/expense (never forced). */
function offerMirror(opts) {
  toast(`اتسجل ✓ — تحب تضيفه ${opts.income ? 'للدخل' : 'للمصروف'} كمان؟`, {
    action: { label: 'ضيفه', fn: () => { S.mirror(opts); toast('اتضاف ✓'); } },
  });
}

// ------------------------------------------------------------------ sheets

let sheetSeq = 0;
const openSheets = [];

/** Bottom sheet; [build] returns its HTML. Resolves with the value passed to close(). */
function sheet(build, { onKey } = {}) {
  return new Promise((resolve) => {
    const sc = 's' + ++sheetSeq;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"></div>';
    const el = overlay.firstChild;
    let closed = false;
    const keyHandler = (e) => onKey?.(e, api);
    const api = {
      el,
      render() { withScope(sc, () => { el.innerHTML = '<div class="grabber"></div>' + build(api); }); },
      /** Registers handlers for HTML added later inside this sheet. */
      scoped: (fn) => { const prev = scope; scope = sc; try { return fn(); } finally { scope = prev; } },
      close(value = null) {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', keyHandler);
        overlay.classList.add('closing');
        setTimeout(() => {
          overlay.remove();
          delete acts[sc];
          openSheets.splice(openSheets.indexOf(api), 1);
          if (!openSheets.length) document.body.style.overflow = '';
        }, 190);
        resolve(value);
      },
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) api.close(); });
    if (onKey) document.addEventListener('keydown', keyHandler);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    openSheets.push(api);
    api.render();
  });
}

function confirmSheet(title, message = '', ok = 'حذف') {
  return sheet((api) => `<h3>${esc(title)}</h3>${message ? `<p class="muted" style="margin:4px 0 0;white-space:pre-line">${esc(message)}</p>` : ''}
    <div class="actions"><button class="btn outline" ${on(() => api.close(false))}>إلغاء</button>
    <button class="btn primary" style="background:${C.red};box-shadow:none" ${on(() => api.close(true))}>${esc(ok)}</button></div>`)
    .then((v) => v === true);
}

// ------------------------------------------------------------------ calculator

class Calc {
  constructor(initial = '') { this.expr = Money.normalize(initial).replace(/\s/g, ''); }
  get current() { const i = Math.max(...['+', '-', '*', '/'].map((o) => this.expr.lastIndexOf(o))); return i < 0 ? this.expr : this.expr.slice(i + 1); }
  get endsWithOp() { return this.expr && '+-*/'.includes(this.expr[this.expr.length - 1]); }
  digit(d) { if (this.current === '0') this.expr = this.expr.slice(0, -1) + d; else this.expr += d; }
  doubleZero() { const c = this.current; if (c && c !== '0') this.expr += '00'; }
  dot() { const c = this.current; if (!c.includes('.')) this.expr += c ? '.' : '0.'; }
  op(o) {
    if (!this.expr) return;
    if (this.endsWithOp) this.expr = this.expr.slice(0, -1);
    if (this.expr.endsWith('.')) this.expr = this.expr.slice(0, -1);
    this.expr += o;
  }
  backspace() { this.expr = this.expr.slice(0, -1); }
  clear() { this.expr = ''; }
  get value() { return this.expr ? Money.evaluate(this.expr) : null; }
  get hasOperator() { return /\d[-+*/]\d/.test(this.expr); }
  equals() { const v = this.value; if (v == null || v < 0) return false; this.expr = Calc.plain(v); return true; }
  static plain(v) {
    const r = Math.round(v * 100) / 100;
    return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '');
  }
  get display() { return this.expr.replace(/[-+*/]/g, (m) => ` ${{ '+': '+', '-': '−', '*': '×', '/': '÷' }[m]} `); }
}

/** Calculator keypad; resolves with plain text ("80", "12.5"), "" when cleared, null when dismissed. */
function calculator({ initial = '', cur, title }) {
  const calc = new Calc(initial);
  let error = false;
  const display = () => {
    const v = calc.value;
    const showRes = calc.hasOperator;
    const bad = error || (showRes && (v == null || v < 0));
    return `<div class="expr ${calc.expr ? '' : 'empty'}">${calc.expr ? esc(calc.display) : '0'}</div>
      <div class="res ${bad ? 'bad' : showRes ? 'ok' : ''}">${bad ? 'العملية مش مظبوطة' : showRes ? `= ${esc(fmt(Math.round(v * 100), cur))}` : esc(Money.symbol(cur))}</div>`;
  };
  let api;
  const refresh = () => { api.el.querySelector('.calc-display').innerHTML = display(); };
  const press = (fn) => () => { error = false; fn(); refresh(); };
  const done = () => {
    if (!calc.expr) return api.close('');
    const v = calc.value;
    if (v == null || v < 0) { error = true; return refresh(); }
    api.close(Calc.plain(v));
  };
  const eq = () => { error = !calc.equals() && !!calc.expr; };
  return sheet((a) => {
    api = a;
    const k = (label, fn, cls = '') => `<button class="${cls}" ${on(press(fn))}>${label}</button>`;
    return `${title ? `<h3>${esc(title)}</h3><div class="gap8"></div>` : ''}
      <div class="calc-display">${display()}</div>
      <div class="keys">
        ${k('C', () => calc.clear(), 'clr')}${k(ic('backspace_outlined'), () => calc.backspace())}${k('÷', () => calc.op('/'), 'op')}${k('×', () => calc.op('*'), 'op')}
        ${['7', '8', '9'].map((d) => k(d, () => calc.digit(d))).join('')}${k('−', () => calc.op('-'), 'op')}
        ${['4', '5', '6'].map((d) => k(d, () => calc.digit(d))).join('')}${k('+', () => calc.op('+'), 'op')}
        ${['1', '2', '3'].map((d) => k(d, () => calc.digit(d))).join('')}${k('=', eq, 'op')}
        ${k('00', () => calc.doubleZero())}${k('0', () => calc.digit('0'))}${k('.', () => calc.dot())}
        <button class="done" ${on(done)}>تم</button>
      </div>`;
  }, {
    // Typing on a computer keyboard works too.
    onKey(e) {
      const key = e.key;
      if (/^\d$/.test(key)) press(() => calc.digit(key))();
      else if ('+-*/'.includes(key) && key.length === 1) press(() => calc.op(key))();
      else if (key === '.' || key === ',') press(() => calc.dot())();
      else if (key === 'Backspace') press(() => calc.backspace())();
      else if (key === 'Enter') done();
      else if (key === '=') press(eq)();
      else if (key === 'Escape') api.close();
      else return;
      e.preventDefault();
    },
  });
}

/** Asks for an amount with the calculator; minor units, 0 when cleared, null when dismissed. */
function askAmount(title, cur, initial = null) {
  return calculator({ initial: initial ? Money.editable(initial) : '', cur, title }).then((r) => (r == null ? null : r === '' ? 0 : Money.parse(r)));
}

function pickCurrencyCode(current) {
  return sheet((api) => `<h3>اختار العملة</h3><div class="gap8"></div>${S.CURRENCIES.map((c) => `
    <div class="list-item" ${on(() => api.close(c.code))}>
      <div class="badge" style="background:var(--blue-tint);color:var(--ink);font-weight:700;font-size:13px">${esc(c.symbol)}</div>
      <div class="grow t">${esc(c.name)}</div>${c.code === current ? ic('check', `color:${C.primary}`) : ''}</div>`).join('')}`);
}

/** The money page's currency: pick one to view, or make it the main one. */
function pickCurrency() {
  const base = S.baseCurrency();
  const cur = currency();
  sheet((api) => `<h3>اختار العملة</h3><div class="gap8"></div>${S.CURRENCIES.map((c) => `
    <div class="list-item" ${on(() => { ui.cur = c.code === base ? null : c.code; api.close(); render(); })}>
      <div class="badge" style="background:var(--blue-tint);color:var(--ink);font-weight:700;font-size:13px">${esc(c.symbol)}</div>
      <div class="grow"><div class="t">${esc(c.name)}</div>${c.code === base ? '<div class="s">العملة الأساسية</div>' : ''}</div>
      ${c.code === cur ? ic('check', `color:${C.primary}`) : ''}
      ${c.code !== base ? `<button class="pill-link" ${on((e) => { e.stopPropagation(); S.setSetting('currency', c.code); ui.cur = null; api.close(); toast(`بقت ${c.name} العملة الأساسية`); })}>خليها الأساسية</button>` : ''}
    </div>`).join('')}`);
}

// ------------------------------------------------------------------ money page

function moneyPage(tab) {
  return `<div class="page">${hero({
    title: tab === 0 ? 'المال' : 'الديون والأقساط',
    subtitle: tab === 0 ? 'دخلك ومصروفك وادخارك في مكان واحد' : 'تابع ديونك وأقساطك وجمعياتك',
    icon: tab === 0 ? 'account_balance_wallet' : 'handshake',
  })}<div class="content">
    ${pillTabs([{ label: 'المعاملات', icon: 'receipt_long' }, { label: 'الديون والأقساط', icon: 'handshake' }], tab, (i) => go(i === 0 ? '/' : '/debts', { replace: true }))}
    <div class="gap12"></div>${tab === 0 ? transactionsTab() : debtsTab()}</div></div>`;
}

function monthBar() {
  const isCurrent = ui.month.getTime() === Dates.monthStart(new Date()).getTime();
  const shift = (n) => () => { ui.month = Dates.addMonths(ui.month, n); render(); };
  return `<div class="monthbar"><div class="bar">
      <button aria-label="الشهر اللي فات" ${on(shift(-1))}>${ic('chevron_right')}</button>
      <b>${Dates.monthYear(ui.month)}</b>
      <button aria-label="الشهر الجاي" ${isCurrent ? 'disabled' : ''} ${on(shift(1))}>${ic('chevron_left')}</button>
    </div><button class="action-pill" ${on(pickCurrency)}>${ic('currency_exchange')}<span>${esc(Money.symbol(currency()))}</span></button></div>`;
}

function transactionsTab() {
  const cur = currency();
  const m = ui.month;
  const entries = S.range(m, Dates.addMonths(m, 1), cur);
  const now = S.summary(entries);
  const prev = S.summary(S.range(Dates.addMonths(m, -1), m, cur));
  const sym = Money.symbol(cur);
  const cats = S.categoryMap();
  const filtered = entries.filter((e) => [true, e.type === EntryType.income, e.type === EntryType.expense, e.type === EntryType.saving][ui.txFilter]);

  return `${monthBar()}<div class="gap12"></div>
    <div class="stats">
      ${stat({ label: 'الدخل', icon: 'north_east', color: C.blue, value: Money.number(now.income), unit: sym, foot: changeLabel(S.change(now.income, prev.income)) })}
      ${stat({ label: 'المصروف', icon: 'south', color: C.red, value: Money.number(now.expense), unit: sym, foot: changeLabel(S.change(now.expense, prev.expense), false) })}
      ${stat({ label: 'الادخار', icon: 'savings', color: C.green, value: Money.number(now.saving), unit: sym, foot: changeLabel(S.change(now.saving, prev.saving)) })}
      ${stat({ label: 'المتبقي', icon: 'account_balance_wallet', color: C.purple, value: Money.number(now.remaining), unit: sym, foot: now.income === 0 ? '—' : `<span class="num">${Math.round((now.remaining * 100) / now.income)}%</span> من الدخل` })}
    </div>
    <div class="gap14"></div>
    <div class="grid2">${budgetCard(now.expense, cur)}${breakdownCard(entries, cur, cats)}</div>
    <div class="gap14"></div>${goalsSection()}<div class="gap14"></div>
    <div class="card">
      ${sectionTitle('حركة الفلوس', 'swap_vert', { action: 'عرض الكل', onAction: () => go('/transactions') })}
      <div class="gap12"></div>
      ${pillTabs(['الكل', 'الدخل', 'المصروف', 'الادخار'], ui.txFilter, (i) => { ui.txFilter = i; render(); }, 'soft')}
      <div class="gap8"></div>
      ${filtered.length ? filtered.slice(0, 8).map((e) => txTile(e, cats)).join('') : empty('مفيش معاملات في الشهر ده', 'receipt_long')}
    </div>
    <div class="gap16"></div>
    <button class="btn primary" ${on(() => go('/add?type=expense'))}>${ic('add_circle')}إضافة معاملة</button>`;
}

function budgetCard(spent, cur) {
  const budget = S.budgetOf(cur);
  const has = budget != null && budget > 0;
  const ratio = has ? spent / budget : 0;
  const color = ratio >= 1 ? C.red : ratio >= 0.8 ? C.orange : C.primary;
  const edit = async () => {
    const v = await askAmount(`ميزانية الشهر (${Money.of(cur).name})`, cur, budget);
    if (v == null) return;
    if (v === 0) S.removeSetting(`budget_${cur}`);
    else S.setSetting(`budget_${cur}`, v);
  };
  return `<div class="card">${sectionTitle('الميزانية الشهرية', 'bar_chart', { action: has ? 'تعديل الميزانية' : 'حدد ميزانية', onAction: edit })}
    <div class="gap12"></div>
    ${!has ? '<div class="muted">حدد ميزانية للشهر وتابع صرفت قد إيه منها</div>' : `
      <div class="row" style="align-items:flex-end">
        <b class="num" style="font-size:32px;line-height:1;color:${color}">${pct(ratio)}%</b><span class="muted">اتصرف</span>
        <span class="grow" style="text-align:left;font-weight:600">${num(spent)} / ${money(budget, cur)}</span>
      </div><div class="gap8"></div>${progress(ratio, color, true)}<div class="gap12"></div>
      <div class="mini-boxes">
        <div class="mini" style="background:${tint(C.red, 0.08)}"><span>المصروف</span><b class="fit" style="color:${C.red}">${money(spent, cur)}</b></div>
        <div class="mini" style="background:${tint(budget >= spent ? C.green : C.red, 0.08)}"><span>${budget >= spent ? 'المتبقي' : 'زيادة عن الميزانية'}</span><b class="fit" style="color:${budget >= spent ? C.green : C.red}">${money(Math.abs(budget - spent), cur)}</b></div>
      </div>`}</div>`;
}

function breakdownCard(entries, cur, cats) {
  const byCat = new Map();
  let total = 0;
  for (const e of entries) {
    if (e.type !== EntryType.expense) continue;
    const k = e.categoryId ?? -1;
    byCat.set(k, (byCat.get(k) || 0) + e.amount);
    total += e.amount;
  }
  const rows = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const colorOf = (k) => (cats.get(k) ? intHex(cats.get(k).color) : '#94a3b8');
  let body;
  if (!rows.length) body = empty('لما تسجل مصروفات هتشوف بتروح فين', 'pie_chart');
  else {
    // Donut: one arc per category, clockwise from the top, 2px gaps.
    const r = 56, circ = 2 * Math.PI * r;
    let offset = 0;
    const arcs = rows.map(([k, v]) => {
      const len = (v / total) * circ;
      const gap = rows.length > 1 ? Math.min(2, len / 2) : 0;
      const a = `<circle cx="66" cy="66" r="${r}" fill="none" stroke="${colorOf(k)}" stroke-width="20" stroke-dasharray="${Math.max(len - gap, 0.01)} ${circ}" stroke-dashoffset="${-offset}"/>`;
      offset += len;
      return a;
    }).join('');
    body = `<div class="breakdown"><div class="legend">${rows.slice(0, 6).map(([k, v]) => `
      <div class="legend-row"><span class="dot" style="background:${colorOf(k)}"></span>
        <div class="grow"><div class="bold" style="font-size:13.5px">${esc(cats.get(k)?.name || 'بدون فئة')}</div><div class="small muted">${money(v, cur)}</div></div>
        <b class="num">${Math.round((v * 100) / total)}%</b></div>`).join('')}</div>
      <div class="donut"><svg viewBox="0 0 132 132" width="132" height="132"><g transform="rotate(-90 66 66)">${arcs}</g></svg>
        <div class="mid"><b class="num fit">${Money.number(total)}</b><span>${esc(Money.symbol(cur))}</span></div></div></div>`;
  }
  return `<div class="card">${sectionTitle('تفاصيل المصروفات', 'donut_large')}<div class="gap12"></div>${body}</div>`;
}

function goalsSection() {
  const goals = S.goals();
  const saved = S.goalSaved();
  if (!goals.length) {
    return `<div class="card green tap" ${on(() => editGoal())}><div class="row">
      <div class="badge" style="background:${C.green};width:50px;height:50px;border-radius:15px">${ic('savings')}</div>
      <div class="grow"><div class="xbold" style="font-size:16px">هدف ادخار</div><div class="muted small">حوّش لحاجة نفسك فيها وتابع وصلت لفين</div></div>
      ${ic('add_circle', `color:${C.green};font-size:30px`)}</div></div>`;
  }
  return goals.map((g) => {
    const s = saved.get(g.id) || 0;
    const ratio = g.target === 0 ? 0 : s / g.target;
    return `<div class="card green tap" ${on(() => goalOptions(g))}><div class="row">
      <div class="goal-icon">${ic(appIcon(g.icon))}</div>
      <div class="grow"><div class="small muted">هدف الادخار</div><div class="xbold" style="font-size:17px">${esc(g.title)}</div>
        <div class="gap8" style="height:6px"></div>${progress(ratio, 'linear-gradient(270deg,#34d399,#14b8a6)')}
        <div class="small muted" style="margin-top:4px">${num(s)} / ${money(g.target, g.currency)}</div></div>
      <div class="center"><b class="num" style="font-size:22px;color:${C.green}">${pct(ratio)}%</b><div class="small muted">اتحوّش</div></div>
    </div></div><div class="gap8"></div>`;
  }).join('') + `<button class="text-btn" ${on(() => editGoal())}>${ic('add')}هدف ادخار جديد</button>`;
}

function txTile(e, cats) {
  const cat = cats.get(e.categoryId);
  const color = e.type === EntryType.income ? C.green : e.type === EntryType.expense ? C.red : C.teal;
  const iconKey = e.type === EntryType.saving ? 'savings' : cat?.icon || 'other';
  const iconColor = cat ? intHex(cat.color) : e.type === EntryType.saving ? '#14b8a6' : '#64748b';
  return `<div class="tx" ${on(() => go(`/add?type=${e.type === EntryType.income ? 'income' : 'expense'}&id=${e.id}`))}>
    <div class="avatar" style="background:${tint(iconColor, 0.14)};color:${iconColor}">${ic(appIcon(iconKey))}</div>
    <div class="grow"><div class="title"><span class="ellipsis">${esc(e.title)}</span>${e.recurring ? ic('autorenew') : ''}</div>
      <div class="small muted">${e.type === EntryType.saving ? 'ادخار' : esc(cat?.name || 'بدون فئة')}</div></div>
    <div class="amt"><b style="color:${color}">${money(e.amount, e.currency)}</b><span>${Dates.relative(new Date(e.date))}</span></div></div>`;
}

// ------------------------------------------------------------------ goals

async function editGoal(goal = null) {
  const f = { title: goal?.title || '', target: goal ? Money.editable(goal.target) : '', icon: goal?.icon || 'savings' };
  const cur = goal?.currency || currency();
  const ok = await sheet((api) => `<h3>${goal ? 'تعديل الهدف' : 'هدف ادخار جديد'}</h3><div class="gap12"></div>
    <input class="input" placeholder="مثلاً: رحلة، موبايل جديد" value="${esc(f.title)}" ${onInput((v) => { f.title = v; })}>
    <div class="gap8"></div>
    <button class="input row" style="justify-content:space-between" ${on(async () => {
      const r = await calculator({ initial: f.target, cur, title: 'المبلغ المطلوب' });
      if (r != null) { f.target = r; api.render(); }
    })}><span class="${f.target ? 'bold num' : 'faint'}">${f.target ? esc(Money.number(Money.parse(f.target) || 0)) : 'المبلغ المطلوب'}</span><span class="muted">${esc(Money.symbol(cur))}</span></button>
    <div class="gap12"></div><div class="chips-wrap">${['savings', 'travel', 'car', 'home', 'phone', 'education', 'gift', 'health'].map((k) =>
      `<button class="chip ${f.icon === k ? 'on' : ''}" ${on(() => { f.icon = k; api.render(); })}>${ic(appIcon(k))}</button>`).join('')}</div>
    <div class="actions"><button class="btn outline" ${on(() => api.close(false))}>إلغاء</button><button class="btn primary" ${on(() => api.close(true))}>حفظ</button></div>`);
  const amount = Money.parse(f.target);
  if (!ok || !f.title.trim() || !amount) return;
  if (goal) S.updateGoal(goal.id, { title: f.title.trim(), target: amount, icon: f.icon });
  else S.addGoal({ title: f.title.trim(), target: amount, currency: cur, icon: f.icon });
}

function goalOptions(goal) {
  sheet((api) => `
    <div class="list-item" ${on(async () => {
      api.close();
      const v = await askAmount(`حوّش لـ ${goal.title}`, goal.currency);
      if (!v) return;
      S.addEntry({ title: `ادخار: ${goal.title}`, amount: v, currency: goal.currency, type: EntryType.saving, goalId: goal.id, date: Date.now() });
      toast('اتحوّش ✓');
    })}>${ic('add_card', `color:${C.green}`)}<div><div class="t">حوّش مبلغ</div><div class="s">هيتسجل كادخار في الشهر ده</div></div></div>
    <div class="list-item" ${on(() => { api.close(); editGoal(goal); })}>${ic('edit', `color:${C.primary}`)}<div class="t">تعديل الهدف</div></div>
    <div class="list-item" ${on(async () => {
      api.close();
      if (await confirmSheet(`تحذف هدف ${goal.title}؟`)) S.deleteGoal(goal.id);
    })}>${ic('delete', `color:${C.red}`)}<div><div class="t">حذف الهدف</div><div class="s">المبالغ اللي حوشتها هتفضل متسجلة</div></div></div>
    <div class="center faint small">اتعمل ${Dates.full(new Date(goal.createdAt))}</div>`);
}

// ------------------------------------------------------------------ all transactions

function transactionsPage() {
  const cur = currency();
  const entries = S.range(ui.month, Dates.addMonths(ui.month, 1), cur);
  const cats = S.categoryMap();
  const used = S.categories().filter((c) => entries.some((e) => e.categoryId === c.id));
  const q = ui.query;
  // Search filters without redrawing (keeps the keyboard up).
  const filterList = (v) => { ui.query = v.trim(); const list = document.getElementById('tx-groups'); if (list) list.innerHTML = withScope('page-list', () => groupsHtml()); };
  const groupsHtml = () => {
    const qq = ui.query;
    const items = entries.filter((e) => (ui.catFilter == null || e.categoryId === ui.catFilter) && (!qq || e.title.includes(qq) || (e.note || '').includes(qq)));
    if (!items.length) return empty('مفيش معاملات', 'receipt_long');
    const g = new Map();
    for (const e of items) {
      const k = Dates.dateOnly(new Date(e.date)).getTime();
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(e);
    }
    return [...g.entries()].map(([k, list]) => {
      const d = new Date(k);
      const spent = list.filter((e) => e.type === EntryType.expense).reduce((s, e) => s + e.amount, 0);
      return `<div class="day-head"><span>${Dates.weekday(d)} ${Dates.dayMonth(d)}</span><span class="small" style="color:${C.red}">${money(spent, cur)}</span></div>
        <div class="card" style="padding:4px 12px">${list.map((e) => txTile(e, cats)).join('')}</div>`;
    }).join('');
  };
  return `<div class="page">${appbar('كل المعاملات')}<div class="content">
    ${monthBar()}<div class="gap12"></div>
    <label class="search">${ic('search')}<input type="search" placeholder="ابحث في المعاملات…" value="${esc(q)}" ${onInput(filterList)}></label>
    <div class="gap8"></div>
    ${used.length ? `<div class="hscroll"><button class="chip ${ui.catFilter == null ? 'on' : ''}" ${on(() => { ui.catFilter = null; render(); })}>الكل</button>${used.map((c) =>
      `<button class="chip ${ui.catFilter === c.id ? 'on' : ''}" ${on(() => { ui.catFilter = c.id; render(); })}>${ic(appIcon(c.icon), `color:${intHex(c.color)}`)}${esc(c.name)}</button>`).join('')}</div>` : ''}
    <div id="tx-groups">${groupsHtml()}</div>
    </div></div>`;
}

// ------------------------------------------------------------------ debts tab

function debtsTab() {
  const today = Dates.today();
  const cur = S.baseCurrency();
  const sym = Money.symbol(cur);
  const debts = S.debtViews(), plans = S.planViews(), assocs = S.assocViews();
  const iOwe = debts.filter((d) => d.debt.direction === DebtDir.iOwe && d.debt.currency === cur && d.remaining > 0);
  const owedMe = debts.filter((d) => d.debt.direction === DebtDir.owedToMe && d.debt.currency === cur && d.remaining > 0);
  const activePlans = plans.filter((p) => p.plan.currency === cur && p.remaining > 0);
  const activeAssocs = assocs.filter((a) => a.a.currency === cur && a.status(today) !== 'done');
  const people = (l) => new Set(l.map((d) => d.debt.person)).size;
  const sum = (l, f) => l.reduce((s, x) => s + f(x), 0);
  const far = new Date(2100, 0, 1).getTime();
  const f = ui.debtFilter;
  const cards = [
    ...(f === 0 || f === 1 ? debts.map((d) => [d.status(today), d.debt.dueDate ?? far, debtCard(d, today)]) : []),
    ...(f === 0 || f === 2 ? plans.map((p) => [p.status(today), p.next?.dueDate ?? far, planCard(p, today)]) : []),
    ...(f === 0 || f === 3 ? assocs.map((a) => [a.status(today), a.next?.dueDate ?? far, assocCard(a, today)]) : []),
  ];
  const rank = (s) => (s === 'late' ? 0 : s === 'done' ? 2 : 1);
  cards.sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]);

  return `<div class="stats">
      ${stat({ label: 'ديون عليّا', icon: 'south', color: C.red, value: Money.number(sum(iOwe, (d) => d.remaining)), unit: sym, foot: `لـ ${people(iOwe)} أشخاص` })}
      ${stat({ label: 'ديون ليّا', icon: 'north', color: C.green, value: Money.number(sum(owedMe, (d) => d.remaining)), unit: sym, foot: `عند ${people(owedMe)} أشخاص` })}
      ${stat({ label: 'الأقساط', icon: 'credit_card', color: C.blue, value: Money.number(sum(activePlans, (p) => p.remaining)), unit: sym, foot: `${activePlans.length} أقساط شغالة` })}
      ${stat({ label: 'الجمعيات', icon: 'groups', color: C.purple, value: Money.number(sum(activeAssocs, (a) => a.a.monthlyAmount)), unit: sym, foot: `${activeAssocs.length} جمعية / شهرياً` })}
    </div><div class="gap12"></div>
    ${pillTabs(['الكل', 'ديون', 'أقساط', 'جمعيات'], f, (i) => { ui.debtFilter = i; render(); })}
    <div class="gap12"></div>
    ${cards.length ? `<div class="cards">${cards.map((c) => c[2]).join('')}</div>` : `<div class="card">${empty('سجّل ديونك وأقساطك وجمعياتك\nوتابع كل ميعاد دفع أو قبض', 'handshake')}</div>`}
    <div class="gap16"></div>
    <button class="btn primary" ${on(chooseDebtKind)}>${ic('add_circle')}إضافة دين / قسط / جمعية</button>`;
}

function chooseDebtKind() {
  sheet((api) => [
    ['debt', 'payments', C.orange, 'دين', 'سلفة عليك أو ليك عند حد'],
    ['installment', 'credit_card', C.blue, 'قسط', 'حاجة اشتريتها بالتقسيط'],
    ['association', 'groups', C.purple, 'جمعية', 'جمعية شهرية مع أصحابك أو الشغل'],
  ].map(([type, icon, color, title, sub]) => `<div class="list-item" ${on(() => { api.close(); go(`/add?type=${type}`); })}>
      <div class="badge" style="background:${tint(color, 0.14)};color:${color}">${ic(icon)}</div>
      <div><div class="t">${title}</div><div class="s">${sub}</div></div></div>`).join(''));
}

function debtCardShell({ icon, color, title, subtitle, status, prog, progColor, total, paid, remaining, cur, dateLabel, date, onTap }) {
  return `<div class="card tap" style="padding:14px" ${on(onTap)}>
    <div class="row"><div class="avatar" style="width:50px;height:50px;background:${tint(color, 0.14)};color:${color}">${ic(icon)}</div>
      <div class="grow"><div class="xbold ellipsis" style="font-size:16px">${esc(title)}</div><div class="small muted">${subtitle}</div></div>${statusChip(status)}</div>
    <div class="gap12"></div><div class="row">${progress(prog, progColor)}<b class="num" style="color:${progColor}">${pct(prog)}%</b></div>
    <div class="gap8"></div>
    <div class="amounts3"><div><span>الإجمالي</span><b class="fit">${money(total, cur)}</b></div><div><span>المدفوع</span><b class="fit" style="color:${C.green}">${money(paid, cur)}</b></div><div><span>المتبقي</span><b class="fit">${money(remaining, cur)}</b></div></div>
    ${date != null ? `<div class="divider"></div><div class="row small">${ic('calendar_month', `color:${C.primary};font-size:16px`)}<span class="grow muted">${dateLabel}</span><b>${Dates.full(new Date(date))}</b></div>` : ''}
  </div>`;
}

function debtCard(v, today) {
  const d = v.debt;
  const mine = d.direction === DebtDir.iOwe;
  return debtCardShell({
    icon: 'person', color: mine ? C.red : C.green, title: d.title, subtitle: esc(mine ? `عليك لـ ${d.person}` : `ليك عند ${d.person}`),
    status: v.status(today), prog: v.progress, progColor: mine ? C.red : C.green, total: d.total, paid: v.paid, remaining: v.remaining,
    cur: d.currency, dateLabel: 'ميعاد السداد', date: d.dueDate, onTap: () => go(`/debt/${d.id}`),
  });
}

function planCard(v, today) {
  const p = v.plan;
  return debtCardShell({
    icon: 'credit_card', color: C.blue, title: p.title,
    subtitle: esc(`${v.paidCount} من ${p.count} أقساط${v.phases.length > 1 ? ` • ${v.phases.length} مراحل` : ''}${p.vendor ? ` • ${p.vendor}` : ''}`),
    status: v.status(today), prog: v.progress, progColor: C.blue, total: p.total, paid: v.paid, remaining: v.remaining, cur: p.currency,
    dateLabel: `القسط الجاي (${money(v.next?.amount ?? 0, p.currency)})`, date: v.next?.dueDate ?? null, onTap: () => go(`/plan/${p.id}`),
  });
}

function assocCard(v, today) {
  const a = v.a;
  return debtCardShell({
    icon: 'groups', color: C.purple, title: a.title,
    subtitle: esc(`دورك ${a.myTurn} من ${a.membersCount} • ${v.payoutReceived ? 'قبضت ✓' : `تقبض ${Dates.dayMonth(v.payoutDate)}`}`),
    status: v.status(today), prog: v.progress, progColor: C.purple, total: v.total, paid: v.paid, remaining: v.remaining, cur: a.currency,
    dateLabel: `الدفعة الجاية (${money(a.monthlyAmount, a.currency)})`, date: v.next?.dueDate ?? null, onTap: () => go(`/assoc/${a.id}`),
  });
}

// ------------------------------------------------------------------ detail pages

function summaryCard({ color, icon, title, subtitle, status, prog, items }) {
  return `<div class="card"><div class="row">
      <div class="badge" style="width:52px;height:52px;border-radius:16px;background:${tint(color, 0.14)};color:${color}">${ic(icon)}</div>
      <div class="grow"><div class="xbold" style="font-size:20px">${esc(title)}</div><div class="muted">${esc(subtitle)}</div></div>${statusChip(status)}</div>
    <div class="gap14"></div><div class="row">${progress(prog, color, true)}<b class="num" style="color:${color}">${pct(prog)}%</b></div>
    <div class="gap12"></div><div class="chips-wrap">${items.map(([l, v]) => `<div class="info-chip"><span>${esc(l)}</span><b>${v}</b></div>`).join('')}</div></div>`;
}

const missing = () => { setTimeout(() => goBack(), 0); return '<div class="page"></div>'; };

function paidRow({ title, subtitle, amount, paid, beforeApp, late, onToggle, onEdit }) {
  return `<div class="paid-row" ${on(() => onToggle(!paid))}>
    <span class="check ${paid ? 'on' : ''}">${ic('check')}</span>
    <div class="grow"><div class="bold">${title}</div><div class="small" style="color:${late ? C.red : C.muted}">${esc(beforeApp && paid ? `${subtitle} • قبل التطبيق` : subtitle)}</div></div>
    <div style="text-align:left"><b>${amount}</b>${late ? `<div class="small" style="color:${C.red}">متأخر</div>` : ''}</div>
    ${onEdit ? `<button class="icon-btn" style="width:34px;height:34px;color:${C.faint}" aria-label="غيّر المبلغ" ${on(onEdit)}>${ic('edit', 'font-size:18px')}</button>` : ''}
  </div>`;
}

function debtDetail(id) {
  const v = S.debtViews().find((x) => x.debt.id === id);
  if (!v) return missing();
  const d = v.debt;
  const mine = d.direction === DebtDir.iOwe;
  const color = mine ? C.red : C.green;
  const today = Dates.today();
  const del = async () => {
    if (await confirmSheet('تحذف الدين ده؟', 'هتتمسح كل الدفعات بتاعته.')) { S.deleteDebt(id); goBack(); }
  };
  const pay = async () => {
    const amount = await askAmount(mine ? 'دفعت كام؟' : 'استلمت كام؟', d.currency, v.remaining);
    if (!amount) return;
    S.addDebtPayment(id, amount, Date.now());
    offerMirror({ title: mine ? `سداد دين لـ ${d.person}` : `استلام دين من ${d.person}`, amount, currency: d.currency, income: !mine });
  };
  return `<div class="page">${appbar(mine ? 'دين عليّا' : 'دين ليّا', `<button class="icon-btn" aria-label="تعديل" ${on(() => editDebt(d))}>${ic('edit')}</button><button class="icon-btn danger" aria-label="حذف" ${on(del)}>${ic('delete')}</button>`)}
  <div class="content">
    ${summaryCard({ color, icon: 'person', title: d.title, subtitle: mine ? `عليك لـ ${d.person}` : `ليك عند ${d.person}`, status: v.status(today), prog: v.progress,
      items: [['الإجمالي', money(d.total, d.currency)], [mine ? 'دفعت' : 'استلمت', money(v.paid, d.currency)], ['المتبقي', money(v.remaining, d.currency)], ...(d.dueDate != null ? [['ميعاد السداد', Dates.full(new Date(d.dueDate))]] : [])] })}
    ${d.note ? `<div class="gap8"></div><div class="card muted">${esc(d.note)}</div>` : ''}
    <div class="gap14"></div>
    <div class="card">${sectionTitle(mine ? 'الدفعات' : 'اللي استلمته', 'history')}<div class="gap8"></div>
      ${v.payments.length ? [...v.payments].reverse().map((p) => `<div class="row" style="padding:8px 0">
        ${ic(p.beforeApp ? 'history_toggle_off' : 'check_circle', `color:${p.beforeApp ? C.muted : color}`)}
        <div class="grow"><b>${money(p.amount, d.currency)}</b><div class="small muted">${p.beforeApp ? 'قبل ما تسجل في التطبيق' : Dates.full(new Date(p.date))}</div></div>
        <button class="icon-btn" style="color:${C.faint}" aria-label="امسح" ${on(async () => { if (await confirmSheet('تمسح الدفعة دي؟')) S.deleteDebtPayment(p.id); })}>${ic('close')}</button></div>`).join('') : empty('لسه مفيش دفعات', 'payments')}
    </div>
    <div class="gap16"></div>
    ${v.remaining > 0 ? `<button class="btn primary" ${on(pay)}>${ic('add_circle')}${mine ? 'سجّل دفعة' : 'سجّل مبلغ استلمته'}</button>` : ''}
  </div></div>`;
}

async function editDebt(d) {
  const f = { title: d.title, person: d.person, total: Money.editable(d.total), due: d.dueDate != null ? new Date(d.dueDate) : null };
  const ok = await sheet((api) => `<h3>تعديل الدين</h3><div class="gap12"></div>
    <input class="input" placeholder="العنوان" value="${esc(f.title)}" ${onInput((v) => { f.title = v; })}><div class="gap8"></div>
    <input class="input" placeholder="الشخص" value="${esc(f.person)}" ${onInput((v) => { f.person = v; })}><div class="gap8"></div>
    <button class="input row" style="justify-content:space-between" ${on(async () => { const r = await calculator({ initial: f.total, cur: d.currency, title: 'المبلغ' }); if (r != null) { f.total = r; api.render(); } })}>
      <span class="bold num">${esc(Money.number(Money.parse(f.total) || 0))}</span><span class="muted">${esc(Money.symbol(d.currency))}</span></button><div class="gap8"></div>
    <div class="row"><label class="input picker grow">${ic('event')}<span>${f.due ? Dates.full(f.due) : 'من غير ميعاد'}</span>
      <input type="date" value="${f.due ? Dates.key(f.due) : ''}" ${onChange((v) => { if (v) { f.due = Dates.fromKey(v); api.render(); } })}></label>
      ${f.due ? `<button class="icon-btn" ${on(() => { f.due = null; api.render(); })}>${ic('close')}</button>` : ''}</div>
    <div class="actions"><button class="btn outline" ${on(() => api.close(false))}>إلغاء</button><button class="btn primary" ${on(() => api.close(true))}>حفظ</button></div>`);
  const amount = Money.parse(f.total);
  if (!ok || !amount) return;
  S.updateDebt(d.id, { title: f.title.trim() || d.title, person: f.person.trim() || d.person, total: amount, dueDate: f.due ? f.due.getTime() : null });
}

function planDetail(id) {
  const v = S.planViews().find((x) => x.plan.id === id);
  if (!v) return missing();
  const p = v.plan;
  const today = Dates.today();
  const del = async () => { if (await confirmSheet('تحذف القسط ده؟')) { S.deletePlan(id); goBack(); } };
  return `<div class="page">${appbar('قسط', `<button class="icon-btn danger" aria-label="حذف" ${on(del)}>${ic('delete')}</button>`)}<div class="content">
    ${summaryCard({ color: C.blue, icon: 'credit_card', title: p.title,
      subtitle: [p.vendor, `${p.count} أقساط كل ${p.intervalMonths === 1 ? 'شهر' : `${p.intervalMonths} شهور`}`, v.phases.length > 1 ? `${v.phases.length} مراحل` : null].filter(Boolean).join(' • '),
      status: v.status(today), prog: v.progress,
      items: [['الإجمالي', money(p.total, p.currency)], ...(p.downPayment > 0 ? [['المقدم', money(p.downPayment, p.currency)]] : []), ['المدفوع', money(v.paid, p.currency)], ['المتبقي', money(v.remaining, p.currency)]] })}
    ${v.phases.length > 1 ? `<div class="gap14"></div><div class="card">${sectionTitle('المراحل', 'stairs', { color: C.sky })}<div class="gap8"></div>
      ${v.phases.map(([months, amount], n) => `<div class="row" style="padding:4px 0"><span class="phase-n" style="width:24px;height:24px;border-radius:50%;background:${C.sky};color:#fff;display:grid;place-items:center;font-weight:800;font-size:12px">${n + 1}</span>
        <b class="grow">${months} ${months === 1 ? 'قسط' : 'أقساط'} × ${money(amount, p.currency)}</b><span class="muted bold">${money(months * amount, p.currency)}</span></div>`).join('')}</div>` : ''}
    <div class="gap14"></div>
    <div class="card" style="padding:6px 0">${v.items.map((i) => paidRow({
      title: `القسط ${i.seq}`, subtitle: Dates.full(new Date(i.dueDate)), amount: money(i.amount, p.currency), paid: i.paidAt != null, beforeApp: i.beforeApp,
      late: i.paidAt == null && Dates.dateOnly(new Date(i.dueDate)) < today,
      onToggle: (val) => { S.setInstallmentPaid(i.id, val); if (val) offerMirror({ title: `قسط ${p.title} (${i.seq})`, amount: i.amount, currency: p.currency, income: false }); },
      onEdit: async () => { const a = await askAmount(`مبلغ القسط ${i.seq}`, p.currency, i.amount); if (a) S.updateInstallmentAmount(i.id, a); },
    })).join('')}</div>
  </div></div>`;
}

function assocDetail(id) {
  const v = S.assocViews().find((x) => x.a.id === id);
  if (!v) return missing();
  const a = v.a;
  const today = Dates.today();
  const del = async () => { if (await confirmSheet('تحذف الجمعية دي؟')) { S.deleteAssociation(id); goBack(); } };
  const togglePayout = () => {
    const val = !v.payoutReceived;
    S.setPayoutReceived(id, val);
    if (val) offerMirror({ title: `قبض جمعية ${a.title}`, amount: v.total, currency: a.currency, income: true });
  };
  return `<div class="page">${appbar('جمعية', `<button class="icon-btn danger" aria-label="حذف" ${on(del)}>${ic('delete')}</button>`)}<div class="content">
    ${summaryCard({ color: C.purple, icon: 'groups', title: a.title, subtitle: `${a.membersCount} أدوار • الدور الحالي ${v.currentRound(today)}`, status: v.status(today), prog: v.progress,
      items: [['القسط الشهري', money(a.monthlyAmount, a.currency)], ['دفعت', `${v.paidRounds} من ${a.membersCount}`], ['هتقبض', money(v.total, a.currency)], ['دورك', `${a.myTurn} • ${Dates.full(v.payoutDate)}`]] })}
    <div class="gap14"></div>
    <div class="card ${v.payoutReceived ? 'green' : 'yellow'} tap" ${on(togglePayout)}><div class="row">
      ${ic(v.payoutReceived ? 'celebration' : 'hourglass_top', `font-size:30px;color:${v.payoutReceived ? C.green : C.orange}`)}
      <b class="grow">${v.payoutReceived ? `قبضت الجمعية (${money(v.total, a.currency)})` : `هتقبض ${money(v.total, a.currency)} يوم ${Dates.full(v.payoutDate)}`}</b>
      <span class="switch ${v.payoutReceived ? 'on' : ''}"></span></div></div>
    <div class="gap14"></div>
    <div class="card" style="padding:6px 0">${v.rounds.map((r) => paidRow({
      title: `الدور ${r.seq}${r.seq === a.myTurn ? ' (دورك تقبض 🎉)' : ''}`, subtitle: Dates.full(new Date(r.dueDate)), amount: money(a.monthlyAmount, a.currency),
      paid: r.paidAt != null, beforeApp: r.beforeApp, late: r.paidAt == null && Dates.dateOnly(new Date(r.dueDate)) < today,
      onToggle: (val) => { S.setRoundPaid(r.id, val); if (val) offerMirror({ title: `جمعية ${a.title} (دور ${r.seq})`, amount: a.monthlyAmount, currency: a.currency, income: false }); },
    })).join('')}</div>
  </div></div>`;
}

// ------------------------------------------------------------------ add page

const ADD_TYPES = [
  { key: 'expense', label: 'مصروف', icon: 'payments', color: C.red },
  { key: 'income', label: 'دخل', icon: 'savings', color: C.green },
  { key: 'debt', label: 'دين', icon: 'request_quote', color: C.orange },
  { key: 'installment', label: 'قسط', icon: 'credit_card', color: C.sky },
  { key: 'association', label: 'جمعية', icon: 'groups', color: C.purple },
];

let form = null;
let formKey = null;
let formNonce = 0;

function initForm(type, id) {
  const today = Dates.today();
  if (type === 'debt') return { dir: DebtDir.iOwe, person: '', title: '', amount: '', paidBefore: '', note: '', currency: S.baseCurrency(), due: null };
  if (type === 'installment') {
    return { title: '', vendor: '', total: '', down: '', currency: S.baseCurrency(), phased: false, count: 12, phases: [{ months: 6, amount: '' }, { months: 12, amount: '' }], interval: 1, firstDue: today, paidBefore: 0, paidTouched: false };
  }
  if (type === 'association') {
    return { title: '', monthly: '', currency: S.baseCurrency(), members: 10, myTurn: 1, start: today, paidBefore: 0, paidTouched: false, payoutReceived: false, payoutTouched: false };
  }
  const e = id ? S.entry(id) : null;
  return {
    editing: e, title: e?.title || '', amount: e ? Money.editable(e.amount) : '', note: e?.note || '', currency: e?.currency || currency(),
    categoryId: e?.categoryId ?? null, date: e ? new Date(e.date) : new Date(), recurring: e?.recurring || false,
  };
}

function addPage(r) {
  const type = ADD_TYPES.some((t) => t.key === r.q.get('type')) ? r.q.get('type') : 'expense';
  const id = r.q.get('id') ? +r.q.get('id') : null;
  const key = `${r.key}#${formNonce}`;
  if (formKey !== key) { form = initForm(type, id); formKey = key; }
  const editing = !!form.editing;
  const current = ADD_TYPES.find((t) => t.key === type);
  const body = { income: () => entryForm(true), expense: () => entryForm(false), debt: debtForm, installment: installmentForm, association: associationForm }[type]();
  return `<div class="page">${hero({ title: editing ? `تعديل ${current.label}` : 'إضافة جديد', subtitle: editing ? '' : 'ضيف مصروف أو دخل أو دين أو قسط', icon: current.icon, color: current.color, back: true })}
    ${editing ? '' : `<div class="types">${ADD_TYPES.map((t) => `<button class="type-tile" style="${t.key === type ? `background:${tint(t.color, 0.13)};border:1.6px solid ${t.color};color:${t.color}` : ''}" ${on(() => go(`/add?type=${t.key}`, { replace: true }))}>
      <i class="ic" style="background:${t.color}">${glyph(t.icon)}</i>${t.label}</button>`).join('')}</div>`}
    <div class="content" style="padding-top:12px">${body}</div></div>`;
}

/** Finishes a form: back to where we came from, or a fresh form for "حفظ وجديد". */
function saved(another, message) {
  toast(message);
  if (another) { formNonce++; render(); window.scrollTo(0, 0); } else goBack();
}

const frow = (icon, label, field, iconColor) => `<div class="frow">${ic(icon, iconColor ? `color:${iconColor}` : '')}<label>${esc(label)}</label><div class="field">${field}</div></div>`;
const textField = (value, hint, set, { multiline = false } = {}) => (multiline
  ? `<textarea class="bare" rows="3" placeholder="${esc(hint)}" ${onInput(set)}>${esc(value)}</textarea>`
  : `<input class="bare" placeholder="${esc(hint)}" value="${esc(value)}" ${onInput(set)}>`);

/** Amount shown big; tapping opens the calculator. Currency chip changes the currency. */
function amountField(f, field, { currencyKey = 'currency', title } = {}) {
  const v = f[field];
  const parsed = Money.parse(v || '');
  const openCalc = async () => {
    const res = await calculator({ initial: v, cur: f[currencyKey], title });
    if (res != null) { f[field] = res; render(); }
  };
  return `<div class="amount-field">
    <button class="calc" aria-label="الآلة الحاسبة" ${on(openCalc)}>${ic('calculate')}</button>
    <div class="val ${v ? '' : 'empty'}" ${on(openCalc)}>${v ? esc(Money.number(parsed ?? 0)) : '0.00'}</div>
    <button class="cur" ${on(async () => { const c = await pickCurrencyCode(f[currencyKey]); if (c) { f[currencyKey] = c; render(); } })}>${esc(Money.symbol(f[currencyKey]))}</button></div>`;
}

function dateField(d, set, { placeholder, clearable = false } = {}) {
  return `<div class="row"><label class="picker ${d ? '' : 'placeholder'}">${ic('edit_calendar')}<span>${d ? Dates.full(d) : esc(placeholder)}</span>
    <input type="date" value="${d ? Dates.key(d) : ''}" ${onChange((v) => { if (v) { set(Dates.fromKey(v)); render(); } })}></label>
    ${clearable && d ? `<button class="icon-btn" aria-label="من غير ميعاد" ${on(() => { set(null); render(); })}>${ic('close')}</button>` : ''}</div>`;
}

function choiceRow(options, value, set) {
  return `<div class="choice-row">${options.map(([v, label, icon]) => `<button class="choice ${v === value ? 'on' : ''}" ${on(() => { set(v); render(); })}>${icon ? ic(icon) : ''}${esc(label)}</button>`).join('')}</div>`;
}

function stepper(value, min, max, set) {
  return `<div class="stepper"><button ${value <= min ? 'disabled' : ''} ${on(() => { set(value - 1); render(); })}>${ic('remove')}</button>
    <b class="num">${value}</b><button ${value >= max ? 'disabled' : ''} ${on(() => { set(value + 1); render(); })}>${ic('add')}</button></div>`;
}

function saveBar(onSave, { onAnother, onDelete } = {}) {
  return `<div class="savebar">
    <button class="btn primary" ${on(() => onSave(false))}>${ic('check')}حفظ</button>
    ${onAnother ? `<button class="btn outline" ${on(() => onSave(true))}>${ic('add')}حفظ وجديد</button>` : ''}
    ${onDelete ? `<button class="btn danger" aria-label="حذف" ${on(onDelete)}>${ic('delete')}</button>` : ''}</div>`;
}

const beforeApp = (inner) => `<div class="before-app"><div class="head">${ic('history')}اللي حصل قبل ما تسجّل</div>${inner}</div>`;

// --- income / expense

function entryForm(income) {
  const f = form;
  const type = f.editing ? f.editing.type : income ? EntryType.income : EntryType.expense;
  const cats = S.categoryMap();
  const cat = cats.get(f.categoryId);
  const color = income ? C.green : C.red;
  const save = (another) => {
    const value = Money.parse(f.amount || '');
    if (!value) return toast('اكتب المبلغ');
    const name = f.title.trim() || cat?.name || (income ? 'دخل' : 'مصروف');
    const data = { title: name, amount: value, currency: f.currency, type, categoryId: f.categoryId, date: f.date.getTime(), note: f.note.trim() || null, recurring: f.recurring };
    if (f.editing) S.updateEntry(f.editing.id, data);
    else S.addEntry(data);
    saved(another, 'اتسجل ✓');
  };
  const del = async () => { if (await confirmSheet('تحذف المعاملة دي؟')) { S.deleteEntry(f.editing.id); goBack(); } };
  const templates = S.templates();
  return `<div class="form-section">${sectionTitle(income ? 'تفاصيل الدخل' : 'تفاصيل المصروف', income ? 'savings' : 'payments', { color })}
      ${frow('description_outlined', 'الاسم', textField(f.title, income ? 'مثال: مرتب أكتوبر' : 'مثال: فاتورة كهربا', (v) => { f.title = v; }))}
      ${frow('attach_money', 'المبلغ', amountField(f, 'amount'), C.green)}
      ${frow('sell', 'الفئة', `<button class="picker ${cat ? '' : 'placeholder'}" ${on(() => pickCategory(type))}>${cat ? ic(appIcon(cat.icon), `color:${intHex(cat.color)}`) : ''}<span>${esc(cat?.name || 'اختار الفئة')}</span></button>`, C.purple)}
      ${frow('calendar_month', 'التاريخ', dateField(f.date, (d) => { f.date = new Date(d.getFullYear(), d.getMonth(), d.getDate(), f.date.getHours(), f.date.getMinutes()); }))}
      ${frow('bar_chart', 'النوع', choiceRow([[false, 'مرة واحدة', 'looks_one'], [true, 'متكرر كل شهر', 'autorenew']], f.recurring, (v) => { f.recurring = v; }), C.purple)}
      ${frow('notes', 'ملاحظات', textField(f.note, 'أضف أي ملاحظات…', (v) => { f.note = v; }, { multiline: true }))}
      ${f.recurring ? '<div class="small muted" style="padding:6px 2px">هيتسجل تلقائياً كل شهر في نفس اليوم لحد ما تقفل التكرار.</div>' : ''}
    </div>
    ${!income && !f.editing && templates.length ? `<div class="gap14"></div><div class="form-section">${sectionTitle('قوالب سريعة', 'bolt')}
      <div class="templates">${templates.map((t) => `<div class="template" style="background:${tint(intHex(t.color), 0.1)}" ${on(() => {
        f.title = t.title;
        if (t.amount > 0) f.amount = Money.editable(t.amount);
        f.categoryId = t.categoryId;
        f.currency = t.currency;
        f.recurring = true;
        render();
      })}>${ic(appIcon(t.icon), `color:${intHex(t.color)}`)}<b>${esc(t.title)}</b><span>${t.amount === 0 ? '—' : money(t.amount, t.currency)}</span></div>`).join('')}</div></div>` : ''}
    <div class="gap16"></div>${saveBar(save, { onAnother: !f.editing, onDelete: f.editing ? del : null })}`;
}

function pickCategory(type) {
  const f = form;
  sheet((api) => `<h3>اختار الفئة</h3><div class="gap12"></div><div class="cat-grid">
    ${S.categories().filter((c) => c.type === type).map((c) => {
      const col = intHex(c.color);
      return `<div class="cat-cell" style="background:${tint(col, c.id === f.categoryId ? 0.2 : 0.08)};border-color:${c.id === f.categoryId ? col : 'transparent'}" ${on(() => { f.categoryId = c.id; api.close(); render(); })}>
        ${ic(appIcon(c.icon), `color:${col}`)}<div>${esc(c.name)}</div></div>`;
    }).join('')}
    <div class="cat-cell" style="border:1px solid var(--border)" ${on(async () => {
      const id = await newCategory(type);
      if (id) { f.categoryId = id; api.close(); render(); }
    })}>${ic('add', `color:${C.primary}`)}<div>فئة جديدة</div></div></div>`);
}

function newCategory(type) {
  const f = { name: '', icon: 'other', color: PALETTE[0] };
  return sheet((api) => `<h3>فئة جديدة</h3><div class="gap12"></div>
    <input class="input" placeholder="اسم الفئة" value="${esc(f.name)}" ${onInput((v) => { f.name = v; })}>
    <div class="gap12"></div><div class="icon-grid">${CATEGORY_CHOICES.map((k) => `<button style="${k === f.icon ? `background:${tint(intHex(f.color), 0.15)};border-color:${intHex(f.color)}` : ''}" ${on(() => { f.icon = k; api.render(); })}>${ic(appIcon(k), `color:${intHex(f.color)}`)}</button>`).join('')}</div>
    <div class="gap12"></div><div class="color-row">${PALETTE.map((c) => `<button class="${c === f.color ? 'on' : ''}" style="background:${intHex(c)}" ${on(() => { f.color = c; api.render(); })}></button>`).join('')}</div>
    <div class="actions"><button class="btn outline" ${on(() => api.close(null))}>إلغاء</button><button class="btn primary" ${on(() => {
      if (!f.name.trim()) return toast('اكتب اسم الفئة');
      api.close(S.addCategory({ name: f.name.trim(), icon: f.icon, color: f.color, type }));
    })}>إضافة</button></div>`);
}

// --- debt

function debtForm() {
  const f = form;
  const mine = f.dir === DebtDir.iOwe;
  const save = (another) => {
    const total = Money.parse(f.amount || '');
    if (!f.person.trim() || !total) return toast('اكتب اسم الشخص والمبلغ');
    const paid = Money.parse(f.paidBefore || '') || 0;
    if (paid > total) return toast('المدفوع قبل كده أكبر من المبلغ');
    const person = f.person.trim();
    S.createDebt({
      direction: f.dir, person, title: f.title.trim() || (mine ? `دين لـ ${person}` : `دين عند ${person}`), total, currency: f.currency,
      dueDate: f.due ? f.due.getTime() : null, note: f.note.trim() || null, paidBefore: paid,
    });
    saved(another, 'اتسجل الدين ✓');
  };
  return `<div class="form-section">${sectionTitle('تفاصيل الدين', 'request_quote', { color: C.orange })}
      ${pillTabs(['عليّا (أنا مديون)', 'ليّا (حد مديون لي)'], mine ? 0 : 1, (i) => { f.dir = i === 0 ? DebtDir.iOwe : DebtDir.owedToMe; render(); }, 'soft')}
      <div class="gap8"></div>
      ${frow('person', 'الشخص', textField(f.person, 'اسمه', (v) => { f.person = v; }))}
      ${frow('description_outlined', 'السبب', textField(f.title, 'اختياري — مثال: سلفة', (v) => { f.title = v; }))}
      ${frow('attach_money', 'المبلغ', amountField(f, 'amount'), C.green)}
      ${frow('event', 'ميعاد السداد', dateField(f.due, (d) => { f.due = d; }, { placeholder: 'من غير ميعاد', clearable: true }))}
      ${frow('notes', 'ملاحظات', textField(f.note, 'أي تفاصيل…', (v) => { f.note = v; }, { multiline: true }))}
      ${beforeApp(`<div class="muted" style="margin-bottom:6px">${mine ? 'دفعت جزء منه قبل كده؟' : 'استلمت جزء منه قبل كده؟'}</div><div class="box">${amountField(f, 'paidBefore')}</div>`)}
    </div><div class="gap16"></div>${saveBar(save, { onAnother: true })}`;
}

// --- installment

function installmentForm() {
  const f = form;
  const today = Dates.today();
  const count = () => (f.phased ? f.phases.reduce((s, p) => s + p.months, 0) : f.count);
  const amounts = () => {
    const out = [];
    for (const p of f.phases) {
      const a = Money.parse(p.amount || '');
      if (!a) return null;
      for (let i = 0; i < p.months; i++) out.push(a);
    }
    return out;
  };
  const passed = () => {
    let n = 0;
    for (let i = 0; i < count(); i++) if (Dates.addMonths(f.firstDue, i * f.interval) < today) n++;
    return n;
  };
  const recalc = () => {
    if (f.paidBefore > count()) f.paidBefore = count();
    if (!f.paidTouched) f.paidBefore = passed();
  };
  const down = Money.parse(f.down || '') || 0;
  const last = Dates.addMonths(f.firstDue, (count() - 1) * f.interval);
  let summary = null;
  if (f.phased) {
    const a = amounts();
    if (a) summary = `الإجمالي ${fmt(a.reduce((s, x) => s + x, 0) + down, f.currency)} • ${count()} قسط • آخر قسط ${Dates.full(last)}`;
  } else {
    const t = Money.parse(f.total || '') || 0;
    const each = f.count === 0 || t <= down ? 0 : Math.floor((t - down) / f.count);
    if (each > 0) summary = `القسط ≈ ${fmt(each, f.currency)} • آخر قسط ${Dates.full(last)}`;
  }
  const save = (another) => {
    if (!f.title.trim()) return toast('اكتب اسم الحاجة');
    const base = { title: f.title.trim(), vendor: f.vendor.trim() || null, downPayment: down, firstDueDate: f.firstDue, intervalMonths: f.interval, currency: f.currency, paidBefore: f.paidBefore };
    if (f.phased) {
      const a = amounts();
      if (!a) return toast('اكتب القسط الشهري لكل مرحلة');
      S.createPlan({ ...base, total: down + a.reduce((s, x) => s + x, 0), count: a.length, amounts: a });
    } else {
      const t = Money.parse(f.total || '');
      if (!t) return toast('اكتب المبلغ الكلي');
      if (down >= t) return toast('المقدم لازم يكون أقل من الإجمالي');
      S.createPlan({ ...base, total: t, count: f.count });
    }
    saved(another, 'اتسجل القسط ✓');
  };

  let editor;
  if (!f.phased) {
    editor = frow('attach_money', 'الإجمالي', amountField(f, 'total'), C.green)
      + frow('format_list_numbered', 'عدد الأقساط', stepper(f.count, 1, 120, (v) => { f.count = v; recalc(); }));
  } else {
    let from = 1;
    editor = f.phases.map((p, i) => {
      const start = from;
      from += p.months;
      return `<div class="phase"><div class="row"><span class="n">${i + 1}</span>
          <b class="grow">${p.months === 1 ? `القسط ${start}` : `من القسط ${start} لـ ${start + p.months - 1}`}</b>
          ${f.phases.length > 1 ? `<button class="icon-btn" style="width:34px;height:34px;color:${C.faint}" aria-label="شيل المرحلة" ${on(() => { f.phases.splice(i, 1); recalc(); render(); })}>${ic('close')}</button>` : ''}</div>
        <div class="row" style="padding:6px 0"><span class="grow muted">كام شهر</span>${stepper(p.months, 1, 120, (v) => { p.months = v; recalc(); })}</div>
        ${frow('attach_money', 'القسط الشهري', amountField(p, 'amount', { currencyKey: 'currency' }), C.green)}</div>`;
    }).join('') + `<button class="text-btn" ${on(() => { f.phases.push({ months: 6, amount: '' }); recalc(); render(); })}>${ic('add_circle_outline')}مرحلة تانية بمبلغ مختلف</button>`;
  }
  return `<div class="form-section">${sectionTitle('تفاصيل القسط', 'credit_card', { color: C.sky })}
      ${frow('shopping_bag', 'الحاجة', textField(f.title, 'مثال: لابتوب', (v) => { f.title = v; }))}
      ${frow('storefront', 'من فين', textField(f.vendor, 'اختياري — المحل أو البنك', (v) => { f.vendor = v; }))}
      <div class="gap8"></div>
      ${pillTabs([{ label: 'قسط ثابت', icon: 'drag_handle' }, { label: 'مراحل بمبالغ مختلفة', icon: 'stairs' }], f.phased ? 1 : 0, (i) => { f.phased = i === 1; recalc(); render(); }, 'soft')}
      <div class="gap8"></div>${editor}
      ${frow('payments', 'المقدم', amountField(f, 'down'))}
      ${frow('event_repeat', 'كل', choiceRow([[1, 'شهر'], [2, 'شهرين'], [3, '3 شهور']], f.interval, (v) => { f.interval = v; recalc(); }))}
      ${frow('event', 'أول قسط', dateField(f.firstDue, (d) => { f.firstDue = d; recalc(); }))}
      ${summary ? `<div class="hint-box">${esc(summary)}</div>` : ''}
      ${beforeApp(`<div class="muted">لو القسط بدأ من زمان، حدد كام قسط دفعته قبل ما تسجّله هنا:</div>
        <div class="row" style="padding-top:8px"><b class="grow">أقساط مدفوعة</b>${stepper(f.paidBefore, 0, count(), (v) => { f.paidBefore = v; f.paidTouched = true; })}</div>`)}
    </div><div class="gap16"></div>${saveBar(save, { onAnother: true })}`;
}

// --- association

function associationForm() {
  const f = form;
  const today = Dates.today();
  const recalc = () => {
    if (!f.paidTouched) {
      let n = 0;
      for (let i = 0; i < f.members; i++) if (Dates.addMonths(f.start, i) < today) n++;
      f.paidBefore = n;
    }
    if (!f.payoutTouched) f.payoutReceived = Dates.addMonths(f.start, f.myTurn - 1) < today;
  };
  const m = Money.parse(f.monthly || '') || 0;
  const payoutDate = Dates.addMonths(f.start, f.myTurn - 1);
  const started = f.start.getTime() <= today.getTime();
  const save = (another) => {
    if (!f.title.trim() || !m) return toast('اكتب اسم الجمعية والقسط الشهري');
    S.createAssociation({ title: f.title.trim(), monthlyAmount: m, membersCount: f.members, myTurn: f.myTurn, startDate: f.start, currency: f.currency, paidBefore: f.paidBefore, payoutReceived: f.payoutReceived });
    saved(another, 'اتسجلت الجمعية ✓');
  };
  return `<div class="form-section">${sectionTitle('تفاصيل الجمعية', 'groups', { color: C.purple })}
      ${frow('edit', 'الاسم', textField(f.title, 'مثال: جمعية الشغل', (v) => { f.title = v; }))}
      ${frow('attach_money', 'القسط الشهري', amountField(f, 'monthly'), C.green)}
      ${frow('groups', 'عدد الأدوار', stepper(f.members, 2, 60, (v) => { f.members = v; if (f.myTurn > v) f.myTurn = v; if (f.paidBefore > v) f.paidBefore = v; recalc(); }))}
      ${frow('star', 'دورك', stepper(f.myTurn, 1, f.members, (v) => { f.myTurn = v; recalc(); }), C.orange)}
      ${frow('event', 'أول دور', dateField(f.start, (d) => { f.start = d; recalc(); }))}
      ${m > 0 ? `<div class="bold" style="color:${C.purple};padding:8px 2px">هتقبض ${esc(fmt(m * f.members, f.currency))} يوم ${Dates.full(payoutDate)}</div>` : ''}
      ${started ? beforeApp(`<div class="muted">الجمعية بدأت قبل كده؟ حدد الأدوار اللي دفعتها قبل ما تسجّلها:</div>
        <div class="row" style="padding-top:8px"><b class="grow">أدوار مدفوعة</b>${stepper(f.paidBefore, 0, f.members, (v) => { f.paidBefore = v; f.paidTouched = true; })}</div>
        <div class="row" style="padding-top:12px;cursor:pointer" ${on(() => { f.payoutReceived = !f.payoutReceived; f.payoutTouched = true; render(); })}><b class="grow">قبضت دوري خلاص</b><span class="switch ${f.payoutReceived ? 'on' : ''}"></span></div>`) : ''}
    </div><div class="gap16"></div>${saveBar(save, { onAnother: true })}`;
}

// ------------------------------------------------------------------ backup

function download(text, name) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function pickTextFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      resolve(file ? await file.text() : null);
    });
    input.addEventListener('cancel', () => { input.remove(); resolve(null); });
    document.body.appendChild(input);
    input.click();
  });
}

function openBackup() {
  let msg = null;
  sheet((api) => {
    const run = (job) => async () => {
      msg = null;
      try { await job(); } catch (e) {
        if (e?.name === 'AbortError') return; // share sheet closed
        msg = { err: true, text: e?.message || String(e) };
      }
      if (document.body.contains(api.el)) api.render();
    };
    const save = run(async () => {
      await S.flush();
      download(S.exportJson(), S.backupName());
      msg = { err: false, text: `الملف اتنزّل ✓  (${S.backupName()})` };
    });
    const share = run(async () => {
      const file = new File([S.exportJson()], S.backupName(), { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'نسخة فلوس نظمها' });
      } else {
        download(S.exportJson(), S.backupName());
        msg = { err: false, text: `الملف اتنزّل: ${S.backupName()}` };
      }
    });
    const imp = run(async () => {
      const text = await pickTextFile();
      if (text == null) return;
      const file = S.readBackup(text);
      const ok = await confirmSheet('تستورد الملف ده؟',
        `${file.exportedAt ? `اتعمل ${Dates.full(file.exportedAt)}\n` : ''}• ${file.entries} معاملة\n• ${file.debts} دين  • ${file.plans} قسط  • ${file.associations} جمعية\n• ${file.goals} هدف ادخار\n\nبيانات الفلوس اللي على الجهاز ده هتتمسح وتتبدل باللي في الملف.`,
        'استورد');
      if (!ok) return;
      S.importBackup(file);
      api.close();
      toast('اتنقلت بيانات الفلوس ✓');
    });
    const action = (icon, color, title, sub, fn) => `<div class="card tap" style="padding:12px;margin-bottom:8px" ${on(fn)}><div class="row">
      <div class="badge" style="width:44px;height:44px;background:${tint(color, 0.14)};color:${color}">${ic(icon)}</div>
      <div class="grow"><div class="xbold">${title}</div><div class="small muted">${sub}</div></div>${ic('chevron_left', `color:${C.faint}`)}</div></div>`;
    return `<h3>نقل بيانات الفلوس</h3><div class="muted">المعاملات والميزانية والأهداف والديون والأقساط والجمعيات في ملف واحد — بين الآيفون والموبايل والكمبيوتر.</div>
      <div class="gap16"></div><div class="muted bold small" style="margin-bottom:6px">من الجهاز ده</div>
      ${action('save_alt', C.primary, 'تصدير — نزّل الملف', 'هيتحفظ في الملفات (التنزيلات)', save)}
      ${action('ios_share', C.teal, 'تصدير — ابعت الملف', 'اختار "حفظ في الملفات" أو ابعته لنفسك', share)}
      <div class="gap8"></div><div class="muted bold small" style="margin-bottom:6px">للجهاز ده</div>
      ${action('file_open', C.orange, 'استيراد ملف', 'هيحل مكان بيانات الفلوس اللي على الجهاز ده', imp)}
      ${msg ? `<div class="msg ${msg.err ? 'err' : 'ok'}">${esc(msg.text)}</div>` : ''}
      <div class="gap12"></div><div class="small muted" style="background:#f6f8fd;border-radius:12px;padding:10px 12px">
        عندك بيانات في النسخة القديمة (Flutter)؟ <a href="old/" style="color:${C.primary};font-weight:700">افتحها من هنا</a>، صدّر منها الملف، وبعدين استورده هنا.</div>`;
  });
}

// ------------------------------------------------------------------ start

S.subscribe(() => render());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') S.flush();
  else if (S.generateRecurring(new Date())) render();
});

S.load().then(() => {
  render();
  document.getElementById('boot')?.remove();
}).catch((err) => {
  const b = document.getElementById('boot-err');
  if (b) { b.style.display = 'block'; b.textContent = 'حصلت مشكلة في فتح البيانات: ' + (err?.message || err); }
});
