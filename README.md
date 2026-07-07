# Criador Dash

A guided builder for marketing, sales, and support dashboards on Cloudflare Pages + Functions + KV (and D1 in historical mode). It is meant to be run by an AI coding agent (Claude Code) that walks a person, step by step, through building and publishing THEIR OWN dashboard on THEIR OWN Cloudflare account. The agent composes from a library of tested pieces (connectors, widgets, templates, metrics engine) and customizes for the person, writing a bespoke connector when the data source is specific.

## What it is / What it is NOT

It is:
- A guided, personalized build: the agent provisions the person's infra (Cloudflare account, KV, Pages, domain, and in historical mode a D1 database + a cron Worker) and assembles the dashboard for them.
- A library of real, tested code (448 passing unit tests, built with TDD) that the agent composes from instead of reinventing per person.
- A generic creator with ready domains (Marketing, Sales, and Support) and an architecture for adding more.
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

- Three ready domains out of the box: Marketing, Sales, and Support.
- Marketing metrics: investment, impressions, clicks, leads, conversions, revenue, plus derived CTR, CPC, CPL, CPA, and ROAS. Conversion funnel (impressions to conversions) with step-to-step rates.
- Sales metrics: number of deals, won deals, revenue (won only, with a fallback when there is no status column), average ticket, and win rate. Closing funnel plus ranking by seller and by product.
- Support metrics: tickets handled, resolved, resolution rate, average response time, and CSAT. Resolution funnel plus ranking by channel.
- Period trend badges on KPIs: each KPI compares the second half of the period to the first (equal-sized halves) and colors the change green or red by whether higher or lower is better.
- Optional goal tracking: set a target for the domain primary metric in the wizard and the main KPI shows a progress bar and percent of goal (green once reached).
- Optional per-dashboard password: protect a published dashboard with a password. The client sends a SHA-256 of the password in the `x-dash-auth` header; the server stores only a salted PBKDF2-SHA256 verifier per dashboard (never the plain password, never a replayable hash), and the config API returns data only when the recomputed verifier matches.
- Widgets: KPI cards (with optional trend badge), time series (pure SVG), funnel, table, ranking. No external libraries.
- 4-step no-code wizard with automatic column mapping by header name; widgets whose columns are not mapped are skipped instead of shown empty.
- Brand accent color per dashboard.
- Light/dark theme toggle in the topbar, persisted per browser (respects the OS preference on first load). Analytics-tool aesthetic: flat surfaces, hairline borders, tabular figures, no decorative gradient.
- Configs stored in Cloudflare KV; optional 5-minute data cache.

## Architecture (3 layers)

The full contract lives in `starter-kit/ARCHITECTURE.md`. The three decoupled layers are:

1. Connectors: fetch data from a source and return a `DataSet` (a common tabular schema). They know nothing about metrics.
2. Widgets: pure visual blocks (KPI, time series, funnel, table, ranking). They receive already-computed data and return HTML/DOM. They know nothing about templates or connectors.
3. Domain templates: define the semantic slots, the metrics, and the widget layout for each domain (Marketing, Sales, Support).

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

## Prerequisites / Onboarding

Before you start:
- A Cloudflare account (the free tier already covers Pages + Functions + KV).
- Node.js installed (to run the tests and the local dev server).
- Wrangler installed and authenticated: `npm i -g wrangler` then `wrangler login`.
- Your data as a Google Sheet or a CSV file.
- If you use a Google Sheet, share it as "anyone with the link". Without that sharing the connector fetch fails.

For the MVP data source (Google Sheets or CSV) you need no token, no OAuth, and no API key. (Managing dashboards still needs an `ADMIN_TOKEN` set at deploy time, since mutations are fail-closed: see Deploy and Access model below.)

## Quick start

```
git clone <YOUR-REPO-URL>
cd <REPO>/starter-kit

npm test                      # 448 unit tests: node --test 'test/*.test.js'
npm run dev                   # local dev server with Functions + KV (wrangler pages dev public --compatibility-date=2026-01-01)
```

Then open `config.html` and create your first dashboard through the 4-step wizard:

1. Pick a domain (Marketing, Sales, or Support).
2. Connect a source: paste the Google Sheets link or upload a CSV. The connector fetches it and previews the columns.
3. Map columns: automatic mapping by header name pre-fills the slots; adjust what is missing. Required slots are validated.
4. Name it and pick a brand accent color. The config is saved to KV and you are redirected to the dashboard.

The dashboard (`dashboard.html`) reads `?id=`, loads the config from KV, fetches the data through the connector, runs `computeAll` plus the template layout, and renders the widgets.

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

There are 448 tests, all green (`npm test`), written before the code (TDD). They cover the pure logic (CSV parsing, Brazilian number/date formatting, metric computation, templates and auto-mapping, widget rendering, trends/goal, snapshots SQL, accent contrast), the API handlers and the password/admin gates, worker/lib parity, and design guards (no decorative gradient, focus-visible, contrast).

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
