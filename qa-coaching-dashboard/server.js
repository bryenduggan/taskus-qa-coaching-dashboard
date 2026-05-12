require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1q2i93WKz14_KIcazfyDy9tTnXcnREo5c-ElNOr0bL-Y';

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

    const [bookedRes, noBookingRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Booked / LT!A1:AQ',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'No Booking!A1:AH',
      }),
    ]);

    res.json({
      booked: bookedRes.data.values || [],
      noBooking: noBookingRes.data.values || [],
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
