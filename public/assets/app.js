/* Halal Meat Shop — partner portal front end.
   Everything is stored by the /api function; this file only renders it. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const METHODS = [
    { key: 'cash', label: 'Cash', icon: '💶', color: '#16a34a' },
    { key: 'novo', label: 'Novo', icon: '💳', color: '#2563eb' },
    { key: 'mypos', label: 'MyPOS', icon: '💳', color: '#9333ea' },
    { key: 'mbway', label: 'MB Way', icon: '📱', color: '#e11d48' }
  ];
  const INVESTORS = [
    { id: 'sam', label: 'Sam', sub: '', emoji: '🧑‍💼' },
    { id: 'tanvir', label: 'Tanvir', sub: 'with Jasim', emoji: '👬' },
    { id: 'ruble', label: 'Ruble', sub: '', emoji: '🧔' }
  ];

  let members = [];
  let me = null;
  let state = null;
  let selectedDate = null;
  let pickedMember = null;

  /* ------------------------------ helpers ------------------------------ */

  const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
  const fmt = (n) => eur.format(Number(n) || 0);
  const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const niceDate = (d) => d.split('-').reverse().join('/');
  const longDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shortDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const today = () => new Date().toISOString().slice(0, 10);
  const when = (iso) => {
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d) / 60000);
    const rel = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
    return `${d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${rel}`;
  };
  const colorOf = (name) => (members.find((m) => m.name === name || m.id === name) || {}).color || '#64748b';

  function totals(s) {
    const sales = round(METHODS.reduce((t, m) => t + (Number(s.sales[m.key]) || 0), 0));
    const expenses = round(s.expenses.reduce((t, e) => t + (Number(e.amount) || 0), 0));
    const expected = round(Number(s.openingTill) + Number(s.sales.cash) - expenses);
    return { sales, expenses, net: round(sales - expenses), expected, takenOut: round(expected - Number(s.closingTill)) };
  }

  async function api(path, options = {}) {
    const res = await fetch('/api/' + path, {
      credentials: 'same-origin',
      headers: options.body ? { 'content-type': 'application/json' } : {},
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== 'session') { showLogin(); throw new Error('Please sign in again.'); }
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  let toastTimer;
  function toast(msg, bad = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 2600);
  }

  /* ------------------------------- login ------------------------------- */

  function renderPicker() {
    $('#member-picker').innerHTML = members.map((m) => `
      <button type="button" class="member" role="radio" aria-checked="false" data-id="${m.id}" style="--c:${m.color}">
        <span class="avatar">${esc(m.name[0])}</span><span>${esc(m.name)}</span>
      </button>`).join('');
    $$('#member-picker .member').forEach((b) => b.addEventListener('click', () => {
      pickedMember = b.dataset.id;
      $$('#member-picker .member').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      $('#password-input').focus();
    }));
  }

  function showLogin() {
    me = null;
    $('#app-view').hidden = true;
    $('#login-view').hidden = false;
    $('#password-input').value = '';
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.textContent = '';
    if (!pickedMember) { err.textContent = 'Tap your name first.'; return; }
    try {
      me = await api('session', { method: 'POST', body: { member: pickedMember, password: $('#password-input').value } });
      await enterApp();
    } catch (ex) { err.textContent = ex.message; }
  });

  async function enterApp() {
    state = await api('state');
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    const btn = $('#user-button');
    btn.style.setProperty('--c', me.color);
    btn.innerHTML = `<span class="avatar">${esc(me.name[0])}</span><span>${esc(me.name)}</span> ▾`;
    renderAll();
    let tab = 'sheets';
    try { tab = sessionStorage.getItem('tab') || 'sheets'; } catch {}
    showTab(tab);
    $('#latest-strip').onclick = () => showTab('log');
  }

  /* ------------------------------- tabs -------------------------------- */

  function showTab(name) {
    try { sessionStorage.setItem('tab', name); } catch {}
    $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('.tab-panel').forEach((p) => (p.hidden = p.id !== 'tab-' + name));
    if (state && name !== 'log') renderLog();
    if (state && name === 'log') markSeen();
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  const userBtn = $('#user-button');
  userBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = $('#user-dropdown');
    dd.hidden = !dd.hidden;
    userBtn.setAttribute('aria-expanded', String(!dd.hidden));
  });
  document.addEventListener('click', () => { $('#user-dropdown').hidden = true; });
  $('#logout-btn').addEventListener('click', async () => { await api('session', { method: 'DELETE' }).catch(() => {}); showLogin(); });

  function renderAll() { renderSheets(); renderInvest(); renderLog(); }

  /* --------------------------- balance sheets -------------------------- */

  function renderSheets() {
    const dates = Object.keys(state.sheets).sort().reverse();
    const sheets = dates.map((d) => state.sheets[d]);
    if (!selectedDate || !state.sheets[selectedDate]) selectedDate = dates[0] || null;

    const all = sheets.reduce((a, s) => { const t = totals(s); a.sales += t.sales; a.exp += t.expenses; a.out += t.takenOut; return a; }, { sales: 0, exp: 0, out: 0 });
    const avg = sheets.length ? all.sales / sheets.length : 0;
    $('#kpis').innerHTML = [
      ['Total sales', fmt(all.sales), 'k-sales', '🛒'],
      ['Total expenses', fmt(all.exp), 'k-exp', '🧾'],
      ['Net', fmt(all.sales - all.exp), 'k-net', '📈'],
      ['Cash taken out', fmt(all.out), 'k-cash', '💶'],
      ['Days recorded', sheets.length + (sheets.length ? ` · avg ${fmt(avg)}/day` : ''), 'k-days', '📅']
    ].map(([l, v, c, i]) => `<div class="kpi ${c}"><span class="kpi-icon">${i}</span><span class="kpi-label">${l}</span><strong>${v}</strong></div>`).join('');

    const byMethod = METHODS.map((m) => ({ ...m, v: round(sheets.reduce((t, s) => t + (Number(s.sales[m.key]) || 0), 0)) }));
    const sum = byMethod.reduce((t, m) => t + m.v, 0) || 1;
    $('#method-split').innerHTML = `
      <h3>Sales by payment method</h3>
      <div class="split-bar">${byMethod.map((m) => `<span style="width:${(m.v / sum) * 100}%;background:${m.color}" title="${m.label}: ${fmt(m.v)}"></span>`).join('')}</div>
      <ul class="split-legend">${byMethod.map((m) => `<li><i style="background:${m.color}"></i>${m.icon} ${m.label} <b>${fmt(m.v)}</b> <small>${Math.round((m.v / sum) * 100)}%</small></li>`).join('')}</ul>`;

    const max = Math.max(1, ...sheets.map((s) => totals(s).sales));
    $('#day-list').innerHTML = sheets.length ? sheets.map((s) => {
      const t = totals(s);
      return `<li><button class="day ${s.date === selectedDate ? 'active' : ''}" data-date="${s.date}">
        <span class="day-name">${shortDay(s.date)}</span>
        <span class="day-amt">${fmt(t.sales)}</span>
        <span class="day-bar"><span style="width:${(t.sales / max) * 100}%"></span></span>
      </button></li>`;
    }).join('') : '<li class="muted empty">No days yet.</li>';
    $$('#day-list .day').forEach((b) => b.addEventListener('click', () => { selectedDate = b.dataset.date; renderSheets(); }));

    renderSheetDetail();
  }

  function renderSheetDetail() {
    const el = $('#sheet-detail');
    const s = selectedDate && state.sheets[selectedDate];
    if (!s) { el.innerHTML = '<div class="empty-state">📒<p>No balance sheet yet. Tap <b>Add a day</b> to start.</p></div>'; return; }
    const t = totals(s);
    const row = (label, val, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="num">${val}</td></tr>`;

    el.innerHTML = `
      <div class="sheet-head">
        <div>
          <p class="print-only print-title">Halal Meat Shop — Daily Balance Sheet</p>
          <h3>${longDate(s.date)}</h3>
          <p class="who-line small">
            ${s.createdBy && (s.createdBy !== s.updatedBy || s.createdAt !== s.updatedAt) ? `<span class="pill" style="--c:${colorOf(s.createdBy)}">➕ Added by ${esc(s.createdBy)}</span>` : ''}
            <span class="pill" style="--c:${colorOf(s.updatedBy)}">✏️ ${s.createdBy && s.createdAt !== s.updatedAt ? 'Last changed' : 'Added'} by ${esc(s.updatedBy)}</span>
            <span class="muted">${when(s.updatedAt)}</span>
          </p>
        </div>
        <div class="sheet-actions no-print">
          <button class="btn btn-ghost btn-sm" id="edit-sheet">✏️ Edit</button>
          <button class="btn btn-ghost btn-sm" id="print-sheet">🖨️ Print</button>
          <button class="btn btn-danger btn-sm" id="delete-sheet">🗑️</button>
        </div>
      </div>

      <div class="net-banner">
        <div><span>Total sales</span><strong>${fmt(t.sales)}</strong></div>
        <div><span>Expenses</span><strong>${fmt(t.expenses)}</strong></div>
        <div class="net"><span>Net for the day</span><strong>${fmt(t.net)}</strong></div>
      </div>

      <div class="sheet-grid">
        <section class="sheet-block b-sales">
          <h4>Sales</h4>
          <table class="table">
            <thead><tr><th>Payment method</th><th class="num">Amount</th></tr></thead>
            <tbody>${METHODS.map((m) => row(`${m.icon} ${m.label}`, fmt(s.sales[m.key]))).join('')}
            ${row('<b>Total sales</b>', `<b>${fmt(t.sales)}</b>`, 'total')}</tbody>
          </table>
        </section>

        <section class="sheet-block b-exp">
          <h4>Expenses</h4>
          <table class="table">
            <thead><tr><th>Item</th><th class="num">Amount</th></tr></thead>
            <tbody>${s.expenses.length ? s.expenses.map((e) => row(esc(e.item), fmt(e.amount))).join('') : row('<span class="muted">No expenses</span>', '')}
            ${row('<b>Total expenses</b>', `<b>${fmt(t.expenses)}</b>`, 'total')}</tbody>
          </table>
        </section>

        <section class="sheet-block b-sum">
          <h4>Summary</h4>
          <table class="table"><tbody>
            ${row('Total sales', fmt(t.sales))}
            ${row('Total expenses', fmt(t.expenses))}
            ${row('<b>Net for the day</b>', `<b>${fmt(t.net)}</b>`, 'total')}
          </tbody></table>
        </section>

        <section class="sheet-block b-till">
          <h4>Cash till</h4>
          <table class="table"><tbody>
            ${row('Opening till', fmt(s.openingTill))}
            ${row('+ Cash sales', fmt(s.sales.cash))}
            ${row('− Expenses (paid from till)', fmt(t.expenses))}
            ${row('<b>Expected cash</b>', `<b>${fmt(t.expected)}</b>`, 'total')}
            ${row('Closing till (float kept)', fmt(s.closingTill))}
            ${row('<b>Cash taken out</b>', `<b>${fmt(t.takenOut)}</b>`, 'total highlight')}
          </tbody></table>
        </section>
      </div>
      ${s.notes ? `<p class="notes">📝 ${esc(s.notes)}</p>` : ''}`;

    $('#edit-sheet').addEventListener('click', () => openSheetDialog(s));
    $('#print-sheet').addEventListener('click', () => window.print());
    $('#delete-sheet').addEventListener('click', async () => {
      if (!confirm(`Delete the balance sheet for ${niceDate(s.date)}? This cannot be undone.`)) return;
      try { state = await api('sheets/' + s.date, { method: 'DELETE' }); selectedDate = null; renderAll(); toast('Sheet deleted'); }
      catch (ex) { toast(ex.message, true); }
    });
  }

  /* --- sheet editor --- */

  const sheetDialog = $('#sheet-dialog');
  const sheetForm = $('#sheet-form');
  const MONEY_FIELDS = ['cash', 'novo', 'mypos', 'mbway', 'openingTill', 'closingTill'];
  const DRAFT_KEY = 'halal-draft-new-day';
  let editingDate = null;

  // "12,50", "12.50", "€12" and sums like "120+35,5" all work. Empty is 0, nonsense is NaN.
  function parseMoney(v) {
    const s = String(v ?? '').replace(/[\s€]/g, '').replace(/,/g, '.');
    if (!s) return 0;
    let total = 0;
    for (const part of s.split('+')) {
      if (!/^\d*\.?\d*$/.test(part) || part === '.' ) return NaN;
      total += part ? parseFloat(part) : 0;
    }
    return round(total);
  }
  const showMoney = (n) => (n || n === 0) && n !== '' ? String(n) : '';

  function expenseRow(item = '', amount = '', focus = null) {
    const div = document.createElement('div');
    div.className = 'expense-row';
    div.innerHTML = `
      <input type="text" class="exp-item" placeholder="What for?" maxlength="120" value="${esc(item)}" aria-label="Expense item" enterkeyhint="next" list="expense-names" />
      <span class="money"><i>€</i><input type="text" class="exp-amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(showMoney(amount))}" aria-label="Expense amount" enterkeyhint="next" /></span>
      <button type="button" class="icon-btn remove" aria-label="Remove expense">✕</button>`;
    div.querySelector('.remove').addEventListener('click', () => { div.remove(); updatePreview(); });
    $('#expense-rows').appendChild(div);
    if (focus) div.querySelector(focus).focus();
    updatePreview();
  }
  $('#add-expense').addEventListener('click', () => expenseRow('', '', '.exp-item'));

  // Items used before, most frequent first, as one-tap chips.
  function knownExpenses() {
    const count = {};
    for (const s of Object.values(state.sheets)) for (const e of s.expenses) if (e.item) count[e.item] = (count[e.item] || 0) + 1;
    return Object.keys(count).sort((a, b) => count[b] - count[a]);
  }
  function renderSuggestions() {
    const used = new Set($$('#expense-rows .exp-item').map((i) => i.value.trim().toLowerCase()));
    const items = knownExpenses().filter((i) => !used.has(i.toLowerCase())).slice(0, 8);
    $('#expense-suggest').innerHTML = items.map((i) => `<button type="button" class="chip-add">＋ ${esc(i)}</button>`).join('');
    $$('#expense-suggest .chip-add').forEach((b, idx) => b.addEventListener('click', () => {
      const empty = $$('#expense-rows .expense-row').find((r) => !r.querySelector('.exp-item').value.trim() && !r.querySelector('.exp-amount').value.trim());
      if (empty) { empty.querySelector('.exp-item').value = items[idx]; empty.querySelector('.exp-amount').focus(); updatePreview(); }
      else expenseRow(items[idx], '', '.exp-amount');
    }));
    let list = $('#expense-names');
    if (!list) { list = document.createElement('datalist'); list.id = 'expense-names'; document.body.appendChild(list); }
    list.innerHTML = knownExpenses().map((i) => `<option value="${esc(i)}"></option>`).join('');
  }

  function readSheetForm() {
    const f = sheetForm.elements;
    return {
      date: f.date.value,
      sales: { cash: parseMoney(f.cash.value), novo: parseMoney(f.novo.value), mypos: parseMoney(f.mypos.value), mbway: parseMoney(f.mbway.value) },
      expenses: $$('#expense-rows .expense-row').map((r) => ({ item: r.querySelector('.exp-item').value.trim(), amount: parseMoney(r.querySelector('.exp-amount').value) })).filter((e) => e.item || e.amount),
      openingTill: parseMoney(f.openingTill.value),
      closingTill: parseMoney(f.closingTill.value),
      notes: f.notes.value.trim()
    };
  }

  function badInputs() {
    return [...MONEY_FIELDS.map((n) => sheetForm.elements[n]), ...$$('#expense-rows .exp-amount')].filter((i) => Number.isNaN(parseMoney(i.value)));
  }

  function updatePreview() {
    // Mark fields that cannot be read as an amount, and show the result of sums.
    $$('input', sheetForm).forEach((i) => i.classList.remove('bad'));
    badInputs().forEach((i) => i.classList.add('bad'));
    MONEY_FIELDS.forEach((n) => {
      const v = sheetForm.elements[n].value;
      const out = $(`.calc[data-for="${n}"]`);
      const val = parseMoney(v);
      out.textContent = v.includes('+') && !Number.isNaN(val) ? `= ${fmt(val)}` : '';
    });

    const data = readSheetForm();
    const ok = !badInputs().length;
    const t = totals({ ...data, sales: Object.fromEntries(Object.entries(data.sales).map(([k, v]) => [k, v || 0])),
      expenses: data.expenses.map((e) => ({ ...e, amount: e.amount || 0 })), openingTill: data.openingTill || 0, closingTill: data.closingTill || 0 });
    $('#ed-sales-total').textContent = fmt(t.sales);
    $('#ed-exp-total').textContent = fmt(t.expenses);
    $('#sheet-preview').innerHTML = `
      <div><span>Sales</span><strong>${fmt(t.sales)}</strong></div>
      <div><span>Expenses</span><strong>${fmt(t.expenses)}</strong></div>
      <div><span>Net</span><strong>${fmt(t.net)}</strong></div>
      <div class="hl"><span>Cash taken out</span><strong>${fmt(t.takenOut)}</strong></div>`;
    $('.save-btn').disabled = !ok;

    const warn = $('#date-warning');
    const clash = data.date && data.date !== editingDate && state.sheets[data.date];
    warn.hidden = !clash;
    if (clash) warn.innerHTML = `⚠️ ${niceDate(data.date)} already has a sheet. Saving will replace it.`;
    $$('.qd').forEach((b) => b.classList.toggle('on', data.date === dayOffset(Number(b.dataset.day))));
    renderSuggestions();

    if (!editingDate) {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(rawForm())); } catch {}
    }
  }
  sheetForm.addEventListener('input', updatePreview);

  function dayOffset(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  $$('.qd').forEach((b) => b.addEventListener('click', () => { sheetForm.elements.date.value = dayOffset(Number(b.dataset.day)); updatePreview(); }));

  // What the person typed, exactly, so a draft comes back as they left it.
  function rawForm() {
    const f = sheetForm.elements;
    const o = { date: f.date.value, notes: f.notes.value };
    MONEY_FIELDS.forEach((n) => (o[n] = f[n].value));
    o.expenses = $$('#expense-rows .expense-row').map((r) => [r.querySelector('.exp-item').value, r.querySelector('.exp-amount').value]);
    return o;
  }

  // Enter moves to the next box instead of saving half a sheet; tapping a box selects what is in it.
  sheetForm.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    const inputs = $$('input:not([type=date]), textarea', sheetForm);
    const next = inputs[inputs.indexOf(e.target) + 1];
    if (next) next.focus(); else sheetForm.requestSubmit();
  });
  sheetForm.addEventListener('focusin', (e) => {
    if (e.target.matches('.money input')) setTimeout(() => e.target.select(), 0);
  });

  function openSheetDialog(sheet) {
    editingDate = sheet ? sheet.date : null;
    $('#sheet-error').textContent = '';
    $('#sheet-dialog-title').textContent = sheet ? `Edit ${shortDay(sheet.date)}` : 'New day';
    const f = sheetForm.elements;
    const dates = Object.keys(state.sheets).sort();
    const last = dates.length ? state.sheets[dates[dates.length - 1]] : null;
    $('#expense-rows').innerHTML = '';

    let draft = null;
    if (!sheet) { try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch {} }
    const hasDraft = draft && (MONEY_FIELDS.slice(0, 4).some((n) => draft[n]) || (draft.expenses || []).some(([i, a]) => i || a));

    if (sheet) {
      f.date.value = sheet.date;
      METHODS.forEach((m) => (f[m.key].value = showMoney(sheet.sales[m.key] || '')));
      f.openingTill.value = showMoney(sheet.openingTill);
      f.closingTill.value = showMoney(sheet.closingTill);
      f.notes.value = sheet.notes || '';
      sheet.expenses.forEach((e) => expenseRow(e.item, e.amount));
    } else if (hasDraft) {
      f.date.value = draft.date || today();
      MONEY_FIELDS.forEach((n) => (f[n].value = draft[n] || ''));
      f.notes.value = draft.notes || '';
      (draft.expenses || []).forEach(([i, a]) => expenseRow(i, a));
      toast('Your unsaved day was brought back');
    } else {
      // The next day after the last sheet, starting with its closing float.
      const next = last ? (() => { const d = new Date(last.date + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })() : today();
      f.date.value = next <= today() ? next : today();
      MONEY_FIELDS.forEach((n) => (f[n].value = ''));
      f.openingTill.value = showMoney(last ? last.closingTill : 180);
      f.closingTill.value = showMoney(last ? last.closingTill : 180);
      f.notes.value = '';
    }
    if (!$$('#expense-rows .expense-row').length) expenseRow();
    updatePreview();
    sheetDialog.showModal();
    sheetDialog.querySelector('.dialog-body').scrollTop = 0;
    if (!sheet && window.matchMedia('(min-width: 821px)').matches) f.cash.focus();
  }
  $('#new-sheet-btn').addEventListener('click', () => openSheetDialog(null));

  sheetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#sheet-error');
    err.textContent = '';
    const bad = badInputs();
    if (bad.length) { err.textContent = 'One amount is not a number — check the red box.'; bad[0].focus(); return; }
    const data = readSheetForm();
    if (!data.date) { err.textContent = 'Pick a date.'; return; }
    if (data.date !== editingDate && state.sheets[data.date] &&
        !confirm(`There is already a sheet for ${niceDate(data.date)}. Replace it?`)) return;
    const btn = $('.save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      state = await api('sheets/' + data.date, { method: 'PUT', body: data });
      if (editingDate && editingDate !== data.date) state = await api('sheets/' + editingDate, { method: 'DELETE' });
      if (!editingDate) { try { localStorage.removeItem(DRAFT_KEY); } catch {} }
      selectedDate = data.date;
      sheetDialog.close();
      renderAll();
      toast('Day saved ✔');
    } catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; btn.textContent = 'Save day'; }
  });

  /* ----------------------------- investment ---------------------------- */

  function renderInvest() {
    const target = Number(state.target) || 0;
    const paid = round(state.investments.reduce((t, c) => t + c.amount, 0));
    const left = round(target - paid);
    const pct = target ? Math.min(100, (paid / target) * 100) : 0;
    const share = round(target / INVESTORS.length);

    $('#invest-hero').innerHTML = `
      <div class="ring" style="--p:${pct}"><div><strong>${Math.round(pct)}%</strong><span>paid</span></div></div>
      <div class="hero-stats">
        <div class="hs hs-target"><span>Shop cost</span><strong>${fmt(target)}</strong><button class="link" id="edit-target">change</button></div>
        <div class="hs hs-paid"><span>Invested so far</span><strong>${fmt(paid)}</strong></div>
        <div class="hs hs-left"><span>Still to pay</span><strong>${fmt(Math.max(0, left))}</strong></div>
        <div class="hs hs-share"><span>Each investor's share</span><strong>${fmt(share)}</strong></div>
      </div>`;
    $('#edit-target').addEventListener('click', () => {
      $('#target-error').textContent = '';
      $('#target-form').elements.total.value = target;
      $('#target-dialog').showModal();
    });

    $('#investor-cards').innerHTML = INVESTORS.map((inv) => {
      const mine = round(state.investments.filter((c) => c.investor === inv.id).reduce((t, c) => t + c.amount, 0));
      const p = share ? Math.min(100, (mine / share) * 100) : 0;
      const color = colorOf(inv.id);
      return `<div class="card investor" style="--c:${color}">
        <div class="inv-head"><span class="avatar big">${inv.emoji}</span>
          <div><strong>${inv.label}</strong>${inv.sub ? `<small>${inv.sub}</small>` : ''}</div></div>
        <div class="inv-amount">${fmt(mine)} <small>of ${fmt(share)}</small></div>
        <div class="progress"><span style="width:${p}%"></span></div>
        <div class="inv-foot"><span>${Math.round(p)}% paid</span><span>${fmt(Math.max(0, share - mine))} left</span></div>
      </div>`;
    }).join('');

    const list = [...state.investments].sort((a, b) => b.date.localeCompare(a.date));
    const name = (id) => (INVESTORS.find((i) => i.id === id) || {}).label || id;
    $('#invest-table').innerHTML = `
      <thead><tr><th>Date</th><th>Investor</th><th>Note</th><th class="num">Amount</th><th class="no-print"></th></tr></thead>
      <tbody>${list.length ? list.map((c) => `
        <tr>
          <td>${niceDate(c.date)}</td>
          <td><span class="pill" style="--c:${colorOf(c.investor)}">${name(c.investor)}</span></td>
          <td>${esc(c.note)}<div class="muted tiny">${c.createdBy && c.createdAt !== c.updatedAt ? `added by <b style="color:${colorOf(c.createdBy)}">${esc(c.createdBy)}</b> · last changed by` : 'added by'} <b style="color:${colorOf(c.updatedBy)}">${esc(c.updatedBy)}</b> · ${when(c.updatedAt)}</div></td>
          <td class="num"><b>${fmt(c.amount)}</b></td>
          <td class="row-actions no-print">
            <button class="icon-btn" data-edit="${c.id}" aria-label="Edit">✏️</button>
            <button class="icon-btn" data-del="${c.id}" aria-label="Delete">🗑️</button>
          </td>
        </tr>`).join('') : '<tr><td colspan="5" class="muted">No payments yet.</td></tr>'}
        <tr class="total"><td colspan="3"><b>Total invested</b></td><td class="num"><b>${fmt(paid)}</b></td><td></td></tr>
      </tbody>`;
    $$('#invest-table [data-edit]').forEach((b) => b.addEventListener('click', () => openInvestDialog(state.investments.find((c) => c.id === b.dataset.edit))));
    $$('#invest-table [data-del]').forEach((b) => b.addEventListener('click', async () => {
      const c = state.investments.find((x) => x.id === b.dataset.del);
      if (!confirm(`Delete ${name(c.investor)}'s payment of ${fmt(c.amount)}?`)) return;
      try { state = await api('investments/' + c.id, { method: 'DELETE' }); renderAll(); toast('Payment deleted'); }
      catch (ex) { toast(ex.message, true); }
    }));
  }

  const investDialog = $('#invest-dialog');
  let editingInvest = null;
  function openInvestDialog(c) {
    editingInvest = c ? c.id : null;
    $('#invest-error').textContent = '';
    $('#invest-dialog-title').textContent = c ? 'Edit payment' : 'New payment';
    const f = $('#invest-form').elements;
    f.investor.value = c ? c.investor : (INVESTORS.some((i) => i.id === me.id) ? me.id : me.id === 'jasim' ? 'tanvir' : 'sam');
    f.amount.value = c ? c.amount : '';
    f.date.value = c ? c.date : today();
    f.note.value = c ? c.note : '';
    investDialog.showModal();
  }
  $('#new-invest-btn').addEventListener('click', () => openInvestDialog(null));

  $('#invest-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const id = editingInvest || 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try {
      state = await api('investments/' + id, { method: 'PUT', body: { investor: f.investor.value, amount: parseFloat(f.amount.value), date: f.date.value, note: f.note.value.trim() } });
      investDialog.close(); renderAll(); toast('Payment saved ✔');
    } catch (ex) { $('#invest-error').textContent = ex.message; }
  });

  $('#target-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      state = await api('target', { method: 'PUT', body: { total: parseFloat(e.target.elements.total.value) } });
      $('#target-dialog').close(); renderAll(); toast('Shop cost updated ✔');
    } catch (ex) { $('#target-error').textContent = ex.message; }
  });

  /* ----------------------------- change log ---------------------------- */

  const ICONS = { added: '🟢', edited: '🟡', deleted: '🔴', changed: '🔵', opened: '🎉' };
  const KINDS = [
    { id: 'all', label: 'Everything' },
    { id: 'sheet', label: '📒 Balance sheets' },
    { id: 'invest', label: '💰 Investment' },
    { id: 'other', label: '⚙️ Other' }
  ];
  const logFilter = { by: 'all', kind: 'all' };
  const kindOf = (l) => /balance sheet/i.test(l.action) ? 'sheet' : /investment|shop cost/i.test(l.action) ? 'invest' : 'other';
  const iconOf = (l) => ICONS[Object.keys(ICONS).find((k) => l.action.toLowerCase().includes(k)) || 'changed'];

  function sentence(l) {
    const m = /^(.*) (added|edited|deleted|changed|opened)$/i.exec(l.action);
    if (!m) return l.action.toLowerCase();
    const verb = m[2].toLowerCase();
    const thing = m[1].toLowerCase().replace('investment', 'an investment payment').replace('balance sheet', 'the balance sheet').replace('shop cost', 'the shop cost').replace('password', 'their password').replace('portal', 'the portal');
    return `${verb} ${thing}`;
  }

  // Changes made by the other partners since I last opened this tab.
  const unseen = () => (state.log || []).filter((l) => l.by !== me.name && (!state.lastSeen || l.at > state.lastSeen));

  function dayLabel(iso) {
    const d = new Date(iso); const t = new Date();
    const y = new Date(t); y.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function renderChips(el, items, key) {
    el.innerHTML = items.map((i) => `<button class="chip ${logFilter[key] === i.id ? 'on' : ''}" data-v="${esc(i.id)}" style="--c:${i.color || '#7c3aed'}">${esc(i.label)}</button>`).join('');
    $$('.chip', el).forEach((b) => b.addEventListener('click', () => { logFilter[key] = b.dataset.v; renderLog(); }));
  }

  function renderLog() {
    renderChips($('#log-people'), [{ id: 'all', label: '👥 Everyone' }, ...members.map((m) => ({ id: m.name, label: m.name, color: m.color }))], 'by');
    renderChips($('#log-kinds'), KINDS, 'kind');

    const fresh = new Set(unseen());
    const badge = $('#log-badge');
    badge.hidden = !fresh.size;
    badge.textContent = fresh.size > 99 ? '99+' : fresh.size;

    const latest = (state.log || [])[0];
    const strip = $('#latest-strip');
    strip.hidden = !latest;
    if (latest) {
      strip.innerHTML = `<span class="live-dot"></span> <span class="strip-text">Last change: <b style="color:${colorOf(latest.by)}">${esc(latest.by)}</b> ${esc(sentence(latest))} · ${esc(latest.detail)} <span class="muted">· ${when(latest.at)}</span></span>`;
    }

    const log = (state.log || []).filter((l) =>
      (logFilter.by === 'all' || l.by === logFilter.by) && (logFilter.kind === 'all' || kindOf(l) === logFilter.kind));

    if (!log.length) { $('#log-list').innerHTML = '<p class="muted">No changes match this filter.</p>'; return; }

    const groups = [];
    for (const l of log) {
      const label = dayLabel(l.at);
      if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
      groups[groups.length - 1].items.push(l);
    }
    $('#log-list').innerHTML = groups.map((g) => `
      <h4 class="log-day">${g.label}</h4>
      <ol class="timeline">${g.items.map((l) => `
        <li class="${fresh.has(l) ? 'fresh' : ''}">
          <span class="avatar log-avatar" style="--c:${colorOf(l.by)}">${esc(l.by[0])}<i>${iconOf(l)}</i></span>
          <div class="log-body">
            <div class="log-line"><b class="who" style="color:${colorOf(l.by)}">${esc(l.by)}</b> ${esc(sentence(l))}
              <span class="log-detail">${esc(l.detail)}</span> ${fresh.has(l) ? '<span class="new-tag">NEW</span>' : ''}</div>
            ${l.changes && l.changes.length ? `<ul class="diff">${l.changes.map((c) => `
              <li><span class="diff-field">${esc(c.field)}</span>
                ${c.from ? `<span class="diff-from">${esc(c.from)}</span>` : ''}
                ${c.from && c.to ? '<span class="arrow">→</span>' : ''}
                ${c.to ? `<span class="diff-to">${esc(c.to)}</span>` : ''}</li>`).join('')}</ul>` : ''}
            <div class="muted small">🕒 ${new Date(l.at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${when(l.at).split(' · ')[1]}</div>
          </div>
        </li>`).join('')}</ol>`).join('');
  }

  // Opening the tab marks everything as read; the NEW tags stay until you leave it.
  async function markSeen() {
    if (!unseen().length) return;
    try {
      await api('seen', { method: 'POST' });
      state.lastSeen = new Date().toISOString();
      $('#log-badge').hidden = true;
    } catch {}
  }

  /* ------------------------------ password ----------------------------- */

  $('#change-password-btn').addEventListener('click', () => {
    $('#password-form').reset();
    $('#password-error').textContent = '';
    $('#password-dialog').showModal();
  });
  $('#password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    if (f.next.value !== f.repeat.value) { $('#password-error').textContent = 'The new passwords do not match.'; return; }
    try {
      await api('password', { method: 'POST', body: { current: f.current.value, next: f.next.value } });
      $('#password-dialog').close();
      state = await api('state'); renderAll();
      toast('Password changed ✔');
    } catch (ex) { $('#password-error').textContent = ex.message; }
  });

  /* ------------------------------- dialogs ----------------------------- */

  $$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  /* -------------------------------- start ------------------------------ */

  (async function start() {
    try {
      members = await api('members');
      renderPicker();
      const { member } = await api('session');
      if (member) { me = member; await enterApp(); return; }
    } catch (ex) {
      $('#login-error').textContent = 'Could not reach the portal server. ' + ex.message;
    }
    showLogin();
  })();
})();
