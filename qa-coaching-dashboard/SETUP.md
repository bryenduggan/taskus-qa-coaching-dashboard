# QA Intelligence Hub — Setup & Dokploy Deploy Guide

## What this is
A self-hosted dark-themed dashboard for coaching TaskUs SDR offshore reps at Jobber.  
Reads scored call data live from Google Sheets and surfaces coaching insights across four tabs:
**Overview · Booked / LT · No Booking · Call Log** (with Revenue.io deep-links and per-rep filters).

---

## Step 1 — Google Cloud setup (one-time, ~10 min)

### 1a. Create a Google Cloud project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project** → **New Project**
3. Name it something like `jobber-qa-dashboard` → **Create**

### 1b. Enable the Google Sheets API
1. In the left sidebar: **APIs & Services** → **Enable APIs and Services**
2. Search "Google Sheets API" → **Enable**

### 1c. Create a service account
1. **IAM & Admin** → **Service Accounts** → **Create Service Account**
2. Name: `qa-dashboard` → **Create and continue**
3. Skip role assignment (viewer access granted at the sheet level) → **Done**

### 1d. Generate a credentials key
1. Click into the service account you just created
2. **Keys** tab → **Add Key** → **Create new key** → **JSON**
3. A `.json` file downloads — **save it, you'll need it in a moment**

### 1e. Share your Google Sheet
1. Open the QA scoring spreadsheet
2. Click **Share** (top right)
3. Add the service account email (looks like `qa-dashboard@your-project.iam.gserviceaccount.com`) with **Viewer** access
4. Click **Send**

---

## Step 2 — Set up environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Open `.env` and set:

| Variable | Value |
|----------|-------|
| `SPREADSHEET_ID` | Already pre-filled (`1q2i93WKz14_KIcazfyDy9tTnXcnREo5c-ElNOr0bL-Y`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The full contents of your downloaded `.json` key file |
| `PORT` | `3000` (default — change if needed) |

**Formatting `GOOGLE_SERVICE_ACCOUNT_JSON`:** Open the JSON file, copy the entire contents, and paste it as a single line (no line breaks) as the value. Example:

```
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"jobber-qa-dashboard","private_key_id":"abc123","private_key":"-----BEGIN RSA PRIVATE KEY-----\nMII....\n-----END RSA PRIVATE KEY-----\n","client_email":"qa-dashboard@jobber-qa-dashboard.iam.gserviceaccount.com",...}
```

---

## Step 3 — Deploy to Dokploy

### Option A: Git repo deploy (recommended)

1. **Push this folder to GitHub** (or GitLab/Gitea):
   ```bash
   cd qa-coaching-dashboard
   git init
   git add .
   git commit -m "Initial QA dashboard"
   git remote add origin https://github.com/your-org/qa-coaching-dashboard.git
   git push -u origin main
   ```

2. **In Dokploy:**
   - Log in → **Applications** → **New Application**
   - Connect your GitHub account if not already linked
   - Select the `qa-coaching-dashboard` repo
   - **Build Type:** Dockerfile
   - **Port:** `3000`

3. **Set environment variables in Dokploy:**
   - In your application → **Environment** tab
   - Add each variable from your `.env`:
     - `SPREADSHEET_ID`
     - `GOOGLE_SERVICE_ACCOUNT_JSON` ← paste the full JSON blob
     - `PORT` = `3000`
   - Mark `GOOGLE_SERVICE_ACCOUNT_JSON` as a **secret** (the lock icon)

4. **Deploy:**
   - Click **Deploy** → Dokploy builds the Docker image and starts the container
   - Check **Logs** tab to confirm: `✅  QA Dashboard running → http://localhost:3000`

5. **Set up a domain (optional):**
   - In Dokploy → **Domains** tab → add your subdomain (e.g. `qa.getjobber.internal`)
   - Dokploy handles the Traefik reverse proxy and SSL automatically

---

### Option B: Docker Compose directly on the server

SSH into your server, clone the repo, add your `.env` file, then:

```bash
docker compose up -d
```

The dashboard will be available at `http://your-server:3000`.

To update after pushing new code:
```bash
git pull && docker compose up -d --build
```

---

## Step 4 — Verify it's working

1. Open `http://your-server:3000/health` — should return `{"status":"ok"}`
2. Open `http://your-server:3000` — dashboard loads with your live call data
3. Navigate to the **Call Log** tab — every call should appear with a Revenue.io link
4. Click a Revenue.io link — should open `https://analytics.revenue.io/conversations/rc...`
5. Click **▶** on any row — full item-level breakdown + coaching notes expand below

---

## Keeping data fresh

The dashboard fetches **live from Google Sheets** on every page load and on the **↻ Refresh** button.  
There is no caching layer — new scored calls appear automatically the next time anyone opens the page.  
No redeployment needed when you score more calls.

---

## Updating the app itself

If the code changes (new features, bug fixes):

**Git deploy:** Dokploy can auto-deploy on push if you enable the webhook:
- Dokploy → your app → **Settings** → **Deploy Webhook** → copy the URL
- Add it as a GitHub webhook on your repo (push events)
- From then on, every `git push` triggers an automatic redeploy

**Manual redeploy:** In Dokploy → your app → **Deploy** button.

---

## Sheet structure expected

| Sheet name   | Range  | Columns |
|-------------|--------|---------|
| Booked / LT  | A1:AO  | 41 columns (A=Call ID, B=Agent … AO=Notes) |
| No Booking   | A1:AF  | 32 columns (A=Call ID, B=Agent … AF=Notes) |

Row 1 is the header and is skipped automatically.  
Column A (Call ID) is used as the Revenue.io conversation ID — the link is built as:  
`https://analytics.revenue.io/conversations/{CALL_ID}`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Dashboard loads but shows "Failed to load data" | Check Dokploy logs. Usually a malformed `GOOGLE_SERVICE_ACCOUNT_JSON` (missing quotes or newlines) or the sheet wasn't shared with the service account email. |
| Revenue.io links 404 | The Call ID in column A doesn't match the Revenue.io conversation ID. Verify the `rc...` IDs are being written to column A during scoring. |
| Charts don't render | Usually a browser cache issue — hard refresh with Cmd+Shift+R. |
| Port conflict | Change `PORT` in your env to `3001` or similar and update the Dokploy port mapping. |
