# Deploying Your Expense Ledger as a Shared iPhone App

> **A fully illustrated, more detailed version of this guide is included as `Expense-Ledger-Deployment-Guide.pdf`** — start there if you'd like screenshots alongside every step. This file remains as a quick-reference backup.

This guide covers three things:
1. Setting up **free shared cloud storage** (Firebase) so every device syncs the same data automatically — **optional**, see the PDF for a full cost/limits comparison against staying local-only
2. Putting the app online for free with **GitHub Pages**
3. Installing it on your **iPhone home screen** like a real app

Total time: about 25 minutes, no coding required. If you skip Part 2 (Firebase), the app still works fine — it just stores data locally on each device instead of syncing.

Two things added since this guide was first written, covered in full in the PDF:
- **Export button** — replaced the separate Excel/CSV buttons with one Export button that opens a menu (Excel, CSV, or send via Mail/Messages/WhatsApp through your phone's native share sheet).
- **Offline Mode** — if you set up Firebase, a toggle in the header lets you work without a connection; anything added offline merges into the cloud automatically (with duplicates skipped) the next time you're online.

---

## Part 1 — Create a GitHub account (skip if you have one)

1. Go to **github.com**.
2. Click **Sign up**, enter your email, create a password, choose a username.
3. Verify your email.

---

## Part 2 — Set up shared cloud storage (Firebase)

Firebase is a free Google service that gives your app a real shared database, with no server to manage. This is what makes entries sync instantly across every phone, tablet, and computer using the app.

### 2.1 Create the Firebase project

1. Go to **console.firebase.google.com** and sign in with any Google account.
2. Click **Create a project** (or **Add project**).
3. Name it something like `expense-ledger`. Click **Continue**.
4. You can turn **off** Google Analytics for this project (toggle it off) — not needed. Click **Create project**, then **Continue** once it's done.

### 2.2 Create the database

1. In the left sidebar of your new project, click **Build** → **Firestore Database**.
2. Click **Create database**.
3. Choose a location close to you (e.g., `nam5 (us-central)` or `northamerica-northeast1` for Canada) — this can't be changed later, but any nearby option works fine.
4. Select **Start in test mode** for now (we'll lock it down properly in step 2.4). Click **Create**.

### 2.3 Register a web app and get your config

1. Click the **gear icon** next to "Project Overview" at the top of the left sidebar → **Project settings**.
2. Scroll to **Your apps** and click the **</>`** (web) icon.
3. Give it a nickname like `expense-ledger-web`. You do **not** need to check "Also set up Firebase Hosting." Click **Register app**.
4. Firebase shows you a code block containing `const firebaseConfig = { ... }`. Keep this page open — you'll copy these values in Part 3.

### 2.4 Set security rules

By default, "test mode" rules expire after 30 days and lock everyone out. Replace them with permanent rules scoped to just this app's data:

1. Back in **Firestore Database**, click the **Rules** tab.
2. Replace everything in the box with:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /expenses/{docId} {
         allow read, write: if true;
       }
       match /meta/{docId} {
         allow read, write: if true;
       }
     }
   }
   ```
3. Click **Publish**.

**What this means:** anyone who has your app's web address and Firebase config can read and write expense data — there's no login system. This matches how the in-chat version worked (shared via link). It's appropriate for a household or small team who trust each other with the link. If you later want real per-person logins and permissions, that's a further step (Firebase Authentication) we can add on request.

---

## Part 3 — Upload the app files

You should have a folder/zip from me containing:
```
index.html
manifest.json
service-worker.js
firebase-config.js
icons/  (icon-512.png, icon-192.png, icon-180.png, icon-167.png, icon-152.png, icon-32.png)
```

### 3.1 Fill in your Firebase config

1. Open `firebase-config.js` in any text editor (Notepad, TextEdit, or directly on GitHub in step 3.3 below).
2. Replace the placeholder values with the real ones from step 2.3. It should end up looking like:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSyABC123...",
     authDomain: "expense-ledger-12345.firebaseapp.com",
     projectId: "expense-ledger-12345",
     storageBucket: "expense-ledger-12345.firebasestorage.app",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abcdef123456",
   };
   ```
3. Save the file.

> These values are not secret — they identify your project, not authenticate it. Security comes from the Firestore Rules in step 2.4, not from hiding this file. It's fine for it to be visible in a public GitHub repo.

### 3.2 Create the GitHub repository

1. Click the **+** icon (top-right of GitHub) → **New repository**.
2. Name it `expense-ledger`. Choose **Public**. Click **Create repository**.

### 3.3 Upload the files

1. On the repository page, click **uploading an existing file**.
2. Drag in `index.html`, `manifest.json`, `service-worker.js`, your edited `firebase-config.js`, and the whole `icons` folder. Make sure `index.html` lands at the **top level**, not in a subfolder.
3. Add a commit message like "Add expense ledger app" and click **Commit changes**.

(If you didn't edit `firebase-config.js` locally, you can also click directly on the file after uploading, then the pencil/edit icon, paste in your real values, and commit — same result.)

---

## Part 4 — Turn on GitHub Pages

1. In your repository, click **Settings**.
2. In the left sidebar, under **Code and automation**, click **Pages**.
3. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
4. Branch: **main**, folder: **/ (root)**. Click **Save**.
5. Wait 1–3 minutes, then refresh — you'll see "Your site is live at `https://YOUR-USERNAME.github.io/expense-ledger/`."

Open that link first in a regular browser to confirm it loads and shows a green "☁️ Shared cloud storage is on" banner near the top. If it instead shows a gray "stored only on this device" banner, double-check `firebase-config.js` was uploaded with your real values (not the placeholders).

---

## Part 5 — Install it on your iPhone

1. Open **Safari** on your iPhone (must be Safari, not Chrome).
2. Go to `https://YOUR-USERNAME.github.io/expense-ledger/`.
3. Tap the **Share** icon (square with an arrow) at the bottom of the screen.
4. Scroll down and tap **Add to Home Screen** → **Add**.
5. Launch it from the new home screen icon — full screen, no browser bar.

Repeat Part 5 on each additional phone/tablet that should share the data — they'll all read and write the same Firebase database automatically.

---

## Updating the app later

1. On GitHub, open the changed file, click the pencil icon, make the edit, commit.
2. GitHub Pages redeploys within a couple of minutes.
3. On each iPhone, fully close the app (swipe away in the app switcher) and reopen to get the latest version.

---

## Troubleshooting

| Problem | Likely fix |
|---|---|
| Banner says "stored only on this device" after setting up Firebase | `firebase-config.js` still has placeholder values, or wasn't uploaded — re-check step 3.1. |
| "Couldn't reach the cloud" / sync errors | Check the Firestore **Rules** tab matches step 2.4 exactly, and that Firestore Database was created (step 2.2). |
| "404" at your GitHub Pages link | `index.html` must be at the repo root, and the right branch/folder selected in Pages settings. |
| Entries from one phone don't appear on another | Confirm both devices loaded the page fresh (pull to refresh / fully reopen) and both show the green cloud banner. |
| "Add to Home Screen" missing | Must be using Safari on iOS, not another browser. |
| Exchange rate not loading | Needs an internet connection; some less-common currencies only get today's rate rather than the exact historical date — this is noted live in the app. |

---

## Importing existing data

Use the **Import** button in the app to bring in a CSV or Excel file. It looks for columns named (any order, case-insensitive): `Date`, `Vendor`, `Category`, `Amount` (or `Amount (Original)`), `Currency`, `Submitted By`, `Status`, `Comments`. Rows missing a date, vendor, or valid amount are skipped and counted as errors. Rows that exactly match an entry already in the ledger (same date, vendor, currency, and amount) are skipped as duplicates — so it's safe to re-import the same file or merge overlapping exports without creating doubles.

---

## A note on the "scan receipt" photo feature

The in-chat Claude version can read a receipt photo and auto-fill the date, amount, and vendor using AI. That relies on Claude's API and isn't available in this standalone version, since it would need a personal API key embedded in a public repository, which isn't secure. Here, you can still attach a receipt photo to each entry for your records — just type in the details yourself. Ask if you'd like to explore adding this via a small secure backend later.
