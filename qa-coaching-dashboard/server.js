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

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  QA Dashboard running → http://localhost:${PORT}`);
});
