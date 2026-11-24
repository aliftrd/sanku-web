# Sanku

A calm personal finance dashboard built with **SvelteKit**. Sign in with **Google only** — every transaction, category and budget is saved to a **Google Sheet** in your own Drive. There is no database to run, back up, or migrate.

## What it does

- Google OAuth 2.0 sign-in (no passwords, no email sign-up)
- Creates a spreadsheet called **Sanku Finance** in the user's Drive on first login
- Tracks income and expenses with categories, accounts and notes
- Monthly dashboard with income, expenses, net, savings rate and cashflow chart
- Category breakdown donut, budget progress, and an at-a-glance summary
- Month navigation, search and filters for transactions
- Currency selector (USD, IDR, EUR, GBP, and more)
- Encrypted, `httpOnly` session cookie; refresh token never reaches the browser
- Responsive, paper-inspired UI

## Tech

- [SvelteKit 3](https://svelte.dev/docs/kit) + Svelte 5
- TypeScript
- [jose](https://github.com/panva/jose) for encrypted session cookies (JWE, `A256GCM`)
- Google Sheets API + Google Drive API (`drive.file` scope)
- No component library, no CSS framework, no database

## Getting started

### 1. Install

```sh
npm install
```

### 2. Create a Google Cloud OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create (or select) a project.
2. Enable both APIs under **APIs & Services → Library**:
   - **Google Sheets API**
   - **Google Drive API**
3. Configure **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - Add an app name, support email, and developer contact
   - Add the scope `https://www.googleapis.com/auth/drive.file`
   - While the app is in **Testing**, add your Google account under **Test users**
4. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3000/auth/callback`
5. Copy the client ID and client secret.

> For production, add your deployed callback URL as another authorized redirect URI, e.g.
> `https://your-domain.com/auth/callback`.

The redirect URI must match **exactly** — including the `/auth/callback` path and the port.

### 3. Configure environment variables

```sh
cp .env.example .env
```

Fill in `.env`:

```dotenv
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
SESSION_SECRET=replace-with-a-random-string-at-least-32-characters
```

Generate a strong session secret with:

```sh
openssl rand -base64 32
```

Environment variables are declared in `src/env.ts` and read through SvelteKit 3's `$app/env/private` module.

### 4. Run

```sh
npm run dev -- --port 3000
```

Open <http://localhost:3000>, sign in with Google, and record your first transaction.

If you use the default Vite port instead (`npm run dev`), add
`http://localhost:5173/auth/callback` to the authorized redirect URIs as well.

## How the storage works

On first sign-in Sanku searches the user's Drive for an app-created spreadsheet named
`Sanku Finance` (using the `drive.file` scope, so it can only see files this app created). If none
exists, it creates one with three tabs and bold header rows.

### `Transactions`

| id | date | type | category_id | description | amount | account | notes | created_at | updated_at |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `a1b2…` | 2026-11-22 | expense | `c3d4…` | Weekly groceries | 64.20 | Main account | Farmers market | 2026-11-22T… | 2026-11-22T… |

### `Categories`

| id | name | type | color | emoji | budget | created_at |
| --- | --- | --- | --- | --- | --- | --- |
| `c3d4…` | Groceries | expense | `#4f7a5b` | 🛒 | 450 | 2026-11-22T… |

### `Settings`

| key | value |
| --- | --- |
| currency | USD |

- Sanku seeds a sensible set of expense and income categories on first run.
- The spreadsheet id and tab ids are stored inside the encrypted session cookie.
- Every write goes directly through the Sheets API using `valueInputOption=RAW`, so text beginning
  with `=` is stored as text rather than a formula.
- Deleting a transaction or category removes its row with a `deleteDimension` batch update.
- Deleting a category leaves its transactions in place; they appear as **Uncategorized**.
- If the cookie is lost, signing in again finds the same spreadsheet in Drive.

## Scripts

```sh
npm run dev      # start the dev server (add -- --port 3000 to pin the port)
npm run build    # production build
npm run preview  # preview the production build
npm run check    # svelte-check + TypeScript
```

## Deploying

The project uses `@sveltejs/adapter-auto`. Install the adapter for your host (Vercel, Netlify, Cloudflare, Node, etc.) if it is not auto-detected.

On the host:

1. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `SESSION_SECRET`.
2. Add `https://your-domain.com/auth/callback` to the OAuth client's authorized redirect URIs.
3. Make sure the app can be reached over HTTPS. The session cookie is marked `secure` in production.

### Google verification

`drive.file` is a sensitive OAuth scope. While the OAuth consent screen is in **Testing**, only added test users can sign in. To open the app to the public you will need to publish the consent screen and complete Google's OAuth verification for that scope.

## Project structure

```
src/
├── app.css                  # design system + landing/dashboard styles
├── app.d.ts                 # App.Locals typing
├── env.ts                   # SvelteKit 3 env declarations
├── hooks.server.ts          # reads the encrypted session cookie
├── lib/
│   ├── components/
│   │   ├── BudgetPanel.svelte
│   │   ├── CashflowChart.svelte
│   │   ├── CategoryDonut.svelte
│   │   ├── CategoryManager.svelte
│   │   └── TransactionModal.svelte
│   ├── finance.ts           # money/date formatting + dashboard calculations
│   ├── server/
│   │   ├── auth.ts          # Google OAuth + PKCE + token refresh
│   │   ├── config.ts        # env validation
│   │   ├── session.ts       # encrypted JWE session cookie
│   │   ├── sheets.ts        # Sheets/Drive data layer
│   │   └── workspace.ts     # token refresh + spreadsheet bootstrap
│   └── types.ts             # Transaction, Category, Budget, Workspace types
└── routes/
    ├── +page.svelte         # landing page
    ├── app/                 # finance dashboard
    └── auth/                # login, callback, logout
```

## Security notes

- The session cookie is encrypted and authenticated with `A256GCM` (JWE) and is `httpOnly`, `SameSite=Lax`, and `secure` in production.
- The Google refresh token is only stored inside that encrypted cookie. Access tokens are refreshed per request and never persisted.
- `drive.file` grants access only to files Sanku creates — not the rest of the user's Drive.
- OAuth uses PKCE plus a state cookie to prevent CSRF and code interception.
- All form actions run through SvelteKit's built-in CSRF origin check.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `redirect_uri_mismatch` | The redirect URI in Google Cloud must exactly match `http://localhost:3000/auth/callback` (or your deployed URL). |
| “Access blocked” on sign-in | Add your Google account as a test user, or publish the OAuth consent screen. |
| Sign-in loops back with an error | Check that Sheets API and Drive API are enabled and that `SESSION_SECRET` is at least 32 characters. |
| Transactions fail to load | The spreadsheet may have been deleted or moved. Sign out and sign in again; Sanku will find or recreate it. |
| “Google refused the request” | Revoke and reconnect the app, or sign out and sign in again to refresh the token. |
| Budgets do not appear | Budgets are set per expense category. Open **Categories**, pick an expense category, and add a monthly budget. |

## License

MIT — do whatever makes sense for your own money.
