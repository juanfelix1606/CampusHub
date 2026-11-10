# Catatan portofolio dan interview

Gunakan sebagai bahan yang dapat dijelaskan sendiri; sesuaikan setiap pernyataan dengan kontribusimu yang sebenarnya, termasuk penggunaan bantuan AI. **Aplikasi belum dideploy ke production.** Tangkapan layar dan alur yang dicoba berasal dari lingkungan lokal; jangan menyiratkan aplikasi sudah live.

## Bullet CV — Bahasa Indonesia

- Membangun CampusHub, aplikasi LMS sederhana dan absensi QR berbasis React, TypeScript, Express, PostgreSQL, dan Prisma, dengan akses sesuai peran admin, dosen, dan mahasiswa.
- Mengimplementasikan token QR yang berotasi, pemeriksaan enrollment, transaksi PostgreSQL, dan unique constraint untuk membatasi token kedaluwarsa serta mencegah absensi ganda.
- Merancang alur tugas, submission berversi, penilaian dengan audit, dan penyimpanan file privat melalui adapter lokal/S3-compatible.
- Menambahkan pengujian Vitest/Supertest, integration PostgreSQL, dan Playwright pada alur tugas hingga penilaian, serta quality gates GitHub Actions.

## CV bullets — English

- Built CampusHub, a lightweight LMS and QR attendance application using React, TypeScript, Express, PostgreSQL, and Prisma with role-based access for administrators, lecturers, and students.
- Implemented rotating QR tokens, enrollment checks, PostgreSQL transactions, and unique constraints to limit expired-token use and prevent duplicate check-ins.
- Designed assignments, versioned submissions, audited grading, and private file storage behind local/S3-compatible adapters.
- Added Vitest/Supertest, PostgreSQL integration, and Playwright coverage for the assignment-to-grading flow, with GitHub Actions quality gates.

## Deskripsi repo satu kalimat

CampusHub adalah LMS sederhana dan sistem absensi QR berbasis React, Express, dan PostgreSQL dengan akses berbasis peran serta pengujian otomatis.

## Topik GitHub yang disarankan

`typescript`, `react`, `express`, `postgresql`, `prisma`, `vite`, `qr-code`, `learning-management-system`, `role-based-access-control`, `playwright`.

## Bio / README profil GitHub

Saya mahasiswa Informatika yang membangun proyek full-stack untuk memperdalam pengembangan aplikasi web. CampusHub adalah LMS sederhana dengan tugas, penilaian, analitik, dan absensi QR menggunakan React, TypeScript, Express, dan PostgreSQL. Proyek ini belum live; dokumentasi, screenshot lokal, dan pengujian tersedia di repositori.

## Pertanyaan interview dan jawaban singkat

1. **Mengapa QR berotasi?** Token JWT terikat sesi dan slot 30 detik yang diperiksa dengan waktu server, sehingga token lama cepat kedaluwarsa; ini tidak membuktikan lokasi fisik mahasiswa. Lihat [attendance-token.ts](../apps/api/src/modules/attendance/attendance-token.ts).
2. **Mengapa `X-Forwarded-For` tidak langsung dipercaya?** Klien bisa mengirim header palsu. Backend dirancang membatasi akses origin dengan secret yang disetel ulang proxy dan mengatur trust proxy; perilaku rewrite dan jumlah hop masih wajib diverifikasi di production. Lihat [app.ts](../apps/api/src/app.ts) dan [panduan deployment](DEPLOYMENT.md).
3. **Bagaimana mencegah kelas melebihi kapasitas?** Transaksi mengunci baris kelas sebelum menghitung dan menambah enrollment; unique constraint juga menolak mahasiswa yang sama mendaftar dua kali. Lihat [class.repository.ts](../apps/api/src/modules/classes/class.repository.ts).
4. **Bagaimana refresh token diamankan?** Token acak disimpan sebagai hash, dikirim melalui cookie `HttpOnly`, dan dirotasi pada refresh; token lama yang dipakai ulang ditolak. Lihat [auth.service.ts](../apps/api/src/modules/auth/auth.service.ts).
5. **Mengapa perlu trigger nilai di database?** Validasi di aplikasi saja tidak melindungi perubahan lewat jalur database lain; trigger juga membatasi score terhadap maxScore dan perubahan maksimum terhadap nilai yang sudah ada. Lihat [migrasi tugas](../apps/api/prisma/migrations/20261109020000_assignments_and_grading/migration.sql).
6. **Bagaimana unduhan file dilindungi?** Backend memeriksa hak akses sebelum streaming dari `FileStorage`; key objek acak, bucket harus privat, dan URL publik permanen tidak dibuat. Lihat [s3-file.storage.ts](../apps/api/src/modules/materials/s3-file.storage.ts).
7. **Apa itu CSV injection?** Spreadsheet dapat menafsirkan sel tertentu sebagai formula. Helper CSV menetralkan nilai berisiko dan mengutip sel; ini diuji pada ekspor. Lihat [csv.ts](../apps/api/src/shared/csv.ts).
8. **Mengapa menggunakan pooled dan direct URL database?** Pooler mengelola koneksi aplikasi, sedangkan migrasi Prisma memakai direct URL; integration runner menimpa keduanya agar tidak memigrasi database lain. Lihat [prisma.config.ts](../apps/api/prisma.config.ts) dan [test-integration.ts](../apps/api/scripts/test-integration.ts).
9. **Apa yang dibuktikan test S3?** CI memakai mock untuk memeriksa operasi dan integrasi aplikasi. Smoke test terpisah terhadap Supabase Storage nyata berhasil untuk put/get/delete, tetapi belum membuktikan alur upload materi aplikasi di production.
10. **Apa trade-off rate limiter saat ini?** Counter disimpan per instance, sehingga tidak menyatukan batas pada beberapa instance; IP di balik proxy juga bergantung pada konfigurasi trust yang benar.
