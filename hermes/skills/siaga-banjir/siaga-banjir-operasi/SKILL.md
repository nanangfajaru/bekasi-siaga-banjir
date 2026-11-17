---
name: siaga-banjir-operasi
description: SOP operasional Siaga Banjir Kabupaten Bekasi — matriks status-tindakan, eskalasi, templat pesan petugas dan warga, dan aturan siaran publik.
version: 1.0.0
author: Bekasi Siaga Banjir
license: MIT
metadata:
  hermes:
    tags: [Banjir, Smart Environment, Bekasi, SOP, Kebencanaan]
    related_skills: [siaga-briefing, siaga-verifikasi-laporan, siaga-laporan-mingguan]
    requires_toolsets: [siaga_banjir]
---

# SOP Operasional Siaga Banjir Kabupaten Bekasi

## When to Use
- Menulis peringatan eskalasi (dari cron `siaga-watchdog`) atau pesan untuk grup petugas.
- Petugas menanyakan "apa yang harus dilakukan" untuk status tertentu.
- Menyusun draf siaran publik untuk warga.

## Cara skor dihitung (sama dengan dashboard)
| Faktor | Poin |
|---|---|
| Hujan maks 24 jam (lalu / prakiraan Open-Meteo / prakiraan BMKG) | ≥20 mm +1 · ≥50 +2 · ≥100 +3 · ≥150 +4 |
| Peringatan dini BMKG menyebut kecamatan | +2 |
| Laporan banjir warga (PetaBencana) | 24 jam +2 · 7 hari +1 |
| Debit sungai yang melintas, hari ini s.d. 3 hari (persentil 2019–2026) | ≥P90 +1 · ≥P95 +2 · ≥P99 +3 |
| Rob (Muaragembong, Tarumajaya, Babelan), puncak 24 jam | ≥1,20 m +1 · ≥1,26 +2 · ≥1,34 +3 |
| Dataran rendah ≤5 m (hanya jika ada faktor lain) | +1 |

Status: 0 Normal · 1–2 Waspada · 3–4 Siaga · ≥5 Awas.
Sungai: Citarum hilir → Kedung Waringin, Pebayuran, Sukakarya, Cabangbungin, Muaragembong. Kali Bekasi → Tarumajaya, Babelan, Tambun Utara, Tambun Selatan. Normal (median) Citarum ±239 m³/s, kapasitas hilir ±1.100 m³/s; Kali Bekasi ±18 m³/s.

## Matriks tindakan
| Status | Pemda/BPBD | Pesan ke warga |
|---|---|---|
| Normal | Bersihkan saluran & pintu air; uji pompa dan perahu karet; sosialisasi jalur evakuasi | Tidak perlu siaran |
| Waspada | Pantau tiap 3 jam; siagakan pompa portabel di titik genangan langganan; info dini via RT/RW | "Waspada hujan/air naik, siapkan tas siaga" |
| Siaga | Buka posko kecamatan; perahu & personel standby; siapkan evakuasi kelompok rentan; koordinasi pintu air dengan BBWS Citarum; pesisir: cek tanggul, tutup pintu air muara saat pasang | "Siap mengungsi, amankan barang & dokumen, pantau info RT" |
| Awas | Evakuasi permukiman tergenang; dapur umum & pengungsian; usulkan status tanggap darurat ke Bupati; tutup jalan terendam | "Segera mengungsi ke titik aman, hubungi 112 bila butuh bantuan" |

## Prosedur: peringatan eskalasi (cron watchdog)
1. Konteks cron berisi `eskalasi` (kecamatan, dari → ke, skor, faktor) dan `pulih`.
2. Untuk setiap kecamatan yang naik ke **Awas**, panggil `siaga_detail_kecamatan` untuk prakiraan & laporan warga terbaru. Untuk >3 kecamatan, cukup `siaga_status_kabupaten`.
3. Tulis pesan untuk grup petugas, teks polos ≤1.200 karakter:
   ```
   ⚠️ ESKALASI SIAGA BANJIR – <tanggal jam> WIB
   <Kecamatan>: <Dari> → <KE> (skor N)
   Penyebab: <faktor utama>
   Prakiraan: <hujan 24 jam ke depan / puncak debit / jam pasang tertinggi>
   Tindakan prioritas:
   1. ...
   2. ...
   3. ...
   Status kabupaten: <status> · Data <jam> · Bukan status resmi BPBD
   ```
4. Jika hanya ada `pulih`, tulis 2–3 baris "kondisi membaik" dan sarankan tetap memantau.
5. Jangan memanggil `siaga_kirim_siaran` dari cron. Boleh menyertakan **draf** siaran warga di akhir pesan dengan label "DRAF SIARAN (perlu persetujuan petugas)".

## Prosedur: siaran publik (atas permintaan petugas)
1. Panggil tool data terbaru; jangan memakai angka dari percakapan lama.
2. Draf ≤600 karakter: wilayah, apa yang terjadi/diperkirakan, tindakan warga, 112, "info resmi: BPBD Kab. Bekasi".
3. Tunjukkan draf ke petugas → setelah setuju, panggil `siaga_kirim_siaran` (sistem akan meminta persetujuan sekali lagi).

## Pitfalls
- Jangan mengubah skor/status sendiri; laporkan apa adanya lalu beri konteks.
- Rob dan hujan bisa terjadi bersamaan di pesisir: sebutkan jam pasang tertinggi.
- Laporan PetaBencana bisa berasal dari Kota Bekasi; yang dihitung hanya Kabupaten.
- Status naik karena **satu** laporan warga perlu dicek ulang (lihat skill `siaga-verifikasi-laporan`).

## Verification
Pesan menyebut waktu data, sumber, dan "bukan status resmi BPBD"; setiap angka berasal dari hasil tool pada giliran ini.
