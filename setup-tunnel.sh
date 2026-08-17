# ──────────────────────────────────────────────────────────────────────────
# AnsCloud — Cloudflare Tunnel Setup
#
# Setup tunnel agar AnsCloud di komputer kamu bisa diakses via domain
# https://drive.anangsetya.my.id (atau subdomain lain yang kamu mau)
#
# PRASYARAT:
#   - Akun Cloudflare (gratis, daftar di https://dash.cloudflare.com/sign-up)
#   - Domain sudah ditambahkan ke Cloudflare (anangsetya.my.id)
#   - AnsCloud sudah jalan di http://localhost:3000 (jalankan setup.sh dulu)
# ──────────────────────────────────────────────────────────────────────────

#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   AnsCloud — Cloudflare Tunnel Setup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# 1. Cek cloudflared
echo -e "${GREEN}[1/6] Cek cloudflared...${NC}"
if command -v cloudflared &>/dev/null; then
  echo -e "  ✓ cloudflared sudah terinstall: $(cloudflared --version)"
else
  echo -e "  ✗ cloudflared belum terinstall. Installing..."
  
  OS="unknown"
  ARCH="amd64"
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    ARCH=$(uname -m)
    if [[ "$ARCH" == "x86_64" ]]; then ARCH="amd64"; fi
    if [[ "$ARCH" == "aarch64" ]]; then ARCH="arm64"; fi
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="darwin"
    ARCH=$(uname -m)
    if [[ "$ARCH" == "arm64" ]]; then ARCH="arm64"; else ARCH="amd64"; fi
  fi
  
  if [[ "$OS" == "linux" ]]; then
    # Download binary langsung
    curl -L "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${OS}-${ARCH}" -o /tmp/cloudflared
    sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
    sudo chmod +x /usr/local/bin/cloudflared
  elif [[ "$OS" == "darwin" ]]; then
    brew install cloudflare/cloudflare/cloudflared
  else
    echo -e "${RED}  Silakan install cloudflared manual: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/${NC}"
    exit 1
  fi
  echo -e "  ✓ cloudflared terinstall: $(cloudflared --version)"
fi
echo ""

# 2. Login ke Cloudflare
echo -e "${GREEN}[2/6] Login ke Cloudflare...${NC}"
echo -e "${YELLOW}  Browser akan terbuka untuk login ke akun Cloudflare kamu.${NC}"
echo -e "${YELLOW}  Authorize dengan domain anangsetya.my.id${NC}"
echo ""
read -p "  Tekan Enter untuk lanjut (atau Ctrl+C untuk batal)... "

cloudflared tunnel login
echo ""

# 3. Buat tunnel
echo -e "${GREEN}[3/6] Buat tunnel baru...${NC}"
TUNNEL_NAME="anscloud"
cloudflared tunnel create $TUNNEL_NAME
echo ""

# 4. Setup config
echo -e "${GREEN}[4/6] Setup konfigurasi tunnel...${NC}"
CONFIG_DIR="$HOME/.cloudflared"
mkdir -p $CONFIG_DIR

# Cek credentials file yang baru dibuat
CRED_FILE=$(ls $CONFIG_DIR/*-credentials.json 2>/dev/null | head -1)
if [[ -z "$CRED_FILE" ]]; then
  echo -e "${RED}  Error: credentials file tidak ditemukan. Cek output di atas.${NC}"
  exit 1
fi
CRED_FILE_NAME=$(basename $CRED_FILE)

# Tanya subdomain
read -p "  Subdomain yang diinginkan (default: drive): " SUBDOMAIN
SUBDOMAIN=${SUBDOMAIN:-drive}
DOMAIN="${SUBDOMAIN}.anangsetya.my.id"
echo -e "  Domain AnsCloud: ${GREEN}https://$DOMAIN${NC}"
echo ""

cat > $CONFIG_DIR/config.yml << EOF
tunnel: $TUNNEL_NAME
credentials-file: $CONFIG_DIR/$CRED_FILE_NAME

ingress:
  - hostname: $DOMAIN
    service: http://localhost:3000
  - service: http_status:404
EOF
echo -e "  ✓ Config ditulis ke: $CONFIG_DIR/config.yml"
echo ""

# 5. Setup DNS
echo -e "${GREEN}[5/6] Setup DNS record...${NC}"
cloudflared tunnel route dns $TUNNEL_NAME $DOMAIN
echo -e "  ✓ CNAME record dibuat: $DOMAIN → $TUNNEL_NAME.cfargotunnel.com"
echo ""

# 6. Install sebagai service (auto-start saat boot)
echo -e "${GREEN}[6/6] Install sebagai service...${NC}"
echo -e "${YELLOW}  Ini akan membuat AnsCloud auto-start saat komputer nyala.${NC}"
echo -e "${YELLOW}  Tunnel akan terus berjalan di background.${NC}"
echo ""
read -p "  Install service sekarang? (y/n): " INSTALL_SERVICE
if [[ "$INSTALL_SERVICE" == "y" || "$INSTALL_SERVICE" == "Y" ]]; then
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    sudo cloudflared service install
    sudo systemctl enable cloudflared
    sudo systemctl start cloudflared
    echo -e "  ✓ Service installed (systemd)"
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    sudo cloudflared service install
    echo -e "  ✓ Service installed (launchd)"
  else
    echo -e "${YELLOW}  Untuk Windows, jalankan manual:${NC}"
    echo -e "  cloudflared tunnel run $TUNNEL_NAME"
  fi
else
  echo -e "${YELLOW}  Untuk menjalankan tunnel manual:${NC}"
  echo -e "  cloudflared tunnel run $TUNNEL_NAME"
fi
echo ""

# Update NEXTAUTH_URL di .env
if [[ -f ".env" ]]; then
  echo -e "${YELLOW}  Update NEXTAUTH_URL di .env ke https://$DOMAIN?${NC}"
  read -p "  Update sekarang? (y/n): " UPDATE_ENV
  if [[ "$UPDATE_ENV" == "y" || "$UPDATE_ENV" == "Y" ]]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      # macOS sed butuh -i ''
      sed -i '' "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://$DOMAIN|" .env
    else
      sed -i "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://$DOMAIN|" .env
    fi
    echo -e "  ✓ .env diupdate"
    
    # Restart AnsCloud
    if command -v pm2 &>/dev/null; then
      pm2 restart anscloud
      echo -e "  ✓ AnsCloud di-restart"
    fi
  fi
fi
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Cloudflare Tunnel berhasil di-setup!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "AnsCloud sekarang bisa diakses dari mana saja via:"
echo -e "  ${GREEN}https://$DOMAIN${NC}"
echo ""
echo -e "${YELLOW}Langkah selanjutnya:${NC}"
echo -e "  1. Test di browser: https://$DOMAIN"
echo -e "  2. Login dengan kredensial yang sudah di-set"
echo -e "  3. (Opsional) Setup Google OAuth untuk Google Drive asli:"
echo -e "     - Tambahkan authorized redirect URI di Google Cloud Console:"
echo -e "       https://$DOMAIN/api/auth/google/callback"
echo -e "     - Set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET di .env"
echo -e "     - Restart: pm2 restart anscloud"
echo ""
echo -e "${YELLOW}Command tunnel yang berguna:${NC}"
echo -e "  sudo systemctl status cloudflared   - status service (Linux)"
echo -e "  sudo systemctl restart cloudflared  - restart tunnel (Linux)"
echo -e "  sudo systemctl stop cloudflared      - stop tunnel (Linux)"
echo -e "  cloudflared tunnel list              - lihat semua tunnel"
echo -e "  cloudflared tunnel delete $TUNNEL_NAME  - hapus tunnel"
echo ""
echo -e "${YELLOW}Troubleshooting:${NC}"
echo -e "  - Cek log tunnel: sudo journalctl -u cloudflared -f"
echo -e "  - Cek log AnsCloud: pm2 logs anscloud"
echo -e "  - Test koneksi: curl https://$DOMAIN/api/auth/csrf"
echo ""
