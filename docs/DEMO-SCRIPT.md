# Skrip video demo CampusHub (2 menit)

Rekam dari aplikasi yang dijalankan secara lokal dengan data seed. Demo live belum tersedia. Gunakan data fiktif dan jangan tampilkan password, file `.env`, token QR, atau kredensial provider.

## Akun demo

Semua akun seed menggunakan password lokal `DEMO_PASSWORD` yang sama. Email saja dicantumkan di sini; password tidak disimpan di repositori.

- Dosen: `dosen@campushub.local`
- Mahasiswa: `mahasiswa1@campushub.local`
- Admin: `admin@campushub.local`

## Urutan rekaman

| Waktu | Klik / aksi | Narasi singkat |
| --- | --- | --- |
| 0:00–0:10 | Buka halaman login, masuk sebagai dosen, lalu tunjukkan dashboard. | “CampusHub menyatukan kelas, tugas, penilaian, dan absensi dalam satu aplikasi dengan tampilan sesuai peran.” |
| 0:10–0:28 | Buka **Tugas & penilaian**. Isi judul, deskripsi, deadline, dan nilai maksimum, lalu buat tugas. | “Dosen dapat membuat tugas untuk kelasnya dan menetapkan tenggat serta bobot nilai.” |
| 0:28–0:44 | Keluar, masuk sebagai mahasiswa, buka **Tugas saya**, pilih tugas yang baru dibuat, tulis jawaban singkat, lalu kirim. | “Mahasiswa melihat tugas kelas dan mengirim jawaban; submission dapat memiliki versi dan lampiran yang divalidasi.” |
| 0:44–1:00 | Keluar, masuk kembali sebagai dosen, buka **Tugas & penilaian**, pilih tugas dan submission mahasiswa, isi nilai serta feedback, lalu simpan. | “Dosen menilai submission. Perubahan nilai dicatat dan divalidasi terhadap nilai maksimum.” |
| 1:00–1:12 | Masuk sebagai mahasiswa dan kembali ke dashboard; sorot notifikasi nilai. | “Hasil penilaian memunculkan notifikasi in-app agar mahasiswa tahu ada nilai dan feedback baru.” |
| 1:12–1:34 | Masuk sebagai dosen, buka **Absensi QR**, isi judul sesi dan durasi, tekan **Buka sesi**, lalu tampilkan QR dinamis. | “Dosen membuka sesi absensi. Token QR berotasi dan terikat pada sesi.” |
| 1:34–1:48 | Buka aplikasi mahasiswa di browser/perangkat kedua, masuk sebagai mahasiswa, buka **Absensi saya**, lalu scan QR sesi. | “Mahasiswa check-in melalui QR; server memeriksa sesi dan mencegah check-in ganda.” |
| 1:48–2:00 | Kembali ke dashboard dan sorot grafik kehadiran, progres tugas, atau distribusi nilai. | “Dashboard merangkum aktivitas belajar sesuai peran. Ini demo lokal; deployment production belum dilakukan.” |

Sesuaikan langkah dengan tampilan aktual. Untuk merekam QR dari perangkat kedua, keduanya harus dapat mengakses aplikasi melalui origin HTTPS yang sama; akses kamera browser biasanya memerlukan HTTPS atau localhost. Jika hanya merekam satu layar lokal, tunjukkan QR dan jelaskan langkah check-in tanpa mengklaim scan berhasil.

## Tips rekaman

- Jalankan database lokal, migrasi, dan seed sesuai bagian **Instalasi lokal** di README. Jangan arahkan aplikasi ke Neon.
- Gunakan dua profil browser atau dua jendela agar perpindahan role cepat. Siapkan tugas dan jawaban cadangan sebelum merekam, tetapi jangan tampilkan terminal yang berisi environment variable.
- Rekam layar 1080p, sembunyikan notifikasi desktop, gunakan zoom browser yang konsisten, dan jeda sejenak setelah aksi agar status berhasil terbaca.
- Pakai akun/email fiktif dari seed; periksa seluruh layar agar tidak ada data pribadi, password, URL database, atau secret.
- Unggah video ke YouTube dengan visibilitas **Unlisted** (atau hosting sejenis), lalu putar kembali tautan untuk memeriksa audio dan gambar. Masukkan URL yang sudah dicek ke bagian Demo di README.
