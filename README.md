# Bekasi Siaga Banjir

Dashboard realtime risiko banjir 23 kecamatan di Kabupaten Bekasi. Tugas mata kuliah Smart City, domain **Smart Environment**.

**Web:** https://bekasi-siaga-banjir.vercel.app

## Isi dashboard

- **Kartu indikator**: curah hujan, debit sungai, pasang laut (rob), peringatan dini, dan laporan warga, lengkap dengan nilai saat ini, cara masuk ke skor, dan sumber data live.
- **Status kabupaten dan per kecamatan** (Normal, Waspada, Siaga, Awas), dihitung otomatis dari data live.
- **Peta risiko** dengan grafik debit sungai di sampingnya, dan **tabel peringkat risiko** semua kecamatan beserta faktor penyebabnya.
- **Curah hujan per jam**: 24 jam terakhir dan 24 jam ke depan.
- **Prakiraan cuaca BMKG 2 hari** (besok dan lusa) per desa pantau, dibagi pagi 06.00, siang 12.00, dan malam 18.00.
- **Debit sungai** Citarum dan Kali Bekasi: 14 hari lalu dan 7 hari prakiraan.
- **Pasang laut (rob)** pesisir utara: tinggi muka laut per jam, 2 hari lalu dan 7 hari prakiraan, dengan batas waspada/siaga/awas.
- **Peringatan dini cuaca BMKG** dan **laporan banjir warga**.
- **Rekomendasi tindakan pemerintah daerah** yang berubah mengikuti status.
- **Simulasi tanggal**: pilih tanggal s.d. 15 hari ke depan (prakiraan) atau sejak 2019 (arsip), termasuk putar ulang banjir 1 Jan 2020, 20 Feb 2021, 4 Mar 2025, dan rob 15 Des 2024.
- **Simulasi manual**: tambah hujan, debit sungai, dan muka laut dengan slider untuk peragaan.
- **Mode monitor**: tombol layar penuh untuk monitor besar di ruang kendali. Menampilkan ringkasan status, peta, dan grafik sungai, selalu data live, dan memuat ulang otomatis setiap 2 menit. Bisa dibuka langsung lewat `?monitor=1`.

## Sumber data (semua gratis, tanpa API key)

| Sumber | Endpoint | Isi |
|---|---|---|
| BMKG | `api.bmkg.go.id/publik/prakiraan-cuaca?adm4=...` | Prakiraan cuaca 3-jaman per desa |
| BMKG | `www.bmkg.go.id/alerts/nowcast/id/rss.xml` | Peringatan dini cuaca |
| Open-Meteo | `api.open-meteo.com/v1/forecast` | Curah hujan per jam dan elevasi |
| Open-Meteo Marine (SMOC) | `marine-api.open-meteo.com/v1/marine` | Tinggi muka laut per jam (pasang surut), sejak Nov 2022 |
| Open-Meteo (GloFAS) | `flood-api.open-meteo.com/v1/flood` | Debit sungai harian |
| Open-Meteo Archive (ERA5) | `archive-api.open-meteo.com/v1/archive` | Arsip curah hujan untuk simulasi tanggal lampau |
| PetaBencana.id | `api.petabencana.id/reports` | Laporan banjir warga |

## Struktur

| File | Isi |
|---|---|
| `api/cuaca.js` | Mengambil BMKG (23 desa pantau) dan Open-Meteo |
| `api/sungai.js` | Debit sungai dari Open-Meteo Flood API |
| `api/laporan.js` | Laporan banjir PetaBencana.id, difilter untuk Bekasi |
| `api/simulasi.js` | Data hujan, sungai, dan muka laut untuk tanggal pilihan |
| `api/laut.js` | Tinggi muka laut (pasang/rob) dari Open-Meteo Marine API |
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
- **Pasang laut (rob)** untuk kecamatan pesisir (Muaragembong, Tarumajaya, Babelan): puncak muka laut 24 jam ke depan dibanding persentil puncak harian Nov 2022–Okt 2026: ≥P90 (1,20 m) +1, ≥P95 (1,26 m) +2, ≥P99 (1,34 m) +3. Puncak tertinggi tercatat 14–17 Des 2024 (±1,37 m), saat rob besar di pesisir utara.
- **Dataran rendah** (≤5 m) +1, hanya jika ada faktor lain.

Status: 0 = Normal, 1–2 = Waspada, 3–4 = Siaga, ≥5 = Awas.

## AI Agent: Asisten Siaga Banjir

Agent berbasis Claude (tool use) yang membaca data live dashboard ini dan memakai **rumus skor yang sama persis** dengan tampilan (`api/_risiko.js`). Agent tidak mengarang angka: setiap angka diambil lewat tool.

**Kemampuan**
- Chat di dashboard (tombol **💬 Tanya Asisten** di kanan bawah) untuk warga dan petugas.
- Menjelaskan status kabupaten dan tiap kecamatan beserta faktor penyebab dan poinnya.
- Prakiraan BMKG besok dan lusa, debit sungai, pasang laut (rob), peringatan dini, laporan warga.
- Simulasi tanggal (arsip sejak 2019 atau prakiraan s.d. 15 hari) dan skenario "bagaimana jika" (tambah hujan, debit, muka laut).
- Rekomendasi tindakan pemda sesuai status, dengan pengingat bahwa status resmi ditetapkan BPBD.
- **Briefing otomatis** setiap pagi 06.00 WIB ke grup Telegram (opsional), lewat Vercel Cron.

**Tool yang dipakai agent**

| Tool | Isi |
|---|---|
| `status_kabupaten` | Status kabupaten, 23 kecamatan, top 5 risiko, ringkasan sungai/rob/peringatan/laporan, rekomendasi |
| `detail_kecamatan` | Skor dan faktor, hujan per jam, prakiraan BMKG 2 hari, peringatan & laporan setempat |
| `debit_sungai` | Citarum hilir dan Kali Bekasi: debit, ambang P50–P99, % kapasitas, deret 21 hari |
| `pasang_laut` | Muka laut sekarang, puncak 24 jam, puncak harian 7 hari |
| `peringatan_dan_laporan` | Peringatan dini BMKG (Bekasi) dan laporan PetaBencana.id |
| `simulasi_tanggal` | Status per kecamatan untuk tanggal pilihan (memakai `api/simulasi`) |
| `skenario` | "Bagaimana jika" di atas data live |

**File**

| File | Isi |
|---|---|
| `api/agent.js` | Endpoint chat `POST /api/agent` `{ messages: [{role, content}] }` → `{ jawaban, toolDipakai }` |
| `api/briefing.js` | `GET /api/briefing` (briefing teks), `?kirim=1` kirim ke Telegram, `?min=siaga` hanya jika status ≥ Siaga |
| `api/_agen.js` | Prompt sistem, definisi tool, loop tool-use Claude |
| `api/_risiko.js` | Rumus skor dan rekomendasi (port dari `assets/app.js`) |
| `api/_data.js` | Mengambil data dari endpoint `api/*` milik dashboard sendiri (ikut cache CDN) |
| `assets/agent.js` | Panel chat di dashboard |
| `vercel.json` | Cron briefing harian 23.00 UTC = 06.00 WIB |

**Pemasangan (Vercel → Settings → Environment Variables)**

| Variabel | Wajib | Keterangan |
|---|---|---|
| `ANTHROPIC_API_KEY` | ya | Kunci API dari console.anthropic.com |
| `ANTHROPIC_MODEL` | tidak | Default `claude-sonnet-5-5`. Pakai `claude-haiku-5-5` untuk biaya lebih murah |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | tidak | Untuk briefing/alarm ke grup Telegram (buat bot lewat @BotFather) |
| `CRON_SECRET` | disarankan | Hanya request ber-header `Authorization: Bearer <CRON_SECRET>` yang boleh mengirim ke Telegram. Vercel Cron menambahkannya otomatis |
| `AGENT_ALLOWED_ORIGIN` | tidak | Batasi domain yang boleh memanggil `/api/agent`, mis. `https://bekasi-siaga-banjir.vercel.app` |
| `DATA_BASE_URL` | tidak | Sumber data jika berbeda dari domain deploy |

Lalu deploy ulang. Uji cepat:

```bash
curl -X POST https://<domain>/api/agent -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Bagaimana kondisi banjir Kabupaten Bekasi sekarang?"}]}'
curl https://<domain>/api/briefing
```

**Alarm per jam.** Paket Vercel Hobby hanya mengizinkan cron harian. Untuk alarm tiap jam, pakai paket Pro (ubah jadwal di `vercel.json`) atau layanan cron gratis (mis. cron-job.org) yang memanggil `https://<domain>/api/briefing?kirim=1&min=siaga` dengan header `Authorization: Bearer <CRON_SECRET>`. Pesan hanya terkirim bila ada kecamatan Siaga/Awas.

**Biaya dan keamanan.** Endpoint `/api/agent` publik dan setiap pertanyaan memakai kredit API (±2–6 panggilan Claude per pertanyaan). Riwayat dibatasi 12 pesan × 1.500 karakter dan tidak disimpan di server. Atur batas pemakaian bulanan di console Anthropic.

## Hermes Agent (model bebas)

Folder [`hermes/`](hermes/README.md) berisi agent pengelola siaga banjir untuk [Hermes Agent](https://hermes-agent.nousresearch.com) (Nous Research). Agent ini bisa memakai model apa pun dan berjalan di Telegram, WhatsApp, Discord, atau CLI. Isinya:
- 11 tool data & analisis dengan rumus skor yang sama dengan dashboard
- watchdog tiap 15 menit yang tidak memakai token AI saat kondisi aman
- riwayat status, pencatatan kejadian, dan evaluasi akurasi peringatan
- briefing terjadwal, serta siaran publik yang selalu meminta persetujuan petugas

Pemasangan: `hermes profile install ./hermes --alias`. Langkah lengkap dan ide pengembangan ada di [hermes/README.md](hermes/README.md).

Dashboard ini bersifat informatif dan bukan penetapan status bencana resmi.
