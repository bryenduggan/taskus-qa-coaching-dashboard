require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1q2i93WKz14_KIcazfyDy9tTnXcnREo5c-ElNOr0bL-Y';

// Outbound SDR Performance Tracker (separate workbook). Must be shared with the
// same service account (Viewer). If it is NOT shared, the SDR fetch fails
// gracefully and the rest of the dashboard still loads (sdrMonths = {}).
const SDR_SPREADSHEET_ID = process.env.SDR_SPREADSHEET_ID || '15jRj2PBFac5-AiwDZsVxrq3YKPa6QNMxoDzRc-EI-pM';
const SDR_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Static files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Google auth ─────────────────────────────────────────────────────────────
function buildAuth() {
  const scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

  // Option 1: full JSON blob in env var (recommended for Dokploy secrets)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({ credentials, scopes });
  }

  // Option 2: path to a credentials file mounted into the container
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return new google.auth.GoogleAuth({ scopes });
  }

  throw new Error(
    'No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.'
  );
}

// ─── Data endpoint ───────────────────────────────────────────────────────────
app.get('/api/data', async (req, res) => {
  try {
    const auth = buildAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const [bookedRes, noBookingRes, humanBookedRes, humanNBRes, dispoRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Booked / LT!A1:AX',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'No Booking!A1:AO',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'QA Scoring Booked / LT!A1:AR',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'QA Scoring No Booking!A1:AG',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Disposition Accuracy!A1:J',
      }),
    ]);

    // ── SDR Performance Tracker (resilient — never blocks the QA dashboard) ──
    // Each month is its own sheet. Header is row 3; data starts row 4.
    // Columns A..O: Rep, Manager, Wave, Dials, Connects, Opps, MRR, C2O%,
    // DialTarget, OppTarget, MRRTarget, Dial%, Opp%, MRR%, Overall%.
    let sdrMonths = {};
    try {
      const sdrRes = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: SDR_SPREADSHEET_ID,
        ranges: SDR_MONTHS.map(m => `${m}!A4:O`),
      });
      (sdrRes.data.valueRanges || []).forEach((vr, i) => {
        sdrMonths[SDR_MONTHS[i]] = vr.values || [];
      });
    } catch (sdrErr) {
      console.error('[/api/data] SDR tracker fetch failed (sheet may not be shared with the service account):', sdrErr.message);
      sdrMonths = {};
    }

    res.json({
      booked:       bookedRes.data.values       || [],
      noBooking:    noBookingRes.data.values     || [],
      humanBooked:  humanBookedRes.data.values   || [],
      humanNB:      humanNBRes.data.values       || [],
      dispo:        dispoRes.data.values         || [],
      sdrMonths,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[/api/data] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Changelog (password-gated post-run learnings feed for Derek) ─────────────
// The whole dashboard already sits behind Jobber Okta SSO; this is a second gate
// so ONLY the holder of CHANGELOG_PASSWORD (Derek) can see the changelog feed.
// Password-ONLY login form → signed httpOnly cookie (no username field, unlike
// the browser's native Basic Auth dialog). Fails CLOSED if the env var is unset.
const crypto = require('crypto');
const CHANGELOG_PASSWORD = process.env.CHANGELOG_PASSWORD || '';
const CL_COOKIE = 'cl_auth';

function clToken() {
  return crypto.createHash('sha256').update('changelog::' + CHANGELOG_PASSWORD).digest('hex');
}
function clAuthed(req) {
  if (!CHANGELOG_PASSWORD) return false;
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)cl_auth=([a-f0-9]{64})/);
  if (!m) return false;
  try { return crypto.timingSafeEqual(Buffer.from(m[1], 'hex'), Buffer.from(clToken(), 'hex')); }
  catch (_e) { return false; }
}
function clLoginPage(showError) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow"><title>QA Changelog — Locked</title>
<style>body{margin:0;background:#f0ead9;color:#15242b;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
.box{background:#fffdf7;border:1px solid #dcd6ca;border-radius:12px;padding:28px 26px;width:330px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
h1{margin:0 0 4px;font-size:17px;color:#012939}.sub{margin:0 0 18px;color:#5a7077;font-size:13px}
input{width:100%;padding:10px 12px;border:1px solid #dcd6ca;border-radius:8px;font-size:14px;box-sizing:border-box}
button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#3d7200;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
button:hover{background:#345f00}.err{color:#a82018;font-size:13px;margin:10px 0 0}</style></head>
<body><form class="box" method="POST" action="/changelog/login">
<h1>QA Run Learnings &amp; Changelog</h1><p class="sub">Enter the access password to continue.</p>
<input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password" aria-label="Password">
<button type="submit">Unlock</button>
${showError ? '<p class="err">Incorrect password. Try again.</p>' : ''}
</form></body></html>`;
}

// Page served from views/ (NOT public/) so express.static can't serve it unauthed.
app.get('/changelog', (req, res) => {
  if (!CHANGELOG_PASSWORD) return res.status(503).send('Changelog is not configured (CHANGELOG_PASSWORD is not set).');
  if (clAuthed(req)) return res.sendFile(path.join(__dirname, 'views', 'changelog.html'));
  res.status(200).send(clLoginPage(false));
});

// Password-only login → sets the auth cookie (scoped to /changelog).
app.post('/changelog/login', express.urlencoded({ extended: false }), (req, res) => {
  if (!CHANGELOG_PASSWORD) return res.status(503).send('Changelog is not configured.');
  const pass = (req.body && req.body.password) || '';
  if (pass === CHANGELOG_PASSWORD) {
    res.setHeader('Set-Cookie',
      `${CL_COOKIE}=${clToken()}; HttpOnly; Secure; SameSite=Lax; Path=/changelog; Max-Age=2592000`);
    return res.redirect('/changelog');
  }
  res.status(401).send(clLoginPage(true));
});

app.get('/changelog/logout', (_req, res) => {
  res.setHeader('Set-Cookie', `${CL_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/changelog; Max-Age=0`);
  res.redirect('/changelog');
});

// Authed data endpoint — reads the standalone "Changelog" tab (A2:F).
app.get('/changelog/data', async (req, res) => {
  if (!clAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const auth = buildAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Changelog!A2:F',
    });
    res.json({ rows: r.data.values || [], fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[/changelog/data] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  QA Dashboard running → http://localhost:${PORT}`);
});
