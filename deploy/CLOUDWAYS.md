# Deploying RepoLens

RepoLens is two services:

| Part | Tech | Where |
| --- | --- | --- |
| `frontend/` | Next.js 16 | **Cloudways Velocity** (managed Node.js) |
| `backend/` | FastAPI + Graphify CLI (Python) | **DigitalOcean Droplet** (Velocity is Node-only; Graphify needs Python) |

The browser only talks to the Velocity origin. `frontend/next.config.ts` rewrites `/api/*` server-side to
`BACKEND_URL`, so the Droplet needs no TLS and no CORS. nginx on the Droplet exposes the backend at `http://<ip>/api/` (port 80 only).

## 1. Backend on a DigitalOcean Droplet

Ubuntu 24.04, 2 GB RAM is enough for repos up to ~3000 files.

```bash
ssh root@<droplet-ip>
curl -fsSL https://raw.githubusercontent.com/tf153/RepoLens/main/deploy/setup.sh | bash
nano /etc/repolens.env          # GEMINI_API_KEY=...  (Google AI Studio key; Gemma 4 is served by the Gemini API)
systemctl restart repolens
curl http://127.0.0.1/api/health    # {"ok":true,"gemma":true,"model":"gemma-4-26b-a4b-it"}
```

Everything is served by nginx on standard **port 80**: `/` is the web app, `/api/` is the backend. If a DigitalOcean Cloud Firewall is attached, allow inbound TCP 80 (and 443 if you add TLS).
Re-deploy after changes: `cd /root/RepoLens && git pull && bash deploy/setup.sh`.

Fallback (no Velocity): `bash deploy/setup.sh --with-web` also serves the frontend from the Droplet at `http://<droplet-ip>/`.

## 2. Frontend on Cloudways Velocity

1. Cloudways console -> **Velocity** -> **Launch application** -> connect GitHub -> pick `tf153/RepoLens`.
2. Build settings:
   - Framework preset: **Next.js**
   - Branch: `main`
   - Node version: **22 LTS**
   - Root directory: `frontend`
   - Build command: `npm run build` (default) · Start command: `npm run start` (default)
3. Environment variables (runtime **and** build):
   - `BACKEND_URL` = `http://<droplet-ip>/api`
4. **Deploy now**. Enable automatic deployments so every push to `main` redeploys.
5. Open the Velocity URL, paste a GitHub repo, and watch the pipeline run.

## 3. Verify

```bash
curl https://<velocity-app>/api/health          # proxied to the Droplet
curl -X POST https://<velocity-app>/api/analyze -H 'content-type: application/json' \
     -d '{"repo_url":"https://github.com/encode/starlette"}'
```

## Environment reference (backend)

| Var | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | – | Required for Gemma 4 (tour, chat, diagram). Without it the app runs in graph-only fallback mode. |
| `GEMMA_MODEL` | `gemma-4-26b-a4b-it` | Alternative: `gemma-4-31b-it` |
| `REPOLENS_DATA_DIR` | `backend/data` | Clones + graphs live here |
| `REPOLENS_MAX_FILES` | `6000` | Refuse larger repos (hosted demo guard) |
| `GRAPHIFY_BIN` | `graphify` on PATH | Path to the Graphify CLI |
