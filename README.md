# Bekasi Siaga Banjir

Dashboard realtime risiko banjir 23 kecamatan di Kabupaten Bekasi. Tugas mata kuliah Smart City, domain **Smart Environment**.

**Web:** https://bekasi-siaga-banjir.vercel.app

## Isi dashboard

- **Status kabupaten dan per kecamatan** (Normal, Waspada, Siaga, Awas), dihitung otomatis dari data live.
- **Peta risiko**, peringkat kecamatan, dan tabel semua kecamatan.
- **Curah hujan per jam**: 24 jam terakhir dan 24 jam ke depan.
- **Prakiraan cuaca BMKG** per desa pantau.
- **Debit sungai** Citarum dan Kali Bekasi: 14 hari lalu dan 7 hari prakiraan.
- **Peringatan dini cuaca BMKG** dan **laporan banjir warga**.
- **Rekomendasi tindakan pemerintah daerah** yang berubah mengikuti status.
- **Mode simulasi** untuk peragaan saat cuaca sedang cerah.

## Sumber data (semua gratis, tanpa API key)

| Sumber | Endpoint | Isi |
|---|---|---|
| BMKG | `api.bmkg.go.id/publik/prakiraan-cuaca?adm4=...` | Prakiraan cuaca 3-jaman per desa |
| BMKG | `www.bmkg.go.id/alerts/nowcast/id/rss.xml` | Peringatan dini cuaca |
| Open-Meteo | `api.open-meteo.com/v1/forecast` | Curah hujan per jam dan elevasi |
| Open-Meteo (GloFAS) | `flood-api.open-meteo.com/v1/flood` | Debit sungai harian |
| PetaBencana.id | `api.petabencana.id/reports` | Laporan banjir warga |

## Struktur

| File | Isi |
|---|---|
| `api/cuaca.js` | Mengambil BMKG (23 desa pantau) dan Open-Meteo |
| `api/sungai.js` | Debit sungai dari Open-Meteo Flood API |
| `api/laporan.js` | Laporan banjir PetaBencana.id, difilter untuk Bekasi |
| `api/peringatan.js` | Peringatan dini BMKG, dicocokkan dengan nama kecamatan |
| `api/_lib.js` | Daftar kecamatan (kode desa BMKG, koordinat) dan titik sungai |
| `index.html`, `assets/` | Tampilan dashboard |

Endpoint `api/` berjalan sebagai Vercel Serverless Functions. Data di-cache 5–60 menit, dan halaman memuat ulang otomatis setiap 10 menit.

## Cara status dihitung

Skor per kecamatan:

- **Curah hujan** (nilai terbesar dari 24 jam lalu, prakiraan Open-Meteo, dan prakiraan BMKG): ≥20 mm +1, ≥50 mm +2, ≥100 mm +3, ≥150 mm +4.
- **Peringatan dini BMKG** untuk kecamatan tersebut: +2.
- **Laporan banjir warga**: +2 jika dalam 24 jam, +1 jika dalam 7 hari.
- **Sungai** yang melintas: puncak 7 hari ke depan ≥1,5× rata-rata 14 hari +1, ≥2× +2, hanya jika melampaui puncak 14 hari terakhir.
- **Dataran rendah** (≤5 m) +1, hanya jika ada faktor lain.

Status: 0 = Normal, 1–2 = Waspada, 3–4 = Siaga, ≥5 = Awas.

Dashboard ini bersifat informatif dan bukan penetapan status bencana resmi.
