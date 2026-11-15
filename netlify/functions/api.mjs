/* Halal Meat Shop partner portal API — a Netlify Function that keeps every
   balance sheet, investment and change-log entry in Netlify Blobs, so all
   four partners see the same numbers.

   Routes (all under /api):
     GET    /api/members            public: names + colours, never passwords
     GET    /api/session            who am I
     POST   /api/session            { member, password } -> sign in
     DELETE /api/session            sign out
     POST   /api/password           { current, next } -> change my password
     GET    /api/state              sheets + investments + recent changes
     PUT    /api/sheets/:date       create or replace one day's sheet
     DELETE /api/sheets/:date       delete one day's sheet
     PUT    /api/investments/:id    create or replace one contribution
     DELETE /api/investments/:id    delete one contribution
     PUT    /api/target             { total } -> change the shop's total cost
     POST   /api/seen               mark the change log as read for me
*/

import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

export const config = { path: '/api/*' };

/* ------------------------------- members -------------------------------- */

/* Starting passwords. Change them in Netlify (PORTAL_PASSWORDS, e.g.
   "sam=xxxx,jasim=yyyy,tanvir=zzzz,ruble=wwww") or from the portal itself:
   a password changed in the portal always wins. */
const MEMBERS = [
  { id: 'sam', name: 'Sam', color: '#f97316', password: 'sam2026' },
  { id: 'jasim', name: 'Jasim', color: '#10b981', password: 'jasim2026' },
  { id: 'tanvir', name: 'Tanvir', color: '#8b5cf6', password: 'tanvir2026' },
  { id: 'ruble', name: 'Ruble', color: '#ec4899', password: 'ruble2026' }
];

function envPasswords() {
  const map = {};
  for (const pair of (process.env.PORTAL_PASSWORDS || '').split(',')) {
    const [id, pw] = pair.split('=').map((s) => (s || '').trim());
    if (id && pw) map[id.toLowerCase()] = pw;
  }
  return map;
}

const findMember = (id) => MEMBERS.find((m) => m.id === String(id || '').toLowerCase());
const publicMember = ({ id, name, color }) => ({ id, name, color });

/* -------------------------------- stores -------------------------------- */

const store = () => getStore({ name: 'halal-shop', consistency: 'strong' });

async function secret() {
  if (process.env.PORTAL_SECRET) return process.env.PORTAL_SECRET;
  const s = store();
  const existing = await s.get('auth-secret');
  if (existing) return existing;
  const created = crypto.randomBytes(32).toString('hex');
  await s.set('auth-secret', created);
  return created;
}

/* ----------------------------- seed data -------------------------------- */

const START_DATE = '2026-11-14';

function seedState() {
  const now = new Date().toISOString();
  return {
    target: 33000,
    sheets: {
      [START_DATE]: {
        date: START_DATE,
        sales: { cash: 360, novo: 306.04, mypos: 158.3, mbway: 6.09 },
        expenses: [
          { item: 'Tayob vai', amount: 54.85 },
          { item: 'Breakfast', amount: 3.12 }
        ],
        openingTill: 180,
        closingTill: 180,
        notes: 'Day one — first day after taking over the shop.',
        updatedBy: 'Sam',
        updatedAt: now
      }
    },
    investments: [
      { id: 'seed-sam', investor: 'sam', amount: 3333.33, date: START_DATE, note: 'Deposit (€10,000 split equally)' },
      { id: 'seed-tanvir', investor: 'tanvir', amount: 3333.33, date: START_DATE, note: 'Deposit (€10,000 split equally)' },
      { id: 'seed-ruble', investor: 'ruble', amount: 3333.34, date: START_DATE, note: 'Deposit (€10,000 split equally)' }
    ].map((c) => ({ ...c, updatedBy: 'Sam', updatedAt: now })),
    log: [
      { at: now, by: 'Portal', action: 'Portal opened', detail: 'Day-one sheet (14/11/2026) and €10,000 deposit added.' }
    ]
  };
}

async function loadState() {
  const s = store();
  const state = await s.get('state', { type: 'json' }).catch(() => null);
  if (state) return state;
  const fresh = seedState();
  await s.setJSON('state', fresh);
  return fresh;
}

async function saveState(state, member, action, detail, changes = []) {
  const entry = { at: new Date().toISOString(), by: member.name, action, detail };
  if (changes.length) entry.changes = changes;
  state.log = [entry, ...(state.log || [])].slice(0, 500);
  await store().setJSON('state', state);
  return state;
}

/* --------------------------------- auth --------------------------------- */

const COOKIE = 'halal_session';
const SESSION_DAYS = 30;

const sign = (value, key) => crypto.createHmac('sha256', key).update(value).digest('hex');

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}

async function checkPassword(member, pw) {
  const stored = await store().get(`password/${member.id}`).catch(() => null);
  if (stored) {
    const [salt] = stored.split(':');
    return safeEqual(stored, hashPassword(pw, salt));
  }
  const expected = envPasswords()[member.id] || member.password;
  return safeEqual(expected, pw);
}

async function makeToken(memberId) {
  const expires = Date.now() + SESSION_DAYS * 864e5;
  const body = `${memberId}.${expires}`;
  return `${body}.${sign(body, await secret())}`;
}

async function currentMember(req) {
  const header = req.headers.get('cookie') || '';
  let token = null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) token = rest.join('=');
  }
  if (!token) return null;
  const [id, expires, mac] = token.split('.');
  if (!mac || !safeEqual(mac, sign(`${id}.${expires}`, await secret()))) return null;
  if (Number(expires) < Date.now()) return null;
  return findMember(id) || null;
}

const sessionCookie = (token, maxAge) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

/* ------------------------------- helpers -------------------------------- */

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }
  });

const money = (v) => {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  return Number.isFinite(n) ? n : 0;
};
const euro = (n) => '€' + money(n).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const niceDate = (d) => d.split('-').reverse().join('/');

function cleanSheet(date, body, member) {
  const sales = body.sales || {};
  return {
    date,
    sales: {
      cash: money(sales.cash),
      novo: money(sales.novo),
      mypos: money(sales.mypos),
      mbway: money(sales.mbway)
    },
    expenses: (Array.isArray(body.expenses) ? body.expenses : [])
      .map((e) => ({ item: String(e.item || '').trim().slice(0, 120), amount: money(e.amount) }))
      .filter((e) => e.item || e.amount)
      .slice(0, 100),
    openingTill: money(body.openingTill),
    closingTill: money(body.closingTill),
    notes: String(body.notes || '').slice(0, 2000),
    updatedBy: member.name,
    updatedAt: new Date().toISOString()
  };
}

const salesTotal = (s) => s.sales.cash + s.sales.novo + s.sales.mypos + s.sales.mbway;
const expensesTotal = (s) => s.expenses.reduce((t, e) => t + e.amount, 0);

/* ---------------------------- change tracking --------------------------- */

/* Field-by-field differences, so the log says exactly what was changed:
   "Cash: €360.00 → €380.00", not just "sheet edited". */
const SHEET_FIELDS = [
  ['Cash', (s) => euro(s.sales.cash)],
  ['Novo', (s) => euro(s.sales.novo)],
  ['MyPOS', (s) => euro(s.sales.mypos)],
  ['MB Way', (s) => euro(s.sales.mbway)],
  ['Opening till', (s) => euro(s.openingTill)],
  ['Closing till', (s) => euro(s.closingTill)],
  ['Notes', (s) => s.notes || '—']
];

function sheetChanges(before, after) {
  const changes = [];
  for (const [field, get] of SHEET_FIELDS) {
    const from = get(before);
    const to = get(after);
    if (from !== to) changes.push({ field, from, to });
  }
  // Match expenses that are exactly the same first, then pair up ones with the
  // same name whose amount changed, and whatever is left was added or removed.
  const removed = [...before.expenses];
  const added = [];
  for (const e of after.expenses) {
    const i = removed.findIndex((o) => o.item === e.item && o.amount === e.amount);
    if (i >= 0) removed.splice(i, 1);
    else added.push(e);
  }
  for (const e of [...added]) {
    const i = removed.findIndex((o) => o.item.toLowerCase() === e.item.toLowerCase());
    if (i < 0) continue;
    changes.push({ field: `Expense: ${e.item || '—'}`, from: euro(removed[i].amount), to: euro(e.amount) });
    removed.splice(i, 1);
    added.splice(added.indexOf(e), 1);
  }
  for (const e of removed) changes.push({ field: 'Expense removed', from: `${e.item || '—'} ${euro(e.amount)}`, to: '' });
  for (const e of added) changes.push({ field: 'Expense added', from: '', to: `${e.item || '—'} ${euro(e.amount)}` });
  return changes;
}

function sheetSnapshot(s) {
  return [
    { field: 'Total sales', from: euro(salesTotal(s)), to: '' },
    { field: 'Total expenses', from: euro(expensesTotal(s)), to: '' }
  ];
}

function investmentChanges(before, after) {
  const fields = [
    ['Investor', (c) => findMember(c.investor).name],
    ['Amount', (c) => euro(c.amount)],
    ['Date', (c) => niceDate(c.date)],
    ['Note', (c) => c.note || '—']
  ];
  return fields
    .map(([field, get]) => ({ field, from: get(before), to: get(after) }))
    .filter((c) => c.from !== c.to);
}

/* -------------------------------- routing ------------------------------- */

export default async function handler(req) {
  const url = new URL(req.url);
  const [resource, id] = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = req.method.toUpperCase();

  try {
    if (resource === 'members' && method === 'GET') return json(MEMBERS.map(publicMember));
    if (resource === 'session') return sessionRoute(req, method);

    const member = await currentMember(req);
    if (!member) return json({ error: 'Please sign in first.' }, 401);

    if (resource === 'password' && method === 'POST') return passwordRoute(req, member);
    if (resource === 'state' && method === 'GET') {
      const lastSeen = await store().get(`seen/${member.id}`).catch(() => null);
      return json({ ...(await loadState()), lastSeen: lastSeen || null });
    }
    if (resource === 'seen' && method === 'POST') {
      await store().set(`seen/${member.id}`, new Date().toISOString());
      return json({ ok: true });
    }
    if (resource === 'sheets') return sheetsRoute(req, method, id, member);
    if (resource === 'investments') return investmentsRoute(req, method, id, member);
    if (resource === 'target' && method === 'PUT') return targetRoute(req, member);
    return json({ error: 'Unknown endpoint.' }, 404);
  } catch (err) {
    console.error('portal api failed', err);
    return json({ error: 'The portal could not complete that request.' }, 500);
  }
}

async function sessionRoute(req, method) {
  if (method === 'GET') {
    const member = await currentMember(req);
    return json({ member: member ? publicMember(member) : null });
  }
  if (method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const member = findMember(body.member);
    const pw = String(body.password || '');
    if (!member || !pw || !(await checkPassword(member, pw))) {
      return json({ error: 'Wrong name or password.' }, 401);
    }
    const token = await makeToken(member.id);
    return json(publicMember(member), 200, { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86400) });
  }
  if (method === 'DELETE') return new Response(null, { status: 204, headers: { 'set-cookie': sessionCookie('', 0) } });
  return json({ error: 'Unsupported method.' }, 405);
}

async function passwordRoute(req, member) {
  const body = await req.json().catch(() => ({}));
  const next = String(body.next || '');
  if (!(await checkPassword(member, String(body.current || '')))) {
    return json({ error: 'Your current password is not right.' }, 400);
  }
  if (next.length < 6) return json({ error: 'Use at least 6 characters.' }, 400);
  await store().set(`password/${member.id}`, hashPassword(next));
  const state = await loadState();
  await saveState(state, member, 'Password changed', `${member.name} set a new password.`);
  return json({ ok: true });
}

async function sheetsRoute(req, method, date, member) {
  if (!isDate(date)) return json({ error: 'Which day?' }, 400);
  const state = await loadState();

  if (method === 'PUT') {
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Send the sheet as JSON.' }, 400);
    const before = state.sheets[date];
    const sheet = cleanSheet(date, body, member);
    const changes = before ? sheetChanges(before, sheet) : [];
    if (before && !changes.length) return json(state); // nothing actually changed
    state.sheets[date] = sheet;
    await saveState(
      state, member,
      before ? 'Balance sheet edited' : 'Balance sheet added',
      `${niceDate(date)} — sales ${euro(salesTotal(sheet))}`,
      changes
    );
    return json(state);
  }

  if (method === 'DELETE') {
    if (!state.sheets[date]) return json({ error: 'That day has no sheet.' }, 404);
    const gone = state.sheets[date];
    delete state.sheets[date];
    await saveState(state, member, 'Balance sheet deleted', niceDate(date), sheetSnapshot(gone));
    return json(state);
  }
  return json({ error: 'Unsupported method.' }, 405);
}

const INVESTORS = ['sam', 'tanvir', 'ruble'];

async function investmentsRoute(req, method, id, member) {
  if (!id || !/^[\w-]{3,64}$/.test(id)) return json({ error: 'Which contribution?' }, 400);
  const state = await loadState();
  const idx = state.investments.findIndex((c) => c.id === id);

  if (method === 'PUT') {
    const body = await req.json().catch(() => ({}));
    if (!INVESTORS.includes(body.investor)) return json({ error: 'Pick an investor.' }, 400);
    const amount = money(body.amount);
    if (amount <= 0) return json({ error: 'Enter an amount above zero.' }, 400);
    const entry = {
      id,
      investor: body.investor,
      amount,
      date: isDate(body.date) ? body.date : new Date().toISOString().slice(0, 10),
      note: String(body.note || '').slice(0, 200),
      updatedBy: member.name,
      updatedAt: new Date().toISOString()
    };
    const changes = idx >= 0 ? investmentChanges(state.investments[idx], entry) : [];
    if (idx >= 0 && !changes.length) return json(state);
    if (idx >= 0) state.investments[idx] = entry;
    else state.investments.push(entry);
    const who = findMember(entry.investor).name;
    await saveState(state, member, idx >= 0 ? 'Investment edited' : 'Investment added', `${who} — ${euro(amount)}`, changes);
    return json(state);
  }

  if (method === 'DELETE') {
    if (idx < 0) return json({ error: 'That contribution is gone already.' }, 404);
    const [gone] = state.investments.splice(idx, 1);
    await saveState(state, member, 'Investment deleted', `${findMember(gone.investor).name} — ${euro(gone.amount)}`,
      [{ field: 'Date', from: niceDate(gone.date), to: '' }, { field: 'Note', from: gone.note || '—', to: '' }]);
    return json(state);
  }
  return json({ error: 'Unsupported method.' }, 405);
}

async function targetRoute(req, member) {
  const body = await req.json().catch(() => ({}));
  const total = money(body.total);
  if (total <= 0) return json({ error: 'Enter the total cost.' }, 400);
  const state = await loadState();
  const before = state.target;
  if (before === total) return json(state);
  state.target = total;
  await saveState(state, member, 'Shop cost changed', `${euro(before)} → ${euro(total)}`,
    [{ field: 'Shop cost', from: euro(before), to: euro(total) }]);
  return json(state);
}
