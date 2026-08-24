# Criador Dash

A guided builder for marketing, sales, support, finance, and inventory dashboards on Cloudflare Pages + Functions + KV (and D1 in historical mode). It is meant to be run by an AI coding agent (Claude Code) that walks a person, step by step, through building and publishing THEIR OWN dashboard on THEIR OWN Cloudflare account. The agent composes from a library of tested pieces (connectors, widgets, templates, metrics engine) and customizes for the person, writing a bespoke connector when the data source is specific.

## Prerequisites

Required, before you run any command below:

- **A Cloudflare account.** The free tier covers everything in this guide (Pages, Functions, KV; D1 also has a free tier if you use historical mode). Sign up at dash.cloudflare.com.
- **Git**, to clone this repository.
- **Node.js 22 or newer.** Wrangler (the Cloudflare CLI) requires Node 22+; check your version with `node -v`. An older Node (18, 20) is not enough. Install a current LTS from nodejs.org, or switch with `nvm use 22` if you use nvm.
- **Wrangler**, the Cloudflare CLI: `npm i -g wrangler`, then authenticate with `wrangler login` (opens a browser). A global install is not mandatory: `npm run dev` already calls it through `npx wrangler`.
- **Claude Code**, installed and signed in. This repository is a Claude Code skill: `SKILL.md` is the script an AI coding agent follows to walk you through the build. You can still read and run the starter-kit code without Claude Code, but the guided experience assumes it.
- **Your data**, as a Google Sheet or a CSV file. If you use a Google Sheet, share it as "Anyone with the link" before pasting the link; without that sharing setting the connector cannot read it.

Optional, only if you need it:

- A **Meta Ads** access token (Business Manager System User) and ad account id, only for the native Meta Ads connector (Marketing domain).
- Nothing extra for D1 / historical mode: it reuses the same Cloudflare account, it just adds one more `wrangler d1 create` step later (see Deploy below).

Nothing above requires a paid plan or a company account: a personal Cloudflare account and a personal Google account are enough to follow this guide end to end.

## Quickstart: from clone to your first dashboard

These steps get a dashboard running on your own machine, reading your own data, in a few minutes. This is local only, no Cloudflare deploy yet (that is the "Deploy to Cloudflare Pages" section further down).

1. Clone the repository and enter the starter kit:
   ```
   git clone <YOUR-REPO-URL> criador-dash
   cd criador-dash/starter-kit
   ```
   Replace `<YOUR-REPO-URL>` with the URL you are cloning from. If you are installing this as a Claude Code skill instead of just trying the code, clone straight into `~/.claude/skills/criador-dash` (see "Install as a Claude Code skill" below); the code inside is the same.
2. Confirm your environment is ready. There is no `npm install` step (zero runtime dependencies), so this alone proves your Node/npm setup works:
   ```
   npm test
   ```
   All tests should print green (500+ tests; `npm test` shows the current count).
3. Create the local secret file. Mutations are fail-closed even on your own machine, so this step is not optional:
   ```
   echo "ADMIN_TOKEN=dev-local-token" > .dev.vars
   ```
   `dev-local-token` is a placeholder: pick any string you like, it only matters on your machine and is never committed (`.dev.vars` is gitignored).
4. Start the local dev server:
   ```
   npm run dev
   ```
   Wrangler prints the local URL in the terminal, normally `http://localhost:8788`.
5. Open `http://localhost:8788/config.html` in your browser and go through the 4-step wizard:
   1. Pick a domain (Marketing, Sales, Support, Finance, or Inventory).
   2. Paste a Google Sheets link (shared "Anyone with the link") or upload one of the sample files in `examples/` (for example `examples/vendas-exemplo.csv`).
   3. Check the auto-mapped columns; fix anything the automatic mapping missed.
   4. Name the dashboard and pick a brand color.
6. You land on your first dashboard, running locally against real data. From here, "Deploy to Cloudflare Pages" below takes the same dashboard to a public URL on your own Cloudflare account.

## What it is / What it is NOT

It is:
- A guided, personalized build: the agent provisions the person's infra (Cloudflare account, KV, Pages, domain, and in historical mode a D1 database + a cron Worker) and assembles the dashboard for them.
- A library of real, tested code (500+ passing unit tests, built with TDD; `npm test` shows the current count) that the agent composes from instead of reinventing per person.
- A generic creator with ready domains (Marketing, Sales, Support, Finance, and Inventory) and an architecture for adding more.
- Dependency-free at runtime: charts are hand-drawn SVG, everything is plain ESM.

It is NOT:
- Not a hosted SaaS. Each person deploys to their own Cloudflare account and owns the code and infra.
- Not a locked, single-niche dashboard. It is a builder that adapts domain, metrics, and source to the person.
- Not a fixed list of vendor integrations. Google Sheets/CSV and Meta Ads ship ready; for any other source the agent writes a bespoke connector following the contract (CRM and Hotmart are documented starting-point stubs).

## Data modes

The person chooses per dashboard:
- Live (default, simplest): the dashboard reads the source on demand. KV stores only the config. No database.
- Historical (D1 + cron): a cron Worker snapshots the source into a Cloudflare D1 database and the dashboard reads the latest snapshot. Gives real history and does not break if the source goes down. More setup.

## Features

- Five ready domains out of the box: Marketing, Sales, Support, Finance, and Inventory.
- Marketing metrics: investment, impressions, clicks, leads, conversions, revenue, plus derived CTR, CPC, CPL, CPA, and ROAS. Conversion funnel (impressions to conversions) with step-to-step rates.
- Sales metrics: number of deals, won deals, revenue (won only, with a fallback when there is no status column), average ticket, and win rate. Closing funnel plus ranking by seller and by product.
- Support metrics: tickets handled, resolved, resolution rate, average response time, and CSAT. Resolution funnel plus ranking by channel.
- Finance metrics: income, expenses, balance (income minus expenses), and margin (balance over income). Time series of income plus ranking of expenses and income by category.
- Inventory metrics: revenue, units sold, units in stock, active products, and turnover (units sold over units in stock). Time series of revenue plus rankings by category and by product.
- Period trend badges on KPIs: each KPI compares the second half of the period to the first (equal-sized halves) and colors the change green or red by whether higher or lower is better.
- Optional goal tracking: set a target for the domain primary metric in the wizard and the main KPI shows a progress bar and percent of goal (green once reached).
- Optional per-dashboard password: protect a published dashboard with a password. The client sends a SHA-256 of the password in the `x-dash-auth` header; the server stores only a salted PBKDF2-SHA256 verifier per dashboard (never the plain password, never a replayable hash), and the config API returns data only when the recomputed verifier matches.
- Widgets: KPI cards (with optional trend badge), time series (pure SVG), funnel, table, ranking. No external libraries.
- 4-step no-code wizard with automatic column mapping by header name; widgets whose columns are not mapped are skipped instead of shown empty.
- Brand accent color per dashboard.
- Light/dark theme toggle in the topbar, persisted per browser (respects the OS preference on first load).
- Engineered-tool visual system (deliberately not an "AI template" look): self-hosted Geist Sans for text and Geist Mono tabular for every number (KPIs, funnel, ranking, chart axis, table headers); KPIs live in one hairline-divided panel rather than N cards with a colored bar; the chart Y-axis uses round nice-number ticks and a filled area under the line; flat surfaces, hairline borders, tinted minimal shadow, no decorative gradient or glow. The brand accent works in both themes and is swappable per dashboard. Regression guards in `test/design.test.js` (no radial-gradient, fonts wired, numbers in mono).
- 2D desktop grid layout: non-KPI widgets flow into a 12-column grid (each layout item declares an optional `col` span 3..8), so the time series sits next to the funnel and rankings pair up, instead of a single vertical stack. Collapses to one column on mobile.
- Built-in client-side filters: a filter bar (period from/to plus one selector per categorical dimension) recomputes every KPI, trend, funnel, series, ranking and table in the browser on change, without reloading or re-hitting the source.
- Dashboard groups (tabs): combine several dashboards of the same business under a single link with tabs (`kind:'group'` config). Each tab lazy-loads its child dashboard with its own filters; the active tab is reflected in the URL. Create one from the landing page ('New group' wizard) or via the API.
- Configs stored in Cloudflare KV; optional 5-minute data cache.
- Per-dashboard link previews (OpenGraph): sharing a dashboard link shows a card with the dashboard name, a per-domain description, a brand-colored 1200x630 image, `theme-color`, and a tinted favicon. Injected server-side (a Pages Function rewrites the page `<head>` from the KV config, since link crawlers do not run JS); the image is a self-hosted SVG at `/og?id=`. Password-protected dashboards do not leak their name (generic card, `noindex`). Note: the SVG image renders on most platforms; WhatsApp/Facebook may show only the title and description.

## Architecture (3 layers)

The full contract lives in `starter-kit/ARCHITECTURE.md`. The three decoupled layers are:

1. Connectors: fetch data from a source and return a `DataSet` (a common tabular schema). They know nothing about metrics.
2. Widgets: pure visual blocks (KPI, time series, funnel, table, ranking). They receive already-computed data and return HTML/DOM. They know nothing about templates or connectors.
3. Domain templates: define the semantic slots, the metrics, and the widget layout for each domain (Marketing, Sales, Support, Finance, Inventory).

Data flow:

```
Data source -> Connector -> DataSet (common schema) -> Template -> Widgets -> Render
```

Every connector returns exactly this shape:

```
DataSet {
  columns: string[]              // headers in original order
  rows: Object[]                 // each row is { [column]: value }, values are raw strings
  meta: { source, fetchedAt, rowCount, name? }
}
```

Number and date normalization (Brazilian formats included) happens in the metrics layer, not in the connector.

## Data sources

- Google Sheets via gviz CSV (flagship connector): the user shares the spreadsheet as "anyone with the link" and pastes the link. No OAuth, no API key, no "publish to web" step. The connector extracts the spreadsheet ID from the link and fetches `https://docs.google.com/spreadsheets/d/{ID}/gviz/tq?tqx=out:csv&gid={GID}`.
- CSV upload (fallback): the CSV text is posted and parsed with automatic delimiter detection.
- Meta Ads (native, advanced): pulls campaign insights from the Graph API using an access token (Business Manager System User) plus the ad account id. The token stays server-side only (stored in the config, never returned to the browser; the Function resolves it by dashboard id). Shown in the wizard only for the Marketing domain.
- D1 (historical mode): the `d1.js` connector reads the latest snapshot written by the cron Worker, so the dashboard shows data from the database instead of the live source.
- Second-wave stubs (documented, not finished): CRM, Hotmart.

## Install as a Claude Code skill

The skill name in the frontmatter is `criador-dash`, so the install folder must match it (the repo
name has a `skill-` prefix; do not reuse it as the folder name):

```
git clone <YOUR-REPO-URL> ~/.claude/skills/criador-dash
```

Repo layout: `SKILL.md` (the agent playbook), `references/` (infra commands, security model, features,
extension guides, loaded on demand), `scripts/preflight.py` (environment + wrangler.toml checks before
deploy), and `starter-kit/` (the deployable code library).

## Quick start

See "Quickstart: from clone to your first dashboard" near the top of this file for the full numbered
walkthrough. In short, once you are inside `starter-kit/`:

```
npm test                      # 500+ unit tests: node --test 'test/*.test.js'
npm run dev                   # local dev server with Functions + KV (wrangler pages dev public --compatibility-date=2026-01-01)
```
Run `python3 ../scripts/preflight.py --starter-kit .` (from inside `starter-kit/`) to check your environment at any time.

Behind the wizard: the dashboard (`dashboard.html`) reads `?id=`, loads the config from KV, fetches
the data through the connector, runs `computeAll` plus the template layout, and renders the widgets.

## Deploy to Cloudflare Pages

The data source needs no secret for the MVP (a link-shared Google Sheet or a CSV upload). You do set one server secret, `ADMIN_TOKEN`, because mutations are fail-closed (step 5 below): without it, creating or deleting dashboards is rejected.

1. Create the KV namespaces:
   ```
   wrangler kv namespace create DASHBOARDS_KV
   wrangler kv namespace create DASHBOARD_CACHE
   ```
   `DASHBOARDS_KV` is required (it stores dashboard configs). `DASHBOARD_CACHE` is optional (5-minute data cache).
   Each command prints an `id = "..."`. Copy it.
2. Put the returned ids into the `wrangler.toml` bindings, replacing `<SEU_KV_NAMESPACE_ID>` and `<SEU_KV_CACHE_ID>`. Use placeholders in any public repo; never commit real ids. There is no build step: `pages_build_output_dir` is already `public`.
3. Create the Pages project (once), then deploy:
   ```
   wrangler pages project create <YOUR-PROJECT-NAME> --production-branch main
   wrangler pages deploy public --project-name=<YOUR-PROJECT-NAME> --branch main
   ```
4. If the API responds 500 "Binding DASHBOARDS_KV não configurado", attach the bindings in the panel: Cloudflare Pages > your project > Settings > Bindings > add the KV binding `DASHBOARDS_KV` (and `DASHBOARD_CACHE`).
5. Required (mutations are fail-closed): set an admin token so you can create/manage dashboards. Generate one and store it as a secret: `openssl rand -base64 32` then `wrangler pages secret put ADMIN_TOKEN --project-name=<YOUR-PROJECT-NAME>` (paste the generated value). Without it, every create/delete is rejected with 403.
6. Optionally attach a custom domain in the Cloudflare Pages dashboard.
7. Open `config.html` on the published domain and create the first dashboard. The wizard asks for the admin token once (paste the value from step 5); it is stored in the browser and sent automatically after that.
8. Historical mode: also create a D1 database (`wrangler d1 create ...`), apply `db/schema.sql` with `--remote`, deploy the Worker in `workers/snapshot/`, and bind D1 (`DASHBOARD_DB`) to the Pages project. See SKILL.md for the exact commands.

### Access model (fail-closed)

Reading a published dashboard is public (it exists to be viewed). Mutations are not: creating, overwriting, and deleting (POST/DELETE) are fail-closed and require the `x-admin-token` header. If no `ADMIN_TOKEN` is configured on the server, the API rejects every mutation with `403 adminNotConfigured`, so nobody can create or delete anything anonymously. Setting `ADMIN_TOKEN` is part of setup, not optional:
- Generate a strong random token (`openssl rand -base64 32`) and set it as a Pages secret: `wrangler pages secret put ADMIN_TOKEN --project-name=<YOUR-PROJECT>`. On first use the wizard asks for it once (the `needsAdmin` flow), stores it in the browser, and sends `x-admin-token` from then on.
- Additionally set a per-dashboard password for anything whose DATA should not be read by link (it gates the config and the data, not just writes).

## Troubleshooting

The three errors a first run is most likely to hit:

1. **`wrangler: command not found`, even after `npm i -g wrangler`.**
   Cause: npm's global bin folder is not on your PATH. Fix: run `npm prefix -g` to find that folder and add it to your shell's PATH, or skip the global install entirely, since `npm run dev` already calls Wrangler through `npx wrangler`.

2. **`npm i -g wrangler` fails, or Wrangler refuses to run with an "unsupported engine" / Node version error.**
   Cause: Wrangler requires Node 22 or newer; an older Node (18, 20) is not enough. Fix: check `node -v`, then install a current LTS from nodejs.org, or `nvm use 22` if you use nvm.

3. **Creating a dashboard in the wizard returns 403 / `adminNotConfigured`.**
   Cause: mutations are fail-closed by design and no `ADMIN_TOKEN` is configured yet. Fix locally: create `starter-kit/.dev.vars` with `ADMIN_TOKEN=<any-value>` (Quickstart step 3) and restart `npm run dev`. Fix in production: run `wrangler pages secret put ADMIN_TOKEN --project-name=<YOUR-PROJECT-NAME>` (Deploy step 5), reload `config.html`, and paste the token when the wizard asks for it.

A fourth one worth knowing even though it did not make the top three: the Google Sheets connector fails to read the sheet. Cause: the sheet is not shared as "Anyone with the link". Fix: Share > General access > Anyone with the link, then paste the link again.

## Project structure

```
starter-kit/
  ARCHITECTURE.md               # the 3-layer contracts (source of truth)
  package.json
  wrangler.toml
  db/schema.sql                 # snapshots table for historical mode (D1)
  examples/
    marketing-exemplo.csv
    vendas-exemplo.csv
    suporte-exemplo.csv
  functions/
    _middleware.js              # CORS + KV cache (only /api/connectors/* responses) + security headers
    api/
      dashboards.js             # CRUD of dashboard configs in KV + password gate + secret strip
      connectors/
        sheets.js               # flagship connector (gviz CSV)
        csv.js                  # upload connector
        meta-ads.js             # Meta Ads connector (Graph API, token server-side)
        d1.js                   # historical-mode connector (reads latest D1 snapshot)
        crm.js                  # second-wave stub
        hotmart.js              # second-wave stub
    lib/
      csv.mjs                   # parseCSV + detectDelimiter (pure, testable)
      sheets-url.mjs            # sheetUrlToCsv (shared by connector and Worker)
      meta.mjs                  # buildInsightsUrl + mapInsightsToDataSet (pure)
      snapshots.mjs             # historical-mode SQL + rowToDataSet (pure)
      auth-config.mjs           # needsAuth/authOk (salted PBKDF2)/safeEqual/checkAdminToken (neutral)
      rate-limit.mjs            # KV fixed-window limiter (password gate + Meta preview throttle)
      domains.mjs               # server DOMAINS list (validates POST); kept in parity with the browser copy
  workers/
    snapshot/                   # Worker with a cron trigger that writes D1 snapshots
  public/
    index.html
    config.html                 # 4-step wizard
    dashboard.html
    assets/
      css/main.css
      js/
        config-wizard.js
        dashboard.js
        index-page.js
        domains.mjs           # browser DOMAINS list (source of truth for domains; parity-tested with the server copy)
        sources/
          index.js              # source registry (type, label, canHistory): source of truth
        lib/
          api-client.js
          automap.js            # slot -> column auto-mapping (token match, no substring)
          format.js             # Brazilian/US parse/format (currency, number, date)
          metrics.js            # computeMetric, computeAll, groupBy, timeSeries
          auth.js               # client-side SHA-256 of the optional password (salted PBKDF2 verifier lives server-side)
          theme.js              # light/dark toggle (injected into the topbar)
          color.js              # WCAG contrast helpers + aplicarAccent (shared by dashboard, theme, wizard)
          html.js               # single esc() (HTML escaping), shared by dashboard, index-page and widgets
        templates/
          index.js
          marketing.js
          vendas.js
          suporte.js
        widgets/
          index.js              # widget registry (type -> render/toHtml)
          _util.js
          kpi.js
          timeseries.js
          funnel.js
          table.js
          ranking.js
  test/                       # unit + handler + security + parity tests (node --test)
```

## Testing

There are 500+ tests, all green (`npm test` shows the current count), written before the code (TDD). They cover the pure logic (CSV parsing, Brazilian number/date formatting, metric computation, templates and auto-mapping, widget rendering, trends/goal, snapshots SQL, accent contrast), the API handlers and the password/admin gates, worker/lib parity, and design guards (no decorative gradient, focus-visible, contrast).

```
cd starter-kit
node --test 'test/*.test.js'
```

The full browser flow (Marketing and Sales, including the brand accent color swap) has also been validated manually.

## Security

- No token is required for the default source: a link-shared public Google Sheet or a CSV upload is enough.
- Optional password per dashboard: the server stores a salted PBKDF2-SHA256 verifier per dashboard (never the plain password, never a directly replayable hash), and the config API strips the whole `auth` block (salt, verifier, iterations) before responding. A KV fixed-window rate limiter throttles wrong-password attempts (by IP + dashboard id) and the Meta Ads preview POST (by IP), so the gate and the preview relay cannot be hammered. The `x-dash-auth` header (a SHA-256 of the password) is still a bearer-style credential protected by TLS in transit: this is a shared view password, not user accounts.
- Mutations are fail-closed: with no `ADMIN_TOKEN` set, POST/DELETE (and the Meta preview POST) are rejected, so there is no anonymous create/overwrite/delete. Setting `ADMIN_TOKEN` is a required setup step, not a hardening extra.
- Meta Ads access token is stored in the dashboard config and never returned to the browser: the connector Function reads it server-side by dashboard id. The config API strips the token from every response.
- A link-shared Google Sheet is readable by anyone with the link, and a published dashboard has no login unless you set a password. Use data you are comfortable sharing by link, and set a password for anything sensitive.
- Nothing sensitive lives in the code. No tokens, Account IDs, or KV ids are committed. Use `<...>` placeholders in any public repo.
- Dashboard configurations are stored in Cloudflare KV, not in the source tree.
- No external runtime dependencies, so there is no third-party script pulling data at render time.

## License

MIT.
