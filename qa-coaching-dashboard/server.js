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
// HTTP Basic Auth, single shared secret from env. Fails CLOSED if unset.
const CHANGELOG_PASSWORD = process.env.CHANGELOG_PASSWORD || '';

function changelogAuth(req, res, next) {
  if (!CHANGELOG_PASSWORD) {
    return res.status(503).send('Changelog is not configured (CHANGELOG_PASSWORD is not set).');
  }
  const hdr = req.headers.authorization || '';
  const m = hdr.match(/^Basic\s+(.+)$/i);
  if (m) {
    let decoded = '';
    try { decoded = Buffer.from(m[1], 'base64').toString('utf8'); } catch (_e) { decoded = ''; }
    const idx = decoded.indexOf(':');
    const pass = idx >= 0 ? decoded.slice(idx + 1) : decoded; // ignore username, check password only
    if (pass && pass === CHANGELOG_PASSWORD) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="QA Changelog", charset="UTF-8"');
  return res.status(401).send('Authentication required.');
}

// Page is served from views/ (NOT public/), so express.static can't serve it unauthed.
app.get('/changelog', changelogAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'changelog.html'));
});

// Authed data endpoint — reads the standalone "Changelog" tab (A2:F).
app.get('/changelog/data', changelogAuth, async (_req, res) => {
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
