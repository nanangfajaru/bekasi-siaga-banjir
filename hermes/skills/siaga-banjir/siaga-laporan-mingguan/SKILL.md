---
name: siaga-laporan-mingguan
description: Laporan mingguan kinerja sistem Siaga Banjir Bekasi — rekap status, kejadian banjir, evaluasi akurasi peringatan (deteksi, alarm palsu, lead time), dan rekomendasi kalibrasi.
version: 1.0.0
author: Bekasi Siaga Banjir
license: MIT
metadata:
  hermes:
    tags: [Banjir, Evaluasi, Laporan, Bekasi]
    related_skills: [siaga-banjir-operasi, siaga-briefing]
    requires_toolsets: [siaga_banjir]
---

# Laporan Mingguan & Evaluasi Akurasi

## When to Use
Cron Senin pagi, atau pertanyaan "seberapa akurat sistem ini", "rekap minggu ini", "perlu ubah ambang?".

## Procedure
1. `siaga_riwayat` (tanpa kecamatan, jam=168): jam per status di tingkat kabupaten dan perubahan status.
2. Untuk kecamatan yang pernah Siaga/Awas minggu ini, `siaga_riwayat` per kecamatan (maks 5, jam=168).
3. `siaga_evaluasi` (hari=7) lalu (hari=90) untuk tren jangka panjang.
4. Tulis laporan:

```
LAPORAN MINGGUAN SIAGA BANJIR – <rentang tanggal>
1. Ringkasan: <jam Awas/Siaga/Waspada di tingkat kabupaten>, kecamatan paling sering berisiko.
2. Kejadian tercatat: <jumlah, terverifikasi, lokasi utama>.
3. Akurasi peringatan (7 hari | 90 hari):
   - Deteksi: x% | y%   - Alarm palsu: x% | y%   - Lead time rata-rata: x jam | y jam
4. Kejadian terlewat & penyebabnya.
5. Rekomendasi:
   - Kalibrasi (dari saran evaluasi) – tandai sebagai USULAN untuk dibahas tim, bukan perubahan otomatis.
   - Operasional (posko, pompa, pembersihan saluran di kecamatan langganan).
   - Data: kejadian yang perlu diverifikasi petugas.
```

## Pitfalls
- Dengan <5 kejadian tercatat, angka akurasi belum bermakna: katakan demikian.
- "Alarm palsu" bisa berarti banjir terjadi tapi tidak dicatat; dorong petugas mencatat kejadian.
- Jangan pernah mengubah ambang atau kode sendiri; perubahan rumus dilakukan tim lewat repo.
