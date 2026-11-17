---
name: siaga-verifikasi-laporan
description: Menerima dan memverifikasi laporan banjir dari warga (teks/foto/lokasi) di Telegram, memberi arahan keselamatan, lalu mencatatnya sebagai kejadian.
version: 1.0.0
author: Bekasi Siaga Banjir
license: MIT
metadata:
  hermes:
    tags: [Banjir, Laporan Warga, Verifikasi, Bekasi]
    related_skills: [siaga-banjir-operasi]
    requires_toolsets: [siaga_banjir]
---

# Verifikasi Laporan Banjir Warga

## When to Use
Pengguna mengatakan ada banjir/genangan/air naik/rob di lokasinya, mengirim foto genangan, atau berbagi lokasi.

## Procedure
1. **Keselamatan dulu.** Jika ada kata kunci darurat (terjebak, air terus naik, masuk rumah tinggi, arus deras, ada korban), balas pertama kali dengan arahan: hubungi 112/BPBD, matikan listrik, menjauh dari arus, mengungsi ke tempat tinggi. Baru lanjut.
2. **Lengkapi 4 data** (tanya maksimal 2 hal sekaligus): kecamatan + desa/perumahan, sejak jam berapa, perkiraan kedalaman (mata kaki ±10 cm, lutut ±50, pinggang ±100), dan apakah air naik/turun.
3. **Foto** (jika ada dan model bisa melihat gambar): perkirakan kedalaman dari patokan (ban motor, pintu, lutut orang), periksa apakah memang genangan banjir. Jangan menyimpan atau menyebut wajah/plat nomor.
4. **Cek silang** dengan `siaga_detail_kecamatan`: hujan 24 jam, debit sungai, rob, laporan lain di sekitar. Konsisten jika ada hujan/debit/rob tinggi atau laporan lain.
5. **Catat** dengan `siaga_catat_kejadian`:
   - `terverifikasi=true` hanya jika pelapor petugas, ATAU foto + lokasi + waktu konsisten dengan data. Selain itu `false`.
   - `sumber`: "warga via Telegram" / "petugas …"; `catatan`: ringkas kondisi tanpa data pribadi.
6. **Balas warga**: terima kasih, status kecamatan saat ini, langkah yang perlu dilakukan, dan bahwa laporan diteruskan ke petugas. Sarankan juga melapor di PetaBencana.id agar tercatat publik.

## Pitfalls
- Satu laporan tanpa bukti dan tanpa hujan/debit tinggi → tetap catat (`terverifikasi=false`), jangan menyimpulkan banjir besar.
- Laporan dari Kota Bekasi (bukan Kabupaten) → beri arahan keselamatan, jelaskan cakupan sistem ini Kabupaten Bekasi, sarankan menghubungi BPBD Kota Bekasi.
- Jangan menjanjikan bantuan atau waktu kedatangan petugas.

## Verification
Kejadian tercatat (tool mengembalikan `ok: true` dan `id`), warga mendapat arahan keselamatan dan status terkini.
