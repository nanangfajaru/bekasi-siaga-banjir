"""Skema tool Siaga Banjir: inilah yang dibaca model untuk memutuskan tool mana yang dipanggil."""

_KEC = {"type": "string", "description": "Nama kecamatan di Kabupaten Bekasi, mis. 'Pebayuran', 'Muara Gembong', 'Tambun Selatan'"}
_NONE = {"type": "object", "properties": {}, "required": []}

STATUS_KABUPATEN = {
    "name": "siaga_status_kabupaten",
    "description": "Status risiko banjir TERKINI seluruh Kabupaten Bekasi: status kabupaten, jumlah kecamatan per status, 5 kecamatan berisiko tertinggi beserta faktornya, ringkasan sungai/rob/peringatan/laporan, dan rekomendasi tindakan. Panggil pertama untuk pertanyaan umum tentang kondisi banjir.",
    "parameters": _NONE,
}

DETAIL_KECAMATAN = {
    "name": "siaga_detail_kecamatan",
    "description": "Detail satu kecamatan: skor, status, faktor penyebab dan poinnya, peringkat risiko, curah hujan per 3 jam (24 jam lalu & 24 jam depan), prakiraan BMKG besok & lusa (pagi/siang/malam), peringatan dini & laporan warga setempat, sungai yang melintas, dan rekomendasi tindakan.",
    "parameters": {"type": "object", "properties": {"kecamatan": _KEC}, "required": ["kecamatan"]},
}

DEBIT_SUNGAI = {
    "name": "siaga_debit_sungai",
    "description": "Debit Sungai Citarum hilir dan Kali Bekasi (model GloFAS): debit hari ini, puncak 3 & 7 hari ke depan, ambang P50/P90/P95/P99, % dari normal, % kapasitas, status, kecamatan terdampak, dan deret harian 14 hari lalu + 7 hari prakiraan.",
    "parameters": _NONE,
}

PASANG_LAUT = {
    "name": "siaga_pasang_laut",
    "description": "Tinggi muka laut (pasang/rob) pesisir utara Bekasi (Muaragembong, Tarumajaya, Babelan): nilai sekarang, puncak 24 jam beserta jamnya, puncak harian hingga 7 hari ke depan, ambang rob, dan status.",
    "parameters": _NONE,
}

PERINGATAN_LAPORAN = {
    "name": "siaga_peringatan_laporan",
    "description": "Peringatan dini cuaca BMKG (nowcast) yang menyebut kecamatan di Kabupaten Bekasi, dan laporan banjir warga PetaBencana.id 7 hari terakhir (waktu, kecamatan terdekat, kedalaman, teks).",
    "parameters": _NONE,
}

SIMULASI_TANGGAL = {
    "name": "siaga_simulasi_tanggal",
    "description": "Hitung status per kecamatan untuk tanggal tertentu: s.d. 15 hari ke depan (prakiraan) atau sejak 2019-01-01 (arsip reanalisis ERA5). Contoh banjir besar: 2020-01-01, 2021-02-20, 2025-03-04; rob besar 2024-12-15. Simulasi tidak memasukkan peringatan dini dan laporan warga.",
    "parameters": {"type": "object", "properties": {"tanggal": {"type": "string", "description": "Tanggal format YYYY-MM-DD"}}, "required": ["tanggal"]},
}

SKENARIO = {
    "name": "siaga_skenario",
    "description": "Simulasi 'bagaimana jika' di atas data live: tambah curah hujan 24 jam (mm), kalikan debit sungai, dan/atau tambah muka laut (m), lalu lihat kecamatan mana yang berubah status. Untuk perencanaan kontinjensi dan latihan.",
    "parameters": {"type": "object", "properties": {
        "tambah_hujan_mm": {"type": "number", "description": "Tambahan hujan 24 jam dalam mm (0–300)"},
        "pengali_debit": {"type": "number", "description": "Pengali debit sungai, mis. 1.5 = naik 50% (0.5–4)"},
        "tambah_laut_m": {"type": "number", "description": "Tambahan muka laut dalam meter (0–1)"},
    }, "required": []},
}

RIWAYAT = {
    "name": "siaga_riwayat",
    "description": "Riwayat status risiko yang direkam watchdog setiap 15 menit: perubahan status, puncak, jam per status, dan tren (memburuk/stabil/membaik). Tanpa kecamatan = riwayat status kabupaten. Gunakan untuk pertanyaan 'sejak kapan', 'bagaimana trennya', atau laporan berkala.",
    "parameters": {"type": "object", "properties": {
        "kecamatan": {**_KEC, "description": "Opsional. Kosongkan untuk tingkat kabupaten."},
        "jam": {"type": "integer", "description": "Rentang ke belakang dalam jam (default 72, maks 2160)"},
    }, "required": []},
}

CATAT_KEJADIAN = {
    "name": "siaga_catat_kejadian",
    "description": "Catat kejadian banjir/genangan/rob yang BENAR-BENAR terjadi (dari petugas atau warga) ke basis data kejadian. Data ini dipakai untuk mengukur akurasi peringatan (siaga_evaluasi). Tanyakan dulu lokasi (kecamatan/desa), waktu, dan perkiraan kedalaman bila belum jelas. Set terverifikasi=true hanya jika dikonfirmasi petugas atau bukti kuat (foto + lokasi + waktu konsisten).",
    "parameters": {"type": "object", "properties": {
        "kecamatan": _KEC,
        "desa": {"type": "string", "description": "Nama desa/kelurahan atau perumahan"},
        "waktu_kejadian": {"type": "string", "description": "Waktu mulai tergenang, ISO 8601 WIB, mis. 2026-11-17T14:30. Kosong = sekarang"},
        "kedalaman_cm": {"type": "number", "description": "Perkiraan kedalaman air (cm). Patokan: mata kaki ±10, lutut ±50, pinggang ±100"},
        "jenis": {"type": "string", "enum": ["banjir", "genangan", "rob", "luapan sungai", "tanggul jebol"]},
        "sumber": {"type": "string", "description": "Asal informasi, mis. 'petugas BPBD', 'warga via Telegram', 'foto warga'"},
        "catatan": {"type": "string", "description": "Ringkasan: jumlah rumah/KK terdampak, akses jalan, kebutuhan mendesak"},
        "terverifikasi": {"type": "boolean"},
    }, "required": ["kecamatan"]},
}

EVALUASI = {
    "name": "siaga_evaluasi",
    "description": "Evaluasi akurasi sistem peringatan: bandingkan riwayat status dengan kejadian banjir yang tercatat. Menghasilkan probabilitas deteksi, rasio alarm palsu, rata-rata lead time (jam), kejadian terlewat, dan saran kalibrasi ambang. Gunakan untuk laporan mingguan/bulanan atau saat ditanya 'seberapa akurat'.",
    "parameters": {"type": "object", "properties": {
        "hari": {"type": "integer", "description": "Periode evaluasi dalam hari (7–400, default 90)"},
        "hanya_terverifikasi": {"type": "boolean", "description": "Hanya pakai kejadian terverifikasi (default true)"},
    }, "required": []},
}

KIRIM_SIARAN = {
    "name": "siaga_kirim_siaran",
    "description": "Kirim pesan peringatan PUBLIK ke kanal/grup siaran warga (Telegram). Selalu meminta persetujuan manusia sebelum terkirim. Gunakan hanya untuk informasi yang sudah dicek dengan data terbaru; jangan menyebut status sebagai status resmi BPBD.",
    "parameters": {"type": "object", "properties": {
        "pesan": {"type": "string", "description": "Teks siaran, maks 1500 karakter, bahasa sederhana, sertakan tindakan yang harus dilakukan warga dan nomor darurat 112"},
        "kecamatan": {"type": "array", "items": {"type": "string"}, "description": "Kecamatan yang dituju (untuk log)"},
    }, "required": ["pesan"]},
}

SEMUA = [STATUS_KABUPATEN, DETAIL_KECAMATAN, DEBIT_SUNGAI, PASANG_LAUT, PERINGATAN_LAPORAN, SIMULASI_TANGGAL,
         SKENARIO, RIWAYAT, CATAT_KEJADIAN, EVALUASI, KIRIM_SIARAN]
