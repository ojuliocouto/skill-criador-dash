# Criador Dash

A guided builder for marketing, sales, and support dashboards on Cloudflare Pages + Functions + KV (and D1 in historical mode). It is meant to be run by an AI coding agent (Claude Code) that walks a person, step by step, through building and publishing THEIR OWN dashboard on THEIR OWN Cloudflare account. The agent composes from a library of tested pieces (connectors, widgets, templates, metrics engine) and customizes for the person, writing a bespoke connector when the data source is specific.

## What it is / What it is NOT

It is:
- A guided, personalized build: the agent provisions the person's infra (Cloudflare account, KV, Pages, domain, and in historical mode a D1 database + a cron Worker) and assembles the dashboard for them.
- A library of real, tested code (242 passing unit tests, built with TDD) that the agent composes from instead of reinventing per person.
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
- Optional per-dashboard password: protect a published dashboard with a password. Only the SHA-256 hash is stored (never the plain password); the config API returns data only with the correct hash.
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

For the MVP (Google Sheets or CSV) you need no token, no OAuth, and no API key.

## Quick start

```
git clone <YOUR-REPO-URL>
cd <REPO>/starter-kit

npm test                      # 242 unit tests: node --test 'test/*.test.js'
wrangler pages dev public     # local dev server with Functions + KV
```

Then open `config.html` and create your first dashboard through the 4-step wizard:

1. Pick a domain (Marketing, Sales, or Support).
2. Connect a source: paste the Google Sheets link or upload a CSV. The connector fetches it and previews the columns.
3. Map columns: automatic mapping by header name pre-fills the slots; adjust what is missing. Required slots are validated.
4. Name it and pick a brand accent color. The config is saved to KV and you are redirected to the dashboard.

The dashboard (`dashboard.html`) reads `?id=`, loads the config from KV, fetches the data through the connector, runs `computeAll` plus the template layout, and renders the widgets.

## Deploy to Cloudflare Pages

For the MVP (Google Sheets or CSV) there is no secret or token to configure.

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
4. If the API responds 500 "Binding DASHBOARDS_KV nao configurado", attach the bindings in the panel: Cloudflare Pages > your project > Settings > Bindings > add the KV binding `DASHBOARDS_KV` (and `DASHBOARD_CACHE`).
5. Optionally attach a custom domain in the Cloudflare Pages dashboard.
6. Open `config.html` on the published domain and create the first dashboard.
7. Historical mode: also create a D1 database (`wrangler d1 create ...`), apply `db/schema.sql` with `--remote`, deploy the Worker in `workers/snapshot/`, and bind D1 (`DASHBOARD_DB`) to the Pages project. See SKILL.md for the exact commands.

### Access model (important)

The dashboards API is open by default: anyone who can reach the site can create dashboards, and any dashboard WITHOUT a password can be read, overwritten, or deleted by anyone with its id. This fits the self-serve, single-owner deploy model. For anything sensitive:
- Set a password on the dashboard (it also gates the data, not just the config).
- To lock the whole instance, set an `ADMIN_TOKEN` env var on the Pages project: with it set, POST/DELETE require the `x-admin-token` header, so only you can create or delete dashboards.

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
    _middleware.js              # CORS + KV cache (JSON only)
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
      auth-config.mjs           # needsAuth/authOk/safeEqual (neutral; connectors import from here)
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
        lib/
          api-client.js
          automap.js            # slot -> column auto-mapping
          format.js             # Brazilian parse/format (currency, number, date)
          metrics.js            # computeMetric, computeAll, groupBy, timeSeries
          auth.js               # SHA-256 hash for optional password
          theme.js              # light/dark toggle (injected into the topbar)
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

There are 221 tests, all green (`npm test`), written before the code (TDD). They cover the pure logic (CSV parsing, Brazilian number/date formatting, metric computation, templates and auto-mapping, widget rendering, trends/goal, snapshots SQL, accent contrast), the API handlers and the password/admin gates, worker/lib parity, and design guards (no decorative gradient, focus-visible, contrast).

```
cd starter-kit
node --test 'test/*.test.js'
```

The full browser flow (Marketing and Sales, including the brand accent color swap) has also been validated manually.

## Security

- No token is required for the default source: a link-shared public Google Sheet or a CSV upload is enough.
- Optional password per dashboard: only the SHA-256 hash is stored (never the plain password), and the config API strips the hash before responding. Note this is a shared view password, not user accounts.
- Meta Ads access token is stored in the dashboard config and never returned to the browser: the connector Function reads it server-side by dashboard id. The config API strips the token from every response.
- A link-shared Google Sheet is readable by anyone with the link, and a published dashboard has no login unless you set a password. Use data you are comfortable sharing by link, and set a password for anything sensitive.
- Nothing sensitive lives in the code. No tokens, Account IDs, or KV ids are committed. Use `<...>` placeholders in any public repo.
- Dashboard configurations are stored in Cloudflare KV, not in the source tree.
- No external runtime dependencies, so there is no third-party script pulling data at render time.

## License

MIT.
