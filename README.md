# BahanBaku — Perencanaan Kebutuhan Bahan Baku UMKM

Proyek mandiri untuk **Analisis dan Perancangan Sistem Informasi Perencanaan Kebutuhan Bahan Baku Berbasis Machine Learning untuk Mendukung Efisiensi Produksi UMKM**. Contoh usaha awal: produksi roti/kue di Batam. Katalog, resep, dan nama usaha dapat disesuaikan.

Angular 20, Fastify 5 (JavaScript), PostgreSQL 18, dan Docker Compose. Model regresi dijalankan dalam JavaScript dengan `ml-matrix`. Aplikasi, database, volume, jaringan, akun, dan kode sumber berdiri sendiri.

## Menjalankan

1. Salin `.env.example` menjadi `.env`, isi password database, JWT secret acak minimal 32 karakter, dan password akun awal minimal 12 karakter.
2. Jalankan `docker compose up -d --build`.
3. Buka http://localhost:4400. Username awal: `aditya`, password awal mengikuti `INITIAL_PASSWORD`. Email `aditya@bahanbaku.local` tetap disimpan sebagai data akun, bukan kolom login.
4. Opsional, untuk database baru: `docker compose run --rm backend npm run demo`.

Impor demo eksplisit tersebut menyimpan data ke PostgreSQL satu kali: 5 akun, 3 pemasok, 8 bahan, 3 produk, komposisi, stok awal, dan 360 catatan permintaan (120 hari × 3 produk). Data berlabel simulasi, bukan transaksi usaha nyata. Restart Docker tidak menjalankan impor ulang. Database yang sudah memiliki bahan tidak ditimpa oleh impor demo. Antarmuka membaca data dari API dan PostgreSQL.

## Hak akses dan pekerjaan

| Jabatan | Kewenangan utama |
|---|---|
| Super Admin | Seluruh tindakan, audit, aktivasi/nonaktivasi pegawai |
| Administrator | Pemasok, bahan, produk, resep, riwayat, identitas usaha, pembuatan akun operasional |
| Manajer Produksi | Riwayat permintaan, resep, pelatihan model, target, persetujuan/pembatalan rencana |
| Petugas Gudang | Koreksi stok, penerimaan pesanan, pencatatan produksi selesai |
| Petugas Pembelian | Pesanan pembelian berdasarkan kekurangan bahan dari rencana disetujui |

Akun simulasi menggunakan username `aditya` (Super Admin), `nadia` (Admin), `rizky` (Manajer), `dewi` (Gudang), dan `fajar` (Pembelian). Email masing-masing tetap tersimpan dengan domain `bahanbaku.local`. Password awal mengikuti `.env`; perubahan konfigurasi tidak mereset password akun yang sudah ada. Sistem ini untuk pegawai internal; akun dibuat oleh administrator, bukan registrasi pelanggan publik. Password dapat diganti oleh pemilik akun. Logout membatalkan sesi di server.

Login menggunakan `username` dan `password`. Username unik, tidak membedakan huruf besar/kecil, panjang 3–40 karakter, diawali huruf/angka dan boleh memuat titik, garis bawah, serta tanda hubung. Pembuatan akun memerlukan username dan email. Migrasi otomatis menambahkan username pada akun lama berdasarkan bagian depan email, memberi akhiran bila terjadi duplikat, tanpa mengubah ID, email, password, atau role. Password disimpan sebagai hash bcrypt dan tidak ditampilkan di daftar pengguna.

## Alur penggunaan

1. Administrator mengisi pemasok, bahan (satuan, harga, ukuran kemasan, stok pengaman, waktu pasok), produk, dan resep untuk satu unit produk.
2. Gudang mencatat stok awal/koreksi beserta alasannya. Riwayat stok tersimpan sebagai jurnal, bukan saldo yang ditimpa.
3. Riwayat permintaan dicatat manual atau diimpor CSV `kode,tanggal,jumlah`. Tanggal yang sama diperbarui setelah konfirmasi; impor seluruh batch menggunakan transaksi database.
4. Manajer melatih model, membaca MAE dan pembanding mingguan, lalu membuat rencana berdasarkan prediksi atau target manual.
5. Rencana draf dihitung dari resep. Saat disetujui, sistem menyimpan snapshot resep dan kebutuhan.
6. Pembelian membuat pesanan untuk kekurangan bahan terbaru. Pesanan dipisah per pemasok, dibulatkan sesuai kemasan.
7. Gudang mengonfirmasi penerimaan penuh saat barang benar-benar datang. Stok bertambah satu kali.
8. Setelah seluruh target diproduksi, Gudang mencatat produksi selesai. Sistem memeriksa stok lalu mengurangi bahan sesuai snapshot secara atomik. Pencatatan ganda ditolak.
9. Laporan harian/mingguan/bulanan/tahunan menampilkan permintaan dan biaya bahan terpakai dalam diagram batang/lingkaran serta tabel rinci. Pilih rentang tanggal lalu **Tampilkan**; gunakan **Cetak laporan**, **Unduh PDF**, atau **Unduh Excel**. Ekspor CSV tetap tersedia untuk stok, riwayat, dan kebutuhan rencana.

## Cetak dan ekspor laporan

- Laporan membaca PostgreSQL dengan transaksi baca `REPEATABLE READ` agar identitas usaha, permintaan, dan pemakaian berasal dari satu snapshot. Tanggal awal dan akhir inklusif; transaksi produksi mengikuti Asia/Jakarta.
- Mengubah filter menonaktifkan ekspor sampai **Tampilkan** ditekan. Header dan isi unduhan selalu berasal dari snapshot yang ditampilkan, bukan filter yang belum diterapkan.
- Cetak menyertakan identitas, filter, diagram, dan rincian tanpa sidebar/tombol. PDF adalah berkas PDF langsung dengan tabel lintas halaman dan nomor halaman. Excel adalah XLSX asli, berisi lembar Ringkasan, Permintaan, dan Pemakaian Bahan; nilai numerik tetap angka yang dapat dihitung.
- Laporan kosong tetap dapat diunduh dengan penjelasan tidak ada data dan total nol. Kuantitas bahan dengan satuan berbeda tidak dijumlahkan. Biaya bahan bukan pendapatan/laba.
- Minggu dimulai Senin; tanggal kelompok dapat mendahului tanggal awal filter, tetapi data yang dijumlahkan tetap dibatasi rentang filter.
- Modul ekspor dimuat hanya ketika dibutuhkan. Override `exceljs > uuid` memakai versi 11 yang masih mendukung CommonJS/v4 untuk menghindari advisory pada dependensi lama.

Referensi ekspor: [ExcelJS](https://github.com/exceljs/exceljs), [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable), dan [CSS untuk pencetakan (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Printing).

## Perhitungan kebutuhan

Kebutuhan bruto = jumlah target produk × kebutuhan resep per unit × (1 + susut/100), dijumlahkan per bahan dan dibulatkan ke atas 3 desimal.

Kekurangan bersih = maksimum(0, kebutuhan bruto + kebutuhan rencana lain yang disetujui + stok pengaman − stok tersedia − pesanan pembelian yang belum diterima).

Jumlah pembelian = kekurangan bersih dibulatkan ke atas sesuai ukuran kemasan. Saat membuat PO, stok dan pesanan berjalan dibaca ulang di dalam transaksi. Mutasi stok, persetujuan, dan pembelian menggunakan penguncian transaksi untuk mencegah penghitungan bersamaan yang tidak konsisten.

### Kesiapan terhadap tanggal produksi

Bagian **Kesiapan bahan pada tanggal mulai** membaca saldo dan pesanan terbaru, terpisah dari snapshot rencana. Hanya pesanan belum diterima dengan tanggal perkiraan antara hari pemeriksaan dan tanggal mulai yang dianggap masuk tepat waktu. Pesanan yang terlambat atau sudah lewat jadwal tetapi belum diterima tidak menutupi kekurangan pada tanggal mulai.

Kekurangan saat mulai = maksimum(0, kebutuhan + cadangan rencana lain + stok pengaman − stok saat ini − pesanan tepat waktu). Pembelian tambahan tetap memperhitungkan **seluruh** PO berjalan agar tidak menggandakan pesanan yang terlambat. Jika kekurangan saat mulai masih ada, konfirmasikan/percepat pengiriman atau tinjau ulang jadwal; angka beli tambahan nol tidak selalu berarti siap produksi. Perkiraan PO baru mengikuti waktu pasok terlama dari bahan yang dibeli pada pemasok yang sama.

Perhitungan ini konservatif terhadap seluruh rencana lain yang disetujui, bukan optimasi alokasi stok per hari. Estimasi kedatangan bukan jaminan pemasok; produksi tetap memeriksa stok yang benar-benar telah diterima.

## Model dan evaluasi

- Ridge regression, alpha 1, fitur tren, lag 1/7/14 hari, rata-rata 7 hari sebelumnya, dan indikator hari dalam minggu.
- Normalisasi fitur menggunakan data pelatihan saja. Minimal 70 hari lengkap, berakhir kemarin (zona Asia/Jakarta). Tanggal kosong tidak otomatis dianggap nol.
- Holdout 14 hari terakhir, diprediksi secara rekursif tanpa membaca nilai aktual selama horizon evaluasi. MAE dan WAPE ditampilkan/disimpan bersama pembanding seasonal naive (pola minggu lalu).
- Model akhir dilatih ulang pada seluruh riwayat yang tersedia untuk horizon 7, 14, atau 30 hari. Parameter, hasil, periode data dan metrik disimpan pada tabel `forecasts`.
- Jika model belum lebih baik daripada baseline, halaman memberi catatan peninjauan. Hasil tetap harus diputuskan manajer. Prediksi ini tidak menjamin penghematan atau akurasi pada usaha nyata; data simulasi bukan bukti efisiensi bisnis.

Referensi metodologi: [evaluasi fitur lagged pada time series](https://scikit-learn.org/stable/auto_examples/applications/plot_time_series_lagged_features.html). Referensi implementasi: [Fastify](https://fastify.dev/docs/latest/), [Angular forms](https://angular.dev/guide/forms/template-driven-forms), [ml-matrix](https://github.com/mljs/matrix).

## Pengujian

```powershell
cd backend
npm ci
npm test
cd ..
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tester
```

Compose pengujian memiliki database sementara tersendiri. Unit test memeriksa evaluasi model, tidak adanya kebocoran holdout, kualitas riwayat, dan permintaan nol. Integrasi memeriksa 5 role, prediksi, persetujuan, pembelian, penerimaan, produksi, rekonsiliasi stok, pencatatan ganda, laporan, akun, audit, logout, dan 404.

## Batas operasional

- Penerimaan PO dan pencatatan produksi dilakukan penuh, belum mendukung parsial.
- Harga merupakan estimasi per satuan; belum ada akuntansi FIFO, pajak, pembayaran pemasok, atau persediaan barang jadi.
- Pemakaian produksi dicatat dari resep/snapshot target, bukan penimbangan aktual. MAE/WAPE adalah ukuran kesalahan prediksi, bukan persentase efisiensi produksi. Penghematan/pengurangan pemborosan harus dibuktikan dengan data operasional sebelum–sesudah; data simulasi tidak membuktikannya.
- Belum ada pelacakan batch/kedaluwarsa, kapasitas mesin, atau optimasi jadwal produksi. Waktu pasok menghasilkan tanggal perkiraan kedatangan, bukan jaminan pemasok.
- Model memprediksi permintaan produk, lalu kebutuhan bahan dihitung dari resep; model tidak menebak stok secara langsung.
- Volume `bahanbakuapp_bahanbaku_data` menyimpan database. Jangan menghapus volume untuk restart. Backup/restore database dilakukan dengan perangkat PostgreSQL oleh pengelola; belum ada menu backup di UI.
- Konfigurasi awal untuk localhost. Hosting publik memerlukan HTTPS, pengaturan proxy, dan kredensial operasional tersendiri. `.env` tidak boleh dipublikasikan.
