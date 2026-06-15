# Criador Dash — Launch Dashboard Builder Skill

An AI agent **skill** (a playbook) that teaches a coding agent such as Claude Code **how to build, maintain, and replicate marketing launch dashboards** on Cloudflare Pages + Workers, pulling data from Meta Ads, Hotmart, SendFlow, ManyChat, ActiveCampaign, and Google Sheets.

This is the **generic, educational version**: it contains **no tokens, account IDs, or real client data**. Everything sensitive appears as a placeholder (`<...>` or in CAPS) for you to fill in with your own project's values.

---

## First, the most important thing: what this IS and what it is NOT

**This is NOT a ready-to-install dashboard.**

It is a **skill** — a detailed manual/playbook that an AI agent reads to **know HOW to build** a launch dashboard from scratch. It is knowledge and a recipe, not the finished product.

| What you get here | What you do NOT get here |
|---|---|
| The full build methodology (`SKILL.md`) | The dashboard source code (`dist/`, `functions/`) |
| Architecture, data flow, rules for each integration | A configured Cloudflare account |
| A defined neutral design system (tokens) | API tokens / secrets for the integrations |
| Deploy checklist and new-client setup checklist | A live website, automatically |
| Known bugs and how to fix them | — |

Think of it this way: this repo hands you the **map and the instruction manual**, not the **assembled car**. You (or the agent, guiding you) assemble the car by following the manual.

---

## How it actually works (step by step)

1. **You install the skill** in your Claude Code (see below).
2. **The agent onboards you first.** The very first time you trigger the skill, the agent will *not* immediately start building. It explains what the skill is, then runs a short checklist (Do you have a Cloudflare account? Is `wrangler` installed? Which integrations? Do you have the tokens? Which campaign type?).
3. **You ask the agent** for something like: *"build a launch dashboard for this client, paid-launch type, integrating Meta Ads and Hotmart."*
4. **The agent reads `SKILL.md`** and follows the methodology: creates the files, wires up the Cloudflare Functions, builds the funnel, applies the design system, etc.
5. **You provide the real data** when the agent asks for it: Cloudflare account, integration tokens, product/campaign IDs. The skill tells the agent *exactly* which ones are needed and where they go.
6. **The agent deploys** following the skill's checklist.

> In short: the skill does not "run by itself." It makes the agent know the path. The hands-on work (create the project, paste tokens, deploy) still happens, but guided, without you having to figure everything out by trial and error.

---

## What you need to actually ship a dashboard

Even with the skill, to get a live dashboard you will need:

- A **Cloudflare account** (Pages + Workers + KV) — the free plan is enough to start
- **`wrangler`** installed (`npm i -g wrangler`)
- **Tokens for whichever integrations you use**, for example:
  - Meta Marketing API (`META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`)
  - Hotmart (`HOTMART_BASIC_TOKEN`)
  - SendFlow, ManyChat, ActiveCampaign, Google Sheets (as applicable)
- **The dashboard source code** — this repo ships only the methodology (`SKILL.md`). The agent can generate the code by following the skill, or you can start from a base project of your own.

---

## Installing the skill in Claude Code

```bash
git clone https://github.com/ojuliocouto/skill-criador-dash.git
mkdir -p ~/.claude/skills
cp -r skill-criador-dash ~/.claude/skills/criador-dash
```

That's it. The next time you ask for a launch dashboard, Claude Code recognizes the skill and starts following its methodology (beginning with the onboarding).

> You can also just **read `SKILL.md` as documentation**, with no agent at all — it's a complete guide to how these dashboards are built.

---

## What's inside the skill (`SKILL.md`)

- **Onboarding block** — what the agent walks the user through on first use
- **Project template** — with placeholders to fill in
- **3 campaign types** — paid launch, free launch, and downsell
- **File architecture** — `dist/` (frontend) + `functions/` (Cloudflare Functions / API)
- **Data flow** — parallel fetch, processing, funnel rendering
- **Hotmart KV-first pattern** — hourly sync via cron to avoid Worker timeouts
- **SendFlow counting rules** — how to mirror the "Overview" screen correctly
- **Cache middleware** — KV-backed, 5 min TTL, with safeguards
- **Design system** — a defined neutral dark token set (see below)
- **Deploy checklist** and **new-client setup checklist**
- **Known bugs** and their fixes

---

## Design system (neutral, brandable)

Dashboards are **not** styled ad hoc. The skill ships a **neutral, professional dark design system** as CSS tokens (palette, semantic colors, fixed chart palette, typography, spacing, radius/shadow). It belongs to no specific brand.

To apply a brand, you change **one** variable — the accent color (`--accent`) — and optionally the font and logo. Everything else stays fixed to guarantee consistency and dark-mode legibility. There's an optional light-theme recipe too.

---

## Campaign types at a glance

| Type | Funnel |
|---|---|
| **Paid launch** (`lancamento_pago`) | Clicks → Page → Popup (opt) → Ticket → AC Onboarding → Group → Survey (opt) |
| **Free launch** (`lancamento_gratuito`) | Clicks → Signup → Onboarding → Group → Survey (opt) → Sales |
| **Downsell** (`downsell`) | Same funnel as free launch, applied to downsell offers |

---

## Security

- This version is **generic and sanitized**: it contains no tokens, account IDs, or real client data. Anything sensitive is a placeholder (`<...>` or CAPS).
- **Never** commit real tokens or IDs. Secrets go in the Cloudflare Pages panel (Settings > Environment variables), never in the code.

---

## License

Educational use. Adapt freely for your own projects.
