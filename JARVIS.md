# JARVIS.md — hobby-management

Operational notes for Jarvis and Xavier. Keep this file updated when architecture, deployment, or product decisions change.

## Identity

- Product name in Coolify: `hobby-management`
- GitHub repo: `https://github.com/fyrex-FR/hobby-management`
- Production domain: `https://collection-api.cardvaults.app`
- Extra Coolify/sslip domain observed: `https://x134wf8gaskhyej4w8jebyus.178.105.44.71.sslip.io`
- Coolify host: `root@coolify` over Tailscale
- Coolify container: `x134wf8gaskhyej4w8jebyus-133024985953`
- Production image tag observed on 2026-05-05: `9df08683b802d3cb67c18b286f89e0e9b0e7d730`

## Stack

- Backend: FastAPI / Python
- Frontend: React + Vite + TypeScript
- Main backend entrypoint: `backend/main.py`
- Backend routes include cards, identify, upload, compare, vinted, ebay, share, admin, auth.
- Integrations visible in dependencies/services: Supabase, Anthropic, eBay/Vinted scraping, Gemini/Claude services.
- Dockerfile: `backend/Dockerfile`
- Browser extension files: `extension/`

## Common commands

From repo root:

```bash
# Frontend
cd frontend
npm install
npm run lint
npm run build

# Backend quick syntax/import check
cd ../backend
python -m compileall .
```

For production inspection only:

```bash
ssh root@coolify 'docker ps --filter name=x134wf8gaskhyej4w8jebyus --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"'
ssh root@coolify 'docker logs --tail=200 x134wf8gaskhyej4w8jebyus-133024985953'
```

## Deployment notes

- Coolify manages production. Do not edit generated files under `/data/coolify/applications/...` as source.
- Source of truth should be this GitHub repo.
- Before pushing or redeploying, Jarvis should summarize changes, test results, and risk.
- Ask Xavier before production redeploy, database/schema changes, secret/env changes, or destructive actions.
- Migration SQL files exist in `backend/`; treat schema changes as sensitive.

## Backlog / ideas

- Document exact Coolify Git integration once confirmed in UI.
- Add/confirm backend health route coverage in deployment checks (`/api/health`).
- Add a lightweight test script if none exists.
- Document extension workflow if Xavier wants Jarvis to evolve it.

## Decisions

- 2026-05-05: Use Git + Markdown notes as project memory first; Obsidian can come later if Xavier wants a visual knowledge base.
- 2026-05-05: Jarvis may inspect and modify code locally, but should ask before pushing to GitHub or redeploying production.
