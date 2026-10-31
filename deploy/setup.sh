#!/usr/bin/env bash
# RepoLens backend bootstrap for a DigitalOcean Droplet (Ubuntu 22.04/24.04).
# Idempotent: safe to re-run after `git pull`.
#
#   curl -fsSL https://raw.githubusercontent.com/tf153/RepoLens/main/deploy/setup.sh | bash
#   # or, from a checkout:  bash deploy/setup.sh [--with-web]
#
# --with-web also runs the Next.js frontend on :3000 (useful if you are not using Cloudways Velocity).
set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/RepoLens}"
WITH_WEB=0
[[ "${1:-}" == "--with-web" ]] && WITH_WEB=1

echo "==> system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates python3 python3-venv build-essential nginx >/dev/null

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "==> cloning RepoLens into $REPO_DIR"
  git clone https://github.com/tf153/RepoLens.git "$REPO_DIR"
fi
cd "$REPO_DIR"

echo "==> uv + graphify"
if ! command -v uv >/dev/null 2>&1 && [[ ! -x "$HOME/.local/bin/uv" ]]; then
  curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null
fi
export PATH="$HOME/.local/bin:$PATH"
uv tool install --quiet "graphifyy[leiden]" 2>/dev/null || uv tool upgrade --quiet graphifyy || true
graphify --version

echo "==> python backend"
cd "$REPO_DIR/backend"
[[ -d .venv ]] || uv venv .venv -q
uv pip install -q -r requirements.txt --python .venv/bin/python
mkdir -p data

echo "==> environment file"
if [[ ! -f /etc/repolens.env ]]; then
  cat > /etc/repolens.env <<'EOF'
# RepoLens runtime secrets. Restart with: systemctl restart repolens
GEMINI_API_KEY=
GEMMA_MODEL=gemma-4-26b-a4b-it
REPOLENS_MAX_FILES=6000
EOF
  chmod 600 /etc/repolens.env
  echo "    wrote /etc/repolens.env  <-- put your GEMINI_API_KEY there"
fi

echo "==> systemd (API on :8000)"
install -m 644 "$REPO_DIR/deploy/repolens.service" /etc/systemd/system/repolens.service
systemctl daemon-reload
systemctl enable --now repolens >/dev/null
systemctl restart repolens

if [[ $WITH_WEB -eq 1 ]]; then
  echo "==> node + web (on :3000)"
  if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  fi
  cd "$REPO_DIR/frontend"
  npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null
  BACKEND_URL=http://127.0.0.1:8000 npm run build >/dev/null
  install -m 644 "$REPO_DIR/deploy/repolens-web.service" /etc/systemd/system/repolens-web.service
  systemctl daemon-reload
  systemctl enable --now repolens-web >/dev/null
  systemctl restart repolens-web
fi

echo "==> nginx on :80  (/api/ -> backend, / -> web)"
rm -f /etc/nginx/sites-enabled/default
install -m 644 "$REPO_DIR/deploy/nginx-repolens.conf" /etc/nginx/sites-available/repolens
ln -sf /etc/nginx/sites-available/repolens /etc/nginx/sites-enabled/repolens
nginx -t >/dev/null && systemctl enable --now nginx >/dev/null 2>&1 && systemctl reload nginx

echo "==> firewall"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
fi

sleep 2
IP=$(curl -s -m 3 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address || hostname -I | awk '{print $1}')
echo
echo "RepoLens API:  http://$IP/api/health  ->  $(curl -s -m 5 http://127.0.0.1/api/health || echo 'not responding yet')"
[[ $WITH_WEB -eq 1 ]] && echo "RepoLens web:  http://$IP/"
echo "Set BACKEND_URL=http://$IP/api in Cloudways Velocity for the frontend."
