// Data layer for the money web app. Rows have exactly the shape of the
// app's backup files (drift toJson: camelCase fields, dates as epoch ms,
// enums as indexes, amounts in minor units), so files move both ways.

export const EntryType = { expense: 0, income: 1, saving: 2 };
export const DebtDir = { iOwe: 0, owedToMe: 1 };
export const DEBT_CATEGORY = 'ديون وأقساط';

export const MONEY_TABLES = [
  'categories', 'saving_goals', 'expense_templates', 'money_entries', 'debts',
  'debt_payments', 'installment_plans', 'installments', 'associations', 'association_rounds',
];

const isMoneySetting = (k) => k === 'currency' || k.startsWith('budget_') || k.startsWith('n_budget');

// ------------------------------------------------------------------ dates

export const Dates = {
  months: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  // Indexed by JS getDay() (Sunday = 0).
  weekdays: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  dateOnly: (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()),
  today: () => Dates.dateOnly(new Date()),
  monthStart: (d) => new Date(d.getFullYear(), d.getMonth(), 1),
  daysInMonth: (y, m) => new Date(y, m + 1, 0).getDate(), // m is 0-based
  /** Adds months keeping the day where possible (Jan 31 + 1 → Feb 28/29), like the app. */
  addMonths(d, n) {
    const total = d.getMonth() + n;
    const y = d.getFullYear() + Math.floor(total / 12);
    const m = ((total % 12) + 12) % 12;
    const day = Math.min(d.getDate(), Dates.daysInMonth(y, m));
    return new Date(y, m, day, d.getHours(), d.getMinutes());
  },
  dayMonth: (d) => `${d.getDate()} ${Dates.months[d.getMonth()]}`,
  full: (d) => `${Dates.dayMonth(d)} ${d.getFullYear()}`,
  monthYear: (d) => `${Dates.months[d.getMonth()]} ${d.getFullYear()}`,
  weekday: (d) => Dates.weekdays[d.getDay()],
  relative(d) {
    const diff = Math.round((Dates.dateOnly(d) - Dates.today()) / 86400000);
    if (diff === 0) return 'النهارده';
    if (diff === 1) return 'بكرة';
    if (diff === -1) return 'امبارح';
    return d.getFullYear() === new Date().getFullYear() ? Dates.dayMonth(d) : Dates.full(d);
  },
  isBefore: (a, b) => a.getTime() < b.getTime(),
  key: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  fromKey(k) {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  },
};

// ------------------------------------------------------------------ money

export const CURRENCIES = [
  { code: 'EGP', symbol: 'ج.م', name: 'جنيه مصري' },
  { code: 'SAR', symbol: 'ر.س', name: 'ريال سعودي' },
  { code: 'AED', symbol: 'د.إ', name: 'درهم إماراتي' },
  { code: 'KWD', symbol: 'د.ك', name: 'دينار كويتي' },
  { code: 'USD', symbol: '$', name: 'دولار أمريكي' },
  { code: 'EUR', symbol: '€', name: 'يورو' },
  { code: 'GBP', symbol: '£', name: 'جنيه إسترليني' },
];

const fmtWhole = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const fmtFrac = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

export const Money = {
  of: (code) => CURRENCIES.find((c) => c.code === code) || CURRENCIES[0],
  symbol: (code) => Money.of(code).symbol,
  /** Minor units → "1,250" or "1,250.5" (Western digits). */
  number: (minor) => (minor % 100 === 0 ? fmtWhole : fmtFrac).format(minor / 100),
  format: (minor, cur) => `${Money.number(minor)} ${Money.symbol(cur)}`,
  normalize(input) {
    let s = String(input).trim();
    const arabic = '٠١٢٣٤٥٦٧٨٩', persian = '۰۱۲۳۴۵۶۷۸۹';
    for (let i = 0; i < 10; i++) s = s.split(arabic[i]).join(String(i)).split(persian[i]).join(String(i));
    return s.replace(/٫/g, '.').replace(/[٬,،]/g, '').replace(/[×xX]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-');
  },
  /** + − × ÷ with normal precedence; null when it can't. */
  evaluate(input) {
    let s = Money.normalize(input).replace(/\s/g, '');
    while (s && '+-*/'.includes(s[s.length - 1])) s = s.slice(0, -1);
    if (!s) return null;
    const tokens = s.match(/(\d+\.?\d*|\.\d+)|([-+*/])/g) || [];
    if (tokens.join('') !== s) return null;
    let total = 0, term = 0, sign = 1, pending = null, expectNumber = true;
    for (const t of tokens) {
      if (/^[\d.]/.test(t)) {
        if (!expectNumber) return null;
        const v = parseFloat(t);
        if (pending === '*') term *= v;
        else if (pending === '/') { if (v === 0) return null; term /= v; }
        else term = v;
        pending = null;
        expectNumber = false;
      } else {
        if (expectNumber) return null;
        if (t === '+' || t === '-') { total += sign * term; sign = t === '+' ? 1 : -1; term = 0; }
        else pending = t;
        expectNumber = true;
      }
    }
    if (expectNumber) return null;
    return total + sign * term;
  },
  /** Text → minor units; null when invalid or negative. */
  parse(input) {
    const v = Money.evaluate(input);
    if (v == null || v < 0) return null;
    return Math.round(v * 100);
  },
  isExpression: (input) => /\d\s*[-+*/]\s*\d/.test(Money.normalize(input)),
  editable: (minor) => (!minor ? '' : minor % 100 === 0 ? String(minor / 100) : String(minor / 100)),
};

/** Color int (0xFFRRGGBB) → CSS. */
export const css = (c, alpha = 1) => {
  const n = Number(c) & 0xffffff;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return alpha === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
};

// ------------------------------------------------------------------ storage

const DB = 'nazzamha-web', STORE = 'kv', KEY = 'state', LS = 'nazzamha-web-state';
let state = null;
const listeners = new Set();

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet() {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get(KEY);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function idbPut(value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function emptyState() {
  const tables = {};
  for (const t of MONEY_TABLES) tables[t] = [];
  return { settings: {}, tables };
}

function seed(s) {
  s.settings.currency = 'EGP';
  s.settings.name = '';
  const expense = [
    ['أكل ومشروبات', 'food', 0xff3b82f6], ['مواصلات', 'transport', 0xff8b5cf6], ['اشتراكات', 'subscription', 0xff14b8a6],
    ['فواتير', 'bills', 0xfff59e0b], ['بيت', 'home', 0xffef4444], ['تسوق', 'shopping', 0xffec4899],
    ['صحة', 'health', 0xff22c55e], ['ترفيه', 'fun', 0xfff97316], ['تعليم', 'education', 0xff6366f1],
    ['أخرى', 'other', 0xff64748b], [DEBT_CATEGORY, 'bills', 0xff0ea5e9],
  ];
  const income = [
    ['راتب', 'salary', 0xff22c55e], ['شغل حر', 'freelance', 0xff3b82f6], ['هدية', 'gift', 0xffec4899],
    ['أخرى', 'other', 0xff64748b], [DEBT_CATEGORY, 'bills', 0xff0ea5e9],
  ];
  let order = 0, id = 1;
  for (const [name, icon, color] of expense) s.tables.categories.push({ id: id++, name, icon, color, type: EntryType.expense, sortOrder: order++ });
  for (const [name, icon, color] of income) s.tables.categories.push({ id: id++, name, icon, color, type: EntryType.income, sortOrder: order++ });
  const tpl = [['إيجار البيت', 5, 'home', 0xffef4444], ['فاتورة كهربا', 4, 'electric', 0xfff59e0b], ['فاتورة مية', 4, 'water', 0xff3b82f6], ['مشتريات البيت', 6, 'cart', 0xff22c55e]];
  tpl.forEach(([title, categoryId, icon, color], i) => s.tables.expense_templates.push({ id: i + 1, title, amount: 0, currency: 'EGP', categoryId, icon, color }));
}

export async function load() {
  let s = null;
  try { s = await idbGet(); } catch (_) { /* private mode etc. */ }
  if (!s) {
    try { const raw = localStorage.getItem(LS); if (raw) s = JSON.parse(raw); } catch (_) { /* ignore */ }
  }
  if (!s) {
    s = emptyState();
    seed(s);
  }
  for (const t of MONEY_TABLES) s.tables[t] ||= [];
  s.settings ||= {};
  state = s;
  try { navigator.storage?.persist?.(); } catch (_) { /* ignore */ }
  generateRecurring(new Date(), true);
  await persist();
}

let saveTimer = null;
async function persist() {
  const copy = JSON.parse(JSON.stringify(state));
  let ok = false;
  try { await idbPut(copy); ok = true; } catch (_) { /* fall back below */ }
  try { localStorage.setItem(LS, JSON.stringify(copy)); ok = true; } catch (_) { /* quota */ }
  return ok;
}

/** Runs [fn] on the data, then saves and redraws. */
export function mutate(fn) {
  const out = fn(state);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 30);
  for (const l of listeners) l();
  return out;
}

export const flush = () => { clearTimeout(saveTimer); return persist(); };
export const subscribe = (fn) => listeners.add(fn);

const T = (name) => state.tables[name];
const nextId = (name) => T(name).reduce((m, r) => Math.max(m, r.id), 0) + 1;

// ------------------------------------------------------------------ settings

export const settings = () => state.settings;
export const baseCurrency = () => state.settings.currency || 'EGP';
export const budgetOf = (cur) => { const v = parseInt(state.settings[`budget_${cur}`], 10); return Number.isFinite(v) ? v : null; };
export const setSetting = (k, v) => mutate((s) => { s.settings[k] = String(v); });
export const removeSetting = (k) => mutate((s) => { delete s.settings[k]; });

// ------------------------------------------------------------------ entries

export const categories = () => [...T('categories')].sort((a, b) => a.sortOrder - b.sortOrder);
export const categoryMap = () => new Map(T('categories').map((c) => [c.id, c]));
export const templates = () => T('expense_templates');
export const entry = (id) => T('money_entries').find((e) => e.id === id) || null;

/** Entries with from <= date < to in [cur], newest first. */
export function range(from, to, cur) {
  const a = from.getTime(), b = to.getTime();
  return T('money_entries')
    .filter((e) => e.date >= a && e.date < b && e.currency === cur)
    .sort((x, y) => y.date - x.date || y.id - x.id);
}

export function summary(entries) {
  const s = { income: 0, expense: 0, saving: 0 };
  for (const e of entries) {
    if (e.type === EntryType.income) s.income += e.amount;
    else if (e.type === EntryType.expense) s.expense += e.amount;
    else s.saving += e.amount;
  }
  s.remaining = s.income - s.expense - s.saving;
  return s;
}

export const change = (now, prev) => (prev === 0 ? null : Math.round(((now - prev) / prev) * 100));

export function addEntry(e) {
  return mutate(() => {
    const id = nextId('money_entries');
    const row = {
      id, title: e.title, amount: e.amount, currency: e.currency, type: e.type,
      categoryId: e.categoryId ?? null, goalId: e.goalId ?? null, date: e.date, note: e.note ?? null,
      recurring: !!e.recurring, seriesId: e.recurring ? id : null, createdAt: Date.now(),
    };
    T('money_entries').push(row);
    return id;
  });
}

export function updateEntry(id, patch) {
  mutate(() => {
    const old = entry(id);
    if (!old) return;
    const wasRecurring = old.recurring;
    Object.assign(old, patch);
    if (wasRecurring && !old.recurring && old.seriesId != null) {
      // Turning repetition off stops the whole series.
      for (const e of T('money_entries')) if (e.seriesId === old.seriesId) e.recurring = false;
    } else if (!wasRecurring && old.recurring && old.seriesId == null) {
      old.seriesId = old.id;
    }
  });
}

export const deleteEntry = (id) => mutate((s) => { s.tables.money_entries = T('money_entries').filter((e) => e.id !== id); });

/** Creates this month's copy of every monthly-recurring entry whose day has come. */
export function generateRecurring(now, silent = false) {
  const rows = T('money_entries').filter((e) => e.seriesId != null).sort((a, b) => a.date - b.date);
  const latest = new Map();
  for (const r of rows) latest.set(r.seriesId, r);
  const add = [];
  let id = nextId('money_entries');
  for (const last of latest.values()) {
    if (!last.recurring) continue;
    let next = Dates.addMonths(new Date(last.date), 1);
    while (next.getTime() <= now.getTime()) {
      add.push({
        id: id++, title: last.title, amount: last.amount, currency: last.currency, type: last.type,
        categoryId: last.categoryId, goalId: last.goalId, date: next.getTime(), note: last.note,
        recurring: true, seriesId: last.seriesId, createdAt: Date.now(),
      });
      next = Dates.addMonths(next, 1);
    }
  }
  if (!add.length) return 0;
  if (silent) T('money_entries').push(...add);
  else mutate(() => T('money_entries').push(...add));
  return add.length;
}

export function addCategory(c) {
  return mutate(() => {
    const id = nextId('categories');
    T('categories').push({ id, name: c.name, icon: c.icon, color: c.color, type: c.type, sortOrder: 100 });
    return id;
  });
}

// ------------------------------------------------------------------ goals

export const goals = () => T('saving_goals').filter((g) => !g.archived);
export function goalSaved() {
  const m = new Map();
  for (const e of T('money_entries')) if (e.goalId != null) m.set(e.goalId, (m.get(e.goalId) || 0) + e.amount);
  return m;
}
export const addGoal = (g) => mutate(() => {
  T('saving_goals').push({ id: nextId('saving_goals'), title: g.title, icon: g.icon || 'savings', target: g.target, currency: g.currency, archived: false, createdAt: Date.now() });
});
export const updateGoal = (id, patch) => mutate(() => Object.assign(T('saving_goals').find((g) => g.id === id), patch));
export const deleteGoal = (id) => mutate((s) => {
  for (const e of T('money_entries')) if (e.goalId === id) e.goalId = null;
  s.tables.saving_goals = T('saving_goals').filter((g) => g.id !== id);
});

// ------------------------------------------------------------------ debts / installments / associations

const before = (date, today) => Dates.dateOnly(new Date(date)).getTime() < today.getTime();

export function debtViews() {
  const pays = [...T('debt_payments')].sort((a, b) => a.date - b.date);
  return [...T('debts')].sort((a, b) => b.createdAt - a.createdAt).map((debt) => {
    const payments = pays.filter((p) => p.debtId === debt.id);
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    const remaining = Math.min(Math.max(debt.total - paid, 0), debt.total);
    return {
      kind: 'debt', debt, payments, paid, remaining,
      progress: debt.total === 0 ? 1 : paid / debt.total,
      status(today) {
        if (paid >= debt.total) return 'done';
        if (debt.dueDate != null && before(debt.dueDate, today)) return 'late';
        return paid > 0 ? 'partial' : 'upcoming';
      },
    };
  });
}

export function planViews() {
  const all = [...T('installments')].sort((a, b) => a.seq - b.seq);
  return [...T('installment_plans')].sort((a, b) => b.createdAt - a.createdAt).map((plan) => {
    const items = all.filter((i) => i.planId === plan.id);
    const paid = plan.downPayment + items.filter((i) => i.paidAt != null).reduce((s, i) => s + i.amount, 0);
    const paidCount = items.filter((i) => i.paidAt != null).length;
    const next = items.find((i) => i.paidAt == null) || null;
    const phases = [];
    for (const i of items) {
      const last = phases[phases.length - 1];
      if (last && last[1] === i.amount) last[0]++;
      else phases.push([1, i.amount]);
    }
    return {
      kind: 'plan', plan, items, paid, paidCount, next, phases,
      remaining: Math.min(Math.max(plan.total - paid, 0), plan.total),
      progress: plan.total === 0 ? 1 : paid / plan.total,
      status(today) {
        if (!next) return 'done';
        if (before(next.dueDate, today)) return 'late';
        return paidCount > 0 ? 'partial' : 'upcoming';
      },
    };
  });
}

export function assocViews() {
  const all = [...T('association_rounds')].sort((a, b) => a.seq - b.seq);
  return [...T('associations')].sort((a, b) => b.createdAt - a.createdAt).map((a) => {
    const rounds = all.filter((r) => r.associationId === a.id);
    const paidRounds = rounds.filter((r) => r.paidAt != null).length;
    const total = a.monthlyAmount * a.membersCount;
    const next = rounds.find((r) => r.paidAt == null) || null;
    const payoutReceived = a.payoutReceivedAt != null;
    return {
      kind: 'assoc', a, rounds, paidRounds, total, next, payoutReceived,
      paid: paidRounds * a.monthlyAmount,
      remaining: total - paidRounds * a.monthlyAmount,
      progress: a.membersCount === 0 ? 1 : paidRounds / a.membersCount,
      payoutDate: Dates.addMonths(new Date(a.startDate), a.myTurn - 1),
      currentRound(today) {
        let n = 0;
        for (const r of rounds) if (Dates.dateOnly(new Date(r.dueDate)).getTime() <= today.getTime()) n = r.seq;
        return Math.min(Math.max(n, 1), a.membersCount);
      },
      status(today) {
        if (!next && payoutReceived) return 'done';
        if (next && before(next.dueDate, today)) return 'late';
        return paidRounds > 0 ? 'partial' : 'upcoming';
      },
    };
  });
}

export function createDebt({ direction, person, title, total, currency, dueDate = null, note = null, paidBefore = 0 }) {
  return mutate(() => {
    const id = nextId('debts');
    T('debts').push({ id, direction, person, title, total, currency, dueDate, note, createdAt: Date.now() });
    if (paidBefore > 0) {
      T('debt_payments').push({ id: nextId('debt_payments'), debtId: id, amount: paidBefore, date: Dates.today().getTime(), note: 'مدفوع قبل التسجيل', beforeApp: true });
    }
    return id;
  });
}
export const updateDebt = (id, patch) => mutate(() => Object.assign(T('debts').find((d) => d.id === id), patch));
export const addDebtPayment = (debtId, amount, date) => mutate(() => {
  T('debt_payments').push({ id: nextId('debt_payments'), debtId, amount, date, note: null, beforeApp: false });
});
export const deleteDebtPayment = (id) => mutate((s) => { s.tables.debt_payments = T('debt_payments').filter((p) => p.id !== id); });
export const deleteDebt = (id) => mutate((s) => {
  s.tables.debts = T('debts').filter((d) => d.id !== id);
  s.tables.debt_payments = T('debt_payments').filter((p) => p.debtId !== id);
});

/** Splits (total - down) into [count] installments, or uses [amounts] (stages). */
export function createPlan({ title, vendor = null, total, downPayment = 0, count, firstDueDate, intervalMonths = 1, currency, note = null, paidBefore = 0, amounts = null }) {
  return mutate(() => {
    if (amounts) count = amounts.length;
    const id = nextId('installment_plans');
    T('installment_plans').push({ id, title, vendor, total, downPayment, count, firstDueDate: firstDueDate.getTime(), intervalMonths, currency, note, createdAt: Date.now() });
    const financed = total - downPayment;
    const each = Math.floor(financed / count);
    let iid = nextId('installments');
    for (let i = 0; i < count; i++) {
      const due = Dates.addMonths(firstDueDate, i * intervalMonths).getTime();
      const amount = amounts ? amounts[i] : i === count - 1 ? financed - each * (count - 1) : each;
      const paid = i < paidBefore;
      T('installments').push({ id: iid++, planId: id, seq: i + 1, dueDate: due, amount, paidAt: paid ? due : null, beforeApp: paid });
    }
    return id;
  });
}

/** Changes one installment's amount; the plan total follows. */
export const updateInstallmentAmount = (id, amount) => mutate(() => {
  const item = T('installments').find((i) => i.id === id);
  item.amount = amount;
  const plan = T('installment_plans').find((p) => p.id === item.planId);
  plan.total = plan.downPayment + T('installments').filter((i) => i.planId === plan.id).reduce((s, i) => s + i.amount, 0);
});
export const setInstallmentPaid = (id, paid) => mutate(() => {
  const i = T('installments').find((x) => x.id === id);
  i.paidAt = paid ? Date.now() : null;
});
export const deletePlan = (id) => mutate((s) => {
  s.tables.installment_plans = T('installment_plans').filter((p) => p.id !== id);
  s.tables.installments = T('installments').filter((i) => i.planId !== id);
});

export function createAssociation({ title, monthlyAmount, membersCount, myTurn, startDate, currency, note = null, paidBefore = 0, payoutReceived = false }) {
  return mutate(() => {
    const id = nextId('associations');
    const payoutDate = Dates.addMonths(startDate, myTurn - 1).getTime();
    T('associations').push({ id, title, monthlyAmount, membersCount, myTurn, startDate: startDate.getTime(), currency, note, payoutReceivedAt: payoutReceived ? payoutDate : null, createdAt: Date.now() });
    let rid = nextId('association_rounds');
    for (let i = 0; i < membersCount; i++) {
      const due = Dates.addMonths(startDate, i).getTime();
      const paid = i < paidBefore;
      T('association_rounds').push({ id: rid++, associationId: id, seq: i + 1, dueDate: due, paidAt: paid ? due : null, beforeApp: paid });
    }
    return id;
  });
}
export const setRoundPaid = (id, paid) => mutate(() => { T('association_rounds').find((r) => r.id === id).paidAt = paid ? Date.now() : null; });
export const setPayoutReceived = (id, received) => mutate(() => { T('associations').find((a) => a.id === id).payoutReceivedAt = received ? Date.now() : null; });
export const deleteAssociation = (id) => mutate((s) => {
  s.tables.associations = T('associations').filter((a) => a.id !== id);
  s.tables.association_rounds = T('association_rounds').filter((r) => r.associationId !== id);
});

/** Mirrors a debt payment into the money log (category "ديون وأقساط"). */
export function mirror({ title, amount, currency, income }) {
  const type = income ? EntryType.income : EntryType.expense;
  const cat = T('categories').find((c) => c.name === DEBT_CATEGORY && c.type === type);
  return addEntry({ title, amount, currency, type, categoryId: cat ? cat.id : null, date: Date.now() });
}

// ------------------------------------------------------------------ backup

const MONEY_KIND = 'nazzamha-money', FULL_KIND = 'nazzamha-full', VERSION = 1;

export function exportJson() {
  const tables = {};
  for (const t of MONEY_TABLES) tables[t] = T(t);
  const s = {};
  for (const [k, v] of Object.entries(state.settings)) if (isMoneySetting(k)) s[k] = v;
  return JSON.stringify({ kind: MONEY_KIND, version: VERSION, exportedAt: new Date().toISOString(), settings: s, tables }, null, 1);
}

export const backupName = () => `نظمها-فلوس-${Dates.key(new Date())}.json`;

/** Parses and checks a file; throws Error with an Arabic message. */
export function readBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch (_) { throw new Error('الملف ده مش نسخة من نظمها'); }
  if (!data || typeof data !== 'object' || ![MONEY_KIND, FULL_KIND].includes(data.kind) || typeof data.tables !== 'object') {
    throw new Error('الملف ده مش نسخة من نظمها');
  }
  if ((data.version || 0) > VERSION) throw new Error('الملف ده من نسخة أحدث من التطبيق — حدّث التطبيق الأول');
  const count = (t) => (Array.isArray(data.tables[t]) ? data.tables[t].length : 0);
  return {
    data,
    entries: count('money_entries'), debts: count('debts'), plans: count('installment_plans'),
    associations: count('associations'), goals: count('saving_goals'),
    exportedAt: data.exportedAt ? new Date(data.exportedAt) : null,
  };
}

const toMs = (v) => (v == null ? null : typeof v === 'number' ? v : new Date(v).getTime());
const DATE_FIELDS = ['date', 'createdAt', 'dueDate', 'firstDueDate', 'paidAt', 'startDate', 'payoutReceivedAt'];

/** Replaces all money data with the file's (ids kept so links hold). */
export function importBackup(file) {
  mutate((s) => {
    for (const t of MONEY_TABLES) {
      const rows = Array.isArray(file.data.tables[t]) ? file.data.tables[t] : [];
      s.tables[t] = rows.map((r) => {
        const row = { ...r };
        for (const f of DATE_FIELDS) if (f in row) row[f] = toMs(row[f]);
        return row;
      });
    }
    for (const [k, v] of Object.entries(file.data.settings || {})) if (isMoneySetting(k)) s.settings[k] = String(v);
  });
}
