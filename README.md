# Vidyatid Content Engine (Cloudflare Serverless)

A full-stack, stateless content generation app running entirely on Cloudflare:
- **Frontend:** Cloudflare Pages-compatible static site (`static/`) with HTML + Tailwind CDN + Vanilla JS
- **Backend:** Cloudflare Worker (`worker.js`) with modular route handlers
- **AI:** Cloudflare Workers AI via `env.AI.run(...)`

## Endpoints
All endpoints accept `POST` JSON and return JSON output:
- `/generate-reel`
- `/generate-carousel`
- `/generate-ad`
- `/generate-social`
- `/generate-calendar`
- `/generate-study-notes`
- `/generate-thumbnail`
- `/generate-campaign-plan`

## Stateless Design
- No KV, R2, D1, or external databases.
- In-memory per-IP rate limiting only (ephemeral by worker instance).
- Frontend can store temporary drafts in `localStorage`.

## Local Development
```bash
wrangler dev
```

Then open the local worker URL in your browser.

## Deploy
```bash
wrangler deploy
```

## Notes
- Use `CF-Connecting-IP` for rate limit keying on deployed traffic.
- AI JSON is normalized against route schemas to reduce malformed output risk.
