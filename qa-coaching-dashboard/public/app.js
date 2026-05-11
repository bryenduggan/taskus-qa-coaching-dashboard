/* ═══════════════════════════════════════════════════════
   QA Intelligence Hub — Frontend Logic
   Atlantis design system · Revenue.io deep-links
   ═══════════════════════════════════════════════════════ */

// ── Revenue.io base URL ───────────────────────────────────
const REVENUE_IO_BASE = 'https://analytics.revenue.io/conversations/';

// ── Chart.js defaults (Atlantis dark palette) ─────────────
Chart.defaults.color          = '#a9b7bc';
Chart.defaults.borderColor    = '#4c5f67';
Chart.defaults.font.family    = "Inter, Helvetica, Arial, sans-serif";
Chart.defaults.font.size      = 12;

// ── Atlantis status colours ───────────────────────────────
const GREEN     = '#8acc33';
const AMBER     = '#cdb52d';
const RED       = '#df786d';
const BLUE_INFO = '#2d7ab9';

function scoreColor(pct) {
  if (pct >= 80) return GREEN;
  if (pct >= 65) return AMBER;
  return RED;
}
function scoreClass(pct) {
  if (pct >= 80) return 'green';
  if (pct >= 65) return 'amber';
  return 'red';
}

// ── Column indices ────────────────────────────────────────
// Booked / LT  (A=0 … AO=40)
const B = {
  CALL_ID:  0, AGENT: 1, DATE: 2, DURATION: 3, TYPE: 4, OVERALL: 5,
  OP_INTRO: 6,  OP_COMPANY: 7,  OP_PERM: 8,  OP_REASON: 9,  OP_TF: 10,    OP_PCT: 11,
  DC_NEED:  12, DC_PROC: 13,   DC_ECON: 14, DC_DM: 15,     DC_URG: 16,    DC_PCT: 17,
  PT_PITCH: 18, PT_FEAT: 19,   PT_PCT: 20,
  NS_ASLT:  21, NS_ASBK: 22,   NS_OBJ: 23,  NS_CONF: 24,   NS_RECAP: 25,  NS_CAL: 26,  NS_PCT: 27,
  GN_LISTEN:28, GN_TONE: 29,   GN_CTRL: 30, GN_PCT: 31,
  AF_MISINFO:32, AF_HANG: 33,  AF_PROF: 34, AF_PII: 35,    AF_TRIG: 36,
  CP1: 37, CP2: 38, CP3: 39, NOTES: 40,
};

// No Booking  (A=0 … AF=31)
const N = {
  CALL_ID:  0, AGENT: 1, DATE: 2, DURATION: 3, TYPE: 4, OVERALL: 5,
  OP_INTRO: 6,  OP_COMPANY: 7, OP_PERM: 8, OP_HOOK: 9,   OP_PCT: 10,
  DC_NEED:  11, DC_PROC: 12,  DC_URG: 13, DC_PCT: 14,
  OB_VAL:   15, OB_EMP: 16,  OB_REFR: 17, OB_TRIAL: 18, OB_CB: 19, OB_SEC: 20, OB_PCT: 21,
  AF_MISINFO:22, AF_HANG: 23, AF_PROF: 24, AF_TRIG: 25,
  DIAG_PB:  26, DIAG_OBJ: 27,
  CP1: 28, CP2: 29, CP3: 30, NOTES: 31,
};

// ── Parsing helpers ───────────────────────────────────────
function parseRows(rawRows) {
  if (!rawRows || rawRows.length < 2) return [];
  return rawRows.slice(1).filter(r => r && r[0] && String(r[0]).trim() !== '');
}

function pct(row, idx) {
  const v = row[idx];
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v).replace('%', ''));
  return isNaN(n) ? null : n;
}

function val(row, idx) {
  return (row[idx] || '').toString().trim();
}

function isYes(row, idx) { return val(row, idx).toLowerCase() === 'yes'; }
function isNo(row, idx)  { return val(row, idx).toLowerCase() === 'no'; }
function isNA(row, idx) {
  const v = val(row, idx).toLowerCase();
  return v === 'na' || v === 'n/a';
}

function hitRate(rows, idx) {
  const eligible = rows.filter(r => !isNA(r, idx));
  if (!eligible.length) return null;
  return Math.round(eligible.filter(r => isYes(r, idx)).length / eligible.length * 100);
}

function avg(nums) {
  const valid = nums.filter(n => n !== null && !isNaN(n));
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
}

function initials(name) {
  return name.split(' ').map(p => p[0] || '').join('').slice(0, 2).toUpperCase();
}

// ── DOM helpers ───────────────────────────────────────────
function el(id)  { return document.getElementById(id); }
function esc(s)  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function sectionBar(name, value) {
  if (value === null || isNaN(value)) return '';
  const cls = scoreClass(value);
  const colorMap = { green: GREEN, amber: AMBER, red: RED };
  return `<div class="sbar-row">
    <div class="sbar-header">
      <span class="sbar-name">${esc(name)}</span>
      <span class="sbar-pct" style="color:${colorMap[cls]}">${value}%</span>
    </div>
    <div class="sbar-track">
      <div class="sbar-fill ${cls}" style="width:${Math.min(value,100)}%"></div>
    </div>
  </div>`;
}

function kpiCard(label, value, sub, colorClass) {
  return `<div class="kpi-card ${colorClass}">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value">${value}</div>
    ${sub ? `<div class="kpi-sub">${esc(sub)}</div>` : ''}
  </div>`;
}

function ynBadge(row, idx) {
  const v = val(row, idx);
  if (!v || v === '' || v === '—' || v === '-') return `<span class="yn-badge yn-na">—</span>`;
  const l = v.toLowerCase();
  if (l === 'yes') return `<span class="yn-badge yn-yes">Yes</span>`;
  if (l === 'no')  return `<span class="yn-badge yn-no">No</span>`;
  return `<span class="yn-badge yn-na">NA</span>`;
}

function revioLink(callId) {
  if (!callId || callId === '—') return `<span style="color:var(--text-dim)">—</span>`;
  const url = `${REVENUE_IO_BASE}${callId}`;
  return `<a class="rev-link" href="${url}" target="_blank" rel="noopener">
    ${esc(callId)}
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M7 1h4v4M11 1L5 7M4 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </a>`;
}

// ── Chart registry ────────────────────────────────────────
const charts = {};
function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

// ════════════════════════════════════════════════════════
//  OVERVIEW TAB
// ════════════════════════════════════════════════════════
function buildOverview(bookedRows, nbRows) {
  const allRows  = [...bookedRows, ...nbRows];
  const allScores = allRows.map(r => pct(r, B.OVERALL)).filter(n => n !== null);
  const teamAvg   = avg(allScores);

  const autofailB = bookedRows.filter(r => isYes(r, B.AF_TRIG)).length;
  const autofailN = nbRows.filter(r => isYes(r, N.AF_TRIG)).length;
  const totalAF   = autofailB + autofailN;

  // Agent avg map
  const agentMap = {};
  allRows.forEach(r => {
    const agent = val(r, 1);
    const score = pct(r, B.OVERALL);
    if (!agent || score === null) return;
    if (!agentMap[agent]) agentMap[agent] = [];
    agentMap[agent].push(score);
  });
  const agentAvgs = Object.entries(agentMap)
    .map(([name, s]) => ({ name, avg: avg(s), count: s.length }));
  const coachNowCount = agentAvgs.filter(a => a.avg < 65).length;

  // Section avgs
  const sectionLabels = ['Opener','Discovery','Pitch / Handling','Next Step / Obj.','General'];
  const bSec = [
    avg(bookedRows.map(r => pct(r, B.OP_PCT)).filter(n=>n!==null)),
    avg(bookedRows.map(r => pct(r, B.DC_PCT)).filter(n=>n!==null)),
    avg(bookedRows.map(r => pct(r, B.PT_PCT)).filter(n=>n!==null)),
    avg(bookedRows.map(r => pct(r, B.NS_PCT)).filter(n=>n!==null)),
    avg(bookedRows.map(r => pct(r, B.GN_PCT)).filter(n=>n!==null)),
  ];
  const nSec = [
    avg(nbRows.map(r => pct(r, N.OP_PCT)).filter(n=>n!==null)),
    avg(nbRows.map(r => pct(r, N.DC_PCT)).filter(n=>n!==null)),
    avg(nbRows.map(r => pct(r, N.OB_PCT)).filter(n=>n!==null)),
    null, null,
  ];
  const combined = sectionLabels.map((_, i) => {
    const vals = [bSec[i], nSec[i]].filter(n => n !== null);
    return vals.length ? avg(vals) : null;
  });
  let weakIdx = 0;
  combined.forEach((v, i) => {
    if (v !== null && (combined[weakIdx] === null || v < combined[weakIdx])) weakIdx = i;
  });

  // KPIs
  el('overview-kpis').innerHTML = [
    kpiCard('Team Avg Score', `${teamAvg}%`, `${allRows.length} calls scored`, scoreClass(teamAvg)),
    kpiCard('Autofails', totalAF, totalAF === 0 ? 'None this batch' : 'Immediate review', totalAF === 0 ? 'green' : 'red'),
    kpiCard('Coach Now', coachNowCount, 'agents below 65%', coachNowCount === 0 ? 'green' : coachNowCount <= 2 ? 'amber' : 'red'),
    kpiCard('Weakest Section', sectionLabels[weakIdx], `${combined[weakIdx] ?? '—'}% avg`, combined[weakIdx] !== null ? scoreClass(combined[weakIdx]) : 'amber'),
  ].join('');

  // Section bars
  el('overview-section-bars').innerHTML = sectionLabels.map((name, i) =>
    combined[i] !== null ? sectionBar(name, combined[i]) : ''
  ).join('');

  // Distribution chart
  destroyChart('dist');
  const buckets = ['< 50','50–64','65–79','80–89','90–100'];
  const counts   = [0,0,0,0,0];
  allScores.forEach(s => {
    if (s < 50) counts[0]++;
    else if (s < 65) counts[1]++;
    else if (s < 80) counts[2]++;
    else if (s < 90) counts[3]++;
    else counts[4]++;
  });
  charts['dist'] = new Chart(el('chart-dist'), {
    type: 'bar',
    data: {
      labels: buckets,
      datasets: [{ data: counts, backgroundColor: [RED,RED,AMBER,GREEN,GREEN], borderRadius: 4, borderSkipped: false }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#4c5f67' } },
        y: { grid: { color: '#4c5f67' }, ticks: { stepSize: 1 } },
      },
    },
  });

  // Agent list
  agentAvgs.sort((a, b) => a.avg - b.avg);
  const badgeMap  = { green: 'badge-strong', amber: 'badge-review', red: 'badge-coach' };
  const labelMap  = { green: 'Strong', amber: 'Review', red: 'Coach Now' };
  el('agent-coaching-list').innerHTML = agentAvgs.map(a => {
    const cls = scoreClass(a.avg);
    return `<div class="agent-row">
      <div class="agent-avatar">${initials(a.name)}</div>
      <div class="agent-info">
        <div class="agent-name">${esc(a.name)}</div>
        <div class="agent-meta">${a.count} call${a.count !== 1 ? 's' : ''} · avg ${a.avg}%</div>
      </div>
      <span class="badge ${badgeMap[cls]}">${labelMap[cls]}</span>
    </div>`;
  }).join('');

  // AI summary
  const lowest  = agentAvgs[0];
  const highest = agentAvgs[agentAvgs.length - 1];
  el('ai-text').textContent =
    `Team avg is ${teamAvg}% across ${allRows.length} scored calls. ` +
    `${totalAF === 0 ? 'No autofails this batch — strong discipline.' : `⚠️ ${totalAF} autofail(s) need immediate review.`} ` +
    `${sectionLabels[weakIdx]} is the weakest section at ${combined[weakIdx]}% — focus coaching there. ` +
    `${lowest.name} needs the most support (${lowest.avg}%); ${highest.name} is leading at ${highest.avg}%.`;
}

// ════════════════════════════════════════════════════════
//  BOOKED / LT TAB
// ════════════════════════════════════════════════════════
function buildBooked(bookedRows) {
  if (!bookedRows.length) {
    el('booked-kpis').innerHTML = '<p style="color:var(--text-muted)">No booked/LT calls in this batch.</p>';
    return;
  }
  const avgOverall = avg(bookedRows.map(r => pct(r, B.OVERALL)).filter(n => n !== null));
  const econRate   = hitRate(bookedRows, B.DC_ECON);
  const urgRate    = hitRate(bookedRows, B.DC_URG);
  const nsRate     = avg(bookedRows.map(r => pct(r, B.NS_PCT)).filter(n => n !== null));

  el('booked-kpis').innerHTML = [
    kpiCard('Avg Score', `${avgOverall}%`, `${bookedRows.length} booked/LT calls`, scoreClass(avgOverall)),
    kpiCard('Econ Impact Rate', `${econRate ?? '—'}%`, 'Discovery: Economic Impact', econRate !== null ? scoreClass(econRate) : 'amber'),
    kpiCard('Urgency Rate', `${urgRate ?? '—'}%`, 'Discovery: Urgency created', urgRate !== null ? scoreClass(urgRate) : 'amber'),
    kpiCard('Next Step %', `${nsRate}%`, 'Avg Next Step section', scoreClass(nsRate)),
  ].join('');

  const sections = [
    ['Opener',    avg(bookedRows.map(r => pct(r, B.OP_PCT)).filter(n=>n!==null))],
    ['Discovery', avg(bookedRows.map(r => pct(r, B.DC_PCT)).filter(n=>n!==null))],
    ['Pitch',     avg(bookedRows.map(r => pct(r, B.PT_PCT)).filter(n=>n!==null))],
    ['Next Step', avg(bookedRows.map(r => pct(r, B.NS_PCT)).filter(n=>n!==null))],
    ['General',   avg(bookedRows.map(r => pct(r, B.GN_PCT)).filter(n=>n!==null))],
  ];
  el('booked-section-bars').innerHTML = sections.map(([name, v]) => sectionBar(name, v)).join('');

  destroyChart('discovery');
  const discItems = [
    ['Need / Pain',     hitRate(bookedRows, B.DC_NEED)],
    ['Current Process', hitRate(bookedRows, B.DC_PROC)],
    ['Econ Impact',     hitRate(bookedRows, B.DC_ECON)],
    ['Decision Maker',  hitRate(bookedRows, B.DC_DM)],
    ['Urgency',         hitRate(bookedRows, B.DC_URG)],
  ];
  charts['discovery'] = new Chart(el('chart-discovery'), {
    type: 'bar',
    data: {
      labels: discItems.map(d => d[0]),
      datasets: [{ label: 'Hit Rate %', data: discItems.map(d => d[1]), backgroundColor: discItems.map(d => scoreColor(d[1])), borderRadius: 4, borderSkipped: false }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { min: 0, max: 100, grid: { color: '#4c5f67' }, ticks: { callback: v => v + '%' } },
        y: { grid: { display: false } },
      },
    },
  });

  const agentMap = {};
  bookedRows.forEach(r => {
    const agent = val(r, B.AGENT);
    const score = pct(r, B.OVERALL);
    if (!agent || score === null) return;
    if (!agentMap[agent]) agentMap[agent] = { scores: [], autofails: 0, calls: 0 };
    agentMap[agent].scores.push(score);
    agentMap[agent].calls++;
    if (isYes(r, B.AF_TRIG)) agentMap[agent].autofails++;
  });
  const rows = Object.entries(agentMap)
    .map(([name, d]) => ({ name, avg: avg(d.scores), calls: d.calls, autofails: d.autofails }))
    .sort((a, b) => b.avg - a.avg);

  el('booked-agent-table').innerHTML = `
    <table class="agent-table">
      <thead><tr><th>Agent</th><th>Calls</th><th>Avg Score</th><th>Autofails</th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td>${esc(r.name)}</td>
          <td>${r.calls}</td>
          <td><span class="score-pill ${scoreClass(r.avg)}">${r.avg}%</span></td>
          <td style="color:${r.autofails > 0 ? RED : 'var(--text-muted)'}">
            ${r.autofails > 0 ? `⚠️ ${r.autofails}` : '—'}
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

// ════════════════════════════════════════════════════════
//  NO BOOKING TAB
// ════════════════════════════════════════════════════════
function buildNoBooking(nbRows) {
  if (!nbRows.length) {
    el('nb-kpis').innerHTML = '<p style="color:var(--text-muted)">No no-booking calls in this batch.</p>';
    return;
  }
  const avgOverall = avg(nbRows.map(r => pct(r, N.OVERALL)).filter(n => n !== null));
  const hookRate   = hitRate(nbRows, N.OP_HOOK);
  const pbRate     = hitRate(nbRows, N.DIAG_PB);

  const objCounts = {};
  nbRows.forEach(r => {
    const obj = val(r, N.DIAG_OBJ);
    if (!obj || obj === '—' || obj === '-') return;
    objCounts[obj] = (objCounts[obj] || 0) + 1;
  });
  const topObj = Object.entries(objCounts).sort((a, b) => b[1] - a[1])[0];

  el('nb-kpis').innerHTML = [
    kpiCard('Avg Score', `${avgOverall}%`, `${nbRows.length} no-booking calls`, scoreClass(avgOverall)),
    kpiCard('Hook Rate', `${hookRate ?? '—'}%`, 'Opener: Value Hook landed', hookRate !== null ? scoreClass(hookRate) : 'amber'),
    kpiCard('TM Push Back', `${pbRate ?? '—'}%`, 'Held position vs objection', pbRate !== null ? scoreClass(pbRate) : 'amber'),
    kpiCard('Top Objection', topObj ? topObj[0] : 'N/A', topObj ? `${topObj[1]} occurrence${topObj[1] !== 1 ? 's' : ''}` : '', 'amber'),
  ].join('');

  const sections = [
    ['Opener',     avg(nbRows.map(r => pct(r, N.OP_PCT)).filter(n=>n!==null))],
    ['Discovery',  avg(nbRows.map(r => pct(r, N.DC_PCT)).filter(n=>n!==null))],
    ['Objections', avg(nbRows.map(r => pct(r, N.OB_PCT)).filter(n=>n!==null))],
  ];
  el('nb-section-bars').innerHTML = sections.map(([name, v]) => sectionBar(name, v)).join('');

  const openerItems = [
    ['Intro / Name',   hitRate(nbRows, N.OP_INTRO)],
    ['Company',        hitRate(nbRows, N.OP_COMPANY)],
    ['Permission Ask', hitRate(nbRows, N.OP_PERM)],
    ['Hook / Value',   hitRate(nbRows, N.OP_HOOK)],
  ];
  el('nb-opener-bars').innerHTML = openerItems.map(([name, v]) => v !== null ? sectionBar(name, v) : '').join('');

  destroyChart('objections');
  const objLabels = Object.keys(objCounts);
  const objValues = Object.values(objCounts);
  const palette   = [GREEN, AMBER, RED, BLUE_INFO, '#a78bfa', '#f472b6'];
  charts['objections'] = new Chart(el('chart-objections'), {
    type: 'doughnut',
    data: {
      labels: objLabels,
      datasets: [{ data: objValues, backgroundColor: objLabels.map((_, i) => palette[i % palette.length]), borderWidth: 2, borderColor: '#232b2f' }],
    },
    options: {
      cutout: '65%',
      plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } } },
    },
  });

  const agentMap = {};
  nbRows.forEach(r => {
    const agent = val(r, N.AGENT);
    const score = pct(r, N.OVERALL);
    if (!agent || score === null) return;
    if (!agentMap[agent]) agentMap[agent] = { scores: [], issues: new Set(), autofails: 0 };
    agentMap[agent].scores.push(score);
    if (isYes(r, N.AF_TRIG)) agentMap[agent].autofails++;
    const cp1 = val(r, N.CP1);
    if (cp1 && cp1 !== '—' && cp1 !== '-') agentMap[agent].issues.add(cp1);
  });
  const flagRows = Object.entries(agentMap)
    .map(([name, d]) => ({ name, avg: avg(d.scores), issues: [...d.issues], autofails: d.autofails }))
    .sort((a, b) => a.avg - b.avg);

  el('nb-agent-flags').innerHTML = flagRows.map(r => {
    const issueText = r.autofails > 0
      ? [`⚠️ Autofail (${r.autofails})`, ...r.issues].slice(0, 3).join(' · ')
      : r.issues.slice(0, 3).join(' · ') || 'No issues flagged';
    return `<div class="flag-row">
      <div>
        <div class="flag-agent">${esc(r.name)}</div>
        <div style="font-size:0.6875rem;color:var(--text-dim)">${r.scores.length} call${r.scores.length!==1?'s':''}</div>
      </div>
      <div class="flag-issues">${esc(issueText)}</div>
      <div class="flag-score" style="color:${scoreColor(r.avg)}">${r.avg}%</div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
//  CALL LOG TAB
// ════════════════════════════════════════════════════════
let activeAgentFilter = 'all';

function buildCallLog(bookedRows, nbRows) {
  // Normalise both sets into a unified structure
  const allCalls = [
    ...bookedRows.map(r => ({ r, rubric: 'booked' })),
    ...nbRows.map(r => ({ r, rubric: 'nb' })),
  ];

  // Sort by date desc, then call ID
  allCalls.sort((a, b) => {
    const da = val(a.r, B.DATE), db = val(b.r, B.DATE);
    if (da !== db) return da > db ? -1 : 1;
    return String(val(a.r, B.CALL_ID)).localeCompare(String(val(b.r, B.CALL_ID)));
  });

  // KPIs for call log
  const allScores = allCalls.map(c => pct(c.r, B.OVERALL)).filter(n=>n!==null);
  const teamAvg   = avg(allScores);
  const totalAF   = allCalls.filter(c =>
    c.rubric === 'booked' ? isYes(c.r, B.AF_TRIG) : isYes(c.r, N.AF_TRIG)
  ).length;
  const belowAvg  = allCalls.filter(c => (pct(c.r,B.OVERALL)||0) < 65).length;

  el('cl-kpis').innerHTML = [
    kpiCard('Total Calls', allCalls.length, 'in this batch', 'blue'),
    kpiCard('Team Avg', `${teamAvg}%`, 'overall score', scoreClass(teamAvg)),
    kpiCard('Below 65%', belowAvg, 'need coaching', belowAvg === 0 ? 'green' : belowAvg <= 3 ? 'amber' : 'red'),
    kpiCard('Autofails', totalAF, totalAF === 0 ? 'None this batch' : 'Immediate review', totalAF === 0 ? 'green' : 'red'),
  ].join('');

  // Build agent filter chips
  const agents = [...new Set(allCalls.map(c => val(c.r, B.AGENT)).filter(Boolean))].sort();
  const filterWrap = el('agent-filters');
  filterWrap.innerHTML = '';

  function makeChip(label, value) {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (activeAgentFilter === value ? ' active' : '');
    chip.textContent = label;
    chip.onclick = () => {
      activeAgentFilter = value;
      filterWrap.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderCallRows(allCalls);
    };
    filterWrap.appendChild(chip);
  }
  makeChip('All reps', 'all');
  agents.forEach(a => makeChip(a, a));

  renderCallRows(allCalls);
}

function renderCallRows(allCalls) {
  const filtered = activeAgentFilter === 'all'
    ? allCalls
    : allCalls.filter(c => val(c.r, B.AGENT) === activeAgentFilter);

  const tbody = el('cl-tbody');
  tbody.innerHTML = '';

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="14" class="cl-empty">No calls match the current filter.</td></tr>`;
    el('cl-meta').textContent = '';
    return;
  }

  filtered.forEach((call, idx) => {
    const { r, rubric } = call;
    const rowId    = `cl-row-${idx}`;
    const detailId = `cl-det-${idx}`;

    const callId  = val(r, B.CALL_ID);
    const agent   = val(r, B.AGENT);
    const date    = val(r, B.DATE);
    const dur     = val(r, B.DURATION);
    const type    = val(r, B.TYPE);
    const overall = pct(r, B.OVERALL);
    const cls     = overall !== null ? scoreClass(overall) : 'amber';

    // Section %s (vary by rubric)
    const opPct = rubric === 'booked' ? pct(r, B.OP_PCT) : pct(r, N.OP_PCT);
    const dcPct = rubric === 'booked' ? pct(r, B.DC_PCT) : pct(r, N.DC_PCT);
    const ptPct = rubric === 'booked' ? pct(r, B.PT_PCT) : pct(r, N.OB_PCT);
    const nsPct = rubric === 'booked' ? pct(r, B.NS_PCT) : null;
    const gnPct = rubric === 'booked' ? pct(r, B.GN_PCT) : null;
    const afTrig = rubric === 'booked' ? isYes(r, B.AF_TRIG) : isYes(r, N.AF_TRIG);
    const cp1    = rubric === 'booked' ? val(r, B.CP1) : val(r, N.CP1);

    function pctCell(v) {
      if (v === null) return `<td style="color:var(--text-dim)">—</td>`;
      const c = scoreColor(v);
      return `<td style="color:${c};font-weight:600">${v}%</td>`;
    }

    const dataRow = document.createElement('tr');
    dataRow.className = 'data-row';
    dataRow.id = rowId;
    dataRow.innerHTML = `
      <td><button class="expand-btn" data-target="${detailId}" data-row="${rowId}" aria-expanded="false">▶</button></td>
      <td>${revioLink(callId)}</td>
      <td style="font-weight:500">${esc(agent)}</td>
      <td style="color:var(--text-muted)">${esc(date)}</td>
      <td style="color:var(--text-muted)">${esc(dur)}</td>
      <td>${type ? `<span style="font-size:0.6875rem;padding:2px 7px;border-radius:99px;background:${type.toLowerCase().includes('book') ? 'rgba(138,204,51,0.1)' : 'rgba(45,122,185,0.1)'};color:${type.toLowerCase().includes('book') ? GREEN : BLUE_INFO}">${esc(type)}</span>` : '—'}</td>
      <td><span class="score-pill ${cls}">${overall !== null ? overall + '%' : '—'}</span></td>
      ${pctCell(opPct)}
      ${pctCell(dcPct)}
      ${pctCell(ptPct)}
      ${pctCell(nsPct)}
      ${pctCell(gnPct)}
      <td style="color:${afTrig ? RED : 'var(--text-dim)'}">${afTrig ? '⚠️ Yes' : '—'}</td>
      <td style="color:var(--text-muted);font-size:0.6875rem;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(cp1)}">${esc(cp1) || '—'}</td>
    `;

    // Expanded detail row
    const detailRow = document.createElement('tr');
    detailRow.id = detailId;
    detailRow.style.display = 'none';
    detailRow.innerHTML = `<td colspan="14" class="cl-detail-cell">${buildDetailHTML(r, rubric)}</td>`;

    tbody.appendChild(dataRow);
    tbody.appendChild(detailRow);
  });

  // Wire expand buttons
  tbody.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const detailRow = el(btn.dataset.target);
      const dataRow   = el(btn.dataset.row);
      const isOpen    = btn.getAttribute('aria-expanded') === 'true';
      if (isOpen) {
        detailRow.style.display = 'none';
        btn.textContent = '▶';
        btn.setAttribute('aria-expanded', 'false');
        dataRow.classList.remove('expanded');
      } else {
        detailRow.style.display = 'table-row';
        btn.textContent = '▼';
        btn.setAttribute('aria-expanded', 'true');
        dataRow.classList.add('expanded');
      }
    });
  });

  el('cl-meta').textContent = `Showing ${filtered.length} of ${allCalls.length} calls${activeAgentFilter !== 'all' ? ` · filtered to ${activeAgentFilter}` : ''} · click ▶ to expand full item breakdown`;
}

function buildDetailHTML(r, rubric) {
  const cp1   = rubric === 'booked' ? val(r, B.CP1)   : val(r, N.CP1);
  const cp2   = rubric === 'booked' ? val(r, B.CP2)   : val(r, N.CP2);
  const cp3   = rubric === 'booked' ? val(r, B.CP3)   : val(r, N.CP3);
  const notes = rubric === 'booked' ? val(r, B.NOTES)  : val(r, N.NOTES);

  function section(title, items) {
    return `<div class="detail-section">
      <div class="ds-title">${title}</div>
      ${items.map(([label, idx]) => `
        <div class="ds-item">
          <span>${esc(label)}</span>
          ${ynBadge(r, idx)}
        </div>`).join('')}
    </div>`;
  }

  let sectionsHTML = '';
  if (rubric === 'booked') {
    sectionsHTML = [
      section('Opener', [
        ['Intro / Name', B.OP_INTRO], ['Company', B.OP_COMPANY],
        ['Permission Ask', B.OP_PERM], ['Reason for Call', B.OP_REASON], ['Timeframe', B.OP_TF],
      ]),
      section('Discovery', [
        ['Need / Pain', B.DC_NEED], ['Current Process', B.DC_PROC],
        ['Econ Impact', B.DC_ECON], ['Decision Maker', B.DC_DM], ['Urgency', B.DC_URG],
      ]),
      section('Pitch', [
        ['Tailored Pitch', B.PT_PITCH], ['Feature Benefit', B.PT_FEAT],
      ]),
      section('Next Step', [
        ['Assumptive Close (LT)', B.NS_ASLT], ['Assumptive Close (Book)', B.NS_ASBK],
        ['Obj. Handling', B.NS_OBJ], ['Confirmation', B.NS_CONF],
        ['Next Steps Recap', B.NS_RECAP], ['Calendar Invite', B.NS_CAL],
      ]),
      section('General', [
        ['Active Listening', B.GN_LISTEN], ['Professional Tone', B.GN_TONE], ['Call Control', B.GN_CTRL],
      ]),
      section('Autofail Items', [
        ['Misinformation', B.AF_MISINFO], ['Hang Up', B.AF_HANG],
        ['Profanity', B.AF_PROF], ['PII Breach', B.AF_PII],
      ]),
    ].join('');
  } else {
    sectionsHTML = [
      section('Opener', [
        ['Intro / Name', N.OP_INTRO], ['Company', N.OP_COMPANY],
        ['Permission Ask', N.OP_PERM], ['Hook / Value', N.OP_HOOK],
      ]),
      section('Discovery', [
        ['Need / Pain', N.DC_NEED], ['Current Process', N.DC_PROC], ['Urgency', N.DC_URG],
      ]),
      section('Objections', [
        ['Value vs Objection', N.OB_VAL], ['Empathy', N.OB_EMP],
        ['Reframe', N.OB_REFR], ['Trial Close', N.OB_TRIAL],
        ['Call Back Attempt', N.OB_CB], ['Second Attempt', N.OB_SEC],
      ]),
      section('Autofail Items', [
        ['Misinformation', N.AF_MISINFO], ['Hang Up', N.AF_HANG], ['Profanity', N.AF_PROF],
      ]),
      `<div class="detail-section">
        <div class="ds-title">Diagnostics</div>
        <div class="ds-item"><span>TM Push Back</span>${ynBadge(r, N.DIAG_PB)}</div>
        <div class="ds-item"><span>Objection Type</span>
          <span style="font-size:0.6875rem;color:var(--text-muted)">${esc(val(r, N.DIAG_OBJ)) || '—'}</span>
        </div>
      </div>`,
    ].join('');
  }

  const cps = [cp1, cp2, cp3].filter(c => c && c !== '—' && c !== '-');

  return `<div class="cl-detail-inner">
    <div class="detail-grid">${sectionsHTML}</div>
    <div class="coaching-box">
      <div class="ds-title">Coaching priorities &amp; notes</div>
      ${cps.length ? `<div class="coaching-row">${cps.map(c => `<span class="cp-badge">${esc(c)}</span>`).join('')}</div>` : ''}
      <div class="coaching-notes">${notes ? esc(notes) : '<em style="color:var(--text-dim)">No notes recorded.</em>'}</div>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════
//  TAB SWITCHING
// ════════════════════════════════════════════════════════
let dataCache = null;
let builtTabs = new Set();

function showTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  el(`tab-${tabId}`).classList.remove('hidden');

  if (!dataCache) return;
  const { bookedRows, nbRows } = dataCache;

  if (tabId === 'booked' && !builtTabs.has('booked')) {
    buildBooked(bookedRows);
    builtTabs.add('booked');
  }
  if (tabId === 'no-booking' && !builtTabs.has('no-booking')) {
    buildNoBooking(nbRows);
    builtTabs.add('no-booking');
  }
  if (tabId === 'call-log' && !builtTabs.has('call-log')) {
    buildCallLog(bookedRows, nbRows);
    builtTabs.add('call-log');
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

// ════════════════════════════════════════════════════════
//  DATA LOAD
// ════════════════════════════════════════════════════════
async function loadData() {
  el('loading').classList.remove('hidden');
  el('error-state').classList.add('hidden');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  builtTabs.clear();
  dataCache = null;
  activeAgentFilter = 'all';
  Object.keys(charts).forEach(id => { charts[id].destroy(); delete charts[id]; });

  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const bookedRows = parseRows(data.booked);
    const nbRows     = parseRows(data.noBooking);

    if (data.fetchedAt) {
      const d = new Date(data.fetchedAt);
      el('fetch-time').textContent = `Updated ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    dataCache = { bookedRows, nbRows };
    el('loading').classList.add('hidden');

    buildOverview(bookedRows, nbRows);
    builtTabs.add('overview');
    showTab('overview');

  } catch (err) {
    el('loading').classList.add('hidden');
    el('error-state').classList.remove('hidden');
    el('error-msg').textContent = `Failed to load data: ${err.message}`;
    console.error(err);
  }
}

loadData();
