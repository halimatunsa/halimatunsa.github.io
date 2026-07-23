# Arahan Deploy: GitHub Pages + Cloudflare Workers (D1/SQLite)

Site statik dihoskan di GitHub Pages (percuma), manakala pangkalan data
rekod murid dihoskan di Cloudflare Workers + D1 (percuma, SQLite sebenar).

---

## Bahagian 1: Deploy API ke Cloudflare (sekali sahaja)

Prasyarat: akaun Cloudflare percuma (daftar di dash.cloudflare.com) dan Node.js.

Buka terminal dalam folder `cloudflare/` ini, kemudian:

```bash
# 1. Log masuk (browser akan terbuka)
npx wrangler login

# 2. Cipta pangkalan data D1
npx wrangler d1 create halimatun-db
#    -> Salin "database_id" yang dipaparkan, tampal ke dalam wrangler.toml
#       (gantikan GANTI-DENGAN-DATABASE-ID-ANDA)

# 3. Cipta jadual dalam pangkalan data sebenar
npx wrangler d1 execute halimatun-db --remote --file=schema.sql

# 4. Tetapkan kunci admin (taip kata laluan rahsia anda sendiri)
npx wrangler secret put ADMIN_KEY

# 5. Deploy!
npx wrangler deploy
#    -> Anda akan dapat URL seperti:
#       https://halimatun-api.NAMA-AKAUN.workers.dev
```

URL itu ialah **URL folder API** anda. Simpan.

---

## Bahagian 2: Sediakan data.js

1. Buka `admin.html` (secara lokal), pergi ke tab **Tetapan & Bantuan**.
2. Isi **URL folder API** = URL workers.dev tadi.
3. Isi **Kunci Admin** = kata laluan yang anda taip pada langkah 4 di atas.
4. Klik **Uji Sambungan** — patut keluar "Berjaya!".
5. Klik **Muat Turun data.js** dan gantikan `data.js` dalam folder laman.

---

## Bahagian 3: Deploy site ke GitHub Pages

1. Cipta repo GitHub. Untuk alamat `halimatun.github.io`, nama akaun GitHub
   mestilah `halimatun` dan nama repo mestilah `halimatun.github.io`.
   (Jika guna akaun lain, laman akan berada di `namaakaun.github.io/nama-repo`
   selepas mengaktifkan Pages dalam Settings > Pages.)

2. Muat naik fail berikut SAHAJA:
   - `index.html`
   - `admin.html`
   - `data.js`

3. **JANGAN muat naik:**
   - folder `api/` (versi PHP — `config.php` mengandungi ADMIN_KEY!)
   - `cloudflare/.dev.vars` (mengandungi kunci ujian)
   - fail PDF nota asal
   (Fail `.gitignore` di akar projek sudah menghalang semua ini jika anda guna git.)

4. Selesai. Laman: `https://halimatun.github.io`

Nota: `admin.html` memang boleh dibuka oleh orang awam, tetapi tanpa Kunci
Admin mereka tidak boleh menerbitkan apa-apa. Kunci hanya disimpan dalam
pelayar anda sendiri.

---

## Aliran kerja harian selepas deploy

| Tugas | Cara |
|---|---|
| Kemas kini rekod murid (markah/PBD) | admin.html > Rekod Murid > edit > **Terbit ke pangkalan data**. Terus aktif, tiada upload diperlukan |
| Kemas kini kandungan (pengumuman, bahan, dll) | admin.html > edit > **Muat Turun data.js** > muat naik ke repo GitHub (Add file > Upload files > commit) |
| Sandaran | Simpan salinan data.js; rekod murid boleh dimuat semula melalui butang "Muat dari pangkalan data" |

Dalam mod pangkalan data, senarai `rekod` dalam data.js boleh dikosongkan
supaya tiada data murid langsung dalam repo awam.

---

## Ujian lokal (pilihan)

```bash
# Terminal 1: API lokal (guna .dev.vars sebagai kunci)
cd cloudflare
npx wrangler d1 execute halimatun-db --local --file=schema.sql
npx wrangler dev --port 8793

# Terminal 2: site lokal
cd ..
python -m http.server 8794
# Buka http://localhost:8794 dan set URL API ke http://localhost:8793
```

## Had percuma Cloudflare (lebih daripada cukup untuk sekolah)

- Workers: 100,000 permintaan/hari
- D1: 5 juta baris dibaca/hari, 100,000 baris ditulis/hari
