# Panduan Deployment AnsCloud

Dokumen ini menjelaskan langkah demi langkah cara deploy AnsCloud ke VPS dengan Docker + Cloudflare (HTTPS gratis + DDoS protection).

## Daftar Isi

1. [Prasyarat](#1-prasyarat)
2. [Setup Google OAuth (Opsional)](#2-setup-google-oauth-opsional)
3. [Deploy dengan Docker](#3-deploy-dengan-docker)
4. [Setup Cloudflare DNS + HTTPS](#4-setup-cloudflare-dns--https)
5. [Alternatif: Cloudflare Tunnel (tanpa expose port)](#5-alternatif-cloudflare-tunnel-tanpa-expose-port)
6. [Backup & Restore](#6-backup--restore)
7. [Update ke Versi Baru](#7-update-ke-versi-baru)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prasyarat

Yang Anda butuhkan:

| Item | Biaya | Catatan |
|------|-------|--------|
| **VPS** (Ubuntu 22.04+, 1GB RAM minimum) | ~$4-6/bulan | Hetzner, DigitalOcean, Vultr, Contabo |
| **Domain** (contoh: `ansari.com`) | ~$10/tahun | Namecheap, Cloudflare Registrar |
| **Cloudflare account** (free plan cukup) | $0 | Untuk DNS + HTTPS + DDoS protection |
| **Google Cloud Console** (opsional) | $0 | Hanya jika ingin Google Drive asli |

Software yang harus terinstall di VPS:
- Docker Engine 24+
- Docker Compose v2
- Git

Instalasi cepat:
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Re-login agar group docker aktif
exit
# SSH lagi ke server, lalu verify:
docker --version
docker compose version
```

---

## 2. Setup Google OAuth (Opsional)

**Lewati langkah ini jika Anda masih pakai mode demo** (file di server lokal AnsCloud).

Untuk menghubungkan akun Google Drive asli:

### 2.1 Buat project di Google Cloud Console
1. Buka https://console.cloud.google.com/
2. Klik **Select a project → New Project** → isi nama `AnsCloud` → Create
3. Pilih project yang baru dibuat

### 2.2 Enable Google Drive API
1. Menu **APIs & Services → Library**
2. Cari **Google Drive API** → klik → **Enable**
3. Cari **Google Picker API** → klik → **Enable** (opsional, untuk file picker UI)

### 2.3 Configure OAuth consent screen
1. Menu **APIs & Services → OAuth consent screen**
2. User type: **External** → Create
3. Isi form:
   - App name: `AnsCloud`
   - User support email: email Anda
   - Developer contact: email Anda
4. Klik **Save and Continue** sampai selesai
5. Pada tab **Scopes** → Add scope:
   - `https://www.googleapis.com/auth/drive` (full access)
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
6. Klik **Save and Continue**
7. Pada tab **Test users** → Add user → masukkan email Google Anda → Save

> **Catatan**: Untuk production (akses publik), Anda perlu submit app untuk verification
> Google. Untuk pemakaian pribadi dengan test users, cukup pakai status "Testing".

### 2.4 Buat OAuth 2.0 Client ID
1. Menu **APIs & Services → Credentials**
2. **Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: `AnsCloud Production`
5. **Authorized redirect URIs** → Add URI:
   - `https://drive.domainkamu.com/api/auth/google/callback`
   - (Untuk dev lokal: `http://localhost:3000/api/auth/google/callback`)
6. **Create** → copy **Client ID** dan **Client Secret**

---

## 3. Deploy dengan Docker

### 3.1 Clone repo ke VPS

```bash
ssh user@your-vps-ip
git clone https://github.com/username/anscloud.git /opt/anscloud
cd /opt/anscloud
```

Atau jika belum di-push ke GitHub, upload via SCP:
```bash
# Di lokal:
scp -r ./anscloud user@your-vps-ip:/opt/anscloud
```

### 3.2 Setup environment variables

```bash
cd /opt/anscloud
cp .env.example .env
nano .env
```

Isi `.env` dengan nilai yang sesuai:

```bash
# Database (gunakan path di dalam container)
DATABASE_URL=file:/app/db/custom.db

# ─── Login Credentials ─────────────────────────────────
ANSCLOUD_LOGIN_EMAIL=info@anangsetya.my.id

# Generate hash password baru (ganti 'YOUR_PASSWORD' dengan password Anda):
#   Di lokal (atau di VPS): bun -e "import bcrypt from 'bcryptjs'; console.log(bcrypt.hashSync('YOUR_PASSWORD', 12))"
# Output: $2b$12$abc...xyz
# ESCAPE setiap '$' menjadi '\$' di .env:
ANSCLOUD_LOGIN_PASSWORD_HASH="\$2b\$12\$abc...xyz"

# ─── NextAuth ──────────────────────────────────────────
# Generate secret:
#   bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
NEXTAUTH_SECRET=your_generated_64_char_hex_string

# URL publik AnsCloud
NEXTAUTH_URL=https://drive.domainkamu.com

# ─── Google OAuth (opsional) ──────────────────────────
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
ANSCLOUD_PUBLIC_URL=https://drive.domainkamu.com
```

> **PENTING**: Setiap `$` di bcrypt hash **WAJIB** di-escape sebagai `\$`, kalau tidak
> dotenv akan memotong string-nya dan login akan gagal.

### 3.3 Buat persistent directories

```bash
mkdir -p data/db data/storage
```

### 3.4 Build & start container

```bash
docker compose up -d --build
```

Build pertama kali butuh ~5-10 menit. Setelah selesai, cek status:

```bash
docker compose ps
docker compose logs -f anscloud
```

Anda akan melihat log seperti:
```
✓ Ready in 1840ms
○ Compiling /login ...
 GET /login 200
```

Test dari VPS:
```bash
curl -I http://localhost:3000/login
# HTTP/2 200
```

AnsCloud sudah jalan! Sekarang setup Cloudflare untuk HTTPS.

---

## 4. Setup Cloudflare DNS + HTTPS

### 4.1 Tambah domain ke Cloudflare

1. Buka https://dash.cloudflare.com → **Add a Site**
2. Masukkan domain Anda (contoh: `ansari.com`)
3. Pilih plan **Free** → Continue
4. Cloudflare akan memberi 2 nameserver:
   ```
   xxx.ns.cloudflare.com
   yyy.ns.cloudflare.com
   ```
5. Login ke registrar domain Anda (Namecheap, Niagahoster, dll) → ubah nameserver ke yang Cloudflare beri
6. Tunggu 1-24 jam untuk propagasi DNS (cek status di dashboard Cloudflare)

### 4.2 Buat DNS A record untuk subdomain

1. Di Cloudflare → pilih domain → tab **DNS → Records**
2. **Add record**:
   - Type: **A**
   - Name: `drive` (akan jadi `drive.domainkamu.com`)
   - IPv4 address: IP VPS Anda (contoh: `188.34.52.10`)
   - Proxy status: **Proxied** (orange cloud) ← PENTING untuk HTTPS
   - TTL: **Auto**
3. **Save**

### 4.3 Aktifkan HTTPS

Cloudflare otomatis issue SSL certificate gratis untuk subdomain yang di-proxied.

1. Tab **SSL/TLS → Overview** → pilih mode **Flexible** atau **Full**
2. Tab **SSL/TLS → Edge Certificates**:
   - **Always Use HTTPS**: ON
   - **HTTP Strict Transport Security (HSTS)**: ON (opsional, hati-hati)
   - **Automatic HTTPS Rewrites**: ON

Tunggu 1-5 menit, lalu test:
```bash
curl -I https://drive.domainkamu.com/login
# HTTP/2 200
```

Buka di browser: `https://drive.domainkamu.com` → halaman login AnsCloud muncul.

### 4.4 (Opsional) Setting upload limit Cloudflare

Cloudflare free plan membatasi upload body hingga **100 MB** per request. Untuk file lebih besar:

**Opsi A**: Upgrade Cloudflare Pro ($20/bulan) → limit naik ke 500 MB

**Opsi B**: Bypass Cloudflare untuk endpoint upload:
- Buat subdomain kedua: `upload.domainkamu.com` (DNS only, grey cloud)
- Update API endpoint upload di code untuk pakai subdomain tersebut
- Lebih kompleks, tidak recommended untuk awam

**Opsi C**: Pakai chunked upload (split file di client sebelum upload) — butuh perubahan code

Untuk pemakaian awal (file <100 MB), free plan Cloudflare cukup.

---

## 5. Alternatif: Cloudflare Tunnel (Tanpa Expose Port)

Cloudflare Tunnel lebih aman: VPS Anda tidak perlu expose port 80/443 ke publik. Tunnel menghubungkan container AnsCloud ke Cloudflare via koneksi outbound.

### 5.1 Install cloudflared di VPS

```bash
# Tambah repo Cloudflare
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update
sudo apt install -y cloudflared
```

### 5.2 Login & buat tunnel

```bash
cloudflared tunnel login
# Browser akan terbuka → pilih domain Anda → Authorize

cloudflared tunnel create anscloud
# Output: Created tunnel anscloud with id xxx-xxx-xxx
```

### 5.3 Configure tunnel

```bash
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<EOF
tunnel: anscloud
credentials-file: /root/.cloudflared/xxx-xxx-xxx.json

ingress:
  - hostname: drive.domainkamu.com
    service: http://localhost:3000
  - service: http_status:404
EOF
```

### 5.4 Setup DNS otomatis

```bash
cloudflared tunnel route dns anscloud drive.domainkamu.com
```

Ini akan membuat CNAME record `drive.domainkamu.com` → `xxx-xxx.cfargotunnel.com` secara otomatis.

### 5.5 Jalankan tunnel sebagai service

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
sudo systemctl status cloudflared
```

Sekarang VPS firewall bisa blok semua inbound (kecuali SSH):
```bash
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw enable
```

Akses `https://drive.domainkamu.com` → tetap jalan karena tunnel menggunakan koneksi outbound.

---

## 6. Backup & Restore

Data AnsCloud ada di 2 tempat:

| Path | Isi |
|------|-----|
| `data/db/custom.db` | SQLite database (semua metadata: accounts, files, folders, activity log) |
| `data/storage/` | File fisik untuk akun demo (provider=local). File akun Google Asli ada di Drive user, tidak perlu di-backup. |

### 6.1 Backup manual

```bash
cd /opt/anscloud
tar -czf /backup/anscloud-$(date +%Y%m%d-%H%M%S).tar.gz data/
ls -lh /backup/
```

### 6.2 Backup otomatis dengan cron

```bash
sudo crontab -e
```

Tambah baris ini (backup setiap hari jam 3 pagi, simpan 30 hari):
```
0 3 * * * tar -czf /backup/anscloud-$(date +\%Y\%m\%d).tar.gz -C /opt/anscloud data/ && find /backup -name "anscloud-*.tar.gz" -mtime +30 -delete
```

### 6.3 Backup ke Backblaze B2 / S3 (opsional)

Untuk off-site backup, install `rclone` dan configure remote:

```bash
sudo apt install rclone
rclone config  # ikuti wizard, pilih Backblaze B2 atau S3
```

Tambah ke crontab:
```
0 4 * * * rclone sync /opt/anscloud/data remote:anscloud-backup/$(date +\%Y\%m\%d)
```

### 6.4 Restore

```bash
cd /opt/anscloud
docker compose stop
tar -xzf /backup/anscloud-20260115-030000.tar.gz -C .
docker compose up -d
```

---

## 7. Update ke Versi Baru

```bash
cd /opt/anscloud
git pull origin main

# Backup dulu sebelum update (recommended)
tar -czf /backup/anscloud-pre-update-$(date +%Y%m%d-%H%M%S).tar.gz data/

# Rebuild & restart
docker compose up -d --build

# Cek log untuk pastikan tidak ada error
docker compose logs -f anscloud
```

Jika ada masalah, rollback:
```bash
git checkout <previous-commit-hash>
docker compose up -d --build
```

---

## 8. Troubleshooting

### Login gagal ("Email atau password salah")

**Penyebab paling umum**: bcrypt hash di `.env` terpotong karena karakter `$` tidak di-escape.

**Solusi**:
```bash
# Cek panjang hash di env
docker compose exec anscloud sh -c 'echo $ANSCLOUD_LOGIN_PASSWORD_HASH | wc -c'
# Harus 61 (60 hash + 1 newline). Kalau 46 atau kurang → hash terpotong.

# Generate hash baru & escape dengan benar:
bun -e "import bcrypt from 'bcryptjs'; console.log(bcrypt.hashSync('@13Sept1990', 12))"
# Output: $2b$12$abc...xyz

# Di .env, escape setiap $ menjadi \$:
ANSCLOUD_LOGIN_PASSWORD_HASH="\$2b\$12\$abc...xyz"

# Restart container:
docker compose up -d
```

### File upload gagal dengan error "Request body too large"

**Penyebab**: Cloudflare free plan membatasi body hingga 100 MB.

**Solusi**:
- Opsi 1: Upload file <100 MB (sebagian besar file sehari-hari)
- Opsi 2: Upgrade Cloudflare Pro ($20/bulan)
- Opsi 3: Pakai Cloudflare Tunnel (opsi 5 di atas) — limit berbeda
- Opsi 4: Disable Cloudflare proxy untuk subdomain upload (DNS only, grey cloud)

### Google OAuth redirect error "redirect_uri_mismatch"

**Penyebab**: URL redirect yang terdaftar di Google Cloud Console tidak cocok dengan yang dipakai AnsCloud.

**Solusi**:
1. Cek `ANSCLOUD_PUBLIC_URL` di `.env` — harus persis sama dengan URL publik Anda (https://drive.domainkamu.com, tanpa trailing slash)
2. Di Google Cloud Console → Credentials → OAuth Client → Authorized redirect URIs → tambah:
   `https://drive.domainkamu.com/api/auth/google/callback`
3. Restart container: `docker compose up -d`

### Database migration error setelah update

```bash
# Force re-push schema
docker compose exec anscloud bunx prisma db push --accept-data-loss
docker compose restart
```

### Container tidak mau start

```bash
# Lihat log lengkap
docker compose logs anscloud

# Cek apakah port 3000 sudah dipakai
sudo lsof -i :3000

# Cek disk space
df -h

# Cek memory
free -m
```

### Cloudflare tunnel putus

```bash
sudo systemctl status cloudflared
sudo systemctl restart cloudflared
```

---

## Checklist Deployment Final

- [ ] VPS dengan Docker terinstall
- [ ] Domain diatur ke Cloudflare nameservers
- [ ] DNS A record `drive` → IP VPS (Proxied)
- [ ] `.env` sudah diisi dengan benar (khususnya hash password dengan `$` escaped)
- [ ] `NEXTAUTH_URL` dan `ANSCLOUD_PUBLIC_URL` di-set ke URL publik HTTPS
- [ ] `docker compose up -d --build` berhasil
- [ ] `curl http://localhost:3000/login` di VPS return 200
- [ ] Buka `https://drive.domainkamu.com` di browser → halaman login muncul
- [ ] Login dengan kredensial → redirect ke dashboard
- [ ] (Opsional) Google OAuth configured → tombol "Hubungkan Google Asli" aktif
- [ ] (Opsional) Cron backup harian sudah setup

**Total biaya per bulan**: ~$5-7 (VPS) + $0 (Cloudflare) + $0.83 (domain amortized) = **sekitar $6-8/bulan**

---

## Struktur File Deployment

```
/opt/anscloud/
├── .env                    # Environment variables (KEEP SECRET, jangan commit)
├── .env.example            # Template (commit ke git, copy ke .env saat deploy)
├── Dockerfile              # Multi-stage build
├── docker-compose.yml      # Service definition
├── .dockerignore           # Exclude files dari build context
├── data/
│   ├── db/
│   │   └── custom.db       # SQLite database (persistent volume)
│   └── storage/
│       └── {accountId}/    # File blobs untuk akun demo (persistent volume)
└── ... (source code)
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | SQLite path, default `file:/app/db/custom.db` |
| `ANSCLOUD_LOGIN_EMAIL` | ✅ | Email untuk login |
| `ANSCLOUD_LOGIN_PASSWORD_HASH` | ✅ | bcrypt hash password (escape `$` jadi `\$`) |
| `NEXTAUTH_SECRET` | ✅ | Random 64-char hex string |
| `NEXTAUTH_URL` | ✅ | Public URL (https://drive.domainkamu.com) |
| `GOOGLE_CLIENT_ID` | ❌ | OAuth Client ID dari Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | ❌ | OAuth Client Secret |
| `ANSCLOUD_PUBLIC_URL` | ❌ | Override untuk OAuth redirect URI (default = NEXTAUTH_URL) |

---

**Selamat! AnsCloud Anda sudah live di internet dengan HTTPS gratis.** 🎉

Jika ada masalah, cek [Troubleshooting](#8-troubleshooting) di atas atau open issue di repo GitHub.
