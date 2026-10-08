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

- **Python 3.8 or newer**, for the guided-flow scripts (tool checker, preflight, step gates). You never call it by name: every script runs through `node <skill-dir>/scripts/py.mjs <script>.py`, which finds the right Python command for your system on its own (its name differs between Windows, macOS and Linux) and turns on UTF-8 mode.
- **Playwright with Chromium** (`npm i -g playwright && npx playwright install chromium`), for the proof screenshot and the proof video of the published dashboard. `playwright install chromium` also downloads the ffmpeg build Playwright uses to record video; if it is missing, `npx playwright install ffmpeg`.
- **The `frontend-design` skill**, for the visual plan: `npx -y skills add anthropics/skills --skill frontend-design --agent claude-code -g -y --copy`. The `-g` matters: without it the skill is installed into the current folder instead of your user-level skills folder.

### Windows, macOS and Linux

The skill runs on all three.

| | Windows | macOS | Linux (Debian/Ubuntu, Fedora) |
|---|---|---|---|
| Node 22+ | `winget install -e --id OpenJS.NodeJS.LTS` | `brew install node` | installer or `nvm` from nodejs.org |
| Python 3.8+ | `winget install -e --id Python.Python.3.12` | `brew install python` | `sudo apt install python3` / `sudo dnf install python3` |
| Git | `winget install -e --id Git.Git` (ships Git Bash) | Apple Command Line Tools | `sudo apt install git` / `sudo dnf install git` |

- **Windows: run everything from Git Bash (or WSL), not plain PowerShell.** The commands in this guide are bash (`cp -R`, `~/`, quoted `curl`).
- After installing anything, open a NEW terminal so the PATH is refreshed.
- A path with spaces or accents (`C:\Users\João Silva`) must be quoted in every command.
- Linux: if Chromium opens and closes at once, run `npx playwright install --with-deps chromium`.

What was verified: the test suites pass with the Python launcher finding each of the possible Python command names alone, or none of them, with a cp1252/ASCII locale, with a project folder containing spaces and accents, and with CRLF line endings. What was NOT verified: a run on a real Windows machine.

Optional, only if you need it:

- A **Meta Ads** access token (Business Manager System User, never expires, `ads_read` + `read_insights`) and ad account id, only for the native Meta Ads connector (Marketing domain). Step-by-step guide (Portuguese): `references/token-meta-ads.md`.
- Nothing extra for D1 / historical mode: it reuses the same Cloudflare account, it just adds one more `wrangler d1 create` step later (see Deploy below).

Nothing above requires a paid plan or a company account: a personal Cloudflare account and a personal Google account are enough to follow this guide end to end.

## Quickstart: from clone to your first dashboard

These steps get a dashboard running on your own machine, reading your own data, in a few minutes. This is local only, no Cloudflare deploy yet (that is the "Deploy to Cloudflare Pages" section further down).

1. Clone the repository and enter the starter kit:
   ```
   git clone https://github.com/ojuliocouto/skill-criador-dash.git criador-dash
   cd criador-dash/starter-kit
   ```
   If you are installing this as a Claude Code skill instead of just trying the code, clone straight into `~/.claude/skills/criador-dash` (see "Install as a Claude Code skill" below); the code inside is the same.
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
5. Open `http://localhost:8788/config.html` in your browser. The wizard asks for the admin key first, before you fill anything in: paste the same value you set for `ADMIN_TOKEN` in `.dev.vars` in step 3 (`dev-local-token` if you used the example above). Then go through the 4 guided steps:
   1. "What do you want to track?": pick an area (Marketing, Sales, Support, Finance, or Inventory). Each card lists the numbers and tabs or blocks that dashboard brings.
   2. "Where are your numbers?": choose one source at a time. Paste a Google Sheets link (shared "Anyone with the link") or upload a CSV (a sample sheet per area can be downloaded right there, and `examples/` has the same files). After connecting you see the row count, the detected period and the first 3 rows.
   3. "Check the columns": a scoreboard ("Found 8 of 8 columns"), sample values for each column, what the dashboard loses without an optional column, and a "Rename" action per metric (for example, show "Conversions" as "New students").
   4. "Make it yours": name, logo upload, brand color, light or dark mode, the highlighted number and an optional goal, with a live preview of the real dashboard next to the form.
   A success screen then shows the dashboard link with "Open" and "Copy link".
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
- Widgets: KPI cards (with optional trend badge), time series (pure SVG), funnel, table, ranking, summary table (`resumo`: grouped by a dimension or by day, week or month, with a TOTAL row recomputed by the metrics engine, never a sum or average of rates) and goal calculator (`meta`: type a conversion target and see the investment, leads and revenue it takes at the period averages). No external libraries.
- Tabs inside a dashboard: a domain template can declare `tabs`. Marketing ships with five (Overview, Channels, Evolution, Funnel, Data); the active tab lives in the URL hash and survives filter changes. Templates without `tabs` keep the single-page layout.
- Guided 4-step no-code wizard with automatic column mapping by header name, sample values per column, a downloadable sample sheet per area and a live preview before saving; widgets whose columns are not mapped are skipped instead of shown empty.
- Rename any metric per dashboard (`config.labels`), validated on the server (short text, no markup).
- Brand identity per dashboard: accent color, optional second color and logo upload (resized in the browser and stored as a `data:image` URL in `config.logo`; the plate behind the logo is chosen from the logo's own luminance so a light logo does not vanish on a light background).
- Light or dark mode chosen by the dashboard owner (`config.tema`: `claro`, `escuro` or `auto`). The server sets the initial `data-theme` in the HTML, so the wrong mode never flashes. Visitors can still toggle; their choice is stored per dashboard in their own browser.
- Presence: a slow-moving background in the brand color, an opening greeting ("Olá, <name>", once per browser session, skippable, `config.saudacao`) that reveals the dashboard, loading skeletons in the shape of the dashboard with a progress bar, a Refresh button with "updated X ago" and an error state with "Try again". Everything collapses to the final state with `prefers-reduced-motion`. Opt out with `config.fundoAnimado: false` and `config.saudacaoLigada: false`.
- `POST /api/admin-check`: lets the wizard confirm the admin key up front without mutating anything (rate limited per IP, constant-time compare, key only in a header).
- Motion (7 named effects, all off under `prefers-reduced-motion`, final numbers always in the DOM): **Card that becomes the screen** (the panel row grows in its own color to cover the screen, then the panel takes over), **Chart that responds** (ruler, dot and label with date and value follow the pointer), **Period in one click** (Today, 7 days, 30 days, This month, All, Custom, with a sliding pill), **Roulette numbers** (only the changed digit rolls, in a one-line window per digit; separators never move), **Chart that transforms** (the line morphs and the goal, ranking and funnel bars grow or shrink on filter changes), **Goal hit** (once per crossing of 100%, about 1.9 s: the card lights up in the brand color, a band of light sweeps across it, a flash runs along the bar, the number pulses and the "Meta batida" seal lands) and **Table that reorders** (click a header to sort; the chosen order survives filters, period changes and Refresh until you click again or switch tab). Effects use only `transform`, `opacity`, `stroke-dashoffset` and `clip-path`, none lasts more than 2.4 s and a full period switch ends within 1.0 s; see `starter-kit/public/assets/css/efeitos.css` and `node <skill-dir>/scripts/test-efeitos-no-navegador.cjs`.
- Proof video: every delivery ships a 10 to 15 s video of the published dashboard (open, switch tab, filter) at 1440x900 and 390x844, recorded with Playwright's native `recordVideo` (no ffmpeg of your own, no Mac-only tool, output folders may contain spaces and accents): `node <skill-dir>/scripts/gravar-video.js "<dashboard-url>" --saida prova`. A default script, `scripts/roteiro-padrao.json` (open, wait, switch two period shortcuts, click tabs and hover the chart, pick a filter option, scroll), works on any factory dashboard without editing; steps whose element does not exist are skipped. Because reviewers read images, not video, it also saves a contact sheet of 6 frames taken during the same run (`prancha-desktop.png`, `prancha-mobile.png`) and a `video-info.json` with format, size and duration (read from the WebM itself, no ffprobe). The output is WebM, about 1 MB per video. Step 6 of `gate-etapas.py` refuses to register a delivery without the desktop and mobile videos.
- Engineered-tool visual system (deliberately not an "AI template" look): self-hosted Geist Sans for text and Geist Mono tabular for every number (KPIs, funnel, ranking, chart axis, table headers); KPIs live in one hairline-divided panel rather than N cards with a colored bar; the chart Y-axis uses round nice-number ticks and a filled area under the line; flat surfaces, hairline borders, tinted minimal shadow, no decorative gradient or glow. The brand accent works in both themes and is swappable per dashboard. Regression guards in `test/design.test.js` (no radial-gradient, fonts wired, numbers in mono). The moving brand-colored background and the opening greeting are the one deliberate exception: they live in a separate stylesheet, `presenca.css`, with their own guard in `test/presenca.test.js`, so the rules above still hold for `main.css`.
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
git clone https://github.com/ojuliocouto/skill-criador-dash.git ~/.claude/skills/criador-dash
```

Repo layout: `SKILL.md` (the agent playbook), `references/` (infra commands, security model, features,
extension guides, loaded on demand), `scripts/preflight.py` (environment + wrangler.toml checks before
deploy), and `starter-kit/` (the deployable code library).

## What changed in 3.7.1

Fixes from an end-to-end run: build and prove a dash locally before having a Cloudflare account (`"modo": "local"` on step 4); a goal now has a period (`goal.periodo`: monthly by default); the assistant preview loads the effects stylesheet; Portuguese synonyms for column auto-mapping (weak matches ask for confirmation); every shown number can be hidden; sortable tables everywhere (the total row stays last); phone layout (cards plus "Ordenar por", 44 px targets, scrolling controls with a fading edge); a second official video script (`--roteiro efeitos`); and a measured taste pass (`scripts/passe-de-gosto.js`) that the step 6 gate reads. Details in `CHANGELOG.md`.

## Quick start

See "Quickstart: from clone to your first dashboard" near the top of this file for the full numbered
walkthrough. In short, once you are inside `starter-kit/`:

```
npm test                      # 500+ unit tests: node --test 'test/*.test.js'
npm run dev                   # local dev server with Functions + KV (wrangler pages dev public --compatibility-date=2026-01-01)
```
Run `node <skill-dir>/scripts/py.mjs preflight.py --starter-kit .` (from inside `starter-kit/`) to check your environment at any time.

In this README `<skill-dir>` means the folder that holds `SKILL.md` (wherever you installed or cloned the skill; if the path has a space or an accent, wrap it in double quotes). Every script command works from any folder. To get the commands already printed with the full path resolved for your machine, run `node <skill-dir>/scripts/py.mjs lancador.py`; to create the project folder (a clean copy of `starter-kit/`) run `node <skill-dir>/scripts/py.mjs lancador.py iniciar ~/meu-dash`.

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

## Ferramentas e gates do roteiro guiado

Antes do Passo 1, execute `node <dir-da-skill>/scripts/py.mjs checar-ferramentas.py` (`<dir-da-skill>` é a pasta onde está o `SKILL.md`; de qualquer pasta).
Além de Node 22+, wrangler e starter-kit, o roteiro exige Python 3.9+ e Playwright.
O 21st.dev é opcional e nunca bloqueia: o código dele é pago e vem em React, e o
starter-kit é HTML puro. O roteiro guiado bloqueia só se faltar uma ferramenta crítica.

```bash
npm install -g playwright && npx playwright install chromium
```

High-end-visual-design e animate são opcionais.
Sem elas, declare a degradação. O starter-kit não tem dependências: use `npm test`,
sem `npm ci`, pois não há arquivo de lock.

Limites do verificador: `claude mcp list` comprova conexão, não uma operação útil;
presença de uma skill não comprova que foi executada. Faça uma chamada de leitura
antes de usar o MCP e confira o retorno. Essa prova ainda não está automatizada.

Cada etapa registra evidências com `scripts/gate-etapas.py --perfil dash`.
Consulte [campos e comandos](references/gate-etapas.md). Na entrega, confira a etapa 6.
O gate de tela exige número em `.kpi__value` visível; um ano no título não é um KPI.
Dashboards personalizados precisam preservar esse marcador nos valores de métricas.

```bash
node <skill-dir>/scripts/test-prova-dash.cjs
node <skill-dir>/scripts/test-resolver-playwright.cjs
node <skill-dir>/scripts/test-roteiro-de-video.cjs
node <skill-dir>/scripts/test-gravar-video-integracao.cjs
node <skill-dir>/scripts/test-efeitos-no-navegador.cjs
node <skill-dir>/scripts/test-celular-no-navegador.cjs
node <skill-dir>/scripts/test-passe-de-gosto-no-navegador.cjs
node <skill-dir>/scripts/py.mjs test-lancador.py
node <skill-dir>/scripts/py.mjs test-skill-md.py
node <skill-dir>/scripts/py.mjs test-biblioteca-independe-do-layout.py
node <skill-dir>/scripts/py.mjs test-preflight.py
node <skill-dir>/scripts/py.mjs test-uso-ferramentas.py
node <skill-dir>/scripts/py.mjs test-gate-etapas.py
```

Datas brasileiras com hora preservam o dia informado. Status de venda são reconhecidos
por termos explícitos de conclusão, incluindo pago, concluído, faturado e finalizado.
Estados como "não pago" e "fechada perdida" não contam como receita. Vocabulário específico
de ERP deve ser confirmado com o aluno antes de ampliar esse mapeamento.
