---
name: siaga-briefing
description: Menyusun briefing harian kondisi banjir Kabupaten Bekasi untuk grup Telegram petugas (pagi dan sore).
version: 1.0.0
author: Bekasi Siaga Banjir
license: MIT
metadata:
  hermes:
    tags: [Banjir, Briefing, Bekasi]
    related_skills: [siaga-banjir-operasi]
    requires_toolsets: [siaga_banjir]
---

# Briefing Harian Siaga Banjir

## When to Use
Cron pagi/sore, atau petugas meminta "briefing", "ringkasan hari ini", "laporan pagi".

## Procedure
1. `siaga_status_kabupaten` — status, top 5, sungai, rob, peringatan, laporan.
2. `siaga_riwayat` (tanpa kecamatan, jam=24) — bagaimana status 24 jam terakhir dan trennya.
3. Jika ada kecamatan Siaga/Awas: `siaga_detail_kecamatan` untuk yang tertinggi (maks 2) agar prakiraan BMKG besok ikut masuk.
4. Jika pasang laut berstatus ≥ Waspada: sebutkan jam puncak dari `siaga_pasang_laut`.
5. Tulis teks polos (tanpa markdown tabel), maks ±1.000 karakter:

```
BRIEFING SIAGA BANJIR KAB. BEKASI – <hari, tanggal> <jam> WIB
Status kabupaten: <STATUS> (Awas a · Siaga s · Waspada w)
24 jam terakhir: <tren singkat dari riwayat>
Perlu perhatian:
- <Kecamatan>: <status> – <faktor utama>
Sungai: Citarum <debit> m³/s (<status>), Kali Bekasi <debit> m³/s (<status>)
Rob: puncak <tinggi> m pukul <jam> (<status>)
Hujan 24 jam ke depan: <ringkas, sebut kecamatan dengan prakiraan tertinggi>
Prioritas hari ini:
1. ...
2. ...
3. ...
Data <jam> · bekasi-siaga-banjir.vercel.app · bukan status resmi BPBD
```

## Pitfalls
- Jika semua Normal, tetap kirim briefing singkat (4–5 baris) berisi prakiraan dan tindakan pemeliharaan.
- Jika ada sumber data gagal, tulis "Catatan: data <sumber> tidak tersedia".
- Jangan menyalin briefing kemarin; semua angka dari tool hari ini.
