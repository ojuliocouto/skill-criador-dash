# Criador Dash

A plug-and-play builder for marketing and sales dashboards, running on Cloudflare Pages + Functions + KV. Connect a Google Sheet by link (or upload a CSV), pick a domain, map your columns in a 4-step wizard, and publish. No code, no OAuth, no API keys.

## What it is / What it is NOT

It is:
- A starter kit of real, tested code (73 passing unit tests, built with TDD) plus a playbook for an AI coding agent to operate it.
- A generic dashboard creator with two ready domains (Marketing and Sales) and an architecture designed for adding more.
- Plug-and-play: the end user pastes a spreadsheet link or uploads a CSV and publishes through a wizard.
- Dependency-free at runtime: charts are hand-drawn SVG, everything is plain ESM.

It is NOT:
- Not a hosted SaaS. You deploy it to your own Cloudflare Pages account.
- Not a locked, single-niche dashboard (launch, e-commerce, etc.). It is a builder.
- Not ready-made integrations with Meta Ads, CRM, or Hotmart. Those connectors are documented second-wave stubs, not finished.
- Not requiring OAuth or an API key for the MVP. A link-shared public spreadsheet is enough.

## Features

- Two ready domains out of the box: Marketing and Sales.
- Marketing metrics: investment, impressions, clicks, leads, conversions, revenue, plus derived CTR, CPC, CPL, CPA, and ROAS. Conversion funnel (impressions to conversions) with step-to-step rates.
- Sales metrics: number of deals, won deals, revenue (won only, with a fallback when there is no status column), average ticket, and win rate. Closing funnel plus ranking by seller and by product.
- Period trend badges on KPIs: each KPI compares the second half of the period to the first (equal-sized halves) and colors the change green or red by whether higher or lower is better.
- Widgets: KPI cards (with optional trend badge), time series (pure SVG), funnel, table, ranking. No external libraries.
- 4-step no-code wizard with automatic column mapping by header name; widgets whose columns are not mapped are skipped instead of shown empty.
- Brand accent color per dashboard.
- Configs stored in Cloudflare KV; optional 5-minute data cache.

## Architecture (3 layers)

The full contract lives in `starter-kit/ARCHITECTURE.md`. The three decoupled layers are:

1. Connectors: fetch data from a source and return a `DataSet` (a common tabular schema). They know nothing about metrics.
2. Widgets: pure visual blocks (KPI, time series, funnel, table, ranking). They receive already-computed data and return HTML/DOM. They know nothing about templates or connectors.
3. Domain templates: define the semantic slots, the metrics, and the widget layout for each domain (Marketing, Sales).

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
- Second-wave stubs (documented, not finished): Meta Ads, CRM, Hotmart.

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

npm test                      # 73 unit tests: node --test 'test/*.test.js'
wrangler pages dev public     # local dev server with Functions + KV
```

Then open `config.html` and create your first dashboard through the 4-step wizard:

1. Pick a domain (Marketing or Sales).
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
2. Put the returned ids into the `wrangler.toml` bindings. Use placeholders in any public repo; never commit real ids.
3. Deploy:
   ```
   wrangler pages deploy public --project-name=<YOUR-PROJECT-NAME>
   ```
4. Optionally attach a custom domain in the Cloudflare Pages dashboard.
5. Open `config.html` on the published domain and create the first dashboard.

## Project structure

```
starter-kit/
  ARCHITECTURE.md               # the 3-layer contracts (source of truth)
  package.json
  wrangler.toml
  examples/
    marketing-exemplo.csv
    vendas-exemplo.csv
  functions/
    _middleware.js
    api/
      dashboards.js             # CRUD of dashboard configs in KV
      connectors/
        sheets.js               # flagship connector (gviz CSV)
        csv.js                  # upload connector
        meta-ads.js             # second-wave stub
        crm.js                  # second-wave stub
        hotmart.js              # second-wave stub
    lib/
      csv.mjs                   # parseCSV + detectDelimiter (pure, testable)
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
        templates/
          index.js
          marketing.js
          vendas.js
        widgets/
          _util.js
          kpi.js
          timeseries.js
          funnel.js
          table.js
          ranking.js
  test/
    csv.test.js
    dashboards.test.js
    format.test.js
    metrics.test.js
    render.test.js
    templates.test.js
    widgets.test.js
    wizard.test.js
```

## Testing

There are 73 unit tests, all green, written before the code (TDD). They cover the pure logic: CSV parsing, Brazilian number/date formatting, metric computation, templates and auto-mapping, widget rendering, the wizard flow, and the dashboards CRUD.

```
cd starter-kit
node --test 'test/*.test.js'
```

The full browser flow (Marketing and Sales, including the brand accent color swap) has also been validated manually.

## Security

- No token is required for the MVP: a link-shared public Google Sheet or a CSV upload is enough.
- Nothing sensitive lives in the code. No tokens, Account IDs, or KV ids are committed. Use `<...>` placeholders in any public repo.
- Dashboard configurations are stored in Cloudflare KV, not in the source tree.
- No external runtime dependencies, so there is no third-party script pulling data at render time.

## License

MIT.
