---
name: cek-status-banjir
description: Menjawab pertanyaan tentang risiko atau status banjir, hujan, debit sungai, dan pasang laut (rob) di 23 kecamatan Kabupaten Bekasi, memakai data live dashboard Bekasi Siaga Banjir. Pakai setiap kali pengguna bertanya "aman nggak", "banjir nggak", status Waspada/Siaga/Awas, atau mengirim lokasi di sekitar Bekasi.
---

# Cek status banjir Kabupaten Bekasi

Sumber kebenaran satu-satunya adalah endpoint dashboard:

| Kebutuhan | URL |
|---|---|
| Ringkasan kabupaten + semua kecamatan | `https://bekasi-siaga-banjir.vercel.app/api/status` |
| Satu kecamatan (nama atau id 01–23) | `https://bekasi-siaga-banjir.vercel.app/api/status?kecamatan=Babelan` |
| Dari lokasi pengguna | `https://bekasi-siaga-banjir.vercel.app/api/status?lat=-6.10&lon=107.03` |

Ambil dengan tool web/HTTP yang tersedia (atau `curl -s "<url>"`). Respons berupa JSON.

## Aturan

1. **Selalu panggil endpoint sebelum menyebut status, skor, atau angka.** Jangan menebak, jangan menghitung skor sendiri, jangan memakai jawaban lama dari memori.
2. Pakai `status`/`label`, `skor`, dan `alasan` apa adanya. Status: Normal (0), Waspada (1–2), Siaga (3–4), Awas (≥5).
3. Jika nama kecamatan tidak dikenal (HTTP 400), tawarkan daftar di `pilihan`. Jika pengguna menyebut desa atau tempat, minta kirim lokasi lalu pakai `lat`/`lon`. Jika `jarakKm` lebih dari 10, sampaikan bahwa lokasi mungkin di luar Kabupaten Bekasi.
4. Jika `sumberGagal` tidak kosong, sebutkan bahwa sebagian data sedang tidak tersedia.
5. Sebutkan waktu data (`diperbarui`, ubah ke WIB) dan akhiri dengan kalimat dari `catatan`.
6. Untuk status Siaga atau Awas, sertakan 2–3 butir `rekomendasi` dan nomor darurat 112.

## Format jawaban (singkat, bahasa sehari-hari)

```
Babelan: SIAGA (skor 3)
Penyebab: hujan 60 mm, debit Kali Bekasi tinggi, dataran rendah 2 m.
Besok: pagi berawan, siang hujan ringan, malam hujan sedang.
Data 31 Okt 13.00 WIB. Informatif, bukan status resmi. Darurat: 112.
Detail: https://bekasi-siaga-banjir.vercel.app
```

Untuk pertanyaan umum ("Bekasi gimana hari ini?"), pakai `kabupaten.status`, `kabupaten.tertinggi`, `sungai`, dan `laut`.
