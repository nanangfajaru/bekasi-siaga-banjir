# Hermes Agent: Siaga Banjir Kabupaten Bekasi

Agent pengelola siaga banjir berbasis [Hermes Agent](https://hermes-agent.nousresearch.com) (Nous Research, open-source MIT). Agent ini **bisa memakai model apa pun**, misalnya Nous Portal, OpenRouter, Anthropic, OpenAI, Gemini, Kimi, GLM, NVIDIA NIM, atau model lokal lewat Ollama/LM Studio. Datanya diambil dari dashboard [bekasi-siaga-banjir.vercel.app](https://bekasi-siaga-banjir.vercel.app).

Folder ini adalah **profile distribution** Hermes, yaitu satu paket berisi persona, plugin tool, skill, skrip watchdog, jadwal cron, dan config. Paket dipasang dengan satu perintah.

## Yang bisa dilakukan agent

| Kemampuan | Cara kerja |
|---|---|
| Menjawab warga & petugas di Telegram/Discord/WhatsApp/CLI | Gateway Hermes + persona `SOUL.md` |
| Status live 23 kecamatan, alasan & poin skornya | Tool `siaga_status_kabupaten`, `siaga_detail_kecamatan` (rumus sama persis dengan dashboard) |
| Sungai, rob, peringatan BMKG, laporan warga | `siaga_debit_sungai`, `siaga_pasang_laut`, `siaga_peringatan_laporan` |
| Simulasi tanggal & "bagaimana jika" | `siaga_simulasi_tanggal`, `siaga_skenario` |
| **Watchdog eskalasi setiap 15 menit, nol token saat aman** | Skrip `watchdog_siaga.py` menghitung skor tanpa AI. Agent hanya dibangunkan saat status naik ke Siaga/Awas atau pulih |
| **Memori riwayat & tren** | Setiap 15 menit snapshot disimpan ke SQLite → `siaga_riwayat` ("sejak kapan Siaga?", "memburuk/membaik?") |
| **Pencatatan kejadian nyata** | `siaga_catat_kejadian` + skill verifikasi laporan warga (teks/foto/lokasi) |
| **Evaluasi akurasi & saran kalibrasi** | `siaga_evaluasi`: probabilitas deteksi, alarm palsu, lead time, faktor yang terlewat |
| **Siaran publik dengan persetujuan manusia** | `siaga_kirim_siaran` selalu meminta persetujuan (hook `pre_tool_call`) dan hanya bisa dipakai petugas terdaftar |
| Status instan tanpa AI | Slash command `/siaga` dan `/siaga <kecamatan>` |
| Konteks otomatis | Hook `pre_llm_call` menyisipkan ringkasan status, hanya saat status berubah supaya hemat token |
| Briefing 06.00, outlook 17.00, laporan Senin 07.00 | `cron/jobs.json` + skill `siaga-briefing`, `siaga-laporan-mingguan` |

## Isi folder

```
hermes/
├── distribution.yaml              manifest paket + variabel lingkungan
├── SOUL.md                        persona, prinsip keselamatan, gaya bicara
├── config.yaml                    model bebas (provider auto), plugin aktif, fallback (contoh)
├── plugins/siaga_banjir/          plugin Python (tanpa dependensi luar)
│   ├── core.py                    ambil data, rumus skor, riwayat SQLite, evaluasi, deteksi eskalasi
│   ├── schemas.py · tools.py      11 tool siaga_*
│   └── __init__.py                registrasi tool, hook, slash command /siaga
├── scripts/watchdog_siaga.py      pra-cek cron (gerbang wakeAgent)
├── skills/siaga-banjir/           SOP operasi, briefing, laporan mingguan, verifikasi laporan warga
└── cron/jobs.json                 watchdog 15 menit, briefing pagi, outlook malam, laporan mingguan
```

## Pemasangan

```bash
# 1. Pasang Hermes Agent (Linux / macOS / WSL2 / Termux)
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash

# 2. Ambil repo ini dan pasang profilnya
git clone https://github.com/nanangfajaru/bekasi-siaga-banjir.git
hermes profile install ./bekasi-siaga-banjir/hermes --alias

# 3. Pilih model, bebas penyedianya
siaga-banjir-bekasi model          # = hermes -p siaga-banjir-bekasi model

# 4. Isi .env profil (salin dari .env.EXAMPLE yang dibuat installer)
#    ~/.hermes/profiles/siaga-banjir-bekasi/.env

# 5. Pastikan plugin aktif lalu coba di terminal
siaga-banjir-bekasi plugins enable siaga_banjir
siaga-banjir-bekasi chat           # coba: "bagaimana kondisi banjir sekarang?" atau /siaga

# 6. Hubungkan Telegram, lalu jalankan gateway (chat + cron)
siaga-banjir-bekasi gateway setup
siaga-banjir-bekasi gateway

# 7. Jadwal dari distribusi terpasang dalam keadaan PAUSE. Tinjau lalu aktifkan:
siaga-banjir-bekasi cron list
siaga-banjir-bekasi cron resume siaga-watchdog
siaga-banjir-bekasi cron resume siaga-briefing-pagi
siaga-banjir-bekasi cron resume siaga-outlook-malam
siaga-banjir-bekasi cron resume siaga-laporan-mingguan
```

Pembaruan: tarik repo terbaru lalu jalankan `hermes profile install ./bekasi-siaga-banjir/hermes --force` (atau `hermes profile update` jika dipasang dari URL git). Memori, sesi, riwayat, dan `.env` Anda tidak tersentuh.

### Variabel `.env`

| Variabel | Fungsi |
|---|---|
| Kunci model (mis. `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`) | Diatur otomatis oleh `model` / `setup` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS` | Bot dan siapa saja yang boleh memakainya |
| `TELEGRAM_HOME_CHANNEL` | Grup petugas, tujuan peringatan & briefing cron |
| `SIAGA_PETUGAS_IDS` | ID Telegram petugas yang boleh memverifikasi kejadian & mengirim siaran |
| `SIAGA_SIARAN_CHAT_ID` | Kanal siaran warga (opsional) |
| `SIAGA_ALARM_MIN` | Status pemicu watchdog: `waspada`, `siaga` (default), `awas` |
| `SIAGA_COOLDOWN_JAM` | Jeda sebelum mengumumkan pemulihan (default 3 jam) |
| `SIAGA_BASE_URL` | Sumber data (default dashboard Vercel) |

## Model bebas: rekomendasi

- **Chat dengan warga/petugas**: pilih model yang kuat dalam tool calling dan bahasa Indonesia.
- **Cron** (watchdog, briefing): boleh model yang lebih murah lewat `cron.model` di `config.yaml`, karena pekerjaannya terstruktur dan skill-nya rinci.
- **Cadangan**: isi `fallback_providers`, idealnya satu model lokal (Ollama) supaya agent tetap hidup saat kuota habis atau internet bermasalah ketika banjir.
- Hitungan skor dilakukan di kode Python, bukan oleh model. Jadi status tetap konsisten apa pun model yang dipakai.

## Ide pengembangan lanjutan (roadmap)

**1. Multi-agent per peran (Kanban Hermes).** Pisahkan menjadi beberapa profil yang berkoordinasi lewat papan Kanban: *Analis Hidrometeorologi* (membaca data & tren), *Koordinator Lapangan* (posko, perahu, pompa, petugas piket), *Humas* (draf siaran, media sosial), dan *Verifikator Laporan*. Watchdog membuat tugas di papan, dan tiap agen mengerjakan bagiannya.

**2. Sensor & CCTV lewat MCP.** Tambahkan server MCP untuk pos duga air (TMA) BBWS Citarum, sensor IoT genangan, dan snapshot CCTV jalan. Agent bisa membaca tinggi muka air nyata, bukan hanya model debit.

**3. Verifikasi foto otomatis (vision).** Foto genangan dari warga dianalisis model vision untuk memperkirakan kedalaman, dicocokkan dengan lokasi dan data hujan, lalu dicatat sebagai kejadian. Wajah dan plat nomor diburamkan.

**4. Kalibrasi berbasis bukti.** `siaga_evaluasi` sudah menghitung deteksi, alarm palsu, dan lead time. Langkah berikutnya: backtest otomatis pada banjir 2020, 2021, 2025, dan rob Desember 2024, lalu agent mengusulkan perubahan ambang sebagai Pull Request ke repo. Manusia yang memutuskan merge.

**5. Rute evakuasi & titik pengungsian.** Data OpenStreetMap + daftar posko → agent menyarankan titik aman terdekat yang tidak melewati jalan tergenang.

**6. Inventaris logistik.** Tabel stok perahu, pompa, tenda, dan makanan per kecamatan. Saat Siaga/Awas, agent menghitung kekurangan dan mengusulkan pergeseran antar-kecamatan.

**7. Kanal warga multibahasa & suara.** WhatsApp, voice note (STT/TTS Hermes), bahasa Indonesia dan Sunda, untuk warga yang tidak nyaman mengetik.

**8. Langganan per desa.** Warga mendaftarkan desanya dan hanya menerima peringatan untuk wilayahnya. Data langganan disimpan di plugin storage.

**9. Prakiraan berbasis ML.** Model sederhana (gradient boosting) dilatih dari riwayat snapshot + kejadian untuk memprediksi probabilitas banjir 6–24 jam ke depan per kecamatan. Hasilnya menjadi faktor tambahan pada skor.

**10. Tata kelola & audit.** Log semua siaran (sudah ada di `plugin-data/siaga_banjir/siaran.jsonl`), dasbor kinerja agent, evaluasi jawaban berkala (golden questions), dan batas biaya per hari.

## Catatan
- Status dari agent bersifat informatif. Status bencana resmi ditetapkan BPBD Kabupaten Bekasi.
- Riwayat dan kejadian disimpan lokal di `~/.hermes/profiles/siaga-banjir-bekasi/plugin-data/siaga_banjir/riwayat.db`.
- Plugin ini sudah diuji offline: skor Python = skor dashboard JS untuk 23 kecamatan, 11 tool, watchdog, hook, dan slash command. Uji di Hermes sungguhan (`hermes plugins doctor`) belum dilakukan.
