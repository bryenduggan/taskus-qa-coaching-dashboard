/* ═══════════════════════════════════════════════════════════════════
   report.js — TaskUs hand-off report builder (print-to-PDF + Slack)
   Loaded AFTER app.js; reuses its globals (val, pct, B/N/D, managerOf,
   findCalibrationCalls, extractRcId, dataCache, Chart, …).
   The QA Hub lives behind Okta so TaskUs can't open it — this turns the
   dashboard into a portable artifact (PDF / Slack text) to send them.
   ═══════════════════════════════════════════════════════════════════ */

const RPT = { type: 'qa-leads', period: 'last-month', manager: 'all', sections: new Set() };

const RPT_TYPES = [
  { key: 'qa-leads',     icon: '📈', title: 'QA leads',     desc: 'Exec summary, org trends, AI vs manual calibration' },
  { key: 'team-leads',   icon: '👥', title: 'Team leads',   desc: 'Team averages, rep table, dispo errors, autofails' },
  { key: 'rep-feedback', icon: '🗂', title: 'Rep feedback', desc: 'Per-rep coaching docs for a whole team (one per rep)' },
];

const SECTIONS = {
  'qa-leads': [
    { k: 'kpis',        label: 'Organization KPIs',         def: true },
    { k: 'calibration', label: 'AI vs manual calibration',  def: true },
    { k: 'trends',      label: 'Score trends',              def: true },
    { k: 'managers',    label: 'Manager comparison',        def: true },
    { k: 'dispo',       label: 'Disposition accuracy (org)',def: true },
  ],
  'team-leads': [
    { k: 'kpis',        label: 'Team KPIs vs org',          def: true },
    { k: 'reps',        label: 'Per-rep performance table', def: true },
    { k: 'dispo',       label: 'Disposition accuracy (team)',def: true },
    { k: 'autofails',   label: 'Autofails needing action',  def: true },
    { k: 'calibration', label: 'AI vs manual calibration',  def: false },
    { k: 'trends',      label: 'Team score trends',         def: false },
  ],
  'rep-feedback': [
    { k: 'rf_scores',    label: 'AI vs manual scores + section averages', def: true },
    { k: 'rf_dispo',     label: 'Disposition usage',           def: true },
    { k: 'rf_coaching',  label: 'Coaching themes',             def: true },
    { k: 'rf_trend',     label: 'Score trend',                 def: true },
    { k: 'rf_calls',     label: 'Call history (clickable IDs)', def: true },
    { k: 'rf_autofails', label: 'Autofails with explanation',  def: true },
  ],
};

const PERIOD_KEYS  = ['all','today','yesterday','current-week','prev-week','mtd','last-month','qtd','last-4-weeks'];
const PERIOD_LABEL = { all:'All time', today:'Today', yesterday:'Yesterday', 'current-week':'This week',
  'prev-week':'Last week', mtd:'Month to date', 'last-month':'Last month', qtd:'Quarter to date', 'last-4-weeks':'Last 4 weeks' };
function periodLabel(p) { return PERIOD_LABEL[p] || p; }

/* ───────────────────── data scoping ───────────────────── */
function rptBounds(period) {
  if (period === 'all') return null;
  if (period === 'today' || period === 'yesterday') {
    const now = new Date();
    const t   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'today') return { start: t, end: t };
    const y = new Date(t); y.setDate(t.getDate() - 1);
    return { start: y, end: y };
  }
  return getPeriodBounds(period);
}

function rptScopedData() {
  let booked = (dataCache && dataCache.bookedRows) || [];
  let nb     = (dataCache && dataCache.nbRows) || [];
  const b = rptBounds(RPT.period);
  if (b) {
    booked = booked.filter(r => inPeriod(val(r, B.DATE_SCORED), b));
    nb     = nb.filter(r => inPeriod(val(r, N.DATE_SCORED), b));
  }
  if (RPT.manager && RPT.manager !== 'all') {
    booked = booked.filter(r => managerOf(r, 'booked') === RPT.manager);
    nb     = nb.filter(r => managerOf(r, 'nb') === RPT.manager);
  }
  return { booked, nb };
}

function ovScore(r, rubric) { return pct(r, rubric === 'booked' ? B.OVERALL : N.OVERALL); }
function combinedAvg(booked, nb) {
  const s = [
    ...booked.filter(r => !isAutofailRow(r, 'booked')).map(r => ovScore(r, 'booked')),
    ...nb.filter(r => !isAutofailRow(r, 'nb')).map(r => ovScore(r, 'nb')),
  ].filter(n => n !== null && !isNaN(n));
  return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
}
function afCount(booked, nb) {
  return booked.filter(r => isAutofailRow(r, 'booked')).length + nb.filter(r => isAutofailRow(r, 'nb')).length;
}

function repMap(scope) {
  const map = {};
  const add = (r, rubric) => {
    const a = val(r, rubric === 'booked' ? B.AGENT : N.AGENT);
    if (!a) return;
    (map[a] = map[a] || { b: [], n: [] })[rubric === 'booked' ? 'b' : 'n'].push(r);
  };
  scope.booked.forEach(r => add(r, 'booked'));
  scope.nb.forEach(r => add(r, 'nb'));
  return map;
}
function allManagers() {
  if (!dataCache) return [];
  const set = new Set();
  (dataCache.bookedRows || []).forEach(r => set.add(managerOf(r, 'booked')));
  (dataCache.nbRows || []).forEach(r => set.add(managerOf(r, 'nb')));
  return [...set].filter(Boolean).sort();
}

function repDispoRows(name) { return ((dataCache && dataCache.dispoRows) || []).filter(r => val(r, D.AGENT) === name); }
function repDispoAccuracy(name) {
  const rows = repDispoRows(name);
  if (!rows.length) return null;
  return Math.round(rows.filter(r => val(r, D.VERDICT) === 'Accurate').length / rows.length * 100);
}
function scopedDispoRows() {
  let rows = ((dataCache && dataCache.dispoRows) || []).slice();
  if (RPT.manager && RPT.manager !== 'all') rows = rows.filter(r => canonMgr(val(r, D.MANAGER)) === RPT.manager);
  const b = rptBounds(RPT.period);
  if (b) {
    const dateById = {};
    (dataCache.bookedRows || []).forEach(r => { const id = val(r, B.CALL_ID); if (id) dateById[id] = val(r, B.DATE_SCORED); });
    (dataCache.nbRows || []).forEach(r => { const id = val(r, N.CALL_ID); if (id && !dateById[id]) dateById[id] = val(r, N.DATE_SCORED); });
    rows = rows.filter(r => inPeriod(dateById[val(r, D.CALL_ID)] || '', b));
  }
  return rows;
}
function verdictClass(v) { return v === 'Over-credited' ? 'red' : v === 'Under-credited' ? 'amber' : v === 'Lateral' ? 'blue' : 'green'; }

function weekKey(d) {
  const dt = parseDateStr(d); if (!dt) return null;
  const dow = dt.getDay();
  const mon = new Date(dt); mon.setDate(dt.getDate() - (dow === 0 ? 6 : dow - 1));
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
}
function autofailExplain(r, rubric) {
  const cats = [];
  if (rubric === 'booked') {
    if (isYes(r, B.AF_MISINFO)) cats.push('Misinformation');
    if (isYes(r, B.AF_RUDE))    cats.push('Rude / unprofessional');
    if (isYes(r, B.AF_PROF))    cats.push('Professionalism');
    if (isYes(r, B.AF_PII))     cats.push('PII / compliance');
  } else {
    if (isYes(r, N.AF_RUDE))    cats.push('Rude / unprofessional');
    if (isYes(r, N.AF_MISINFO)) cats.push('Misinformation');
    if (isYes(r, N.AF_LEGAL))   cats.push('Legal / compliance');
  }
  return cats;
}
function callLink(id) { return REVENUE_IO_BASE + extractRcId(id); }

/* ───────────────────── render primitives ───────────────────── */
let _rptChartJobs = [];
let _rptCharts = [];
let _rptCid = 0;
function rptChartCanvas(initFn, height) {
  const id = 'rpt-chart-' + (++_rptCid);
  _rptChartJobs.push(() => { const c = el(id); if (c) { try { _rptCharts.push(initFn(c)); } catch (e) { console.error('rpt chart', e); } } });
  return `<div class="rpt-chart" style="height:${height || 220}px"><canvas id="${id}"></canvas></div>`;
}
function rptBarOpts()  { return { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } } }; }
function rptLineOpts() { return { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } } }; }

function rptCard(title, inner) { return `<section class="rpt-section"><h2 class="rpt-h2">${esc(title)}</h2>${inner}</section>`; }
function rptKpiRow(items) {
  return `<div class="rpt-kpis">` + items.map(k =>
    `<div class="rpt-kpi ${k.cls || ''}"><div class="rpt-kpi-label">${esc(k.label)}</div><div class="rpt-kpi-val">${k.value}</div>${k.sub ? `<div class="rpt-kpi-sub">${esc(k.sub)}</div>` : ''}</div>`
  ).join('') + `</div>`;
}
function rptBars(rows) {
  if (!rows.length) return '<p class="rpt-note">No section data.</p>';
  return `<div class="rpt-bars">` + rows.map(s =>
    `<div class="rpt-bar-row"><span class="rpt-bar-label">${esc(s.label)}</span><span class="rpt-bar-track"><span class="rpt-bar-fill" style="width:${s.pct}%;background:${scoreColor(s.pct)}"></span></span><span class="rpt-bar-val ${scoreClass(s.pct)}">${s.pct}%</span></div>`
  ).join('') + `</div>`;
}

/* ───────────────────── shared sections (QA / Team) ───────────────────── */
function sec_kpis(scope, isTeam) {
  const avg   = combinedAvg(scope.booked, scope.nb);
  const calls = scope.booked.length + scope.nb.length;
  const af    = afCount(scope.booked, scope.nb);
  const afRate = calls ? Math.round(af / calls * 100) : 0;
  const items = [
    { label: isTeam ? 'Team avg score' : 'Org avg score', value: avg == null ? '—' : avg + '%', cls: scoreClass(avg || 0) },
    { label: 'Calls scored', value: calls, cls: 'blue' },
    { label: 'Autofails', value: af, sub: afRate + '% of calls', cls: af ? 'red' : 'green' },
  ];
  if (isTeam) {
    const org = combinedAvg(dataCache.bookedRows, dataCache.nbRows);
    items.push({ label: 'Org avg (all teams)', value: org == null ? '—' : org + '%', cls: 'blue' });
  }
  return rptCard(isTeam ? 'Team performance' : 'Organization performance', rptKpiRow(items));
}

function sec_calibration(scope) {
  const cal = findCalibrationCalls(scope.booked, scope.nb);
  const desc = `<p class="rpt-desc">Each row is a call scored independently by two reviewers — typically an AI pass and a TaskUs manual scorer. Agreement = % of rubric items where both gave the same Yes/No.</p>`;
  if (!cal.length) return rptCard('AI vs manual calibration', `${desc}<p class="rpt-note">No dual-scored calls (scored by both an AI pass and a manual reviewer) in this period/scope.</p>`);
  const ta = cal.reduce((s, c) => s + c.agreeCount, 0);
  const ti = cal.reduce((s, c) => s + c.totalCount, 0);
  const overall = ti ? Math.round(ta / ti * 100) : null;
  const secAgg = {};
  cal.forEach(c => Object.entries(c.sectionAgreements).forEach(([s, v]) => {
    if (!secAgg[s]) secAgg[s] = { a: 0, t: 0 };
    secAgg[s].a += v.agree; secAgg[s].t += v.total;
  }));
  const secRows = Object.entries(secAgg).map(([s, v]) => ({ label: s, pct: v.t ? Math.round(v.a / v.t * 100) : 0 }));
  const divergent = secRows.length ? secRows.reduce((m, x) => x.pct < m.pct ? x : m).label : '—';
  const kpis = rptKpiRow([
    { label: 'Dual-scored calls', value: cal.length, cls: 'blue' },
    { label: 'Item-level agreement', value: overall == null ? '—' : overall + '%', cls: scoreClass(overall || 0) },
    { label: 'Most divergent section', value: esc(divergent) },
  ]);
  const chart = rptChartCanvas(c => new Chart(c, { type: 'bar',
    data: { labels: secRows.map(r => r.label), datasets: [{ data: secRows.map(r => r.pct), backgroundColor: secRows.map(r => scoreColor(r.pct)) }] },
    options: rptBarOpts() }), 200);
  const body = cal.slice(0, 20).map(c =>
    `<tr><td><a href="${callLink(c.callId)}">${esc(extractRcId(c.callId))}</a></td><td>${esc(c.agent)}</td><td>${esc(c.reviewers.join(' vs '))}</td><td class="${scoreClass(c.agreePct || 0)}">${c.agreePct == null ? '—' : c.agreePct + '%'}</td><td>${c.topMismatch ? esc(c.topMismatch) : '—'}</td></tr>`
  ).join('');
  const table = `<table class="rpt-table"><thead><tr><th>Call ID</th><th>Agent</th><th>Reviewers</th><th>Agreement</th><th>Top divergence</th></tr></thead><tbody>${body}</tbody></table>`;
  return rptCard('AI vs manual calibration', kpis + desc + chart + `<h3 class="rpt-h3">Most divergent calls</h3>` + table);
}

function trendChart(booked, nb, height) {
  const buckets = {};
  const add = (r, rubric) => {
    const k = weekKey(val(r, rubric === 'booked' ? B.DATE_SCORED : N.DATE_SCORED));
    if (!k || isAutofailRow(r, rubric)) return;
    const s = ovScore(r, rubric); if (s == null) return;
    (buckets[k] = buckets[k] || []).push(s);
  };
  booked.forEach(r => add(r, 'booked')); nb.forEach(r => add(r, 'nb'));
  const keys = Object.keys(buckets).sort();
  if (keys.length < 2) return null;
  const data = keys.map(k => Math.round(buckets[k].reduce((a, b) => a + b, 0) / buckets[k].length));
  const labels = keys.map(k => { const p = k.split('-'); return `${p[1]}/${p[2]}`; });
  return rptChartCanvas(c => new Chart(c, { type: 'line',
    data: { labels, datasets: [{ label: 'Avg QA score', data, borderColor: GREEN, backgroundColor: GREEN + '22', tension: 0.3, fill: true, pointRadius: 3 }] },
    options: rptLineOpts() }), height || 220);
}
function sec_trends(scope) {
  const chart = trendChart(scope.booked, scope.nb, 220);
  if (!chart) return rptCard('Score trend', `<p class="rpt-note">Not enough dated data across weeks to chart a trend for this scope.</p>`);
  return rptCard('Score trend (week over week)', chart);
}

function sec_managers(scope) {
  const map = {};
  const add = (r, rubric) => { const m = managerOf(r, rubric); (map[m] = map[m] || { b: [], n: [] })[rubric === 'booked' ? 'b' : 'n'].push(r); };
  scope.booked.forEach(r => add(r, 'booked')); scope.nb.forEach(r => add(r, 'nb'));
  const rows = Object.entries(map).map(([m, d]) => ({ m, calls: d.b.length + d.n.length, a: combinedAvg(d.b, d.n), af: afCount(d.b, d.n) }))
    .sort((x, y) => (y.a || 0) - (x.a || 0));
  const body = rows.map(r => `<tr><td>${esc(r.m)}</td><td>${r.calls}</td><td class="${scoreClass(r.a || 0)}">${r.a == null ? '—' : r.a + '%'}</td><td class="${r.af ? 'red' : ''}">${r.af}</td></tr>`).join('');
  return rptCard('Manager comparison', `<table class="rpt-table"><thead><tr><th>Manager / pod</th><th>Calls</th><th>Avg score</th><th>Autofails</th></tr></thead><tbody>${body}</tbody></table>`);
}

function sec_reps(scope) {
  const map = repMap(scope);
  const rows = Object.entries(map).map(([a, d]) => ({ a, calls: d.b.length + d.n.length, avg: combinedAvg(d.b, d.n), af: afCount(d.b, d.n), da: repDispoAccuracy(a) }))
    .sort((x, y) => (y.avg || 0) - (x.avg || 0));
  const body = rows.map(r => `<tr><td>${esc(r.a)}</td><td>${r.calls}</td><td class="${scoreClass(r.avg || 0)}">${r.avg == null ? '—' : r.avg + '%'}</td><td class="${r.af ? 'red' : ''}">${r.af}</td><td class="${r.da == null ? '' : scoreClass(r.da)}">${r.da == null ? '—' : r.da + '%'}</td></tr>`).join('');
  return rptCard('Per-rep performance', `<table class="rpt-table"><thead><tr><th>Rep</th><th>Calls</th><th>Avg score</th><th>Autofails</th><th>Dispo accuracy</th></tr></thead><tbody>${body}</tbody></table>`);
}

function sec_dispo() {
  const rows = scopedDispoRows();
  const desc = `<p class="rpt-desc">Does the rep's Salesforce disposition match what actually happened on the call. Over-credited = logged more progress than occurred (pipeline risk).</p>`;
  if (!rows.length) return rptCard('Disposition accuracy', `${desc}<p class="rpt-note">No disposition-accuracy rows in this period/scope.</p>`);
  const v = x => val(x, D.VERDICT);
  const tot = rows.length;
  const acc = rows.filter(r => v(r) === 'Accurate').length;
  const over = rows.filter(r => v(r) === 'Over-credited').length;
  const under = rows.filter(r => v(r) === 'Under-credited').length;
  const lat = rows.filter(r => v(r) === 'Lateral').length;
  const kpis = rptKpiRow([
    { label: 'Accurate', value: Math.round(acc / tot * 100) + '%', sub: acc + ' of ' + tot, cls: 'green' },
    { label: 'Over-credited', value: over, sub: 'pipeline risk', cls: over ? 'red' : 'green' },
    { label: 'Under-credited', value: under, cls: 'amber' },
    { label: 'Lateral', value: lat, cls: 'blue' },
  ]);
  const overByRep = {};
  rows.filter(r => v(r) === 'Over-credited').forEach(r => { const a = val(r, D.AGENT); overByRep[a] = (overByRep[a] || 0) + 1; });
  const lb = Object.entries(overByRep).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const lbHtml = lb.length
    ? `<table class="rpt-table"><thead><tr><th>Rep</th><th>Over-credits</th></tr></thead><tbody>${lb.map(([a, n]) => `<tr><td>${esc(a)}${n >= 3 ? ' 🚩' : ''}</td><td class="red">${n}</td></tr>`).join('')}</tbody></table>`
    : '<p class="rpt-note">No over-credited dispositions in scope.</p>';
  const mis = rows.filter(r => v(r) !== 'Accurate').slice(0, 30);
  const misHtml = mis.length
    ? `<h3 class="rpt-h3">Mistagged calls (tagged → should be)</h3><table class="rpt-table"><thead><tr><th>Call ID</th><th>Rep</th><th>Verdict</th><th>Tagged</th><th>Should be</th></tr></thead><tbody>${mis.map(r => `<tr><td><a href="${callLink(val(r, D.CALL_ID))}">${esc(extractRcId(val(r, D.CALL_ID)))}</a></td><td>${esc(val(r, D.AGENT))}</td><td class="${verdictClass(v(r))}">${esc(v(r))}</td><td>${esc(val(r, D.SF_DISP))}</td><td>${esc(val(r, D.CORRECT))}</td></tr>`).join('')}</tbody></table>`
    : '';
  return rptCard('Disposition accuracy', kpis + desc + `<h3 class="rpt-h3">Over-crediting leaderboard</h3>` + lbHtml + misHtml);
}

function sec_autofails(scope) {
  const list = [
    ...scope.booked.filter(r => isAutofailRow(r, 'booked')).map(r => ({ r, rubric: 'booked' })),
    ...scope.nb.filter(r => isAutofailRow(r, 'nb')).map(r => ({ r, rubric: 'nb' })),
  ];
  if (!list.length) return rptCard('Autofails needing action', `<p class="rpt-note">No autofails in this period/scope. 🎉</p>`);
  const body = list.map(({ r, rubric }) => {
    const id = val(r, rubric === 'booked' ? B.CALL_ID : N.CALL_ID);
    const agent = val(r, rubric === 'booked' ? B.AGENT : N.AGENT);
    const cats = autofailExplain(r, rubric).join(', ') || 'Triggered';
    const notes = val(r, rubric === 'booked' ? B.NOTES : N.NOTES);
    return `<tr><td><a href="${callLink(id)}">${esc(extractRcId(id))}</a></td><td>${esc(agent)}</td><td class="red">${esc(cats)}</td><td>${esc(notes || '—')}</td></tr>`;
  }).join('');
  return rptCard('Autofails needing action', `<p class="rpt-desc">Calls that failed automatically. 'Reason' is which autofail category fired; 'Detail' is the reviewer note.</p><table class="rpt-table"><thead><tr><th>Call ID</th><th>Rep</th><th>Reason</th><th>Detail</th></tr></thead><tbody>${body}</tbody></table>`);
}

/* ───────────────────── rep feedback (per-rep docs) ───────────────────── */
function sec_repFeedback(scope) {
  const map = repMap(scope);
  const reps = Object.keys(map).sort();
  if (!reps.length) return rptCard('Rep feedback', `<p class="rpt-note">No reps with scored calls in this scope.</p>`);
  return reps.map((rep, i) => renderRepFeedback(rep, map[rep], i)).join('');
}
function renderRepFeedback(rep, d, idx) {
  const repB = d.b || [], repN = d.n || [];
  const calls = repB.length + repN.length;
  const score = combinedAvg(repB, repN);
  const af = afCount(repB, repN);
  const first = repB[0] || repN[0];
  const mgr = first ? managerOf(first, repB[0] ? 'booked' : 'nb') : '—';
  const lobRaw = first ? val(first, repB[0] ? B.LOB : N.LOB) : '';
  const lob = normalizeLOB(lobRaw) || lobRaw || '—';
  const S = RPT.sections;
  let html = `<div class="rpt-rep-head"><div class="rpt-rep-ava">${esc(initials(rep))}</div><div class="rpt-rep-id"><div class="rpt-rep-kicker">Coaching report</div><div class="rpt-rep-name">${esc(rep)}</div><div class="rpt-rep-meta">${esc(mgr)} &middot; ${esc(lob)} &middot; ${calls} calls${af ? ` &middot; <span class="red">${af} autofail${af > 1 ? 's' : ''}</span>` : ''}</div></div><div class="rpt-rep-score ${scoreClass(score || 0)}">${score == null ? '—' : score + '%'}</div></div>`;
  if (S.has('rf_scores'))    html += rf_scores(rep, repB, repN);
  if (S.has('rf_dispo'))     html += rf_dispo(rep);
  if (S.has('rf_coaching'))  html += rf_coaching(repB, repN);
  if (S.has('rf_trend'))     html += rf_trend(repB, repN);
  if (S.has('rf_calls'))     html += rf_calls(repB, repN);
  if (S.has('rf_autofails')) html += rf_autofails(repB, repN);
  return `<section class="rpt-section rpt-rep${idx > 0 ? ' rpt-break' : ''}">${html}</section>`;
}
function rf_scores(rep, repB, repN) {
  const secAvgs = [];
  const collect = (rows, rubric, defs) => defs.forEach(({ label, idx }) => {
    const vals = rows.filter(r => !isAutofailRow(r, rubric)).map(r => pct(r, idx)).filter(n => n != null);
    if (vals.length) secAvgs.push({ label, pct: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) });
  });
  collect(repB, 'booked', [{ label: 'Opener', idx: B.OP_PCT }, { label: 'Discovery', idx: B.DC_PCT }, { label: 'Pitch', idx: B.PT_PCT }, { label: 'Next step', idx: B.NS_PCT }, { label: 'General', idx: B.GN_PCT }]);
  collect(repN, 'nb', [{ label: 'Opener (NB)', idx: N.OP_PCT }, { label: 'Discovery (NB)', idx: N.DC_PCT }, { label: 'Objections (NB)', idx: N.OB_PCT }]);
  const cal = findCalibrationCalls(repB, repN);
  const calHtml = cal.length
    ? `<table class="rpt-table"><thead><tr><th>Call ID</th><th>Reviewers</th><th>Agreement</th><th>Top divergence</th></tr></thead><tbody>${cal.map(c => `<tr><td><a href="${callLink(c.callId)}">${esc(extractRcId(c.callId))}</a></td><td>${esc(c.reviewers.join(' vs '))}</td><td class="${scoreClass(c.agreePct || 0)}">${c.agreePct == null ? '—' : c.agreePct + '%'}</td><td>${c.topMismatch ? esc(c.topMismatch) : '—'}</td></tr>`).join('')}</tbody></table>`
    : `<p class="rpt-note">No calls for ${esc(rep)} were independently scored by both an AI pass and a manual reviewer in this range.</p>`;
  return `<div class="rpt-sub"><h3 class="rpt-h3">Section averages</h3>${rptBars(secAvgs)}<h3 class="rpt-h3">AI vs manual scoring</h3>${calHtml}</div>`;
}
function rf_dispo(rep) {
  const rows = repDispoRows(rep);
  if (!rows.length) return `<div class="rpt-sub"><h3 class="rpt-h3">Disposition usage</h3><p class="rpt-note">No disposition data for ${esc(rep)}.</p></div>`;
  const v = x => val(x, D.VERDICT);
  const tot = rows.length;
  const acc = rows.filter(r => v(r) === 'Accurate').length;
  const over = rows.filter(r => v(r) === 'Over-credited').length;
  const under = rows.filter(r => v(r) === 'Under-credited').length;
  const lat = rows.filter(r => v(r) === 'Lateral').length;
  const kpis = rptKpiRow([
    { label: 'Accuracy', value: Math.round(acc / tot * 100) + '%', cls: 'green' },
    { label: 'Over-credited', value: over, cls: over ? 'red' : 'green' },
    { label: 'Under-credited', value: under, cls: 'amber' },
    { label: 'Lateral', value: lat, cls: 'blue' },
  ]);
  const mis = rows.filter(r => v(r) !== 'Accurate');
  const misHtml = mis.length
    ? `<table class="rpt-table"><thead><tr><th>Call ID</th><th>Verdict</th><th>Tagged</th><th>Should be</th></tr></thead><tbody>${mis.map(r => `<tr><td><a href="${callLink(val(r, D.CALL_ID))}">${esc(extractRcId(val(r, D.CALL_ID)))}</a></td><td class="${verdictClass(v(r))}">${esc(v(r))}</td><td>${esc(val(r, D.SF_DISP))}</td><td>${esc(val(r, D.CORRECT))}</td></tr>`).join('')}</tbody></table>`
    : '<p class="rpt-note">No disposition mistags. ✅</p>';
  return `<div class="rpt-sub"><h3 class="rpt-h3">Disposition usage</h3>${kpis}${over >= 3 ? '<p class="rpt-flag">🚩 At or above the 3-over-credit escalation threshold.</p>' : ''}${misHtml}</div>`;
}
function rf_coaching(repB, repN) {
  const counts = {};
  const add = (rows, idxs) => rows.forEach(r => idxs.forEach(i => { const v = val(r, i); if (v && v.length > 2 && !/^n\/?a$/i.test(v)) counts[v] = (counts[v] || 0) + 1; }));
  add(repB, [B.CP1, B.CP2, B.CP3]); add(repN, [N.CP1, N.CP2, N.CP3]);
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!top.length) return `<div class="rpt-sub"><h3 class="rpt-h3">Coaching themes</h3><p class="rpt-note">No recurring coaching priorities logged.</p></div>`;
  return `<div class="rpt-sub"><h3 class="rpt-h3">Top coaching themes</h3><ul class="rpt-themes">${top.map(([t, n]) => `<li><span class="rpt-theme-ct">${n}×</span> ${esc(t)}</li>`).join('')}</ul></div>`;
}
function rf_trend(repB, repN) {
  const chart = trendChart(repB, repN, 180);
  if (!chart) return `<div class="rpt-sub"><h3 class="rpt-h3">Score trend</h3><p class="rpt-note">Not enough weeks of data to chart a trend.</p></div>`;
  return `<div class="rpt-sub"><h3 class="rpt-h3">Score trend (week over week)</h3>${chart}</div>`;
}
function rf_calls(repB, repN) {
  const all = [...repB.map(r => ({ r, rubric: 'booked' })), ...repN.map(r => ({ r, rubric: 'nb' }))];
  all.sort((a, b) => toSortable(val(b.r, b.rubric === 'booked' ? B.DATE_SCORED : N.DATE_SCORED)).localeCompare(toSortable(val(a.r, a.rubric === 'booked' ? B.DATE_SCORED : N.DATE_SCORED))));
  const body = all.map(({ r, rubric }) => {
    const id = val(r, rubric === 'booked' ? B.CALL_ID : N.CALL_ID);
    const date = formatDate(val(r, rubric === 'booked' ? B.DATE_SCORED : N.DATE_SCORED));
    const s = ovScore(r, rubric);
    const afl = isAutofailRow(r, rubric);
    return `<tr><td><a href="${callLink(id)}">${esc(extractRcId(id))}</a></td><td>${esc(date)}</td><td>${rubric === 'booked' ? 'Booked / LT' : 'No Booking'}</td><td class="${afl ? 'red' : scoreClass(s || 0)}">${afl ? 'AUTOFAIL' : (s == null ? '—' : s + '%')}</td></tr>`;
  }).join('');
  return `<div class="rpt-sub"><h3 class="rpt-h3">Call history</h3><table class="rpt-table"><thead><tr><th>Call ID</th><th>Date</th><th>Type</th><th>Score</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
function rf_autofails(repB, repN) {
  const list = [
    ...repB.filter(r => isAutofailRow(r, 'booked')).map(r => ({ r, rubric: 'booked' })),
    ...repN.filter(r => isAutofailRow(r, 'nb')).map(r => ({ r, rubric: 'nb' })),
  ];
  if (!list.length) return `<div class="rpt-sub"><h3 class="rpt-h3">Autofails</h3><p class="rpt-note">No autofails. ✅</p></div>`;
  const body = list.map(({ r, rubric }) => {
    const id = val(r, rubric === 'booked' ? B.CALL_ID : N.CALL_ID);
    const cats = autofailExplain(r, rubric).join(', ') || 'Triggered';
    const notes = val(r, rubric === 'booked' ? B.NOTES : N.NOTES);
    return `<tr><td><a href="${callLink(id)}">${esc(extractRcId(id))}</a></td><td class="red">${esc(cats)}</td><td>${esc(notes || '—')}</td></tr>`;
  }).join('');
  return `<div class="rpt-sub"><h3 class="rpt-h3">Autofails — needs addressing</h3><table class="rpt-table"><thead><tr><th>Call ID</th><th>Reason</th><th>Explanation</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

/* ───────────────────── assembly + print ───────────────────── */
function reportTitleText() {
  const tt = { 'qa-leads': 'QA Leadership Report', 'team-leads': 'Team Lead Report', 'rep-feedback': 'Rep Feedback Pack' }[RPT.type];
  const mgr = (RPT.manager && RPT.manager !== 'all') ? ' — ' + RPT.manager : '';
  return tt + mgr;
}
function reportHeader(scope) {
  const calls = scope.booked.length + scope.nb.length;
  const t = new Date();
  const gen = `${t.getMonth() + 1}/${t.getDate()}/${t.getFullYear()}`;
  return `<header class="rpt-report-head"><div><div class="rpt-brand">TaskUs QA Hub</div><div class="rpt-report-title">${esc(reportTitleText())}</div></div><div class="rpt-report-meta"><div>Period: <strong>${esc(periodLabel(RPT.period))}</strong></div><div>${calls} calls in scope</div><div>Generated ${gen}</div></div></header>`;
}

function generateReport() {
  if (!dataCache) { alert('Dashboard data is still loading — give it a few seconds, then try again.'); return; }
  // Tear down charts from the previous run so reused canvas ids never render stale.
  _rptCharts.forEach(ch => { try { ch && ch.destroy(); } catch (e) {} });
  _rptCharts = []; _rptChartJobs = []; _rptCid = 0;
  const scope = rptScopedData();
  const parts = [reportHeader(scope)];
  const t = RPT.type, S = RPT.sections;
  try {
    if (t === 'qa-leads') {
      if (S.has('kpis'))        parts.push(sec_kpis(scope, false));
      if (S.has('calibration')) parts.push(sec_calibration(scope));
      if (S.has('trends'))      parts.push(sec_trends(scope));
      if (S.has('managers'))    parts.push(sec_managers(scope));
      if (S.has('dispo'))       parts.push(sec_dispo());
    } else if (t === 'team-leads') {
      if (S.has('kpis'))        parts.push(sec_kpis(scope, true));
      if (S.has('reps'))        parts.push(sec_reps(scope));
      if (S.has('dispo'))       parts.push(sec_dispo());
      if (S.has('autofails'))   parts.push(sec_autofails(scope));
      if (S.has('calibration')) parts.push(sec_calibration(scope));
      if (S.has('trends'))      parts.push(sec_trends(scope));
    } else if (t === 'rep-feedback') {
      parts.push(sec_repFeedback(scope));
    }
  } catch (e) {
    console.error('report build', e);
    parts.push(`<section class="rpt-section"><p class="rpt-note">Something went wrong building this report (${esc(e.message)}). Try a different scope, or check the console.</p></section>`);
  }
  el('report-output').innerHTML = parts.join('');
  el('report-preview-title').textContent = reportTitleText();
  closeExport();
  el('report-preview').classList.remove('hidden');
  document.body.classList.add('rpt-printing-mode');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    _rptChartJobs.forEach(f => { try { f(); } catch (e) { console.error('chart', e); } });
    _rptChartJobs = [];
    window.scrollTo(0, 0);
  }));
}

/* ───────────────────── modal UI ───────────────────── */
function applyTypeDefaults(type) {
  RPT.type = type;
  RPT.sections = new Set(SECTIONS[type].filter(s => s.def).map(s => s.k));
  if (type === 'qa-leads') {
    // Org-wide report with no manager picker — clear any manager filter carried
    // over from a Team-leads / Rep-feedback selection so it doesn't stay scoped.
    RPT.manager = 'all';
  } else {
    const mgrs = allManagers();
    if (type === 'rep-feedback' && (RPT.manager === 'all' || !mgrs.includes(RPT.manager)) && mgrs.length) RPT.manager = mgrs[0];
  }
}
function openExport() {
  if (!dataCache) { alert('Dashboard data is still loading — give it a few seconds, then click Export again.'); return; }
  if (!RPT.sections.size) applyTypeDefaults(RPT.type);
  renderExportBody();
  el('export-overlay').classList.remove('hidden');
}
function closeExport() { el('export-overlay').classList.add('hidden'); }
function closePreview() {
  el('report-preview').classList.add('hidden');
  document.body.classList.remove('rpt-printing-mode');
  openExport();
}
function selectType(t) { applyTypeDefaults(t); renderExportBody(); }
function setManager(v) { RPT.manager = v; updateEstimate(); }
function setPeriod(v) { RPT.period = v; updateEstimate(); }
function toggleSection(k) { if (RPT.sections.has(k)) RPT.sections.delete(k); else RPT.sections.add(k); updateEstimate(); }

function renderExportBody() {
  const body = el('export-body');
  const type = RPT.type;
  const cards = RPT_TYPES.map(t => `<button class="rpt-type ${t.key === type ? 'sel' : ''}" onclick="selectType('${t.key}')"><span class="rpt-type-icon">${t.icon}</span><span class="rpt-type-title">${t.title}</span><span class="rpt-type-desc">${t.desc}</span></button>`).join('');
  const mgrs = allManagers();
  const needsMgr = (type !== 'qa-leads');
  const mgrOpts = (type === 'team-leads' ? `<option value="all">All teams</option>` : '') + mgrs.map(m => `<option value="${esc(m)}" ${m === RPT.manager ? 'selected' : ''}>${esc(m)}</option>`).join('');
  const periodOpts = PERIOD_KEYS.map(p => `<option value="${p}" ${p === RPT.period ? 'selected' : ''}>${periodLabel(p)}</option>`).join('');
  const ctx = `<div class="rpt-ctx">${needsMgr ? `<label class="rpt-ctl"><span>${type === 'rep-feedback' ? 'Team (one doc per rep)' : 'Team'}</span><select onchange="setManager(this.value)">${mgrOpts}</select></label>` : ''}<label class="rpt-ctl"><span>Period / digest window</span><select onchange="setPeriod(this.value)">${periodOpts}</select></label></div>`;
  const secs = SECTIONS[type].map(s => `<label class="rpt-check"><input type="checkbox" ${RPT.sections.has(s.k) ? 'checked' : ''} onchange="toggleSection('${s.k}')"><span>${esc(s.label)}</span></label>`).join('');
  const secHead = type === 'rep-feedback' ? 'Include in each rep’s doc' : 'Include sections';
  body.innerHTML = `<p class="rpt-step">1 · Choose a report</p><div class="rpt-types">${cards}</div><p class="rpt-step">2 · Scope</p>${ctx}<p class="rpt-step">3 · ${secHead}</p><div class="rpt-checks">${secs}</div>`;
  updateEstimate();
}
function updateEstimate() {
  const est = el('export-estimate'); if (!est) return;
  if (RPT.type === 'rep-feedback') {
    const reps = Object.keys(repMap(rptScopedData())).length;
    est.innerHTML = `<strong>${reps}</strong> rep doc${reps === 1 ? '' : 's'} · ${RPT.sections.size} section${RPT.sections.size === 1 ? '' : 's'} each`;
  } else {
    est.innerHTML = `<strong>${RPT.sections.size}</strong> section${RPT.sections.size === 1 ? '' : 's'} selected`;
  }
}

/* ───────────────────── Slack summary ───────────────────── */
function buildSlackSummary(scope) {
  const L = [`*${reportTitleText()}* — ${periodLabel(RPT.period)} (${scope.booked.length + scope.nb.length} calls)`];
  if (RPT.type === 'rep-feedback') {
    const map = repMap(scope);
    Object.keys(map).sort().forEach(rep => {
      const d = map[rep];
      const sc = combinedAvg(d.b, d.n);
      const af = afCount(d.b, d.n);
      const da = repDispoAccuracy(rep);
      L.push(`• *${rep}* — ${sc == null ? '—' : sc + '%'} avg · ${d.b.length + d.n.length} calls${af ? ` · ${af} autofail(s)` : ''}${da != null ? ` · dispo ${da}%` : ''}`);
    });
  } else {
    const avg = combinedAvg(scope.booked, scope.nb);
    L.push(`• Avg QA score: *${avg == null ? '—' : avg + '%'}*`);
    L.push(`• Autofails: *${afCount(scope.booked, scope.nb)}*`);
    const cal = findCalibrationCalls(scope.booked, scope.nb);
    if (cal.length) {
      const ta = cal.reduce((s, c) => s + c.agreeCount, 0);
      const ti = cal.reduce((s, c) => s + c.totalCount, 0);
      L.push(`• AI↔manual agreement: *${ti ? Math.round(ta / ti * 100) + '%' : '—'}* across ${cal.length} dual-scored calls`);
    }
    const dr = scopedDispoRows();
    if (dr.length) {
      const acc = dr.filter(r => val(r, D.VERDICT) === 'Accurate').length;
      const over = dr.filter(r => val(r, D.VERDICT) === 'Over-credited').length;
      L.push(`• Disposition accuracy: *${Math.round(acc / dr.length * 100)}%* (${over} over-credited)`);
    }
  }
  L.push(`_Full PDF available on request — generated from the TaskUs QA Hub._`);
  return L.join('\n');
}
function copySlackSummary() {
  if (!dataCache) { alert('Dashboard data is still loading.'); return; }
  const txt = buildSlackSummary(rptScopedData());
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(() => toast('Slack summary copied to clipboard'), () => fallbackCopy(txt));
  } else { fallbackCopy(txt); }
}
function fallbackCopy(txt) {
  const ta = document.createElement('textarea');
  ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Slack summary copied'); }
  catch (e) { alert('Copy failed — here is the text:\n\n' + txt); }
  document.body.removeChild(ta);
}
function toast(msg) {
  let t = el('rpt-toast');
  if (!t) { t = document.createElement('div'); t.id = 'rpt-toast'; t.className = 'rpt-toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
