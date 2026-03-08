#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# FinanceMe — GCP e2-micro Free Tier Setup Script
# ═══════════════════════════════════════════════════════════════════════════════
#
# HOSTING DECISION: Google Cloud Platform (GCP) — e2-micro Always Free Tier
#
# Why GCP over AWS:
#   - GCP e2-micro is FREE FOREVER (no 12-month expiry like AWS Free Tier)
#   - AWS t4g.nano costs ~$3/month after the first year
#   - For a single-user personal app, GCP e2-micro (1 vCPU, 1GB RAM) is plenty
#
# GCP Always Free includes (per month, per account):
#   ✓  1x e2-micro VM (us-west1, us-central1, or us-east1)
#   ✓  30 GB standard persistent disk
#   ✓  1 GB outbound network traffic
#   ✓  $0/month total for this app
#
# Claude API cost for CC statement import:
#   ✓  ~$0.001–$0.01 per PDF statement (Haiku model)
#   ✓  CSV imports: FREE (no API call needed)
#
# Prerequisites:
#   1. Create a GCP account at console.cloud.google.com
#   2. Create an e2-micro VM in us-central1 with Debian/Ubuntu
#   3. SSH into the VM and run this script
#   4. Point your domain (or use IP) to the VM
#
# Usage: bash setup-gcp.sh [your-domain.com]
# ═══════════════════════════════════════════════════════════════════════════════

set -e

DOMAIN=${1:-""}
APP_DIR="/opt/financeme"
APP_USER="financeme"
NODE_VERSION="20"

echo "════════════════════════════════════════"
echo "  FinanceMe — GCP Setup"
echo "════════════════════════════════════════"

# ─── 1. System updates ───────────────────────────────────────────────────────
echo "→ Updating system packages..."
sudo apt-get update -qq && sudo apt-get upgrade -y -qq

# ─── 2. Node.js ──────────────────────────────────────────────────────────────
echo "→ Installing Node.js ${NODE_VERSION}..."
curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | sudo -E bash -
sudo apt-get install -y nodejs -qq
echo "   Node: $(node --version) | npm: $(npm --version)"

# ─── 3. Nginx ────────────────────────────────────────────────────────────────
echo "→ Installing Nginx..."
sudo apt-get install -y nginx -qq
sudo systemctl enable nginx

# ─── 4. PM2 ──────────────────────────────────────────────────────────────────
echo "→ Installing PM2..."
sudo npm install -g pm2 --silent

# ─── 5. Create app user ───────────────────────────────────────────────────────
echo "→ Creating app user..."
if ! id "$APP_USER" &>/dev/null; then
  sudo useradd -r -m -s /bin/bash "$APP_USER"
fi
sudo mkdir -p "$APP_DIR"
sudo chown "$APP_USER:$APP_USER" "$APP_DIR"

# ─── 6. Copy app files ────────────────────────────────────────────────────────
echo "→ Copying application files..."
# If running from the repo directory, copy everything
if [ -f "package.json" ]; then
  sudo rsync -a --exclude='node_modules' --exclude='*.db' --exclude='.git' \
    ./ "$APP_DIR/"
  sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi

# ─── 7. Install dependencies ─────────────────────────────────────────────────
echo "→ Installing backend dependencies..."
sudo -u "$APP_USER" bash -c "cd $APP_DIR/backend && npm install --production"

echo "→ Installing frontend dependencies and building..."
sudo -u "$APP_USER" bash -c "cd $APP_DIR/frontend && npm install && npm run build"

# ─── 8. Environment file ─────────────────────────────────────────────────────
echo "→ Setting up environment..."
if [ ! -f "$APP_DIR/backend/.env" ]; then
  sudo -u "$APP_USER" bash -c "cat > $APP_DIR/backend/.env" << 'ENVEOF'
NODE_ENV=production
PORT=3001
JWT_SECRET=$(openssl rand -hex 32)
# Add your Anthropic API key for credit card PDF import:
# ANTHROPIC_API_KEY=sk-ant-...
ENVEOF
  echo "   ⚠ Edit $APP_DIR/backend/.env to add your ANTHROPIC_API_KEY"
fi

# ─── 9. PM2 setup ────────────────────────────────────────────────────────────
echo "→ Configuring PM2..."
sudo -u "$APP_USER" bash -c "cd $APP_DIR && pm2 start ecosystem.config.cjs --env production"
sudo -u "$APP_USER" bash -c "pm2 save"

# PM2 startup script (run as root)
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" 2>/dev/null || true

# ─── 10. Nginx config ────────────────────────────────────────────────────────
echo "→ Configuring Nginx..."
sudo cp "$(dirname "$0")/nginx.conf" /etc/nginx/sites-available/financeme

if [ -n "$DOMAIN" ]; then
  sudo sed -i "s/server_name _;/server_name $DOMAIN;/" /etc/nginx/sites-available/financeme
fi

sudo ln -sf /etc/nginx/sites-available/financeme /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# ─── 11. SSL (optional, requires domain) ─────────────────────────────────────
if [ -n "$DOMAIN" ]; then
  echo "→ Installing SSL certificate (Let's Encrypt)..."
  sudo apt-get install -y certbot python3-certbot-nginx -qq
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --email "admin@$DOMAIN" --redirect || echo "   ⚠ SSL setup failed — run manually"
fi

# ─── 12. Firewall ────────────────────────────────────────────────────────────
echo "→ Configuring firewall..."
sudo apt-get install -y ufw -qq
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  ✓ Setup complete!"
echo "════════════════════════════════════════"
echo ""
echo "  App running at: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_IP')"
if [ -n "$DOMAIN" ]; then
  echo "  Secure URL:     https://$DOMAIN"
fi
echo ""
echo "  Important next steps:"
echo "  1. Edit $APP_DIR/backend/.env and add ANTHROPIC_API_KEY"
echo "  2. Run: sudo -u $APP_USER pm2 restart financeme"
echo ""
echo "  Useful commands:"
echo "  pm2 status              — check app status"
echo "  pm2 logs financeme      — view logs"
echo "  pm2 restart financeme   — restart app"
echo "  sqlite3 $APP_DIR/backend/finance.db  — inspect database"
echo ""
