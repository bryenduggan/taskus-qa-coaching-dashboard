/* ═══════════════════════════════════════════════════════
   QA Intelligence Hub — Frontend Logic
   3-layer: Executive (LOB) › Manager › Rep Detail
   Atlantis dark palette · Revenue.io deep-links
   ═══════════════════════════════════════════════════════ */

const REVENUE_IO_BASE = 'https://analytics.revenue.io/conversations/';

Chart.defaults.color       = '#a9b7bc';
Chart.defaults.borderColor = '#4c5f67';
Chart.defaults.font.family = "Inter, Helvetica, Arial, sans-serif";
Chart.defaults.font.size   = 12;

const GREEN     = '#8acc33';
const AMBER     = '#cdb52d';
const RED       = '#df786d';
const BLUE_INFO = '#2d7ab9';

function scoreColor(pct) { return pct >= 80 ? GREEN : pct >= 65 ? AMBER : RED; }
function scoreClass(pct) { return pct >= 80 ? 'green' : pct >= 65 ? 'amber' : 'red'; }

// ── Column indices — Booked / LT  (A=0 … AS=44) ──────────────
const B = {
  CALL_ID:0, AGENT:1, DATE:2, DURATION:3, TYPE:4, OVERALL:5,
  OP_INTRO:6, OP_PURPOSE:7, OP_CONTEXT:8, OP_INDUSTRY:9, OP_COMPANY_SIZE:10, OP_PCT:11,
  DC_PROC:12, DC_PAIN:13, DC_ECON:14, DC_IMPLICIT:15, DC_URG:16, DC_PCT:17,
  PT_RESTATE:18, PT_PRESENT:19, PT_PCT:20,
  NS_EST:21, NS_CONFIRM:22, NS_RECAP:23, NS_ADDL:24, NS_CLOSE_LT:25, NS_CLOSE_BK:26, NS_PCT:27,
  GN_OBJ:28, GN_COMM:29, GN_ACK:30, GN_PCT:31,
  AF_MISINFO:32, AF_RUDE:33, AF_PROF:34, AF_PII:35, AF_TRIG:36,
  CP1:37, CP2:38, CP3:39, NOTES:40, LOB:41, REVIEWED_BY:42, DATE_SCORED:43, LEAD_STATUS:44,
};

// ── Column indices — No Booking  (A=0 … AJ=35) ───────────────
const N = {
  CALL_ID:0, AGENT:1, DATE:2, DURATION:3, TYPE:4, OVERALL:5,
  OP_HOOK:6, OP_PURPOSE:7, OP_CONTEXT:8, OP_RIGHT_PERSON:9, OP_PCT:10,
  DC_PROC:11, DC_PAIN:12, DC_POSITION:13, DC_PCT:14,
  OB_REASON:15, OB_VALUE:16, OB_PIVOT:17, OB_CLARIFY:18, OB_PACING:19, OB_RESPECT:20, OB_PCT:21,
  AF_RUDE:22, AF_MISINFO:23, AF_LEGAL:24, AF_TRIG:25,
  DIAG1:26, DIAG2:27,
  CP1:28, CP2:29, CP3:30, NOTES:31, LOB:32, REVIEWED_BY:33, DATE_SCORED:34, LEAD_STATUS:35,
};

// ── Manager → Rep mapping ─────────────────────────────────────
const MANAGER_MAP = {
  'Grant Mendano':   ['Jessie Tatad','Eillen Mae Cruz','Franniella San Mateo','Markell Manalo',
                      'Edrian Maraya','Mark Levi Delima','Andy Heartynazck Hugo','Renz Christian Fernandez',
                      'Ma Luisa Padron'],
  'Joseph Pastrana': ['Alex Saberdo','Noel Manhilot','Regil Kent Gipanao','Ronin Felisario',
                      'Aff Daryll Zeta','John Daryl Zamora','Raul John Dalandan','Christian Lanzar',
                      'Rhein Jazrelle Mendenueta','John Jerick Moldes','John Hoefel Relucio'],
  'Kharlo De Leon':  ['Richard Gopez','Sajid Baider','Veronica Halili','Mark Eran Akiko Alim',
                      'Ysabelle Velasco','Vince Nicole Tamayo','Sheila May Lasam','Charles Tobby Jaca'],
  'Aki Lopez':       ['Ejay Santos','Aileen Salazar','Jerick Labordo','Mariane Kaye Ruallo','Gabriel Maluya'],
  'Daizy Malate':    ['Julian Simon Babaran'],
};

// reverse lookup rep → manager
const REP_TO_MANAGER = {};
Object.entries(MANAGER_MAP).forEach(([mgr, reps]) => reps.forEach(r => { REP_TO_MANAGER[r] = mgr; }));

// ── LOB normaliser ────────────────────────────────────────────
function normalizeLOB(raw) {
  if (!raw) return '';
  const s = raw.toLowerCase();
  if (s.includes('cold') || s.includes('overnight')) return 'Cold';
  if (s.includes('recycl'))                           return 'Recycled';
  if (s.includes('campaign') || s.includes('summit')) return 'Campaigns';
  return '';
}

// ── Row parsing ───────────────────────────────────────────────
function parseRows(rawRows) {
  if (!rawRows || rawRows.length < 2) return [];
  return rawRows.slice(1).filter(r => r && r[0] && String(r[0]).trim() !== '');
}

function pct(row, idx) {
  const v = row[idx];
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).replace(/%/g, '').trim();
  if (s === '') return null;
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  // BLT cells are percentage-formatted: integer 19 stored → Sheets shows "1900%" → divide by 100
  if (n > 100) return Math.round(n / 100);
  // NB original batches stored decimal fractions: 0.46 = 46%, 1.0 = 100% → multiply by 100
  if (n > 0 && n <= 1.0) return Math.round(n * 100);
  return n;
}
function val(row, idx)   { return (row[idx] || '').toString().trim(); }
function isYes(row, idx) { return val(row, idx).toLowerCase() === 'yes'; }
function isNA(row, idx)  { const v = val(row, idx).toLowerCase(); return v === 'na' || v === 'n/a'; }
function hitRate(rows, idx) {
  const eligible = rows.filter(r => !isNA(r, idx));
  if (!eligible.length) return null;
  return Math.round(eligible.filter(r => isYes(r, idx)).length / eligible.length * 100);
}
function avg(nums) {
  const valid = nums.filter(n => n !== null && !isNaN(n));
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
}
function initials(name) { return name.split(' ').map(p => p[0] || '').join('').slice(0, 2).toUpperCase(); }

// ── DOM helpers ───────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function sectionBar(name, value) {
  if (value === null || isNaN(value)) return '';
  const cls = scoreClass(value);
  const colorMap = { green: GREEN, amber: AMBER, red: RED };
  return `<div class="sbar-row">
    <div class="sbar-header">
      <span class="sbar-name">${esc(name)}</span>
      <span class="sbar-pct" style="color:${colorMap[cls]}">${value}%</span>
    </div>
    <div class="sbar-track"><div class="sbar-fill ${cls}" style="width:${Math.min(value,100)}%"></div></div>
  </div>`;
}

let _sbarUid = 0;
function expandableSectionBar(name, value, items) {
  if (value === null || isNaN(value)) return '';
  const cls = scoreClass(value);
  const colorMap = { green: GREEN, amber: AMBER, red: RED };
  const color = colorMap[cls];
  const uid = `xsbar-${++_sbarUid}`;
  const validItems = (items || []).filter(([, v]) => v !== null);
  const hasItems = validItems.length > 0;
  const itemsHTML = hasItems ? `<div class="sbar-items" id="${uid}">
      ${validItems.map(([label, v]) => {
        const ic = scoreClass(v);
        return `<div class="sbar-item-row">
          <span class="sbar-item-label">${esc(label)}</span>
          <div class="sbar-item-track"><div class="sbar-item-fill ${ic}" style="width:${Math.min(v,100)}%"></div></div>
          <span class="sbar-item-pct" style="color:${colorMap[ic]}">${v}%</span>
        </div>`;
      }).join('')}
    </div>` : '';
  return `<div class="sbar-row${hasItems ? ' sbar-expandable' : ''}"${hasItems ? ` onclick="toggleSbarExpand('${uid}',this)"` : ''}>
    <div class="sbar-header">
      <span class="sbar-name">${hasItems ? `<span class="sbar-chevron">›</span> ` : ''}${esc(name)}</span>
      <span class="sbar-pct" style="color:${color}">${value}%</span>
    </div>
    <div class="sbar-track"><div class="sbar-fill ${cls}" style="width:${Math.min(value,100)}%"></div></div>
    ${itemsHTML}
  </div>`;
}

function toggleSbarExpand(uid, rowEl) {
  const items = el(uid);
  if (!items) return;
  const isOpen = items.classList.toggle('open');
  const chevron = rowEl.querySelector('.sbar-chevron');
  if (chevron) chevron.textContent = isOpen ? '˅' : '›';
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
  return `<a class="rev-link" href="${REVENUE_IO_BASE}${callId}" target="_blank" rel="noopener">
    ${esc(callId)}<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M7 1h4v4M11 1L5 7M4 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </a>`;
}

// ── Human tab normalization ───────────────────────────────────
// Human tabs have: A=Call ID (full URL), B=Agent, C=Date, D=Reviewer, E=Type, F=LOB, G=Overall%, H+= rubric items
// We normalize them into the same row format as AI tabs so existing display logic works.

function normalizeReviewer(raw) {
  if (!raw) return 'Derek';
  const s = String(raw).trim().toLowerCase();
  if (s === 'dm' || s === 'derek') return 'Derek';
  return raw.trim();
}

function extractRcId(callId) {
  if (!callId) return '';
  const s = String(callId).trim();
  // Full URL: https://analytics.revenue.io/conversations/rc123...
  const match = s.match(/\/(rc\w+)\s*$/i);
  if (match) return match[1];
  // Already an rc# ID
  if (/^rc\d+/i.test(s)) return s;
  return s;
}

function convertHumanScore(v) {
  // Human tabs store scores as "75%" strings
  if (v === undefined || v === null || v === '') return '';
  const s = String(v).trim();
  if (s.endsWith('%')) return String(Math.round(parseFloat(s)));
  return s; // Already a number string
}

// Normalize a QA Scoring No Booking row into AI No Booking row format (N indices)
function normalizeHumanNBRow(h) {
  const row = new Array(36).fill('');
  row[N.CALL_ID]        = extractRcId(h[0]);
  row[N.AGENT]          = h[1] || '';
  row[N.DATE]           = h[2] || '';
  // [3] DURATION — not in human tab, leave empty
  row[N.TYPE]           = h[4] || '';
  row[N.OVERALL]        = convertHumanScore(h[6]);
  row[N.OP_HOOK]        = h[7] || '';
  row[N.OP_PURPOSE]     = h[8] || '';
  row[N.OP_CONTEXT]     = h[9] || '';
  row[N.OP_RIGHT_PERSON]= h[10] || '';
  row[N.OP_PCT]         = convertHumanScore(h[11]);
  row[N.DC_PROC]        = h[12] || '';
  row[N.DC_PAIN]        = h[13] || '';
  row[N.DC_POSITION]    = h[14] || '';
  row[N.DC_PCT]         = convertHumanScore(h[15]);
  row[N.OB_REASON]      = h[16] || '';
  row[N.OB_VALUE]       = h[17] || '';
  row[N.OB_PIVOT]       = h[18] || '';
  row[N.OB_CLARIFY]     = h[19] || '';
  row[N.OB_PACING]      = h[20] || '';
  row[N.OB_RESPECT]     = h[21] || '';
  row[N.OB_PCT]         = convertHumanScore(h[22]);
  row[N.AF_RUDE]        = h[23] || '';
  row[N.AF_MISINFO]     = h[24] || '';
  row[N.AF_LEGAL]       = h[25] || '';
  row[N.AF_TRIG]        = h[26] || '';
  row[N.DIAG1]          = h[27] || '';
  row[N.DIAG2]          = h[28] || '';
  row[N.CP1]            = h[29] || '';
  row[N.CP2]            = h[30] || '';
  row[N.CP3]            = h[31] || '';
  row[N.NOTES]          = h[32] || '';
  row[N.LOB]            = h[5]  || '';   // LOB is at col F in human tab
  row[N.REVIEWED_BY]    = normalizeReviewer(h[3]);
  row[N.DATE_SCORED]    = h[2]  || '';   // use call date as DateScored
  row[N.LEAD_STATUS]    = '';
  return row;
}

// Normalize a QA Scoring Booked/LT row into AI Booked/LT row format (B indices)
function normalizeHumanBookedRow(h) {
  const row = new Array(45).fill('');
  row[B.CALL_ID]         = extractRcId(h[0]);
  row[B.AGENT]           = h[1]  || '';
  row[B.DATE]            = h[2]  || '';
  // [3] DURATION — not in human tab
  row[B.TYPE]            = h[4]  || '';
  row[B.OVERALL]         = convertHumanScore(h[6]);
  // Opener items: human H-L = indices 7-12 → AI 6-11
  row[B.OP_INTRO]        = h[7]  || '';
  row[B.OP_PURPOSE]      = h[8]  || '';
  row[B.OP_CONTEXT]      = h[9]  || '';
  row[B.OP_INDUSTRY]     = h[10] || '';
  row[B.OP_COMPANY_SIZE] = h[11] || '';
  row[B.OP_PCT]          = convertHumanScore(h[12]);
  // Discovery items: human M-R = indices 13-18 → AI 12-17
  row[B.DC_PROC]         = h[13] || '';
  row[B.DC_PAIN]         = h[14] || '';
  row[B.DC_ECON]         = h[15] || '';
  row[B.DC_IMPLICIT]     = h[16] || '';
  row[B.DC_URG]          = h[17] || '';
  row[B.DC_PCT]          = convertHumanScore(h[18]);
  // Pitch items: human S-U = indices 19-21 → AI 18-20
  row[B.PT_RESTATE]      = h[19] || '';
  row[B.PT_PRESENT]      = h[20] || '';
  row[B.PT_PCT]          = convertHumanScore(h[21]);
  // Next Step items: human V-AB = indices 22-28 → AI 21-27
  row[B.NS_EST]          = h[22] || '';
  row[B.NS_CONFIRM]      = h[23] || '';
  row[B.NS_RECAP]        = h[24] || '';
  row[B.NS_ADDL]         = h[25] || '';
  row[B.NS_CLOSE_LT]     = h[26] || '';
  row[B.NS_CLOSE_BK]     = h[27] || '';
  row[B.NS_PCT]          = convertHumanScore(h[28]);
  // General items: human AC-AF = indices 29-32 → AI 28-31
  row[B.GN_OBJ]          = h[29] || '';
  row[B.GN_COMM]         = h[30] || '';
  row[B.GN_ACK]          = h[31] || '';
  row[B.GN_PCT]          = convertHumanScore(h[32]);
  // Autofails: human AG-AJ = indices 33-36 → AI 32-35
  row[B.AF_MISINFO]      = h[33] || '';
  row[B.AF_RUDE]         = h[34] || '';
  row[B.AF_PROF]         = h[35] || '';
  row[B.AF_PII]          = h[36] || '';
  row[B.AF_TRIG]         = h[37] || '';
  // Coaching priorities: human AK-AM = indices 38-40 → AI 37-39
  row[B.CP1]             = h[38] || '';
  row[B.CP2]             = h[39] || '';
  row[B.CP3]             = h[40] || '';
  row[B.NOTES]           = h[41] || '';
  row[B.LOB]             = h[5]  || '';  // LOB is at col F in human tab
  row[B.REVIEWED_BY]     = normalizeReviewer(h[3]);
  row[B.DATE_SCORED]     = h[2]  || '';  // use call date as DateScored
  row[B.LEAD_STATUS]     = '';
  return row;
}

function parseHumanRows(rawRows) {
  if (!rawRows || rawRows.length < 2) return [];
  // Skip header row (row 0), filter rows that have a non-empty Call ID
  return rawRows.slice(1).filter(r => r && r[0] && String(r[0]).trim() !== '');
}

// ── Lead Status badge (color-coded by Salesforce status value) ─
function leadStatusBadge(statusRaw) {
  if (!statusRaw || statusRaw === '—' || statusRaw === '') return `<span style="color:var(--text-dim)">—</span>`;
  const s = statusRaw.toLowerCase().trim();
  let color, bg, emoji;

  // Booked / LT outcomes → green
  if (s === 'sql' || s === 'meeting booked' || s.includes('convert') || s.includes('book')) {
    color = GREEN;     bg = 'rgba(138,204,51,0.12)';  emoji = '🟢';
  }
  // Meeting No Show → amber (caution)
  else if (s === 'meeting no show' || s.includes('no show')) {
    color = AMBER;     bg = 'rgba(205,181,45,0.12)';  emoji = '🟡';
  }
  // Working / Nurturing / MQL → blue
  else if (s.includes('working') || s.includes('nurtur') || s === 'mql') {
    color = BLUE_INFO; bg = 'rgba(45,122,185,0.12)';  emoji = '🔵';
  }
  // Call Back → amber
  else if (s.includes('call back') || s.includes('callbk')) {
    color = AMBER;     bg = 'rgba(205,181,45,0.12)';  emoji = '🟡';
  }
  // Not Interested / Unqualified / Disqualified → red
  else if (s.includes('not interest') || s.includes('unqualified') || s.includes('disqualif')) {
    color = RED;       bg = 'rgba(223,120,109,0.12)'; emoji = '🔴';
  }
  // New Lead → purple
  else if (s.includes('new')) {
    color = '#a78bfa'; bg = 'rgba(167,139,250,0.12)'; emoji = '🟣';
  }
  // Fallback
  else {
    color = 'var(--text-muted)'; bg = 'rgba(255,255,255,0.05)'; emoji = '';
  }

  return `<span style="font-size:0.625rem;padding:2px 7px;border-radius:99px;background:${bg};color:${color};font-weight:600;white-space:nowrap">${emoji ? emoji + ' ' : ''}${esc(statusRaw)}</span>`;
}

const charts = {};
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

// ── Period filter ─────────────────────────────────────────────
let currentPeriod = 'all';

function parseDateStr(s) {
  if (!s) return null;
  s = String(s).trim();
  // YYYY-MM-DD (how DateScored is written)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  // MM/DD/YYYY (how Revenue.io dates come through)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split('/').map(Number);
    return new Date(y, m - 1, d);
  }
  return null;
}

function inPeriod(dateStr, { start, end }) {
  const d = parseDateStr(dateStr);
  if (!d) return false;
  return d >= start && d <= end;
}

function getPeriodBounds(period) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow   = today.getDay(); // 0 = Sun, 1 = Mon …

  if (period === 'current-week') {
    // Mon–Sun ISO week
    const mon = new Date(today); mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    const sun = new Date(mon);   sun.setDate(mon.getDate() + 6);
    return { start: mon, end: sun };
  }
  if (period === 'prev-week') {
    const thisMon = new Date(today); thisMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    const prevMon = new Date(thisMon); prevMon.setDate(thisMon.getDate() - 7);
    const prevSun = new Date(thisMon); prevSun.setDate(thisMon.getDate() - 1);
    return { start: prevMon, end: prevSun };
  }
  if (period === 'mtd') {
    return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
  }
  if (period === 'qtd') {
    const q = Math.floor(today.getMonth() / 3);
    return { start: new Date(today.getFullYear(), q * 3, 1), end: today };
  }
  return null;
}

function getFilteredData() {
  if (!dataCache) return { bookedRows: [], nbRows: [] };
  if (currentPeriod === 'all') return dataCache;
  const bounds = getPeriodBounds(currentPeriod);
  if (!bounds) return dataCache;
  return {
    bookedRows: dataCache.bookedRows.filter(r => inPeriod(val(r, B.DATE_SCORED), bounds)),
    nbRows:     dataCache.nbRows.filter(r => inPeriod(val(r, N.DATE_SCORED), bounds)),
  };
}

function switchPeriod(p) {
  currentPeriod = p;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === p));
  const lbl = el('period-range-label');
  if (p !== 'all') {
    const bounds = getPeriodBounds(p);
    if (bounds && lbl) {
      const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      lbl.textContent = `${fmt(bounds.start)} – ${fmt(bounds.end)}`;
    }
  } else {
    if (lbl) lbl.textContent = '';
  }
  builtTabs.clear();
  if (dataCache) {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'overview';
    showTab(activeTab);
  }
}

// ════════════════════════════════════════════════════════════════
//  OVERVIEW TAB
// ════════════════════════════════════════════════════════════════
function buildOverview(bookedRows, nbRows) {
  const allRows   = [...bookedRows, ...nbRows];
  const allScores = allRows.map(r => pct(r, B.OVERALL)).filter(n => n !== null);
  const teamAvg   = avg(allScores);
  const totalAF   = bookedRows.filter(r => isYes(r, B.AF_TRIG)).length +
                    nbRows.filter(r => isYes(r, N.AF_TRIG)).length;

  const agentMap = {};
  allRows.forEach(r => {
    const agent = val(r, 1), score = pct(r, B.OVERALL);
    if (!agent || score === null) return;
    (agentMap[agent] = agentMap[agent] || []).push(score);
  });
  const agentAvgs     = Object.entries(agentMap).map(([name, s]) => ({ name, avg: avg(s), count: s.length }));
  const coachNowCount = agentAvgs.filter(a => a.avg < 65).length;

  const sectionLabels = ['Opener','Discovery','Pitch / Handling','Next Step','General'];
  const bSec = [B.OP_PCT, B.DC_PCT, B.PT_PCT, B.NS_PCT, B.GN_PCT].map(i => avg(bookedRows.map(r => pct(r,i)).filter(n=>n!==null)));
  const nSec = [N.OP_PCT, N.DC_PCT, N.OB_PCT, null, null].map(i => i !== null ? avg(nbRows.map(r => pct(r,i)).filter(n=>n!==null)) : null);
  const combined = sectionLabels.map((_, i) => {
    const vs = [bSec[i], nSec[i]].filter(n => n !== null);
    return vs.length ? avg(vs) : null;
  });
  let weakIdx = 0;
  combined.forEach((v, i) => { if (v !== null && (combined[weakIdx] === null || v < combined[weakIdx])) weakIdx = i; });

  el('overview-kpis').innerHTML = [
    kpiCard('Team Avg Score', `${teamAvg}%`, `${allRows.length} calls scored`, scoreClass(teamAvg)),
    kpiCard('Autofails', totalAF, totalAF === 0 ? 'None this batch' : 'Immediate review', totalAF === 0 ? 'green' : 'red'),
    kpiCard('Coach Now', coachNowCount, 'agents below 65%', coachNowCount === 0 ? 'green' : coachNowCount <= 2 ? 'amber' : 'red'),
    kpiCard('Weakest Section', sectionLabels[weakIdx], `${combined[weakIdx] ?? '—'}% avg`, combined[weakIdx] !== null ? scoreClass(combined[weakIdx]) : 'amber'),
  ].join('');

  el('overview-section-bars').innerHTML = sectionLabels.map((name, i) =>
    combined[i] !== null ? sectionBar(name, combined[i]) : ''
  ).join('');

  destroyChart('dist');
  const buckets = ['< 50','50–64','65–79','80–89','90–100'];
  const counts  = [0,0,0,0,0];
  allScores.forEach(s => {
    if (s < 50) counts[0]++; else if (s < 65) counts[1]++; else if (s < 80) counts[2]++; else if (s < 90) counts[3]++; else counts[4]++;
  });
  charts['dist'] = new Chart(el('chart-dist'), {
    type: 'bar',
    data: { labels: buckets, datasets: [{ data: counts, backgroundColor: [RED,RED,AMBER,GREEN,GREEN], borderRadius: 4, borderSkipped: false }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#4c5f67' } }, y: { grid: { color: '#4c5f67' }, ticks: { stepSize: 1 } } } },
  });

  agentAvgs.sort((a, b) => a.avg - b.avg);
  const badgeMap = { green: 'badge-strong', amber: 'badge-review', red: 'badge-coach' };
  const labelMap = { green: 'Strong', amber: 'Review', red: 'Coach Now' };
  el('agent-coaching-list').innerHTML = agentAvgs.map(a => {
    const cls = scoreClass(a.avg);
    return `<div class="agent-row" onclick="drillRep('${esc(a.name)}')" style="cursor:pointer" title="Click to view ${esc(a.name)}'s detail">
      <div class="agent-avatar">${initials(a.name)}</div>
      <div class="agent-info">
        <div class="agent-name">${esc(a.name)}</div>
        <div class="agent-meta">${a.count} call${a.count !== 1 ? 's' : ''} · avg ${a.avg}%</div>
      </div>
      <span class="badge ${badgeMap[cls]}">${labelMap[cls]}</span>
    </div>`;
  }).join('');

  const lowest = agentAvgs[0], highest = agentAvgs[agentAvgs.length - 1];
  el('ai-text').textContent =
    `Team avg is ${teamAvg}% across ${allRows.length} scored calls. ` +
    `${totalAF === 0 ? 'No autofails this batch — strong discipline.' : `⚠️ ${totalAF} autofail(s) need immediate review.`} ` +
    `${sectionLabels[weakIdx]} is the weakest section at ${combined[weakIdx]}%. ` +
    `${lowest.name} needs the most support (${lowest.avg}%); ${highest.name} is leading at ${highest.avg}%.`;
}

// ════════════════════════════════════════════════════════════════
//  BOOKED / LT TAB
// ════════════════════════════════════════════════════════════════
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

  el('booked-section-bars').innerHTML = [
    ['Opener',    B.OP_PCT, [
      ['Intro / Name',    hitRate(bookedRows, B.OP_INTRO)],
      ['Purpose',         hitRate(bookedRows, B.OP_PURPOSE)],
      ['Context',         hitRate(bookedRows, B.OP_CONTEXT)],
      ['Industry',        hitRate(bookedRows, B.OP_INDUSTRY)],
      ['Company Size',    hitRate(bookedRows, B.OP_COMPANY_SIZE)],
    ]],
    ['Discovery', B.DC_PCT, [
      ['Current Process', hitRate(bookedRows, B.DC_PROC)],
      ['Need / Pain',     hitRate(bookedRows, B.DC_PAIN)],
      ['Econ Impact',     hitRate(bookedRows, B.DC_ECON)],
      ['Implicit Needs',  hitRate(bookedRows, B.DC_IMPLICIT)],
      ['Urgency',         hitRate(bookedRows, B.DC_URG)],
    ]],
    ['Pitch',     B.PT_PCT, [
      ['Restate & Validate', hitRate(bookedRows, B.PT_RESTATE)],
      ['Present Jobber',     hitRate(bookedRows, B.PT_PRESENT)],
    ]],
    ['Next Step', B.NS_PCT, [
      ['NS Established',  hitRate(bookedRows, B.NS_EST)],
      ['Confirmed',       hitRate(bookedRows, B.NS_CONFIRM)],
      ['Recap',           hitRate(bookedRows, B.NS_RECAP)],
      ['Addl Help',       hitRate(bookedRows, B.NS_ADDL)],
      ['Close (LT)',      hitRate(bookedRows, B.NS_CLOSE_LT)],
      ['Close (Book)',    hitRate(bookedRows, B.NS_CLOSE_BK)],
    ]],
    ['General',   B.GN_PCT, [
      ['Objection Handling', hitRate(bookedRows, B.GN_OBJ)],
      ['Communication',      hitRate(bookedRows, B.GN_COMM)],
      ['Acknowledgement',    hitRate(bookedRows, B.GN_ACK)],
    ]],
  ].map(([name, i, items]) => expandableSectionBar(name, avg(bookedRows.map(r => pct(r,i)).filter(n=>n!==null)), items)).join('');

  destroyChart('discovery');
  const discItems = [
    ['Current Process', hitRate(bookedRows, B.DC_PROC)],
    ['Need / Pain',     hitRate(bookedRows, B.DC_PAIN)],
    ['Econ Impact',     hitRate(bookedRows, B.DC_ECON)],
    ['Implicit Needs',  hitRate(bookedRows, B.DC_IMPLICIT)],
    ['Urgency',         hitRate(bookedRows, B.DC_URG)],
  ];
  charts['discovery'] = new Chart(el('chart-discovery'), {
    type: 'bar',
    data: { labels: discItems.map(d => d[0]), datasets: [{ data: discItems.map(d => d[1]), backgroundColor: discItems.map(d => scoreColor(d[1] ?? 0)), borderRadius: 4, borderSkipped: false }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100, grid: { color: '#4c5f67' }, ticks: { callback: v => v+'%' } }, y: { grid: { display: false } } } },
  });

  const agentMap = {};
  bookedRows.forEach(r => {
    const agent = val(r, B.AGENT), score = pct(r, B.OVERALL);
    if (!agent || score === null) return;
    if (!agentMap[agent]) agentMap[agent] = { scores: [], autofails: 0 };
    agentMap[agent].scores.push(score);
    if (isYes(r, B.AF_TRIG)) agentMap[agent].autofails++;
  });
  const rows = Object.entries(agentMap)
    .map(([name, d]) => ({ name, avg: avg(d.scores), calls: d.scores.length, autofails: d.autofails }))
    .sort((a, b) => b.avg - a.avg);
  el('booked-agent-table').innerHTML = `
    <table class="agent-table">
      <thead><tr><th>Agent</th><th>Calls</th><th>Avg Score</th><th>Autofails</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><button class="rep-link-btn" onclick="drillRep('${esc(r.name)}')">${esc(r.name)}</button></td>
        <td>${r.calls}</td>
        <td><span class="score-pill ${scoreClass(r.avg)}">${r.avg}%</span></td>
        <td style="color:${r.autofails > 0 ? RED : 'var(--text-dim)'}"> ${r.autofails > 0 ? `⚠️ ${r.autofails}` : '—'}</td>
      </tr>`).join('')}</tbody>
    </table>`;
}

// ════════════════════════════════════════════════════════════════
//  NO BOOKING TAB
// ════════════════════════════════════════════════════════════════
function buildNoBooking(nbRows) {
  if (!nbRows.length) {
    el('nb-kpis').innerHTML = '<p style="color:var(--text-muted)">No no-booking calls in this batch.</p>';
    return;
  }
  const avgOverall = avg(nbRows.map(r => pct(r, N.OVERALL)).filter(n => n !== null));
  const hookRate   = hitRate(nbRows, N.OP_HOOK);
  const pbRate     = hitRate(nbRows, N.DIAG1);

  const objCounts = {};
  nbRows.forEach(r => { const obj = val(r, N.DIAG2); if (obj && obj !== '—') objCounts[obj] = (objCounts[obj] || 0) + 1; });
  const topObj = Object.entries(objCounts).sort((a, b) => b[1] - a[1])[0];

  el('nb-kpis').innerHTML = [
    kpiCard('Avg Score', `${avgOverall}%`, `${nbRows.length} no-booking calls`, scoreClass(avgOverall)),
    kpiCard('Hook Rate', `${hookRate ?? '—'}%`, 'Pattern Interrupt landed', hookRate !== null ? scoreClass(hookRate) : 'amber'),
    kpiCard('TM Push Back', `${pbRate ?? '—'}%`, 'Held position vs objection', pbRate !== null ? scoreClass(pbRate) : 'amber'),
    kpiCard('Top Objection', topObj ? topObj[0] : 'N/A', topObj ? `${topObj[1]} occurrence${topObj[1] !== 1 ? 's' : ''}` : '', 'amber'),
  ].join('');

  el('nb-section-bars').innerHTML = [
    ['Opener', N.OP_PCT, [
      ['Hook / Pattern Interrupt', hitRate(nbRows, N.OP_HOOK)],
      ['Purpose',                  hitRate(nbRows, N.OP_PURPOSE)],
      ['Context',                  hitRate(nbRows, N.OP_CONTEXT)],
      ['Right Person',             hitRate(nbRows, N.OP_RIGHT_PERSON)],
    ]],
    ['Discovery', N.DC_PCT, [
      ['Current Process',          hitRate(nbRows, N.DC_PROC)],
      ['Dig Into Pain',            hitRate(nbRows, N.DC_PAIN)],
      ['Position Jobber',          hitRate(nbRows, N.DC_POSITION)],
    ]],
    ['Objections', N.OB_PCT, [
      ['Reason with Obj.',         hitRate(nbRows, N.OB_REASON)],
      ['Value vs Obj.',            hitRate(nbRows, N.OB_VALUE)],
      ['Pivot & Ask',              hitRate(nbRows, N.OB_PIVOT)],
      ['Clarifying Question',      hitRate(nbRows, N.OB_CLARIFY)],
      ['Pacing & Tone',            hitRate(nbRows, N.OB_PACING)],
      ['Respect SP Wishes',        hitRate(nbRows, N.OB_RESPECT)],
    ]],
  ].map(([name, i, items]) => expandableSectionBar(name, avg(nbRows.map(r => pct(r,i)).filter(n=>n!==null)), items)).join('');

  // Opener item detail now lives inside the expandable Opener bar above
  const nbOpenerBars = el('nb-opener-bars');
  if (nbOpenerBars) nbOpenerBars.closest('.card') && (nbOpenerBars.closest('.card').style.display = 'none');

  destroyChart('objections');
  const objLabels = Object.keys(objCounts), objValues = Object.values(objCounts);
  const palette   = [GREEN, AMBER, RED, BLUE_INFO, '#a78bfa', '#f472b6'];
  if (objLabels.length) {
    charts['objections'] = new Chart(el('chart-objections'), {
      type: 'doughnut',
      data: { labels: objLabels, datasets: [{ data: objValues, backgroundColor: objLabels.map((_,i) => palette[i%palette.length]), borderWidth: 2, borderColor: '#232b2f' }] },
      options: { cutout: '65%', plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } } } },
    });
  }

  const agentMap = {};
  nbRows.forEach(r => {
    const agent = val(r, N.AGENT), score = pct(r, N.OVERALL);
    if (!agent || score === null) return;
    if (!agentMap[agent]) agentMap[agent] = { scores: [], issues: new Set(), autofails: 0 };
    agentMap[agent].scores.push(score);
    if (isYes(r, N.AF_TRIG)) agentMap[agent].autofails++;
    const cp1 = val(r, N.CP1); if (cp1 && cp1 !== '—') agentMap[agent].issues.add(cp1);
  });
  const flagRows = Object.entries(agentMap)
    .map(([name, d]) => ({ name, avg: avg(d.scores), issues: [...d.issues], autofails: d.autofails }))
    .sort((a, b) => a.avg - b.avg);
  el('nb-agent-flags').innerHTML = flagRows.map(r => {
    const issueText = r.autofails > 0
      ? [`⚠️ Autofail (${r.autofails})`, ...r.issues].slice(0, 3).join(' · ')
      : r.issues.slice(0, 3).join(' · ') || 'No issues flagged';
    return `<div class="flag-row" onclick="drillRep('${esc(r.name)}')" style="cursor:pointer" title="Click to view ${esc(r.name)}'s detail">
      <div>
        <div class="flag-agent">${esc(r.name)}</div>
        <div style="font-size:0.6875rem;color:var(--text-dim)">${r.scores.length} call${r.scores.length!==1?'s':''}</div>
      </div>
      <div class="flag-issues">${esc(issueText)}</div>
      <div class="flag-score" style="color:${scoreColor(r.avg)}">${r.avg}%</div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════════
//  LOB TAB  — Executive / SLT layer
// ════════════════════════════════════════════════════════════════
function buildLOB(bookedRows, nbRows) {
  const allCalls = [...bookedRows.map(r => ({ r, rubric: 'booked' })), ...nbRows.map(r => ({ r, rubric: 'nb' }))];
  const lobMap   = { Cold: [], Recycled: [], Campaigns: [], Other: [] };
  allCalls.forEach(({ r, rubric }) => {
    const lob = normalizeLOB(val(r, rubric === 'booked' ? B.LOB : N.LOB)) || 'Other';
    lobMap[lob].push({ r, rubric });
  });

  const total = allCalls.length;
  el('lob-kpis').innerHTML = [
    kpiCard('Total Calls', total, 'across all LOBs', 'blue'),
    kpiCard('Cold',      lobMap.Cold.length,      `${total ? Math.round(lobMap.Cold.length/total*100) : 0}% of calls`, lobMap.Cold.length ? 'blue' : 'amber'),
    kpiCard('Recycled',  lobMap.Recycled.length,  `${total ? Math.round(lobMap.Recycled.length/total*100) : 0}% of calls`, 'amber'),
    kpiCard('Campaigns', lobMap.Campaigns.length, `${total ? Math.round(lobMap.Campaigns.length/total*100) : 0}% of calls`, lobMap.Campaigns.length ? 'green' : 'amber'),
  ].join('');

  const grid = el('lob-grid');
  grid.innerHTML = '';
  ['Cold','Recycled','Campaigns'].forEach(cat => {
    const calls = lobMap[cat];
    if (!calls.length) {
      grid.innerHTML += `<div class="lob-card"><div class="lob-card-header"><span class="lob-badge lob-${cat.toLowerCase()}">${cat}</span><span style="color:var(--text-muted);font-size:0.75rem">0 calls</span></div><div class="lob-empty">No ${cat} calls in this batch.</div></div>`;
      return;
    }
    const scores    = calls.map(c => pct(c.r, B.OVERALL)).filter(n => n !== null);
    const avgScore  = avg(scores);
    const autofails = calls.filter(c => c.rubric === 'booked' ? isYes(c.r, B.AF_TRIG) : isYes(c.r, N.AF_TRIG)).length;
    function secAvg(bIdx, nIdx) {
      return avg([
        ...calls.filter(c => c.rubric === 'booked').map(c => pct(c.r, bIdx)),
        ...(nIdx !== null ? calls.filter(c => c.rubric === 'nb').map(c => pct(c.r, nIdx)) : []),
      ].filter(n => n !== null));
    }
    const sections = [['Opener',B.OP_PCT,N.OP_PCT],['Discovery',B.DC_PCT,N.DC_PCT],['Pitch/Obj',B.PT_PCT,N.OB_PCT]];
    const agentMap = {};
    calls.forEach(({ r }) => {
      const a = val(r, B.AGENT), s = pct(r, B.OVERALL);
      if (!a || s === null) return;
      (agentMap[a] = agentMap[a] || []).push(s);
    });
    const agentList = Object.entries(agentMap).map(([name, s]) => ({ name, avg: avg(s) })).sort((a,b) => a.avg-b.avg).slice(0,5);
    const weak = sections.map(([n,,nI],i) => [n, secAvg(sections[i][1], nI)]).reduce((w,s) => !w||s[1]<w[1]?s:w, null);

    grid.innerHTML += `<div class="lob-card">
      <div class="lob-card-header">
        <span class="lob-badge lob-${cat.toLowerCase()}">${cat}</span>
        <span style="color:var(--text-muted);font-size:0.75rem">${calls.length} call${calls.length!==1?'s':''}</span>
      </div>
      <div class="lob-score-row">
        <span class="lob-score" style="color:${scoreColor(avgScore)}">${avgScore}%</span>
        <span class="lob-score-label">avg score</span>
        ${autofails > 0 ? `<span class="lob-af-badge">⚠️ ${autofails} AF</span>` : ''}
      </div>
      <div class="lob-sections">${sections.map(([name, bI, nI]) => sectionBar(name, secAvg(bI, nI))).join('')}</div>
      <div class="lob-agents">
        <div class="lob-agents-title">Rep Coaching Focus</div>
        ${agentList.map(a => `<div class="lob-agent-row">
          <button class="rep-link-btn" onclick="drillRep('${esc(a.name)}')">${esc(a.name)}</button>
          <span style="color:${scoreColor(a.avg)};font-size:0.6875rem;font-weight:600">${a.avg}%</span>
        </div>`).join('')}
        ${Object.keys(agentMap).length > 5 ? `<div class="lob-more">+${Object.keys(agentMap).length-5} more reps</div>` : ''}
      </div>
      ${weak ? `<div class="lob-weak">⚑ Weakest section: <strong>${esc(weak[0])}</strong> at ${weak[1]}%</div>` : ''}
    </div>`;
  });

  if (lobMap.Other.length) {
    grid.innerHTML += `<div class="lob-card lob-card-other"><div class="lob-card-header"><span class="lob-badge lob-other">Uncategorized</span><span style="color:var(--text-muted);font-size:0.75rem">${lobMap.Other.length} call${lobMap.Other.length!==1?'s':''}</span></div><div class="lob-empty">Fill "Line of Business" column to categorize.</div></div>`;
  }
}

// ════════════════════════════════════════════════════════════════
//  MANAGER TAB  — Layer 2
// ════════════════════════════════════════════════════════════════
function buildManager(bookedRows, nbRows) {
  const allCalls = [...bookedRows.map(r => ({ r, rubric: 'booked' })), ...nbRows.map(r => ({ r, rubric: 'nb' }))];

  // Aggregate per manager
  const mgrData = {};
  Object.keys(MANAGER_MAP).forEach(mgr => { mgrData[mgr] = { calls: [], reps: {} }; });

  allCalls.forEach(({ r, rubric }) => {
    const agent = val(r, 1);
    const mgr   = REP_TO_MANAGER[agent];
    if (!mgr) return;
    mgrData[mgr].calls.push({ r, rubric });
    if (!mgrData[mgr].reps[agent]) mgrData[mgr].reps[agent] = { scores: [], calls: 0 };
    mgrData[mgr].reps[agent].calls++;
    const s = pct(r, B.OVERALL);
    if (s !== null) mgrData[mgr].reps[agent].scores.push(s);
  });

  const allScores = allCalls.map(c => pct(c.r, B.OVERALL)).filter(n => n !== null);
  const teamAvg   = avg(allScores);

  el('mgr-kpis').innerHTML = [
    kpiCard('Team Avg', `${teamAvg}%`, `${allCalls.length} total calls`, scoreClass(teamAvg)),
    ...Object.entries(mgrData).map(([mgr, d]) => {
      const scores = d.calls.map(c => pct(c.r, B.OVERALL)).filter(n => n !== null);
      const mgrAvg = scores.length ? avg(scores) : null;
      const firstName = mgr.split(' ')[0];
      return kpiCard(`${firstName}'s Pod`, mgrAvg !== null ? `${mgrAvg}%` : '—', `${d.calls.length} calls · ${MANAGER_MAP[mgr].length} reps`, mgrAvg !== null ? scoreClass(mgrAvg) : 'amber');
    }),
  ].join('');

  const grid = el('mgr-grid');
  grid.innerHTML = '';

  Object.entries(MANAGER_MAP).forEach(([mgr, repList]) => {
    const d       = mgrData[mgr];
    const scores  = d.calls.map(c => pct(c.r, B.OVERALL)).filter(n => n !== null);
    const mgrAvg  = scores.length ? avg(scores) : null;
    const afCount = d.calls.filter(c => c.rubric === 'booked' ? isYes(c.r, B.AF_TRIG) : isYes(c.r, N.AF_TRIG)).length;

    const bCalls = d.calls.filter(c => c.rubric === 'booked').map(c => c.r);
    const nCalls = d.calls.filter(c => c.rubric === 'nb').map(c => c.r);
    function podSec(bIdx, nIdx) {
      const vs = [...bCalls.map(r => pct(r, bIdx)), ...(nIdx !== null ? nCalls.map(r => pct(r, nIdx)) : [])].filter(n => n !== null);
      return vs.length ? avg(vs) : null;
    }
    const sections = [
      ['Opener',    podSec(B.OP_PCT, N.OP_PCT)],
      ['Discovery', podSec(B.DC_PCT, N.DC_PCT)],
      ['Pitch/Obj', podSec(B.PT_PCT, N.OB_PCT)],
    ].filter(([, v]) => v !== null);

    // Reps — sorted lowest avg first (coaching priority)
    const repRows = repList.map(rep => {
      const rd = d.reps[rep] || { scores: [], calls: 0 };
      return { name: rep, avg: rd.scores.length ? avg(rd.scores) : null, calls: rd.calls };
    }).sort((a, b) => {
      if (a.avg === null && b.avg === null) return 0;
      if (a.avg === null) return 1;
      if (b.avg === null) return -1;
      return a.avg - b.avg;
    });

    grid.innerHTML += `<div class="mgr-card">
      <div class="mgr-card-header">
        <div>
          <div class="mgr-name">${esc(mgr)}</div>
          <div class="mgr-meta">${d.calls.length} call${d.calls.length!==1?'s':''} · ${repList.length} reps</div>
        </div>
        <div class="mgr-score-block">
          <span class="mgr-score" style="color:${mgrAvg !== null ? scoreColor(mgrAvg) : 'var(--text-dim)'}">
            ${mgrAvg !== null ? mgrAvg + '%' : '—'}
          </span>
          ${afCount > 0 ? `<span class="lob-af-badge">⚠️ ${afCount} AF</span>` : ''}
        </div>
      </div>
      ${sections.length ? `<div class="mgr-sections">${sections.map(([n,v]) => sectionBar(n,v)).join('')}</div>` : ''}
      <div class="mgr-rep-list">
        <div class="mgr-rep-header"><span>Rep</span><span>Score</span><span>Calls</span></div>
        ${repRows.map(rep => `
          <div class="mgr-rep-row ${rep.calls > 0 ? 'clickable' : ''}" ${rep.calls > 0 ? `onclick="drillRep('${esc(rep.name)}')"` : ''} title="${rep.calls > 0 ? `View ${esc(rep.name)}'s detail` : 'No calls scored'}">
            <span class="mgr-rep-name">${esc(rep.name)}</span>
            <span>${rep.avg !== null ? `<span class="score-pill ${scoreClass(rep.avg)}">${rep.avg}%</span>` : `<span style="color:var(--text-dim);font-size:0.6875rem">no calls</span>`}</span>
            <span style="color:var(--text-dim);font-size:0.6875rem">${rep.calls > 0 ? `${rep.calls}` : ''}</span>
          </div>`).join('')}
      </div>
    </div>`;
  });
}

// ════════════════════════════════════════════════════════════════
//  REP DETAIL TAB  — Layer 3
// ════════════════════════════════════════════════════════════════
let currentRep = null;

function drillRep(repName) {
  currentRep = repName;
  showTab('rep');
}

function buildRepTab(bookedRows, nbRows) {
  // Populate the selector
  const allAgents = [...new Set([
    ...bookedRows.map(r => val(r, B.AGENT)),
    ...nbRows.map(r => val(r, N.AGENT)),
  ].filter(Boolean))].sort();

  const sel = el('rep-select');
  sel.innerHTML = '<option value="">— Select a rep —</option>';
  allAgents.forEach(agent => {
    const opt = document.createElement('option');
    opt.value = agent; opt.textContent = agent;
    if (agent === currentRep) opt.selected = true;
    sel.appendChild(opt);
  });

  sel.onchange = () => {
    currentRep = sel.value;
    currentRep ? renderRepDetail(bookedRows, nbRows, currentRep)
               : el('rep-content').innerHTML = `<div class="rep-empty">Select a rep above to view their detail.</div>`;
  };

  currentRep ? renderRepDetail(bookedRows, nbRows, currentRep)
             : el('rep-content').innerHTML = `<div class="rep-empty">Select a rep above to view their performance detail.</div>`;
}

function renderRepDetail(bookedRows, nbRows, repName) {
  const repB     = bookedRows.filter(r => val(r, B.AGENT) === repName);
  const repN     = nbRows.filter(r => val(r, N.AGENT) === repName);
  const allCalls = [...repB.map(r => ({ r, rubric:'booked' })), ...repN.map(r => ({ r, rubric:'nb' }))];

  if (!allCalls.length) {
    el('rep-content').innerHTML = `<div class="rep-empty">No scored calls found for <strong>${esc(repName)}</strong>.</div>`;
    return;
  }

  const allScores = allCalls.map(c => pct(c.r, B.OVERALL)).filter(n => n !== null);
  const repAvg    = avg(allScores);
  const afCount   = allCalls.filter(c => c.rubric === 'booked' ? isYes(c.r, B.AF_TRIG) : isYes(c.r, N.AF_TRIG)).length;
  const manager   = REP_TO_MANAGER[repName] || '—';
  const firstCall = allCalls[0];
  const lobRaw    = val(firstCall.r, firstCall.rubric === 'booked' ? B.LOB : N.LOB);
  const lob       = normalizeLOB(lobRaw) || lobRaw || '—';

  // Section averages
  const secRows = [];
  if (repB.length) {
    [['Booked — Opener', B.OP_PCT], ['Booked — Discovery', B.DC_PCT],
     ['Booked — Pitch', B.PT_PCT], ['Booked — Next Step', B.NS_PCT], ['Booked — General', B.GN_PCT]]
     .forEach(([name, i]) => {
       const v = avg(repB.map(r => pct(r,i)).filter(n=>n!==null));
       secRows.push([name, v]);
     });
  }
  if (repN.length) {
    [['NB — Opener', N.OP_PCT], ['NB — Discovery', N.DC_PCT], ['NB — Objections', N.OB_PCT]]
     .forEach(([name, i]) => {
       const v = avg(repN.map(r => pct(r,i)).filter(n=>n!==null));
       secRows.push([name, v]);
     });
  }

  // Coaching priorities
  const cpAll = allCalls.flatMap(c => {
    const r = c.r, rb = c.rubric;
    return [rb==='booked'?val(r,B.CP1):val(r,N.CP1), rb==='booked'?val(r,B.CP2):val(r,N.CP2), rb==='booked'?val(r,B.CP3):val(r,N.CP3)].filter(v => v && v !== '—');
  });
  const cpCounts = {};
  cpAll.forEach(cp => { cpCounts[cp] = (cpCounts[cp]||0)+1; });
  const topCPs = Object.entries(cpCounts).sort((a,b) => b[1]-a[1]).slice(0,5);

  // Objection types
  const objTypes = {};
  repN.forEach(r => { const obj = val(r, N.DIAG2); if (obj && obj !== '—') objTypes[obj] = (objTypes[obj]||0)+1; });
  const topObj = Object.entries(objTypes).sort((a,b) => b[1]-a[1])[0];

  el('rep-content').innerHTML = `
    <div class="rep-header-block">
      <div class="rep-avatar-lg">${initials(repName)}</div>
      <div class="rep-header-info">
        <div class="rep-name-lg">${esc(repName)}</div>
        <div class="rep-meta-row">
          <span class="rep-meta-item">Manager: <strong>${esc(manager)}</strong></span>
          <span class="rep-meta-item">LOB: <strong>${esc(lob)}</strong></span>
          <span class="rep-meta-item">${allCalls.length} call${allCalls.length!==1?'s':''} scored</span>
          ${afCount > 0 ? `<span class="rep-meta-item" style="color:${RED}">⚠️ ${afCount} Autofail${afCount!==1?'s':''}</span>` : ''}
        </div>
      </div>
      <div class="rep-score-badge" style="color:${scoreColor(repAvg)}">${repAvg}%</div>
    </div>

    <div class="rep-detail-grid">
      <div class="rep-col">
        <div class="card">
          <h3 class="card-title">Section Averages</h3>
          ${secRows.filter(([,v]) => v !== null && !isNaN(v)).map(([name, v]) => sectionBar(name, v)).join('')}
        </div>
        ${topCPs.length ? `<div class="card">
          <h3 class="card-title">Top Coaching Priorities</h3>
          <div class="cp-priority-list">
            ${topCPs.map(([cp, cnt]) => `<div class="cp-priority-item">
              <span class="cp-badge">${esc(cp)}</span>
              <span class="cp-count">${cnt}×</span>
            </div>`).join('')}
          </div>
        </div>` : ''}
        ${topObj ? `<div class="card">
          <h3 class="card-title">Primary Objection Type</h3>
          <div style="padding:8px 0">
            <span style="font-weight:600;color:var(--text)">${esc(topObj[0])}</span>
            <span style="color:var(--text-muted)"> — ${topObj[1]} occurrence${topObj[1]!==1?'s':''}</span>
          </div>
        </div>` : ''}
      </div>
      <div class="rep-col">
        <div class="card">
          <h3 class="card-title">Call History</h3>
          <table class="agent-table" style="width:100%">
            <thead><tr><th>Call</th><th>Date</th><th>Type</th><th>Score</th><th>Op</th><th>Disc</th><th>Pitch/Obj</th></tr></thead>
            <tbody>${allCalls.map(({ r, rubric }) => {
              const callId  = val(r, B.CALL_ID);
              const date    = val(r, B.DATE);
              const overall = pct(r, B.OVERALL);
              const opPct   = pct(r, rubric === 'booked' ? B.OP_PCT : N.OP_PCT);
              const dcPct   = pct(r, rubric === 'booked' ? B.DC_PCT : N.DC_PCT);
              const ptPct   = pct(r, rubric === 'booked' ? B.PT_PCT : N.OB_PCT);
              function pc(v) { return v !== null ? `<span style="color:${scoreColor(v)};font-weight:600">${v}%</span>` : '<span style="color:var(--text-dim)">—</span>'; }
              const typeLabel = rubric === 'booked' ? 'Booked/LT' : 'No Booking';
              const typeBg    = rubric === 'booked' ? 'rgba(138,204,51,0.1)' : 'rgba(45,122,185,0.1)';
              const typeColor = rubric === 'booked' ? GREEN : BLUE_INFO;
              return `<tr>
                <td style="font-size:0.6875rem">${revioLink(callId)}</td>
                <td style="color:var(--text-muted);font-size:0.6875rem">${esc(date)}</td>
                <td><span style="font-size:0.6875rem;padding:2px 6px;border-radius:99px;background:${typeBg};color:${typeColor}">${typeLabel}</span></td>
                <td>${overall!==null?`<span class="score-pill ${scoreClass(overall)}">${overall}%</span>`:'—'}</td>
                <td>${pc(opPct)}</td><td>${pc(dcPct)}</td><td>${pc(ptPct)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
//  REVIEWER TAB
// ════════════════════════════════════════════════════════════════
function buildReviewer(bookedRows, nbRows) {
  const allCalls = [...bookedRows.map(r => ({ r, rubric:'booked' })), ...nbRows.map(r => ({ r, rubric:'nb' }))];
  if (!allCalls.length) {
    el('rv-kpis').innerHTML = '<p style="color:var(--text-muted)">No calls in this batch.</p>';
    el('rv-table').innerHTML = '';
    return;
  }

  const reviewerMap = {};
  allCalls.forEach(({ r, rubric }) => {
    const rev   = val(r, rubric === 'booked' ? B.REVIEWED_BY : N.REVIEWED_BY) || 'Unassigned';
    const score = pct(r, B.OVERALL);
    const agent = val(r, B.AGENT);
    if (!reviewerMap[rev]) reviewerMap[rev] = { scores: [], calls: 0, agents: new Set() };
    reviewerMap[rev].calls++;
    if (agent) reviewerMap[rev].agents.add(agent);
    if (score !== null) reviewerMap[rev].scores.push(score);
  });
  const reviewers     = Object.entries(reviewerMap).map(([name, d]) => ({ name, avg: d.scores.length ? avg(d.scores) : null, calls: d.calls, agents: d.agents.size })).sort((a,b) => b.calls-a.calls);
  const isAI          = name => /ai|claude/i.test(name);
  const aiRevs        = reviewers.filter(r => isAI(r.name));
  const humanRevs     = reviewers.filter(r => !isAI(r.name) && r.name !== 'Unassigned');
  const totalHuman    = humanRevs.reduce((s,r) => s+r.calls, 0);
  const totalAI       = aiRevs.reduce((s,r) => s+r.calls, 0);
  const humanAvg      = humanRevs.length ? avg(humanRevs.filter(r => r.avg !== null).map(r => r.avg)) : null;
  const aiAvg         = aiRevs.length ? avg(aiRevs.filter(r => r.avg !== null).map(r => r.avg)) : null;
  const delta         = humanAvg !== null && aiAvg !== null ? Math.abs(humanAvg - aiAvg) : null;
  const unassigned    = (reviewerMap['Unassigned']||{}).calls || 0;

  el('rv-kpis').innerHTML = [
    kpiCard('Total Reviewed', allCalls.length, `${unassigned ? `${unassigned} unassigned` : 'all assigned'}`, 'blue'),
    kpiCard('Human QA', totalHuman, `${allCalls.length ? Math.round(totalHuman/allCalls.length*100) : 0}% of reviews`, 'green'),
    kpiCard('AI Scored', totalAI, `${allCalls.length ? Math.round(totalAI/allCalls.length*100) : 0}% of reviews`, 'blue'),
    delta !== null ? kpiCard('Score Delta', `${delta}%`, `Human ${humanAvg}% vs AI ${aiAvg}%`, delta <= 5 ? 'green' : 'amber') : kpiCard('Score Delta', '—', 'Need both reviewer types', 'amber'),
  ].join('');

  el('rv-table').innerHTML = `
    <table class="agent-table">
      <thead><tr><th>Reviewer</th><th>Type</th><th>Calls</th><th>Reps</th><th>Avg Score</th></tr></thead>
      <tbody>${reviewers.map(r => {
        const ai = isAI(r.name);
        const type = ai ? 'AI' : r.name === 'Unassigned' ? '—' : 'Human QA';
        return `<tr>
          <td style="font-weight:500">${esc(r.name)}</td>
          <td><span style="font-size:0.6875rem;padding:2px 7px;border-radius:99px;background:${ai?'var(--blue-dim)':r.name==='Unassigned'?'transparent':'var(--green-dim)'};color:${ai?'var(--blue-info)':r.name==='Unassigned'?'var(--text-dim)':'var(--green)'}">${type}</span></td>
          <td>${r.calls}</td><td>${r.agents}</td>
          <td>${r.avg!==null?`<span class="score-pill ${scoreClass(r.avg)}">${r.avg}%</span>`:'<span style="color:var(--text-dim)">—</span>'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;

  destroyChart('rv-dist');
  const chartData = reviewers.filter(r => r.name !== 'Unassigned' && r.avg !== null);
  if (chartData.length) {
    charts['rv-dist'] = new Chart(el('chart-rv-dist'), {
      type: 'bar',
      data: { labels: chartData.map(r => r.name), datasets: [{ data: chartData.map(r => r.avg), backgroundColor: chartData.map(r => isAI(r.name) ? BLUE_INFO : GREEN), borderRadius: 4, borderSkipped: false }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { min:0, max:100, grid: { color:'#4c5f67' }, ticks: { callback: v=>v+'%' } }, y: { grid: { display: false } } } },
    });
  }
}

// ════════════════════════════════════════════════════════════════
//  CALL LOG TAB
// ════════════════════════════════════════════════════════════════
let activeAgentFilter = 'all';

function buildCallLog(bookedRows, nbRows) {
  const allCalls = [...bookedRows.map(r => ({ r, rubric:'booked' })), ...nbRows.map(r => ({ r, rubric:'nb' }))];
  allCalls.sort((a, b) => {
    const da = val(a.r, B.DATE), db = val(b.r, B.DATE);
    if (da !== db) return da > db ? -1 : 1;
    return String(val(a.r, B.CALL_ID)).localeCompare(String(val(b.r, B.CALL_ID)));
  });

  const allScores = allCalls.map(c => pct(c.r, B.OVERALL)).filter(n=>n!==null);
  const teamAvg   = avg(allScores);
  const totalAF   = allCalls.filter(c => c.rubric==='booked' ? isYes(c.r,B.AF_TRIG) : isYes(c.r,N.AF_TRIG)).length;
  const belowAvg  = allCalls.filter(c => (pct(c.r,B.OVERALL)||0) < 65).length;

  el('cl-kpis').innerHTML = [
    kpiCard('Total Calls', allCalls.length, 'in this batch', 'blue'),
    kpiCard('Team Avg', `${teamAvg}%`, 'overall score', scoreClass(teamAvg)),
    kpiCard('Below 65%', belowAvg, 'need coaching', belowAvg===0?'green':belowAvg<=3?'amber':'red'),
    kpiCard('Autofails', totalAF, totalAF===0?'None this batch':'Immediate review', totalAF===0?'green':'red'),
  ].join('');

  const agents = [...new Set(allCalls.map(c => val(c.r, B.AGENT)).filter(Boolean))].sort();
  const fw = el('agent-filters');
  fw.innerHTML = '';
  function makeChip(label, value) {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (activeAgentFilter === value ? ' active' : '');
    chip.textContent = label;
    chip.onclick = () => {
      activeAgentFilter = value;
      fw.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderCallRows(allCalls);
    };
    fw.appendChild(chip);
  }
  makeChip('All reps', 'all');
  agents.forEach(a => makeChip(a, a));
  renderCallRows(allCalls);
}

function renderCallRows(allCalls) {
  const filtered = activeAgentFilter === 'all' ? allCalls : allCalls.filter(c => val(c.r, B.AGENT) === activeAgentFilter);
  const tbody = el('cl-tbody');
  tbody.innerHTML = '';
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="18" class="cl-empty">No calls match the current filter.</td></tr>`;
    el('cl-meta').textContent = '';
    return;
  }
  filtered.forEach((call, idx) => {
    const { r, rubric } = call;
    const rowId = `cl-row-${idx}`, detailId = `cl-det-${idx}`;
    const callId  = val(r, B.CALL_ID);
    const agent   = val(r, B.AGENT);
    const date    = val(r, B.DATE);
    const dur     = val(r, B.DURATION);
    const type    = val(r, B.TYPE);
    const overall = pct(r, B.OVERALL);
    const cls     = overall !== null ? scoreClass(overall) : 'amber';
    const opPct   = pct(r, rubric==='booked' ? B.OP_PCT : N.OP_PCT);
    const dcPct   = pct(r, rubric==='booked' ? B.DC_PCT : N.DC_PCT);
    const ptPct   = pct(r, rubric==='booked' ? B.PT_PCT : N.OB_PCT);
    const nsPct   = rubric === 'booked' ? pct(r, B.NS_PCT) : null;
    const gnPct   = rubric === 'booked' ? pct(r, B.GN_PCT) : null;
    const afTrig  = rubric === 'booked' ? isYes(r, B.AF_TRIG) : isYes(r, N.AF_TRIG);
    const cp1     = rubric === 'booked' ? val(r, B.CP1) : val(r, N.CP1);
    const lobRaw     = val(r, rubric==='booked' ? B.LOB : N.LOB);
    const lob        = normalizeLOB(lobRaw) || lobRaw;
    const reviewer   = val(r, rubric==='booked' ? B.REVIEWED_BY : N.REVIEWED_BY);
    const dateScored = val(r, rubric==='booked' ? B.DATE_SCORED : N.DATE_SCORED);
    const leadStatus = val(r, rubric==='booked' ? B.LEAD_STATUS : N.LEAD_STATUS);
    function pc(v) { return v===null ? `<td style="color:var(--text-dim)">—</td>` : `<td style="color:${scoreColor(v)};font-weight:600">${v}%</td>`; }

    const dataRow = document.createElement('tr');
    dataRow.className = 'data-row'; dataRow.id = rowId;
    dataRow.innerHTML = `
      <td><button class="expand-btn" data-target="${detailId}" data-row="${rowId}" aria-expanded="false">▶</button></td>
      <td>${revioLink(callId)}</td>
      <td><button class="rep-link-btn" onclick="drillRep('${esc(agent)}')">${esc(agent)}</button></td>
      <td style="color:var(--text-muted)">${esc(date)}</td>
      <td style="color:var(--text-muted)">${esc(dur)}</td>
      <td>${type?`<span style="font-size:0.6875rem;padding:2px 7px;border-radius:99px;background:${type.toLowerCase().includes('book')?'rgba(138,204,51,0.1)':'rgba(45,122,185,0.1)'};color:${type.toLowerCase().includes('book')?GREEN:BLUE_INFO}">${esc(type)}</span>`:'—'}</td>
      <td><span class="score-pill ${cls}">${overall!==null?overall+'%':'—'}</span></td>
      ${pc(opPct)}${pc(dcPct)}${pc(ptPct)}${pc(nsPct)}${pc(gnPct)}
      <td style="color:${afTrig?RED:'var(--text-dim)'}">${afTrig?'⚠️ Yes':'—'}</td>
      <td style="color:var(--text-muted);font-size:0.6875rem;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(cp1)}">${esc(cp1)||'—'}</td>
      <td>${lob?`<span class="lob-badge lob-${lob.toLowerCase()}">${esc(lob)}</span>`:`<span style="color:var(--text-dim)">—</span>`}</td>
      <td style="color:var(--text-muted);font-size:0.6875rem">${esc(reviewer)||'—'}</td>
      <td style="color:var(--text-muted);font-size:0.6875rem;white-space:nowrap">${esc(dateScored)||'—'}</td>
      <td>${leadStatusBadge(leadStatus)}</td>`;

    const detailRow = document.createElement('tr');
    detailRow.id = detailId; detailRow.style.display = 'none';
    detailRow.innerHTML = `<td colspan="18" class="cl-detail-cell">${buildDetailHTML(r, rubric)}</td>`;
    tbody.appendChild(dataRow); tbody.appendChild(detailRow);
  });

  tbody.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dRow = el(btn.dataset.target), pRow = el(btn.dataset.row);
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      if (isOpen) { dRow.style.display = 'none'; btn.textContent = '▶'; btn.setAttribute('aria-expanded','false'); pRow.classList.remove('expanded'); }
      else        { dRow.style.display = 'table-row'; btn.textContent = '▼'; btn.setAttribute('aria-expanded','true'); pRow.classList.add('expanded'); }
    });
  });
  el('cl-meta').textContent = `Showing ${filtered.length} of ${allCalls.length} calls${activeAgentFilter!=='all'?` · filtered to ${activeAgentFilter}`:''} · click ▶ to expand`;
}

function buildDetailHTML(r, rubric) {
  const cp1 = rubric==='booked' ? val(r,B.CP1) : val(r,N.CP1);
  const cp2 = rubric==='booked' ? val(r,B.CP2) : val(r,N.CP2);
  const cp3 = rubric==='booked' ? val(r,B.CP3) : val(r,N.CP3);
  const notes = rubric==='booked' ? val(r,B.NOTES) : val(r,N.NOTES);
  function section(title, items) {
    return `<div class="detail-section"><div class="ds-title">${title}</div>${items.map(([label,idx]) =>
      `<div class="ds-item"><span>${esc(label)}</span>${ynBadge(r,idx)}</div>`).join('')}</div>`;
  }
  let html = '';
  if (rubric === 'booked') {
    html = [
      section('Opener',[['Intro / Name',B.OP_INTRO],['Purpose',B.OP_PURPOSE],['Context',B.OP_CONTEXT],['Industry',B.OP_INDUSTRY],['Company Size',B.OP_COMPANY_SIZE]]),
      section('Discovery',[['Current Process',B.DC_PROC],['Need / Pain',B.DC_PAIN],['Econ Impact',B.DC_ECON],['Implicit Needs',B.DC_IMPLICIT],['Urgency',B.DC_URG]]),
      section('Pitch',[['Restate & Validate',B.PT_RESTATE],['Present Jobber',B.PT_PRESENT]]),
      section('Next Step',[['NS Established',B.NS_EST],['Confirmed',B.NS_CONFIRM],['Recap',B.NS_RECAP],['Addl Help',B.NS_ADDL],['Close (LT)',B.NS_CLOSE_LT],['Close (Book)',B.NS_CLOSE_BK]]),
      section('General',[['Objection Handling',B.GN_OBJ],['Communication',B.GN_COMM],['Acknowledgement',B.GN_ACK]]),
      section('Autofail',[['Misinformation',B.AF_MISINFO],['Rudeness',B.AF_RUDE],['Profanity',B.AF_PROF],['PII Breach',B.AF_PII]]),
    ].join('');
  } else {
    html = [
      section('Opener',[['Pattern Interrupt / Hook',N.OP_HOOK],['Purpose',N.OP_PURPOSE],['Context',N.OP_CONTEXT],['Right Person',N.OP_RIGHT_PERSON]]),
      section('Discovery',[['Current Process',N.DC_PROC],['Dig into Pain',N.DC_PAIN],['Position Jobber',N.DC_POSITION]]),
      section('Objections',[['Reason with Obj.',N.OB_REASON],['Value vs Obj.',N.OB_VALUE],['Pivot & Ask',N.OB_PIVOT],['Clarifying Q.',N.OB_CLARIFY],['Pacing & Tone',N.OB_PACING],['Respect SP',N.OB_RESPECT]]),
      section('Autofail',[['Rudeness',N.AF_RUDE],['Misinformation',N.AF_MISINFO],['Legal/Regulatory',N.AF_LEGAL]]),
      `<div class="detail-section"><div class="ds-title">Diagnostics</div>
       <div class="ds-item"><span>TM Pushed Back</span>${ynBadge(r,N.DIAG1)}</div>
       <div class="ds-item"><span>Objection Type</span><span style="font-size:0.6875rem;color:var(--text-muted)">${esc(val(r,N.DIAG2))||'—'}</span></div></div>`,
    ].join('');
  }
  const cps = [cp1,cp2,cp3].filter(c => c && c !== '—' && c !== '-');
  return `<div class="cl-detail-inner">
    <div class="detail-grid">${html}</div>
    <div class="coaching-box">
      <div class="ds-title">Coaching priorities &amp; notes</div>
      ${cps.length ? `<div class="coaching-row">${cps.map(c=>`<span class="cp-badge">${esc(c)}</span>`).join('')}</div>` : ''}
      <div class="coaching-notes">${notes ? esc(notes) : '<em style="color:var(--text-dim)">No notes recorded.</em>'}</div>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════════
//  TAB SWITCHING
// ════════════════════════════════════════════════════════════════
let dataCache = null;
let builtTabs = new Set();

function showTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  el(`tab-${tabId}`).classList.remove('hidden');
  if (!dataCache) return;
  const { bookedRows, nbRows } = getFilteredData();

  const builders = {
    'booked':     () => buildBooked(bookedRows),
    'no-booking': () => buildNoBooking(nbRows),
    'call-log':   () => buildCallLog(bookedRows, nbRows),
    'lob':        () => buildLOB(bookedRows, nbRows),
    'manager':    () => buildManager(bookedRows, nbRows),
    'reviewer':   () => buildReviewer(bookedRows, nbRows),
  };
  if (builders[tabId] && !builtTabs.has(tabId)) {
    builders[tabId]();
    builtTabs.add(tabId);
  }
  if (tabId === 'rep') {
    buildRepTab(bookedRows, nbRows);
    const sel = el('rep-select');
    if (sel && currentRep) sel.value = currentRep;
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

// ════════════════════════════════════════════════════════════════
//  DATA LOAD
// ════════════════════════════════════════════════════════════════
async function loadData() {
  el('loading').classList.remove('hidden');
  el('error-state').classList.add('hidden');
  el('period-filter').classList.add('hidden');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  builtTabs.clear(); dataCache = null; activeAgentFilter = 'all'; currentRep = null; currentPeriod = 'all';
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === 'all'));
  Object.keys(charts).forEach(id => { charts[id].destroy(); delete charts[id]; });

  try {
    const res  = await fetch('/api/data');
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const bookedRows = parseRows(data.booked);
    const nbRows     = parseRows(data.noBooking);

    // Merge human-reviewed rows from QA Scoring tabs
    const humanBookedNorm = parseHumanRows(data.humanBooked || []).map(normalizeHumanBookedRow);
    const humanNBNorm     = parseHumanRows(data.humanNB     || []).map(normalizeHumanNBRow);

    // De-duplicate: if a call ID already exists in AI tabs, skip (AI score takes precedence)
    const aiBookedIds = new Set(bookedRows.map(r => val(r, B.CALL_ID)));
    const aiNBIds     = new Set(nbRows.map(r => val(r, N.CALL_ID)));
    const newHumanBooked = humanBookedNorm.filter(r => {
      const id = val(r, B.CALL_ID);
      return id && !aiBookedIds.has(id);
    });
    const newHumanNB = humanNBNorm.filter(r => {
      const id = val(r, N.CALL_ID);
      return id && !aiNBIds.has(id);
    });

    bookedRows.push(...newHumanBooked);
    nbRows.push(...newHumanNB);

    if (data.fetchedAt) {
      const d = new Date(data.fetchedAt);
      el('fetch-time').textContent = `Updated ${d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
    }

    // Last Scored stamp — find most recent Date Scored value across both tabs
    const allDateScored = [
      ...bookedRows.map(r => val(r, B.DATE_SCORED)),
      ...nbRows.map(r => val(r, N.DATE_SCORED)),
    ].filter(Boolean);
    if (allDateScored.length) {
      // Sort MM/DD/YYYY strings by converting to sortable YYYY-MM-DD
      const toSortable = d => { const [m,day,y] = d.split('/'); return `${y}-${m}-${day}`; };
      const latest = allDateScored.sort((a,b) => toSortable(b).localeCompare(toSortable(a)))[0];
      const lastScoredEl = el('last-scored');
      if (lastScoredEl) lastScoredEl.textContent = `Last scored: ${latest}`;
    }

    dataCache = { bookedRows, nbRows };
    el('loading').classList.add('hidden');
    el('period-filter').classList.remove('hidden');
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
