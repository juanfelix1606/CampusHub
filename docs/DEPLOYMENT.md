# Panduan deploy CampusHub

Panduan ini untuk demo portofolio, bukan sistem akademik dengan data sungguhan. Jangan masukkan secret ke Git, screenshot, chat, atau browser console. Layanan dan kuota gratis dapat berubah; periksa syarat masing-masing provider.

## Gambaran dan batasan

Browser mengakses frontend **dan** `/api` pada origin Vercel yang sama. Vercel meneruskan `/api` ke Render melalui rewrite; Render memakai PostgreSQL Neon dan bucket S3 privat. Cookie refresh `HttpOnly`, `Secure`, `SameSite=Lax`; jangan mengubah frontend agar memanggil domain Render secara langsung.

Render memakai `render.yaml`: `npm ci --include=dev`, generate Prisma Client, build API, lalu `npm run start --workspace @campushub/api`. Render menyediakan `PORT`; `API_PORT` hanya fallback lokal. Health check `/api/v1/health` tidak mengakses database dan terbuka untuk platform. Swagger `/api/docs` dinonaktifkan di production; gunakan dokumentasi lokal agar permukaan API production lebih kecil.

Migrasi tidak dijalankan ketika instance start. Render pre-deploy command memerlukan paket berbayar; di paket gratis jalankan migrasi **manual** dari komputer tepercaya sebelum menjalankan versi aplikasi yang membutuhkannya. Render free dapat tidur saat tidak aktif: request pertama bisa lambat atau timeout sementara.

## 1. Database Neon

1. Buat project Neon dan database **khusus demo** bernama misalnya `campushub_demo`. Ini terpisah dari database development, test, dan data nyata. Nama yang berakhiran `_demo` adalah pemeriksaan tambahan, bukan jaminan keamanan: pastikan sendiri project dan database yang dipilih benar.
2. Salin connection string pooled untuk runtime (`DATABASE_URL`) dan direct/non-pooled untuk migrasi (`DIRECT_DATABASE_URL`). Keduanya harus menunjuk ke database dan project yang sama, dengan SSL sesuai petunjuk Neon. Jangan kirim URL ke chat.
3. Di komputer sendiri isi `.env` root dengan kedua URL tersebut. `.env` diabaikan Git. `TEST_DATABASE_URL` harus menunjuk database terpisah berakhiran `_test`, bukan production/demo.
4. Dari root, dengan dependency terpasang, jalankan `npm run db:generate` lalu `npm run db:deploy`. Periksa target secara pribadi sebelum menjalankan. Prisma CLI menggunakan `DIRECT_DATABASE_URL` jika tersedia, sementara API memakai `DATABASE_URL`; test integration secara eksplisit menimpa keduanya dengan URL test.

## 2. Storage

1. Buat bucket **privat** pada Supabase Storage atau R2 dan buat kredensial S3 server-side. Periksa persyaratan akun dan biaya terkini; R2 bisa memerlukan aktivasi pembayaran. Kunci Supabase S3 dapat melewati RLS, sehingga tidak boleh dibagikan ke frontend.
2. Siapkan `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`. Supabase: endpoint `https://<project-ref>.storage.supabase.co/storage/v1/s3`, region proyek, path style `true`. R2: `https://<account-id>.r2.cloudflarestorage.com`, region `auto`, path style sesuai provider.
3. Isi variabel tersebut di `.env` lokal, lalu jalankan `npm run storage:smoke`. Skrip mengunggah, membaca dan menghapus objek acak di prefix `smoke-tests/`; kegagalan dilaporkan tanpa mencetak credential. Pastikan bucket benar karena skrip benar-benar mengakses provider dan membutuhkan hak put/get/delete. Jika operasi delete gagal, hapus objek uji yang tertinggal melalui dashboard bucket.

Pengujian CI menggunakan mock HTTP S3, bukan provider sesungguhnya. Smoke test terhadap provider sungguhan adalah verifikasi terpisah yang harus dilakukan sendiri.

## 3. Backend Render

1. Sebelum deploy backend, siapkan origin sementara HTTPS yang valid untuk `WEB_ORIGIN` (misalnya `https://placeholder.invalid`); login belum akan berfungsi. Nanti ganti dengan URL Vercel sebenarnya **tanpa slash akhir**, lalu redeploy.
2. Di Render buat Blueprint dari repositori dan `render.yaml` pada root. Set env berikut secara privat:

| Nama | Keterangan |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon pooled, database demo |
| `DIRECT_DATABASE_URL` | Neon direct, database sama; hanya dipakai Prisma CLI, boleh tidak disimpan di Render jika migrasi manual |
| `WEB_ORIGIN` | origin HTTPS Vercel yang tepat |
| `JWT_ACCESS_SECRET`, `ATTENDANCE_QR_SECRET`, `ORIGIN_PROXY_SECRET` | tiga nilai acak **berbeda**; masing-masing minimal 32 karakter dan 12 karakter unik |
| `STORAGE_DRIVER` | `s3` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | pengaturan bucket privat |
| `PROXY_HOPS` | mulai dari `2`, wajib diverifikasi seperti di bawah |
| `PROXY_DIAGNOSTICS` | opsional, default mati; `true` hanya sementara untuk verifikasi IP |
| `DASHBOARD_RISK_ATTENDANCE_PERCENT`, `DASHBOARD_RISK_MISSED_ASSIGNMENTS` | opsional; threshold dashboard |

`PORT` disediakan Render. Jangan set `ALLOW_LOCAL_STORAGE=true` di production: disk lokal bisa hilang. Generate masing-masing secret terpisah memakai `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` pada komputer tepercaya; simpan di password manager.

3. Jalankan migrasi dari langkah 1 sebelum backend dipakai. Deploy, lalu catat origin HTTPS Render. Health check `/api/v1/health` harus mengembalikan 200; endpoint API lain yang diakses langsung tanpa header rahasia harus mengembalikan 403.

## 4. Frontend Vercel

1. Ganti hostname placeholder pada `dest` dalam `vercel.json` dengan origin HTTPS Render milikmu, pertahankan `/api/$1`. Ini bukan secret, tetapi **jangan** memasukkan credential di URL. Commit perubahan konfigurasi tersebut dan push.
2. Import repo ke Vercel. Root Directory: root repositori (`.`); framework Vite; build command `npm run build --workspace @campushub/web`; output `apps/web/dist`. Konfigurasi ini juga tercantum di `vercel.json`. Jangan set URL backend di frontend.
3. Tambahkan environment variable `ORIGIN_PROXY_SECRET` di Vercel untuk environment Production dengan nilai sama seperti Render, tanpa prefix `VITE_`. Transform request pada rewrite menimpa header `x-origin-secret`, bukan meneruskan header dari browser. Jangan memasukkan nilai itu ke `vercel.json`. Redeploy setelah perubahan env.
4. Catat origin HTTPS Vercel yang tetap, set `WEB_ORIGIN` di Render ke origin itu dan redeploy Render. Gunakan origin yang sama setiap kali login; preview deployment/domain berbeda tidak otomatis diizinkan.

## 5. Seed dan reset data demo

Database ini hanya boleh berisi data demo yang boleh hilang. Seed melakukan upsert beberapa email dan ID tetap, termasuk akun admin, sehingga **jangan** jalankan pada database bersama atau database dengan data nyata. Password untuk semua akun demo diambil dari `DEMO_PASSWORD`, minimal 12 karakter dan 8 karakter unik. Admin demo memberi pengguna kekuasaan admin; jangan gunakan konfigurasi ini untuk data sensitif atau berbagi password yang digunakan di tempat lain.

Set `DATABASE_URL`, `DIRECT_DATABASE_URL`, `DEMO_DATABASE_NAME`, `CONFIRM_DEMO_DATABASE=yes`, `DEMO_PASSWORD` di environment terminal atau `.env` lokal. Pastikan URL pooled/direct dari project yang sama menunjuk nama database `*_demo` yang sama. Kemudian:

```powershell
npm run demo:seed
```

Seed dapat diulang: data seed yang sudah ada akan diperbarui, termasuk password akun demo. Akun: `admin@campushub.local`, `dosen@campushub.local`, `mahasiswa1@campushub.local`, `mahasiswa2@campushub.local`. Jangan publish password pada Git.

**Reset bersifat destruktif:** menghapus seluruh isi database demo, termasuk data baru yang dibuat pengguna, lalu migrasi dan seed ulang. Pemeriksaan nama bukan bukti bahwa database aman dihapus. Baca lagi project/host dan database di dashboard sebelum melanjutkan. Reset tidak menghapus objek bucket: file lama bisa menjadi orphan dan harus dibersihkan terpisah dari bucket khusus demo.

```powershell
$env:CONFIRM_DEMO_RESET = $env:DEMO_DATABASE_NAME
npm run demo:reset
Remove-Item Env:CONFIRM_DEMO_RESET
```

Jika `DEMO_DATABASE_NAME` hanya ada di `.env`, bukan environment PowerShell, isi `$env:CONFIRM_DEMO_RESET` dengan nama database demo yang tepat secara manual. Hapus konfirmasi setelah selesai. Password dan konfirmasi seed/reset tidak perlu disimpan di Render.

## 6. Verifikasi IP dan rate limit

Default `PROXY_HOPS=2` merupakan hipotesis untuk Vercel rewrite -> proxy Render -> Express, **bukan jaminan topologi**. Server menolak request API langsung tanpa `ORIGIN_PROXY_SECRET`; health check tetap terbuka. Jangan bocorkan secret ini. Jika transform Vercel gagal menimpa header atau secret bocor, pihak luar dapat memalsukan `X-Forwarded-For`, sehingga rate limit per IP tidak bisa dipercaya. Rate limit saat ini in-memory per instance, bukan limit terdistribusi.

1. Sementara set `PROXY_DIAGNOSTICS=true` di Render dan redeploy. Pada browser buka `https://<origin-vercel>/api/v1/proxy-diagnostic`; respons `clientIp` hanya untuk debugging dan tidak disimpan oleh aplikasi.
2. Bandingkan dengan IP publik masing-masing dari dua jaringan berbeda, misalnya Wi-Fi dan data seluler. Jika hasilnya IP proxy yang sama, jumlah hop mungkin terlalu kecil; jika tidak sesuai atau berubah akibat header palsu, mungkin terlalu besar. Uji juga akses langsung Render tanpa secret harus 403. Jangan tempel hasil IP/secret ke chat publik.
3. Sesuaikan `PROXY_HOPS` dan ulangi bila perlu. Verifikasi pada deployment nyata; unit test hanya mensimulasikan dua hop. Jika tidak bisa memastikan rantai atau sifat overwrite header, **jangan anggap rate limiting aman**: jangan buka demo publik sampai origin dibatasi secara tepercaya dan hasilnya diverifikasi.
4. Hapus `PROXY_DIAGNOSTICS` atau set `false` lalu redeploy; endpoint diagnostik harus menjadi 404 melalui Vercel. Saat rotasi `ORIGIN_PROXY_SECRET`, perubahan Render dan Vercel dapat menyebabkan downtime singkat; redeploy keduanya dan uji ulang.

## 7. Checklist pasca-deploy

- Login tiap role dan reload; refresh sesi masih berhasil, cookie bertanda Secure/HttpOnly/SameSite=Lax. Logout lalu pastikan sesi tidak dapat diperbarui.
- Dosen upload dan download materi; mahasiswa terdaftar dapat download, pengguna tanpa akses ditolak. Pastikan bucket privat.
- Dosen buat tugas, mahasiswa submit, dosen memberi nilai/feedback, mahasiswa melihat nilai dan notifikasi.
- Buka sesi absensi dosen, scan QR dengan HP lewat HTTPS, dan pastikan check-in ganda ditolak.
- Buka halaman SPA langsung dan reload; cek health, grafik, CSV, dan notifikasi. Uji IP seperti bagian 6.

## Troubleshooting

- **403 semua API:** cocokkan secret proxy di Vercel dan Render, cek transform dan redeploy. Health masih 200 tanpa secret.
- **CORS/refresh cookie:** samakan `WEB_ORIGIN` persis dengan origin HTTPS di address bar; browser harus memakai `/api` relatif melalui rewrite, bukan URL Render.
- **502 atau timeout:** Render mungkin cold start, build gagal, `PORT` salah, migrasi belum diterapkan, atau backend belum sehat. Periksa log layanan tanpa membagikan secret.
- **Database gagal tersambung:** periksa project, nama database, SSL dan koneksi pooled/direct Neon, lalu jalankan migrasi manual dengan direct URL. Jangan menampilkan URL koneksi.
- **Storage gagal:** periksa bucket privat, endpoint, region, path style dan hak put/get/delete; gunakan smoke test. Mock CI bukan bukti kompatibilitas provider.

Referensi: [Vercel external rewrites dan origin protection](https://vercel.com/docs/routing/rewrites), [Neon dan Prisma](https://neon.com/docs/guides/prisma), [Render deploy](https://render.com/docs/deploys), [Supabase S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication).
