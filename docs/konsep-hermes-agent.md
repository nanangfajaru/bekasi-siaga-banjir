# Konsep: Hermes Agent untuk Bekasi Siaga Banjir

Dokumen rancangan. Belum diimplementasikan.

## Gagasan utama

Dashboard sekarang bersifat **tarik (pull)**: warga atau petugas harus membuka web untuk tahu status. Hermes Agent ([Nous Research](https://github.com/NousResearch/hermes-agent)) menambahkan sisi **dorong (push) dan percakapan**: status banjir datang sendiri ke Telegram/WhatsApp, warga bisa bertanya dengan bahasa sehari-hari, dan warga bisa mengirim laporan banjir lewat chat.

Prinsip yang tidak boleh dilanggar:

> **Agent tidak pernah menghitung status sendiri.** Skor dan status selalu berasal dari rumus dashboard (deterministik, bisa diaudit). Agent hanya membaca, merangkum, menyampaikan, dan mengumpulkan laporan.

Dengan begitu, angka di chat selalu sama dengan angka di dashboard, dan model bahasa tidak bisa "mengarang" status Awas.

## Arsitektur

```
Sumber data (BMKG, Open-Meteo, GloFAS, SMOC, PetaBencana)
              │
              ▼
Vercel: api/cuaca, sungai, laut, laporan, peringatan
              │
              ▼
[BARU] api/status  ← rumus skor yang sama dengan dashboard (api/_skor.js)
              │
     ┌────────┴─────────┐
     ▼                  ▼
Dashboard (web)   Hermes Agent (VPS kecil, proses selalu jalan)
                    ├─ Gateway: Telegram (utama), WhatsApp, Discord
                    ├─ Skill: cek-status, peringatan, lapor, briefing
                    ├─ Cron: pantau tiap 15 menit, briefing 06.00
                    └─ Model: Hermes via OpenRouter/Nous Portal (OpenAI-compatible)
                              │
                              ▼
                  [BARU] Basis data (mis. Supabase): pelanggan, laporan warga, log kiriman
```

Hermes Agent adalah proses Python yang berjalan terus (gateway + scheduler), jadi **tidak cocok di Vercel Serverless**. Tempatkan di VPS kecil (1 vCPU / 1–2 GB cukup) atau container; dashboard tetap di Vercel.

## Prasyarat penting: pindahkan rumus skor ke server

Saat ini fungsi `nilai()`, `statusSungai()`, dan `statusLaut()` hanya ada di `assets/app.js` (browser). Agent butuh hasil yang sama tanpa membuka browser.

1. Pindahkan rumus ke `api/_skor.js` (fungsi murni, tanpa DOM, tanpa `SIM`).
2. Buat `api/status.js` yang memanggil kelima sumber, menjalankan rumus, dan mengembalikan:

```json
{
  "diperbarui": "2026-10-31T06:00:00Z",
  "kabupaten": { "status": "siaga", "terburuk": "Muaragembong" },
  "kecamatan": [
    { "id": "17", "nama": "Muaragembong", "skor": 4, "status": "siaga",
      "alasan": ["pasang laut sangat tinggi (rob)", "debit sungai tinggi", "dataran rendah 2 m"] }
  ],
  "sumberGagal": []
}
```

3. Dashboard juga mengimpor `_skor.js` (atau tetap memakai salinan yang diuji sama) supaya satu sumber kebenaran.

Langkah ini bermanfaat juga di luar agent: endpoint `api/status` bisa dipakai pihak lain (BPBD, aplikasi kelurahan).

## Empat peran agent

### 1. Asisten tanya-jawab warga
- "Babelan aman nggak malam ini?" → agent memanggil `api/status` dan `api/cuaca`, menjawab status, alasan, dan prakiraan hujan pagi/siang/malam.
- Warga bisa kirim **lokasi (share location)**; agent mencari kecamatan terdekat (`jarakKm` di `_lib.js`).
- Jawaban selalu menyertakan waktu data dan kalimat: *informatif, bukan penetapan status resmi*.

### 2. Peringatan dini proaktif (cron)
- Tiap 15 menit agent membaca `api/status` dan membandingkan dengan status sebelumnya.
- Kirim pesan **hanya jika status naik** (mis. Waspada → Siaga) ke pelanggan kecamatan itu. Turun status cukup dikirim sekali sebagai "kondisi membaik".
- Anti-spam: status harus bertahan 2 kali pengecekan berturut-turut sebelum dikirim, dan maksimal 1 pesan per kecamatan per 3 jam kecuali naik ke Awas.
- Status **Awas** untuk siaran massal sebaiknya lewat **persetujuan operator** (human-in-the-loop): agent menyiapkan draf, operator menekan "kirim".

### 3. Penerima laporan warga
- Warga kirim foto + lokasi + teks ("air selutut di depan masjid").
- Agent menstrukturkan: kecamatan, perkiraan kedalaman (cm), waktu, foto. Disimpan di basis data dengan status `belum_diverifikasi`.
- Laporan baru tampil di panel "Laporan warga" dashboard dan masuk ke skor **setelah diverifikasi** (atau dengan bobot lebih kecil, mis. +1, jika ≥2 laporan independen di kecamatan yang sama dalam 3 jam).
- Opsional: teruskan ke PetaBencana.id agar ekosistem yang ada ikut terisi.

### 4. Asisten operator BPBD / ruang kendali
- Briefing otomatis 06.00 dan 18.00: ringkasan kabupaten, 5 kecamatan berisiko tertinggi, sungai dan rob, rekomendasi tindakan (diambil dari daftar `POLICY` yang sudah ada).
- Perintah cepat: `/ringkas`, `/draf-rilis` (draf siaran pers), `/simulasi 2020-01-01` (memanggil `api/simulasi`).

## Skill yang dibuat

Hermes Agent memakai skill berformat agentskills.io (folder berisi `SKILL.md` + skrip). Usulan:

| Skill | Fungsi | Memanggil |
|---|---|---|
| `cek-status-banjir` | Status per kecamatan/lokasi | `api/status`, `api/cuaca` |
| `pantau-dan-peringatkan` | Dijalankan cron, bandingkan status, kirim ke pelanggan | `api/status`, DB pelanggan |
| `terima-laporan-banjir` | Strukturkan laporan warga, simpan | DB laporan |
| `briefing-harian` | Ringkasan untuk operator | `api/status`, `api/sungai`, `api/laut`, `api/peringatan` |

Alternatif yang lebih rapi: bungkus endpoint sebagai **MCP server** kecil (`tools: get_status, get_forecast, submit_report, subscribe`). Hermes Agent mendukung MCP, dan server yang sama bisa dipakai agent lain di kemudian hari.

## Memori: apa disimpan di mana

- **Memori agent (MEMORY.md / USER.md)**: preferensi gaya bicara, kebiasaan pengguna. Cocok untuk hal yang "lunak".
- **Basis data**: langganan kecamatan, riwayat status, log pesan terkirim, laporan warga. Data ini harus pasti dan bisa dihitung, **jangan** disimpan di memori agent.

## Keamanan dan etika

- Angka hanya dari tool; prompt sistem melarang menyebut status tanpa memanggil `api/status`.
- Jika sumber data gagal, agent mengatakan data tidak lengkap, bukan menebak.
- Lokasi pelapor disimpan seperlunya (dibulatkan ke ~100 m untuk tampilan publik), foto bisa dihapus atas permintaan.
- Batasi tool agent: tanpa akses shell/terminal di produksi, hanya skill di atas.
- Rate limit per pengguna untuk mencegah penyalahgunaan dan biaya model.
- Sertakan nomor darurat (BPBD Kab. Bekasi, 112) di setiap pesan Siaga/Awas.

## Tahapan

| Fase | Isi | Hasil yang bisa didemokan |
|---|---|---|
| 1 | `api/_skor.js` + `api/status`; Hermes + Telegram + skill `cek-status-banjir` | Bot menjawab status kecamatan |
| 2 | DB pelanggan, `/langganan`, cron 15 menit + anti-spam | Peringatan otomatis saat status naik (uji dengan `api/simulasi`) |
| 3 | `terima-laporan-banjir` + panel dashboard + verifikasi | Laporan chat muncul di peta |
| 4 | Briefing operator, draf rilis, WhatsApp | Ruang kendali dapat ringkasan rutin |

## Nilai untuk tugas Smart City

- Domain **Smart Environment** (data lingkungan) kini terhubung ke **Smart People** (partisipasi warga lewat laporan) dan **Smart Governance** (dukungan keputusan operator).
- Metrik evaluasi yang bisa diukur: waktu dari status naik sampai pesan terkirim, jumlah pelanggan per kecamatan, jumlah laporan warga terverifikasi, dan kecocokan jawaban bot dengan dashboard (harus 100%).
