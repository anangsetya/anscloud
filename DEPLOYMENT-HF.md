# ──────────────────────────────────────────────────────────────────────────
# AnsCloud — Deploy ke Hugging Face Spaces (100% Gratis, Tanpa Kartu Kredit)
# ──────────────────────────────────────────────────────────────────────────

## Kenapa Hugging Face Spaces?

- ✅ **Gratis selamanya** tanpa kartu kredit
- ✅ **Always-on** (sleep setelah 48 jam idle, bisa di-trigger dengan cron)
- ✅ **20GB persistent storage** (cukup untuk SQLite + file blobs)
- ✅ Docker support (pakai Dockerfile yang sudah ada)
- ✅ Auto-deploy dari GitHub
- ✅ HTTPS otomatis via `*.hf.space` subdomain
- ✅ Bisa pakai custom domain via Cloudflare CNAME (gratis)

## Limit Free Tier

| Resource | Free Tier | Catatan |
|----------|-----------|--------|
| CPU | 2 vCPU | Cukup untuk pemakaian pribadi |
| RAM | 16GB | Next.js + Prisma + SQLite |
| Storage | 20GB persistent | SQLite + file blobs (cukup untuk demo + banyak file) |
| Sleep | Setelah 48 jam idle | Cold start ~1-2 menit; bisa di-trigger dengan cron |
| Egress | Tidak dibatasi | Bandwidth gratis selamanya |

---

## Langkah-Langkah Deploy

### 1. Push Code ke GitHub

```bash
cd /path/to/anscloud
git init
git add .
git commit -m "AnsCloud initial commit"
git branch -M main

# Bikin repo di GitHub (PUBLIC, gratis tanpa kartu)
# Lalu push:
git remote add origin https://github.com/USERNAME/anscloud.git
git push -u origin main
```

**Catatan**: Repo harus PUBLIC untuk Hugging Face Spaces free. Kalau mau private, butuh GitHub Pro ($4/bulan) atau pakai akun GitHub baru khusus deploy (recommended kalau ada secrets di code).

### 2. Setup Secrets di GitHub Repo (PENTING!)

Karena repo public, **JANGAN** commit file `.env`. Pakai GitHub Secrets + GitHub Actions untuk inject env vars saat deploy.

Atau alternatifnya: set env vars langsung di Hugging Face Spaces settings (lebih simple).

### 3. Daftar Hugging Face (Gratis, Tanpa Kartu)

1. Buka https://huggingface.co/join
2. Signup dengan email atau GitHub
3. **Verifikasi email** (wajib sebelum bisa create Space)

### 4. Buat Space Baru

1. Buka https://huggingface.co/new-space
2. Isi:
   - **Space name**: `anscloud`
   - **License**: MIT (atau pilih yang sesuai)
   - **SDK**: **Docker** ← penting!
   - **Visibility**: Public (gratis) atau Private (butuh PRO $9/bulan)
   - **Hardware**: **CPU basic (free)**
3. Klik **Create Space**

### 5. Upload Code ke Space

Ada 2 cara:

#### Cara A: Upload via Git (Recommended)

```bash
# Clone Space repo ke lokal
git clone https://huggingface.co/spaces/USERNAME/anscloud
cd anscloud

# Copy semua file AnsCloud ke sini (kecuali .git, node_modules, .next)
cp -r /path/to/anscloud/* .
cp -r /path/to/anscloud/.* . 2>/dev/null || true

# Pastikan ada Dockerfile dan README.md (yang udah aku siapkan)
# README.md punya config: sdk: docker, app_port: 7860

# Commit & push
git add .
git commit -m "Initial AnsCloud deploy"
git push
```

#### Cara B: Upload via Web UI

1. Buka Space kamu di Hugging Face
2. Tab **Files** → **Add file** → upload files satu-satu
3. Pastikan `Dockerfile` (rename dari `Dockerfile.hf`) & `README.md` ter-upload

### 6. Set Environment Variables di Hugging Face

Setelah code ter-upload, set env vars di Space settings:

1. Buka Space kamu → tab **Settings**
2. Scroll ke **Variables and secrets**
3. Tambah variables (key-value pairs):

| Key | Value |
|-----|-------|
| `DATABASE_URL` | `file:/data/db/custom.db` |
| `ANSCLOUD_LOGIN_EMAIL` | `email@anangsetya.my.id` |
| `ANSCLOUD_LOGIN_PASSWORD_HASH` | `\$2b\$12\$abc...xyz` (escape `$` jadi `\$`!) |
| `NEXTAUTH_SECRET` | generate 64-char hex string |
| `NEXTAUTH_URL` | `https://USERNAME-anscloud.hf.space` (update setelah build pertama selesai) |

**Generate NEXTAUTH_SECRET** (di lokal):
```bash
openssl rand -hex 32
# atau: bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Generate password hash** (di lokal):
```bash
bun -e "import bcrypt from 'bcryptjs'; console.log(bcrypt.hashSync('PASSWORD_KAMU', 12))"
# Output: $2b$12$abc...xyz
# ESCAPE setiap $ jadi \$: \$2b\$12\$abc...xyz
```

### 7. Build & Deploy Pertama

Hugging Face otomatis build saat code di-push. Build pertama butuh ~5-15 menit.

Cek status:
1. Buka Space kamu di https://huggingface.co/spaces/USERNAME/anscloud
2. Tab **Logs** → lihat build progress
3. Setelah status jadi **Running**, aplikasi siap diakses

Akses di: `https://USERNAME-anscloud.hf.space`

### 8. Update NEXTAUTH_URL

Setelah build pertama, update env var:
1. Settings → Variables and secrets
2. Edit `NEXTAUTH_URL` → `https://USERNAME-anscloud.hf.space`
3. Restart Space: Settings → **Factory reboot** atau **Restart this Space**

### 9. Setup Custom Domain via Cloudflare (Gratis)

Karena kamu punya domain `anangsetya.my.id`:

1. **Cloudflare Dashboard** → pilih domain `anangsetya.my.id`
2. **DNS → Records** → Add record:
   - Type: **CNAME**
   - Name: `drive` (atau `anscloud` atau subdomain lain)
   - Target: `USERNAME-anscloud.hf.space`
   - Proxy status: **DNS only** (grey cloud) — Hugging Face punya HTTPS sendiri
3. Save

Tunggu ~5 menit untuk propagasi DNS, lalu:
- Update `NEXTAUTH_URL` di Hugging Face → `https://drive.anangsetya.my.id`
- Restart Space

### 10. Setup Google OAuth (Opsional)

Untuk connect akun Google Drive asli:

1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web app)
2. Authorized redirect URI:
   ```
   https://drive.anangsetya.my.id/api/auth/google/callback
   ```
3. Set env vars di Hugging Face:
   - `GOOGLE_CLIENT_ID` = `xxxxx.apps.googleusercontent.com`
   - `GOOGLE_CLIENT_SECRET` = `xxxxx`
   - `ANSCLOUD_PUBLIC_URL` = `https://drive.anangsetya.my.id`
4. Restart Space

---

## Mencegah Sleep (Keep-Alive)

Hugging Face Spaces free tier sleep setelah 48 jam idle. Untuk mencegah, pakai cron job ping:

### Cara 1: Cron-job.org (Gratis, Tanpa Kartu)

1. Daftar di https://cron-job.org (gratis)
2. Create cron job:
   - URL: `https://drive.anangsetya.my.id/api/auth/csrf`
   - Schedule: **Every 10 minutes**
   - Save

### Cara 2: UptimeRobot (Gratis, Tanpa Kartu)

1. Daftar di https://uptimerobot.com (gratis, no card)
2. Add new monitor:
   - Monitor type: HTTP(s)
   - URL: `https://USERNAME-anscloud.hf.space/api/auth/csrf`
   - Monitoring interval: **5 minutes**
   - Save

Dengan ping setiap 5-10 menit, Space tidak akan sleep dan selalu siap diakses.

---

## Update Aplikasi

Setiap kali ada perubahan code:

```bash
# Di lokal
git add .
git commit -m "Update fitur X"
git push origin main
```

Atau kalau pakai cara Hugging Face git:

```bash
cd /path/to/hf-space-repo
# (copy file baru ke sini)
git add .
git commit -m "Update AnsCloud"
git push
```

Hugging Face otomatis rebuild & redeploy (~5-10 menit).

---

## Backup Database

```bash
# SSH ke Hugging Face Space (butuh HF token, gratis)
# Setup: https://huggingface.co/settings/tokens → Create new token (read permission)

# Download SQLite DB via Hugging Face API
curl -L \
  -H "Authorization: Bearer YOUR_HF_TOKEN" \
  "https://huggingface.co/spaces/USERNAME/anscloud/resolve/main/data/db/custom.db" \
  -o backup-$(date +%Y%m%d).db
```

Atau pakai script Python:
```python
from huggingface_hub import hf_hub_download
hf_hub_download(
  repo_id="USERNAME/anscloud",
  repo_type="space",
  filename="data/db/custom.db",
  token="YOUR_HF_TOKEN"
)
```

---

## Troubleshooting

### Build gagal dengan "out of memory"

Hugging Face free punya 16GB RAM, seharusnya cukup. Kalau OOM:
- Cek Dockerfile, pastikan tidak ada proses yang makan banyak memori saat build
- Kurangi jumlah dependencies kalau perlu

### App crash setelah deploy

Cek logs di tab **Logs** Space. Penyebab umum:
- Env vars belum di-set → cek Settings → Variables and secrets
- Database belum ter-init → tambahin `RUN bun run db:push` di Dockerfile (sudah ada)

### Login gagal ("Email atau password salah")

Penyebab umum: bcrypt hash terpotong karena `$` tidak di-escape.

Solusi:
- Cek env var di Hugging Face Settings
- Hash harus escaped: `\$2b\$12\$abc...xyz` (setiap `$` jadi `\$`)
- Re-set via Settings → Variables and secrets

### App sleep / tidak bisa diakses

- Cek apakah sudah setup cron-job.org / UptimeRobot ping
- Atau manual wakeup: buka URL di browser, tunggu 1-2 menit

### Google OAuth redirect error

- Cek `ANSCLOUD_PUBLIC_URL` di Settings → harus persis sama dengan URL publik
- Cek authorized redirect URI di Google Cloud Console

---

## Estimasi Biaya: Rp 0 / Bulan ✅

| Item | Biaya |
|------|-------|
| Hosting (Hugging Face Spaces) | $0 (free tier) |
| Storage (20GB persistent) | $0 (free) |
| Bandwidth (unlimited) | $0 (free) |
| Domain (anangsetya.my.id) | ~$10/tahun (sudah punya) |
| Cloudflare (DNS + CNAME) | $0 (free plan) |
| Cron-job.org / UptimeRobot (keep-alive) | $0 (free) |
| Google Drive OAuth | $0 (free) |

**Total: Rp 0 / bulan** selamanya (selain biaya domain yang sudah kamu punya)

---

## Alternatif: Koyeb + Cloudflare R2

Kalau Hugging Face Spaces tidak cocok (misal mau codebase private), alternatif lain:

1. **Koyeb** (https://koyeb.com) — free 1 nano instance, no credit card, always-on
2. **Cloudflare R2** (10GB free, no credit card) — untuk file blobs
3. **Neon Postgres** (0.5GB free, no credit card) — untuk database

Setup lebih ribet (perlu refactor codebase ~2-3 jam), tapi:
- Codebase bisa private (GitHub private repo free)
- Storage 10GB+ via R2
- Database 0.5GB via Neon (lebih robust dari SQLite untuk multi-user)

Mau aku bikinin tutorial Koyeb juga? Bilang aja kalau perlu.

---

## Checklist Final

- [ ] Repo GitHub berisi code AnsCloud (public)
- [ ] Akun Hugging Face (verifikasi email)
- [ ] Space baru dengan SDK: Docker
- [ ] Code ter-upload ke Space (via git atau web UI)
- [ ] Env vars di-set di Settings (password hash escaped!)
- [ ] Build pertama sukses (status: Running)
- [ ] Akses `https://USERNAME-anscloud.hf.space` → halaman login muncul
- [ ] Login dengan kredensial → redirect ke dashboard
- [ ] (Opsional) Custom domain via Cloudflare CNAME → `drive.anangsetya.my.id`
- [ ] (Opsional) Cron-job.org / UptimeRobot setup (keep-alive)
- [ ] (Opsional) Google OAuth configured → tombol "Hubungkan Google Asli" aktif

**Selamat! AnsCloud Anda sudah live, gratis selamanya, tanpa kartu kredit.** 🎉
