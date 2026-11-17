// Inti AI Agent "Asisten Siaga Banjir Bekasi": prompt sistem, definisi tool, dan loop tool-use Claude.
import { KECAMATAN, SUNGAI, LAUT, norm } from "./_lib.js";
import { nilaiSemua, ringkasKabupaten, statusSungai, statusLaut, POLICY, LABEL } from "./_risiko.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_LANGKAH = 8;

export function promptSistem() {
  const sekarang = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "full", timeStyle: "short" });
  return `Kamu adalah "Asisten Siaga Banjir Bekasi", AI Agent domain Smart Environment untuk Kabupaten Bekasi.
Waktu sekarang: ${sekarang} WIB.

TUGAS
- Menjawab pertanyaan warga dan petugas pemda tentang risiko banjir, hujan, debit sungai (Citarum, Kali Bekasi), pasang laut/rob pesisir utara, peringatan dini BMKG, dan laporan banjir warga di 23 kecamatan Kabupaten Bekasi.
- Menjelaskan MENGAPA sebuah kecamatan berstatus tertentu (faktor dan poinnya), memberi rekomendasi tindakan, dan menjalankan simulasi tanggal atau skenario "bagaimana jika".

ATURAN
1. Semua angka, status, dan prakiraan WAJIB diambil dari tool. Jangan menebak atau mengarang angka. Jika tool gagal, katakan sumber mana yang gagal.
2. Sebutkan waktu data dan sumbernya secara singkat (BMKG, Open-Meteo/GloFAS, Open-Meteo Marine, PetaBencana.id).
3. Status di sini adalah skor informatif dashboard, BUKAN penetapan status bencana resmi. Status resmi ditetapkan BPBD Kabupaten Bekasi. Sampaikan ini bila membahas status Siaga/Awas.
4. Jika pengguna menggambarkan keadaan darurat (air masuk rumah, ada orang terjebak), utamakan keselamatan: minta segera menghubungi 112 / BPBD setempat, menjauh dari arus, mematikan listrik, dan mengungsi ke tempat tinggi. Baru setelah itu beri data.
5. Debit sungai adalah keluaran model (m³/s), bukan tinggi muka air pos pantau. Muka laut adalah model SMOC terhadap rata-rata muka laut.
6. Jawab dalam bahasa Indonesia yang ringkas dan jelas (bahasa pengguna jika berbeda). Untuk warga: bahasa sederhana. Untuk petugas: boleh lebih teknis. Gunakan daftar poin seperlunya.
7. Di luar topik lingkungan/banjir/cuaca Bekasi, tolak dengan sopan dan arahkan kembali.

CARA HITUNG SKOR (per kecamatan)
Hujan maks 24 jam (lalu, prakiraan Open-Meteo, prakiraan BMKG): ≥20 mm +1, ≥50 +2, ≥100 +3, ≥150 +4. Peringatan dini BMKG +2. Laporan warga: 24 jam +2, 7 hari +1. Debit sungai yang melintas (hari ini s.d. 3 hari): ≥P90 +1, ≥P95 +2, ≥P99 +3. Rob (Muaragembong, Tarumajaya, Babelan): puncak 24 jam ≥1,20 m +1, ≥1,26 +2, ≥1,34 +3. Dataran rendah ≤5 m +1 (hanya jika ada faktor lain).
Status: 0 Normal, 1–2 Waspada, 3–4 Siaga, ≥5 Awas.

Daftar kecamatan: ${KECAMATAN.map((k) => k.nama).join(", ")}.`;
}

export const TOOLS = [
  {
    name: "status_kabupaten",
    description: "Status risiko banjir terkini seluruh Kabupaten Bekasi: status kabupaten, jumlah kecamatan per status, 5 kecamatan berisiko tertinggi beserta faktornya, ringkasan sungai/rob/peringatan/laporan, dan rekomendasi tindakan. Panggil ini dulu untuk pertanyaan umum.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "detail_kecamatan",
    description: "Detail satu kecamatan: skor, status, faktor penyebab, curah hujan per jam (24 jam lalu & 24 jam depan), prakiraan BMKG besok & lusa (pagi/siang/malam), peringatan dini dan laporan warga di kecamatan itu, serta rekomendasi tindakan.",
    input_schema: { type: "object", properties: { kecamatan: { type: "string", description: "Nama kecamatan, mis. 'Pebayuran' atau 'Muara Gembong'" } }, required: ["kecamatan"] },
  },
  {
    name: "debit_sungai",
    description: "Debit Sungai Citarum hilir dan Kali Bekasi: debit hari ini, puncak 3 dan 7 hari ke depan, ambang P50/P90/P95/P99, % kapasitas, status, kecamatan terdampak, dan deret harian 14 hari lalu + 7 hari prakiraan.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "pasang_laut",
    description: "Tinggi muka laut (pasang/rob) pesisir utara Bekasi: nilai sekarang, puncak 24 jam beserta jamnya, puncak harian 7 hari ke depan, ambang rob, dan status.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "peringatan_dan_laporan",
    description: "Peringatan dini cuaca BMKG (nowcast) yang menyebut kecamatan di Kabupaten Bekasi, dan laporan banjir warga PetaBencana.id 7 hari terakhir (waktu, kecamatan terdekat, kedalaman, teks).",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "simulasi_tanggal",
    description: "Hitung status per kecamatan untuk tanggal tertentu: s.d. 15 hari ke depan (prakiraan) atau sejak 2019-01-01 (arsip ERA5). Contoh kejadian banjir: 2020-01-01, 2021-02-20, 2025-03-04, rob 2024-12-15. Tanpa peringatan dini dan laporan warga.",
    input_schema: { type: "object", properties: { tanggal: { type: "string", description: "Format YYYY-MM-DD" } }, required: ["tanggal"] },
  },
  {
    name: "skenario",
    description: "Simulasi 'bagaimana jika' di atas data live: tambah curah hujan (mm), kalikan debit sungai, dan/atau tambah muka laut (m), lalu lihat perubahan status kecamatan.",
    input_schema: {
      type: "object",
      properties: {
        tambah_hujan_mm: { type: "number", description: "Tambahan hujan 24 jam (mm), 0–300" },
        pengali_debit: { type: "number", description: "Pengali debit sungai, mis. 1.5 = naik 50%. 0.5–4" },
        tambah_laut_m: { type: "number", description: "Tambahan muka laut (m), 0–1" },
      },
      required: [],
    },
  },
];

const cariKec = (q) => {
  const n = norm(q);
  return KECAMATAN.find((k) => norm(k.nama) === n) || KECAMATAN.find((k) => norm(k.nama).includes(n) || n.includes(norm(k.nama)));
};

function ringkasSungaiAgen(s, sim = 1) {
  if (!s.ok) return { nama: s.nama, ok: false, error: s.error || "data tidak tersedia" };
  const st = statusSungai(s, sim);
  return {
    nama: s.nama, tanggal: s.tanggal, satuan: s.satuan,
    debitHariIni: s.kini, puncak3Hari: s.puncak3, puncak7Hari: s.puncak7,
    ambang: s.ambang, status: LABEL[st.status], nilaiDinilai: st.nilai, persenDariNormal: st.persenNormal, persenKapasitas: st.persenKapasitas,
    kecamatanTerdampak: s.kecamatan.map((id) => KECAMATAN.find((k) => k.id === id)?.nama),
  };
}

function ringkasLautAgen(l, tambah = 0) {
  if (!l?.ok) return { ok: false, alasan: l?.alasan || l?.error || "data tidak tersedia" };
  const st = statusLaut(l, tambah);
  return {
    nama: l.nama, satuan: "m", acuan: l.acuan, sekarang: l.kini, puncak24Jam: l.puncak24, status: LABEL[st.status],
    ambang: l.ambang, kecamatanPesisir: l.kecamatan.map((id) => KECAMATAN.find((k) => k.id === id)?.nama),
    puncakHarian: (l.harian || []).map((h) => ({ tanggal: h.tanggal, jam: h.waktu.slice(11, 16), tinggi: Math.round(h.tinggi * 100) / 100 })),
  };
}

// Menjalankan satu tool. `src` = sumberData(req).
export async function jalankanTool(nama, input, src) {
  switch (nama) {
    case "status_kabupaten": {
      const d = await src.semua();
      if (d.cuaca?._error) return { error: `Data cuaca gagal dimuat: ${d.cuaca._error}` };
      const kec = nilaiSemua(d);
      return {
        waktuData: d.cuaca.diperbarui, sumberGagal: d.gagal,
        ...ringkasKabupaten(kec),
        semuaKecamatan: kec.map((k) => ({ nama: k.nama, status: k.status, skor: k.skor, hujanMaks24: k.hujanMaks24 })),
        sungai: (d.sungai?.sungai || []).map((s) => ringkasSungaiAgen(s)).map(({ nama, status, debitHariIni, puncak3Hari, ok }) => ({ nama, status, debitHariIni, puncak3Hari, ok })),
        laut: d.laut?.laut?.ok ? { status: LABEL[statusLaut(d.laut.laut).status], puncak24Jam: d.laut.laut.puncak24 } : null,
        jumlahPeringatanDiniBekasi: d.peringatan?.bekasi?.length ?? null,
        jumlahLaporanWarga7Hari: (d.laporan?.laporan || []).filter((r) => !r.latihan && r.wilayah === "Kabupaten Bekasi").length,
      };
    }
    case "detail_kecamatan": {
      const k = cariKec(input.kecamatan || "");
      if (!k) return { error: `Kecamatan "${input.kecamatan}" tidak ditemukan. Pilihan: ${KECAMATAN.map((x) => x.nama).join(", ")}` };
      const d = await src.semua();
      if (d.cuaca?._error) return { error: `Data cuaca gagal dimuat: ${d.cuaca._error}` };
      const hasil = nilaiSemua(d).find((x) => x.id === k.id);
      const mentah = d.cuaca.kecamatan.find((x) => x.id === k.id) || {};
      const urut = nilaiSemua(d).sort((a, b) => b.skor - a.skor).findIndex((x) => x.id === k.id) + 1;
      return {
        waktuData: d.cuaca.diperbarui, ...hasil, peringkatRisiko: `${urut} dari 23`,
        hujanPerJam: (mentah.perJam || []).filter((_, i) => i % 3 === 0).map(([w, mm]) => ({ waktu: w, mm })),
        prakiraanBmkg2Hari: (mentah.duaHari || []).map((h) => ({
          tanggal: h.tanggal,
          ...Object.fromEntries(["pagi", "siang", "malam"].map((s) => [s, h[s] ? `${h[s].cuaca}, ${h[s].suhu}°C, hujan ${h[s].hujan ?? 0} mm` : null])),
        })),
        peringatanDini: (d.peringatan?.bekasi || []).filter((a) => a.kecamatan.includes(k.id)).map((a) => ({ judul: a.judul, terbit: a.terbit, isi: a.isi.slice(0, 400) })),
        laporanWarga: (d.laporan?.laporan || []).filter((r) => !r.latihan && r.kecamatan?.id === k.id).map((r) => ({ waktu: r.waktu, kedalamanCm: r.kedalaman, teks: r.teks })),
        sungaiMelintas: SUNGAI.filter((s) => s.kecamatan.includes(k.id)).map((s) => s.nama),
        pesisir: LAUT.kecamatan.includes(k.id),
        rekomendasi: POLICY[hasil.status],
      };
    }
    case "debit_sungai": {
      const s = await src.sungai();
      if (s?._error) return { error: s._error };
      return {
        waktuData: s.diperbarui, sumber: "Model GloFAS via Open-Meteo Flood API (debit, bukan tinggi muka air)",
        sungai: s.sungai.map((x) => ({ ...ringkasSungaiAgen(x), deretHarian: (x.seri || []).map((p) => ({ tanggal: p.tanggal, debit: p.debit, prakiraan: p.setelah })) })),
      };
    }
    case "pasang_laut": {
      const l = await src.laut();
      if (l?._error) return { error: l._error };
      return { waktuData: l.diperbarui, sumber: "MeteoFrance SMOC via Open-Meteo Marine API", ...ringkasLautAgen(l.laut) };
    }
    case "peringatan_dan_laporan": {
      const [p, l] = await Promise.all([src.peringatan(), src.laporan()]);
      return {
        peringatanDini: p?._error ? { error: p._error } : {
          waktuData: p.diperbarui, jumlahJawaBarat: p.jumlahJawaBarat,
          bekasi: p.bekasi.map((a) => ({ judul: a.judul, terbit: a.terbit, kecamatan: a.kecamatan.map((id) => KECAMATAN.find((k) => k.id === id)?.nama), isi: a.isi.slice(0, 500) })),
        },
        laporanWarga: l?._error ? { error: l._error } : {
          waktuData: l.diperbarui, sumber: "PetaBencana.id (7 hari)",
          laporan: l.laporan.filter((r) => !r.latihan).slice(0, 25).map((r) => ({ waktu: r.waktu, wilayah: r.wilayah, kecamatanTerdekat: r.kecamatan?.nama || null, kedalamanCm: r.kedalaman, teks: r.teks })),
        },
      };
    }
    case "simulasi_tanggal": {
      const tgl = String(input.tanggal || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) return { error: "Format tanggal harus YYYY-MM-DD" };
      const s = await src.simulasi(tgl);
      if (s?._error) return { error: s._error };
      const kec = nilaiSemua({ cuaca: { kecamatan: s.kecamatan }, sungai: { sungai: s.sungai }, laut: { laut: s.laut } });
      return {
        tanggal: s.tanggal, selisihHari: s.selisihHari, sumberHujan: s.sumberHujan,
        catatan: "Simulasi tanpa peringatan dini dan laporan warga, jadi skor bisa lebih rendah dari kejadian nyata.",
        ...ringkasKabupaten(kec),
        semuaKecamatan: kec.map((k) => ({ nama: k.nama, status: k.status, skor: k.skor, hujanMaks24: k.hujanMaks24 })),
        sungai: s.sungai.map((x) => ringkasSungaiAgen(x)),
        laut: ringkasLautAgen(s.laut),
      };
    }
    case "skenario": {
      const sim = {
        hujan: Math.min(300, Math.max(0, +input.tambah_hujan_mm || 0)),
        sungai: Math.min(4, Math.max(0.5, +input.pengali_debit || 1)),
        laut: Math.min(1, Math.max(0, +input.tambah_laut_m || 0)),
      };
      const d = await src.semua();
      if (d.cuaca?._error) return { error: `Data cuaca gagal dimuat: ${d.cuaca._error}` };
      const awal = nilaiSemua(d), baru = nilaiSemua(d, sim);
      const berubah = baru.filter((k, i) => k.status !== awal[i].status)
        .map((k) => ({ nama: k.nama, dari: awal.find((a) => a.id === k.id).status, menjadi: k.status, skorBaru: k.skor, faktor: k.faktor.map((f) => f.ket) }));
      return { skenario: sim, sebelum: ringkasKabupaten(awal).statusKabupaten, sesudah: ringkasKabupaten(baru), kecamatanBerubahStatus: berubah };
    }
    default:
      return { error: `Tool tidak dikenal: ${nama}` };
  }
}

async function panggilClaude(body) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY belum diatur di Environment Variables Vercel");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${j.error?.message || JSON.stringify(j)}`);
  return j;
}

// Loop agent: Claude memilih tool → server menjalankan → hasil dikirim balik, sampai Claude selesai menjawab.
export async function jalankanAgen(messages, src, { system = promptSistem(), maxTokens = 1500 } = {}) {
  const pesan = [...messages];
  const dipakai = [];
  for (let langkah = 0; langkah < MAX_LANGKAH; langkah++) {
    const res = await panggilClaude({ model: MODEL, max_tokens: maxTokens, system, tools: TOOLS, messages: pesan });
    pesan.push({ role: "assistant", content: res.content });
    if (res.stop_reason !== "tool_use") {
      const teks = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      return { jawaban: teks, toolDipakai: dipakai, usage: res.usage };
    }
    const hasil = await Promise.all(res.content.filter((b) => b.type === "tool_use").map(async (b) => {
      dipakai.push(b.name);
      let out;
      try { out = await jalankanTool(b.name, b.input || {}, src); } catch (e) { out = { error: String(e.message || e) }; }
      return { type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out), is_error: !!out?.error };
    }));
    pesan.push({ role: "user", content: hasil });
  }
  return { jawaban: "Maaf, analisis terlalu panjang. Coba ajukan pertanyaan yang lebih spesifik.", toolDipakai: dipakai };
}
