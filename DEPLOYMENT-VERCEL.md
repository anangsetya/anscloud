# ──────────────────────────────────────────────────────────────────────────
# AnsCloud — Deploy ke Vercel + Neon + Supabase (100% Gratis, Tanpa Kartu Kredit)
# ──────────────────────────────────────────────────────────────────────────

## Kenapa Kombinasi Ini?

| Layanan | Free Tier | Butuh Kartu? | Always-On? |
|---------|-----------|---------------|------------|
| **Vercel** (hosting Next.js) | 100GB bandwidth/bulan | ❌ Tidak | ✅ Yes (no sleep) |
| **Neon** (PostgreSQL database) | 0.5GB storage | ❌ Tidak | ✅ Yes |
| **Supabase** (file storage) | 500MB storage + 1GB DB | ❌ Tidak | ✅ Yes |
| **Cloudflare** (DNS untuk custom domain) | Free plan | ❌ Tidak | ✅ Yes |
| **GitHub** (repo private) | Unlimited private repos | ❌ Tidak | ✅ Yes |

**Total storage**: 0.5GB database + 500MB file = ~1GB. Cukup untuk pemakaian pribadi kecil. Untuk file besar, hubungkan akun Google Drive asli (file disimpan di Drive user, bukan di Supabase).

**Total biaya**: Rp 0 / bulan selamanya.

---

## Langkah-Langkah Deploy

### 1. Push Code ke GitHub (Private Repo)

```bash
cd /path/to/anscloud
git init
git add .
git commit -m "AnsCloud initial commit"
git branch -M main

# Buat repo PRIVATE di GitHub (gratis, tanpa kartu)
# Lalu push:
git remote add origin https://github.com/USERNAME/anscloud.git
git push -u origin main
```

### 2. Buat Akun Neon (PostgreSQL Database, Gratis)

1. Buka https://neon.tech
2. Klik **Sign Up** → login dengan GitHub atau email
3. **Tidak perlu kartu kredit** — verifikasi email saja
4. **Create new project**:
   - Project name: `anscloud`
   - Database name: `anscloud`
   - Region: pilih yang terdekat (e.g., `ap-southeast-1` Singapore)
5. Setelah project dibuat, klik **Connection Details** → copy **connection string**
6. Simpan connection string (format: `postgresql://user:password@host/dbname?sslmode=require`)

### 3. Buat Akun Supabase (File Storage, Gratis)

1. Buka https://supabase.com
2. Klik **Start your project** → login dengan GitHub
3. **Tidak perlu kartu kredit** — verifikasi email saja
4. **New Project**:
   - Name: `anscloud`
   - Database Password: bikin password kuat (catat! akan dipakai untuk DB Supabase)
   - Region: pilih yang terdekat (e.g., `Southeast Asia (Singapore)`)
   - Plan: **Free**
5. Tunggu ~2 menit sampai project selesai dibuat
6. Masuk ke project → **Settings** → **API**:
   - Copy **Project URL** (format: `https://xxxxx.supabase.co`)
   - Copy **service_role secret key** (PENTING: yang service_role, BUKAN anon!)
7. Buat Storage Bucket:
   - Tab **Storage** → **New bucket**
   - Name: `anscloud-files`
   - Public: **NO** (private — files hanya bisa diakses via server-side API)
   - File size limit: 100MB (default, sesuai free tier Supabase)
   - Click **Save**

### 4. Buat Akun Vercel (Hosting, Gratis)

1. Buka https://vercel.com
2. Klik **Sign Up** → **Continue with GitHub**
3. **Tidak perlu kartu kredit** — verifikasi email saja
4. Authorize Vercel untuk akses repo GitHub kamu
5. **Add New...** → **Project**
6. **Import** repo `anscloud` kamu
7. **Configure Project**:
   - Framework Preset: **Next.js** (auto-detected)
   - Build Command: default (`bun run build`)
   - Output Directory: default (`.next`)
8. **Environment Variables** — klik **Add** untuk setiap variable:

| Name | Value |
|------|-------|
| `DATABASE_URL` | `postgresql://...` (dari Neon, langkah 2) |
| `ANSCLOUD_LOGIN_EMAIL` | `info@anangsetya.my.id` (atau email kamu) |
| `ANSCLOUD_LOGIN_PASSWORD_HASH` | `\$2b\$12\$abc...xyz` (escape `$` jadi `\$`!) |
| `NEXTAUTH_SECRET` | generate: `openssl rand -hex 32` |
| `NEXTAUTH_URL` | `https://anscloud-USERNAME.vercel.app` (setelah deploy pertama, update ke custom domain) |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` (dari Supabase, langkah 3) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key dari Supabase (PENTING: bukan anon key) |

**Generate bcrypt password hash** (di terminal lokal):
```bash
bun -e "import bcrypt from 'bcryptjs'; console.log(bcrypt.hashSync('PASSWORD_KAMU', 12))"
# Output: $2b$12$abc...xyz
# ESCAPE setiap $ jadi \$: \$2b\$12\$abc...xyz
```

**Generate NEXTAUTH_SECRET**:
```bash
openssl rand -hex 32
# atau: bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

9. Klik **Deploy** — tunggu ~5-10 menit untuk build pertama

### 5. Test Akses

Setelah build selesai, Vercel akan kasih URL: `https://anscloud-USERNAME.vercel.app`

1. Buka URL di browser → halaman login muncul
2. Login dengan email & password yang sudah di-set
3. Test upload file kecil → file tersimpan di Supabase Storage
4. Test lihat storage overview → data tercatat di Neon Postgres

### 6. Setup Custom Domain via Cloudflare (Gratis)

Karena kamu punya domain `anangsetya.my.id`:

#### 6.1 Tambah Domain ke Cloudflare (Kalau Belum)

1. Buka https://dash.cloudflare.com
2. **Add a Site** → masukkan `anangsetya.my.id`
3. Pilih plan **Free**
4. Cloudflare kasih 2 nameserver → update nameserver di registrar domain kamu
5. Tunggu 1-24 jam untuk propagasi DNS

#### 6.2 Tambah CNAME Record untuk Vercel

1. Di Cloudflare → pilih domain `anangsetya.my.id`
2. Tab **DNS → Records** → **Add record**:
   - Type: **CNAME**
   - Name: `drive` (atau subdomain lain yang kamu mau)
   - Target: `cname.vercel-dns.com`
   - Proxy status: **Proxied** (orange cloud) untuk DDoS protection, atau **DNS only** (grey cloud)
   - TTL: **Auto**
3. Save

#### 6.3 Add Domain di Vercel

1. Di Vercel Dashboard → pilih project `anscloud`
2. Tab **Settings** → **Domains**
3. **Add** → masukkan `drive.anangsetya.my.id`
4. Vercel akan verifikasi DNS — tunggu ~5 menit
5. Vercel otomatis issue Let's Encrypt cert → HTTPS aktif

#### 6.4 Update NEXTAUTH_URL

1. Update env var di Vercel:
   - Settings → Environment Variables
   - Edit `NEXTAUTH_URL` → `https://drive.anangsetya.my.id`
   - Save
2. Redeploy: tab **Deployments** → ... → **Redeploy**

### 7. Setup Google OAuth (Opsional)

Untuk connect akun Google Drive asli (bukan demo):

1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web app)
2. Authorized redirect URI:
   ```
   https://drive.anangsetya.my.id/api/auth/google/callback
   ```
3. Set env vars di Vercel:
   - `GOOGLE_CLIENT_ID` = `xxxxx.apps.googleusercontent.com`
   - `GOOGLE_CLIENT_SECRET` = `xxxxx`
   - `ANSCLOUD_PUBLIC_URL` = `https://drive.anangsetya.my.id`
4. Redeploy

### 8. Inisialisasi Supabase Bucket (Sekali Saja)

Kalau di langkah 3 kamu **tidak** create bucket manual via dashboard Supabase, jalankan script init:

```bash
# Di lokal
git clone https://github.com/USERNAME/anscloud.git
cd anscloud

# Set env vars lokal (atau pakai .env)
export SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run init script
bun run init-supabase
# Output: "Bucket 'anscloud-files' berhasil dibuat."
```

Kalau bucket sudah dibuat manual via dashboard di langkah 3, skip step ini.

---

## Update Aplikasi

Setiap kali ada perubahan code:

```bash
git add .
git commit -m "Update fitur X"
git push origin main
```

Vercel otomatis rebuild & redeploy (~2-5 menit). Zero-downtime deploy.

---

## Backup Database (Neon Postgres)

Neon punya fitur **branching** & **point-in-time recovery** gratis:
1. Di Neon Dashboard → pilih project
2. Tab **Backups** → lihat semua restore points (tersimpan 7 hari untuk free tier)
3. **Restore** ke waktu tertentu kalau perlu

Atau manual via `pg_dump`:
```bash
# Install pg_dump kalau belum (sudo apt install postgresql-client)
pg_dump "postgresql://user:password@host/dbname?sslmode=require" > backup-$(date +%Y%m%d).sql
```

Upload backup ke GitHub (private repo) atau ke Supabase Storage via API.

---

## Troubleshooting

### Build gagal di Vercel dengan error Prisma

Error umum: `PrismaClientInitializationError: Can't reach database server`

**Solusi**:
- Cek `DATABASE_URL` di Vercel env vars — pastikan format benar dengan `?sslmode=require`
- Cek Neon project status — pastikan database aktif (tidak di-pause)
- Neon free tier auto-pause setelah 5 hari idle. Cek di dashboard → Resume

### Login gagal ("Email atau password salah")

Penyebab umum: bcrypt hash terpotong karena `$` tidak di-escape.

**Solusi**:
- Cek env var `ANSCLOUD_LOGIN_PASSWORD_HASH` di Vercel Settings
- Hash harus escaped: `\$2b\$12\$abc...xyz` (setiap `$` jadi `\$`)
- Re-set via Settings → Environment Variables

### File upload gagal dengan error Supabase

Error umum: `Bucket not found` atau `Unauthorized`

**Solusi**:
- Pastikan bucket `anscloud-files` sudah dibuat di Supabase Dashboard (langkah 3 atau 8)
- Pastikan `SUPABASE_SERVICE_ROLE_KEY` adalah **service_role**, BUKAN anon key
- Cek env vars di Vercel: `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY` harus match project Supabase kamu

### Google OAuth redirect error

**Solusi**:
- Cek `ANSCLOUD_PUBLIC_URL` di Vercel env vars → harus persis sama dengan URL publik (`https://drive.anangsetya.my.id`)
- Cek authorized redirect URI di Google Cloud Console → harus persis match
- Redeploy setelah update env vars

### Performance lambat (cold start)

Vercel free tier serverless functions punya cold start ~500ms-2s saat idle. Solusi:
- Pakai Vercel Edge Functions (perlu refactor) — no cold start
- Atau hubungkan UptimeRobot (gratis, no card) untuk ping setiap 5 menit

### Database connection limit (Neon)

Neon free tier: max 100 concurrent connections. Kalau error "too many connections":
- Cek apakah ada connection leak di code (Prisma auto-handles ini, tapi pastikan tidak ada manual connection)
- Restart app via Vercel → Redeploy

---

## Limit Free Tier & Cara Mengatasinya

| Resource | Free Tier | Limit | Solusi |
|----------|-----------|-------|--------|
| Vercel bandwidth | 100GB/bulan | Cukup untuk pribadi | - |
| Vercel serverless | 100GB-hours/bulan | Cukup | - |
| Neon DB storage | 0.5GB | Cukup untuk ribuan file metadata | - |
| Neon compute | 191.9 hours/bulan | Cukup | Auto-pause setelah 5 hari idle |
| Supabase storage | 500MB | Batasi upload file <5MB | Hubungkan Google Drive asli untuk file besar |
| Supabase DB | 1GB | Sudah cukup (untuk Auth Supabase, bukan dipakai AnsCloud) | - |
| Supabase egress | 1GB/bulan | Untuk download file | Hubungkan Google Drive asli |

**Kalau storage penuh**, hubungkan akun Google Drive asli (gratis 15GB per akun, bisa multiple). File disimpan di Drive user, bukan di Supabase — storage AnsCloud tetap kecil.

---

## Estimasi Biaya: Rp 0 / Bulan ✅

| Item | Biaya |
|------|-------|
| Vercel hosting (free) | $0 |
| Neon Postgres (free) | $0 |
| Supabase Storage (free) | $0 |
| GitHub private repo (free) | $0 |
| Cloudflare DNS (free) | $0 |
| Domain (sudah punya) | $0 |
| Google Drive OAuth | $0 |

**Total: Rp 0 / bulan** selamanya, tanpa kartu kredit, always-on 24/7.

---

## Alternatif: Koyeb + Neon + Supabase

Kalau Vercel free tier tidak cukup (misal butuh persistent server, atau banyak serverless function calls):

1. **Koyeb** (https://koyeb.com) — free 1 nano instance, no card, always-on
2. Deploy sebagai Docker container (pakai `Dockerfile` yang sudah ada)
3. Tetap pakai Neon + Supabase untuk database & storage
4. Setup custom domain via Cloudflare CNAME → Koyeb domain

Cocok kalau butuh:
- Long-running processes (cron jobs, WebSocket connections)
- Persistent server (no cold start)
- Lebih banyak compute resources

---

## Checklist Final

- [ ] Repo GitHub berisi code AnsCloud (private)
- [ ] Akun Neon (free, no card) — connection string disalin
- [ ] Akun Supabase (free, no card) — Project URL & service_role key disalin
- [ ] Bucket `anscloud-files` dibuat di Supabase Storage
- [ ] Akun Vercel (free, no card) — login via GitHub
- [ ] Project Vercel di-import dari GitHub repo
- [ ] Environment Variables di-set di Vercel (DATABASE_URL, ANSCLOUD_LOGIN_*, NEXTAUTH_*, SUPABASE_*)
- [ ] Build pertama sukses
- [ ] Akses `https://anscloud-USERNAME.vercel.app` → halaman login muncul
- [ ] Login dengan kredensial → redirect ke dashboard
- [ ] Upload test file → tersimpan di Supabase Storage
- [ ] (Opsional) Custom domain via Cloudflare CNAME → `drive.anangsetya.my.id`
- [ ] (Opsional) Google OAuth configured → tombol "Hubungkan Google Asli" aktif

**Selamat! AnsCloud Anda sudah live, gratis selamanya, tanpa kartu kredit.** 🎉
