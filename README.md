# Bekasi Siaga Banjir

Dashboard realtime risiko banjir 23 kecamatan di Kabupaten Bekasi. Tugas mata kuliah Smart City, domain **Smart Environment**.

**Web:** https://bekasi-siaga-banjir.vercel.app

## Isi dashboard

- **Kartu indikator**: curah hujan, debit sungai, peringatan dini, dan laporan warga, lengkap dengan nilai saat ini, cara masuk ke skor, dan sumber data live.
- **Status kabupaten dan per kecamatan** (Normal, Waspada, Siaga, Awas), dihitung otomatis dari data live.
- **Peta risiko**, peringkat kecamatan, dan tabel semua kecamatan.
- **Curah hujan per jam**: 24 jam terakhir dan 24 jam ke depan.
- **Prakiraan cuaca BMKG 2 hari** (besok dan lusa) per desa pantau, dibagi pagi 06.00, siang 12.00, dan malam 18.00.
- **Debit sungai** Citarum dan Kali Bekasi: 14 hari lalu dan 7 hari prakiraan.
- **Peringatan dini cuaca BMKG** dan **laporan banjir warga**.
- **Rekomendasi tindakan pemerintah daerah** yang berubah mengikuti status.
- **Simulasi tanggal**: pilih tanggal s.d. 15 hari ke depan (prakiraan) atau sejak 2019 (arsip), termasuk putar ulang banjir 1 Jan 2020, 20 Feb 2021, dan 4 Mar 2025.
- **Simulasi manual**: tambah hujan dan debit sungai dengan slider untuk peragaan.

## Sumber data (semua gratis, tanpa API key)

| Sumber | Endpoint | Isi |
|---|---|---|
| BMKG | `api.bmkg.go.id/publik/prakiraan-cuaca?adm4=...` | Prakiraan cuaca 3-jaman per desa |
| BMKG | `www.bmkg.go.id/alerts/nowcast/id/rss.xml` | Peringatan dini cuaca |
| Open-Meteo | `api.open-meteo.com/v1/forecast` | Curah hujan per jam dan elevasi |
| Open-Meteo (GloFAS) | `flood-api.open-meteo.com/v1/flood` | Debit sungai harian |
| Open-Meteo Archive (ERA5) | `archive-api.open-meteo.com/v1/archive` | Arsip curah hujan untuk simulasi tanggal lampau |
| PetaBencana.id | `api.petabencana.id/reports` | Laporan banjir warga |

## Struktur

| File | Isi |
|---|---|
| `api/cuaca.js` | Mengambil BMKG (23 desa pantau) dan Open-Meteo |
| `api/sungai.js` | Debit sungai dari Open-Meteo Flood API |
| `api/laporan.js` | Laporan banjir PetaBencana.id, difilter untuk Bekasi |
| `api/simulasi.js` | Data hujan & sungai untuk tanggal pilihan |
| `api/peringatan.js` | Peringatan dini BMKG, dicocokkan dengan nama kecamatan |
| `api/_lib.js` | Daftar kecamatan (kode desa BMKG, koordinat) dan titik sungai |
| `index.html`, `assets/` | Tampilan dashboard |

Endpoint `api/` berjalan sebagai Vercel Serverless Functions. Data di-cache 5–60 menit, dan halaman memuat ulang otomatis setiap 10 menit.

## Cara status dihitung

Skor per kecamatan:

- **Curah hujan** (nilai terbesar dari 24 jam lalu, prakiraan Open-Meteo, dan prakiraan BMKG): ≥20 mm +1, ≥50 mm +2, ≥100 mm +3, ≥150 mm +4.
- **Peringatan dini BMKG** untuk kecamatan tersebut: +2.
- **Laporan banjir warga**: +2 jika dalam 24 jam, +1 jika dalam 7 hari.
- **Sungai** yang melintas: debit tertinggi hari itu s.d. 3 hari ke depan dibanding persentil debit harian 2019–2026 (model GloFAS): ≥P90 +1, ≥P95 +2, ≥P99 +3. Normal (median) Citarum hilir ±239 m³/s, Kali Bekasi ±18 m³/s.
- **Dataran rendah** (≤5 m) +1, hanya jika ada faktor lain.

Status: 0 = Normal, 1–2 = Waspada, 3–4 = Siaga, ≥5 = Awas.

Dashboard ini bersifat informatif dan bukan penetapan status bencana resmi.
