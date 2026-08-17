# ──────────────────────────────────────────────────────────────────────────
# AnsCloud — Deploy ke Fly.io (100% Gratis Selamanya)
# ──────────────────────────────────────────────────────────────────────────

Fly.io free tier mencakup:
- 1 VM shared-cpu-1x dengan 256MB RAM
- 3GB persistent volume storage
- 160GB outbound bandwidth per bulan
- HTTPS otomatis via `*.fly.dev` subdomain

Cocok untuk pemakaian pribadi. Untuk file besar (>3GB), hubungkan akun Google Drive asli via OAuth — file disimpan di Drive user, bukan di volume Fly.io.

## Langkah-Langkah Deploy

### 1. Install flyctl CLI

```bash
# macOS
brew install flyctl

# Linux (script)
curl -L https://fly.io/install.sh | sh
# Tambah ke PATH:
export PATH="$HOME/.fly/bin:$PATH"  # tambahkan ke ~/.bashrc atau ~/.zshrc

# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex
```

Verifikasi:
```bash
flyctl version
```

### 2. Signup & Login ke Fly.io

```bash
flyctl auth signup
```

- Pilih "Try Fly.io for free"
- Login dengan GitHub atau email
- **Verifikasi kartu kredit** — Fly.io butuh kartu untuk verifikasi (anti-abuse), tapi **tidak akan dicharge** selama pemakaian masih di free tier.
- Setelah verifikasi, kembali ke terminal:

```bash
flyctl auth login
```

### 3. Push Code ke GitHub

Di komputer lokal:

```bash
cd /path/to/anscloud
git init
git add .
git commit -m "AnsCloud initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/anscloud.git
git push -u origin main
```

### 4. Clone ke tempat yang punya flyctl (kalau deploy dari server lain)

Skip kalau deploy langsung dari komputer lokal.

### 5. Setup Environment Variables

Edit `.env` (atau buat `.env.production`):

```bash
cp .env.example .env
nano .env
```

Isi dengan:

```env
DATABASE_URL=file:/app/data/db/custom.db

# Login credentials
ANSCLOUD_LOGIN_EMAIL=email-kamu@gmail.com
# Generate hash: bun -e "import bcrypt from 'bcryptjs'; console.log(bcrypt.hashSync('PASSWORD_KAMU', 12))"
# ESCAPE setiap $ jadi \$ !
ANSCLOUD_LOGIN_PASSWORD_HASH="\$2b\$12\$abc...xyz"

# NextAuth
# Generate: bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
NEXTAUTH_SECRET=64-char-hex-string-kamu
NEXTAUTH_URL=https://anscloud-USERNAME.fly.dev

# Google OAuth (opsional — untuk Google Drive asli)
# GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=xxxxx
# ANSCLOUD_PUBLIC_URL=https://anscloud-USERNAME.fly.dev
```

**PENTING**: Setiap `$` di bcrypt hash **WAJIB** di-escape sebagai `\$`.

### 6. Deploy ke Fly.io

Dari direktori project (yang berisi `fly.toml`):

```bash
# Buat aplikasi baru di Fly.io (interaktif — akan tanya nama region, dll)
flyctl launch --no-deploy
```

- Pilih nama app yang unik (e.g., `anscloud-anang`)
- Pilih region terdekat (e.g., `sin` untuk Singapore)
- Jangan deploy dulu — kita akan set env vars dulu

Set secrets di Fly.io (lebih aman daripada `.env` file):

```bash
flyctl secrets set ANSCLOUD_LOGIN_EMAIL="email-kamu@gmail.com"
flyctl secrets set ANSCLOUD_LOGIN_PASSWORD_HASH='\$2b\$12\$abc...xyz'
flyctl secrets set NEXTAUTH_SECRET="64-char-hex-string-kamu"
flyctl secrets set NEXTAUTH_URL="https://anscloud-USERNAME.fly.dev"

# Opsional (Google OAuth):
flyctl secrets set GOOGLE_CLIENT_ID="xxxxx"
flyctl secrets set GOOGLE_CLIENT_SECRET="xxxxx"
flyctl secrets set ANSCLOUD_PUBLIC_URL="https://anscloud-USERNAME.fly.dev"
```

### 7. Buat Persistent Volume

```bash
# 3GB volume (free tier max)
flyctl volumes create anscloud_data --size 3 --region sin
```

Ganti `sin` dengan region yang sama saat launch.

### 8. Deploy Pertama Kali

```bash
flyctl deploy
```

Build akan jalan ~5-10 menit. Setelah selesai, cek status:

```bash
flyctl status
flyctl logs
```

Akses: `https://anscloud-USERNAME.fly.dev`

### 9. Setup Google OAuth (Opsional)

Kalau mau hubungkan Google Drive asli:

1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web app)
2. Authorized redirect URI:
   ```
   https://anscloud-USERNAME.fly.dev/api/auth/google/callback
   ```
3. Set secrets (kalau belum):
   ```bash
   flyctl secrets set GOOGLE_CLIENT_ID="xxxxx.apps.googleusercontent.com"
   flyctl secrets set GOOGLE_CLIENT_SECRET="xxxxx"
   flyctl secrets set ANSCLOUD_PUBLIC_URL="https://anscloud-USERNAME.fly.dev"
   ```
4. Restart app:
   ```bash
   flyctl apps restart anscloud-USERNAME
   ```

### 10. Setup Custom Domain (Opsional, Gratis via Cloudflare)

Kalau punya domain sendiri:

1. **Cloudflare** → DNS → Add CNAME record:
   - Name: `drive` (atau `anscloud`)
   - Target: `anscloud-USERNAME.fly.dev`
   - Proxied: NO (DNS only — grey cloud) karena Fly.io punya HTTPS sendiri
2. **Fly.io Dashboard** → Pilih app → Certificates → Add certificate
   - Masukkan `drive.domainkamu.com`
   - Fly.io akan issue Let's Encrypt cert gratis
3. Update `NEXTAUTH_URL`:
   ```bash
   flyctl secrets set NEXTAUTH_URL="https://drive.domainkamu.com"
   flyctl secrets set ANSCLOUD_PUBLIC_URL="https://drive.domainkamu.com"
   ```
4. Update Google OAuth redirect URI di Google Cloud Console.

---

## Update Aplikasi (Setiap Kali Push Code)

```bash
# Pull changes
git pull origin main

# Re-deploy
flyctl deploy
```

Fly.io otomatis akan rebuild image, zero-downtime deploy. Data SQLite & file blobs di volume persistent **tetap aman**.

---

## Backup Database

```bash
# Dump SQLite ke lokal (jalankan di komputer yang login ke Fly.io)
flyctl ssh sftp get /app/data/db/custom.db ./backup-$(date +%Y%m%d).db

# Restore (kalau perlu)
flyctl ssh sftp put ./backup-20260115.db /app/data/db/custom.db
```

Atau pakai `flyctl ssh console`:
```bash
flyctl ssh console
# Di dalam container:
cp /app/data/db/custom.db /app/data/db/backup-$(date +%Y%m%d).db
```

**Untuk backup otomatis**, pakai GitHub Actions:
- Cron harian → dump DB → commit ke branch `backup`
- Atau push ke Backblaze B2 (10GB free)

---

## Monitor Resource Usage

```bash
# Status VM
flyctl status

# Log real-time
flyctl logs -f

# SSH ke container
flyctl ssh console

# Cek disk usage
flyctl ssh console -c "df -h /app/data"
```

---

## Limit Free Tier & Cara Mengatasinya

| Limit | Free Tier | Kalau Habis |
|-------|-----------|------------|
| RAM | 256MB | Restart app otomatis — pakai `auto_start_machines: true` |
| Disk | 3GB | Hubungkan Google Drive asli (file di Drive, bukan di Fly.io) |
| Bandwidth | 160GB/bulan | Untuk pemakaian pribadi cukup |
| Compute hours | 3 shared-cpu VMs × 24/7 = unlimited (kalau 1 VM) | Pakai `auto_stop_machines: true` kalau jarang dipakai |

---

## Troubleshooting

### App crash / OOM (Out of Memory)

```bash
# Cek log
flyctl logs | grep -i "error\|oom"

# Kalau OOM, restart
flyctl apps restart anscloud-USERNAME
```

Solusi: kurangi file besar di demo mode, atau pakai Google Drive asli (file tidak di-load ke memori server).

### Login gagal ("Email atau password salah")

Penyebab umum: bcrypt hash terpotong karena `$` tidak di-escape.

```bash
# Cek panjang hash
flyctl secrets list | grep PASSWORD_HASH

# Re-set dengan escape yang benar:
flyctl secrets set ANSCLOUD_LOGIN_PASSWORD_HASH='\$2b\$12\$abc...xyz'
```

### File tidak bisa diupload

Cek disk space:
```bash
flyctl ssh console -c "df -h /app/data"
```

Kalau hampir penuh, hapus file demo atau pakai Google Drive asli.

### Google OAuth redirect error

```bash
# Cek env var
flyctl secrets list

# Pastikan ANSCLOUD_PUBLIC_URL match dengan URL publik
flyctl secrets set ANSCLOUD_PUBLIC_URL="https://drive.domainkamu.com"
flyctl apps restart
```

---

## Estimasi Biaya: Rp 0 / Bulan ✅

- VPS: $0 (Fly.io free tier)
- Storage: $0 (3GB free)
- Bandwidth: $0 (160GB free, cukup untuk pribadi)
- Domain (opsional): $0 kalau pakai `.fly.dev` subdomain
- Cloudflare (kalau pakai custom domain): $0 (free plan)

**Total: $0 / bulan selamanya** untuk pemakaian pribadi.

Kalau butuh lebih dari 3GB storage atau RAM lebih besar, upgrade ke paid plan mulai ~$2/bulan. Tapi untuk pemakaian pribadi + Google Drive asli, free tier cukup selamanya.

---

## Alternatif: Oracle Cloud Always Free (200GB Storage)

Kalau 3GB Fly.io kurang, pakai Oracle Cloud Always Free:
- 4 ARM VMs (24GB RAM total!) — gratis selamanya
- 200GB block storage — gratis selamanya
- Setup lebih ribet (seperti VPS biasa) — pakai Docker + Cloudflare Tunnel

Tutorial singkat:
1. Daftar Oracle Cloud (https://www.oracle.com/cloud/free/) — butuh kartu verifikasi
2. Create Always Free VM (Ampere A1 — 4 cores, 24GB RAM)
3. SSH ke VM, install Docker, clone repo AnsCloud
4. Setup Cloudflare Tunnel (gratis, HTTPS otomatis, tidak perlu expose port)
5. Domain via Cloudflare free plan

Lebih powerful tapi setup ~1-2 jam. Cocok kalau mau long-term, banyak file, banyak user.

---

## Checklist Final

- [ ] `flyctl` terinstall
- [ ] Akun Fly.io (verifikasi kartu kredit)
- [ ] Repo GitHub berisi code AnsCloud
- [ ] `.env` diisi dengan hash password yang benar (escape `\$`)
- [ ] `NEXTAUTH_SECRET` di-generate (64-char hex)
- [ ] `fly.toml` di-edit (app name & region)
- [ ] `flyctl secrets set` untuk semua env vars
- [ ] `flyctl volumes create anscloud_data --size 3`
- [ ] `flyctl deploy` berhasil
- [ ] Buka `https://anscloud-USERNAME.fly.dev` → halaman login muncul
- [ ] Login dengan kredensial → redirect ke dashboard
- [ ] (Opsional) Google OAuth configured → tombol "Hubungkan Google Asli" aktif
- [ ] (Opsional) Custom domain via Cloudflare

**Selamat! AnsCloud Anda sudah live di internet, gratis selamanya.** 🎉
