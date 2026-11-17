// Penilaian risiko banjir di sisi server, sama persis dengan assets/app.js (fungsi nilai, statusSungai, statusLaut).
// Dipakai oleh AI Agent (api/agent.js) dan briefing otomatis (api/briefing.js) supaya angka agent = angka dashboard.

export const STATUS = ["normal", "waspada", "siaga", "awas"];
export const LABEL = { normal: "Normal", waspada: "Waspada", siaga: "Siaga", awas: "Awas" };

export const POLICY = {
  normal: ["Bersihkan saluran, gorong-gorong, dan pintu air secara rutin", "Uji kesiapan pompa air dan perahu karet BPBD", "Sosialisasi jalur evakuasi ke RT/RW di desa rawan"],
  waspada: ["Pantau cuaca, debit sungai, dan jadwal pasang laut setiap 3 jam", "Siagakan pompa portabel di titik genangan langganan", "Kirim info dini ke warga lewat RT/RW dan media sosial Pemkab"],
  siaga: ["Buka posko siaga banjir di kantor kecamatan", "Perahu karet dan personel BPBD standby di lokasi", "Siapkan evakuasi lansia, anak, dan penyandang disabilitas", "Koordinasi operasi pintu air dengan BBWS Citarum", "Saat pasang tinggi: periksa tanggul pesisir dan tutup pintu air muara di Muaragembong, Tarumajaya, Babelan"],
  awas: ["Evakuasi warga dari permukiman tergenang", "Aktifkan dapur umum dan pengungsian", "Usulkan status tanggap darurat bencana kepada Bupati", "Tutup sementara akses jalan yang terendam"],
};

const r1 = (x, d = 1) => (x == null || isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

// Debit (hari acuan s.d. 3 hari ke depan) dibanding persentil historis 2019–2026: ≥P90 +1, ≥P95 +2, ≥P99 +3.
export function statusSungai(s, kali = 1) {
  const nilai = Math.max(s.kini || 0, s.puncak3 || 0) * kali;
  const a = s.ambang || {};
  const poin = nilai >= a.p99 ? 3 : nilai >= a.p95 ? 2 : nilai >= a.p90 ? 1 : 0;
  return {
    nilai: r1(nilai), poin, status: STATUS[poin],
    persenNormal: a.p50 ? r1((nilai / a.p50) * 100, 0) : null,
    persenKapasitas: a.kapasitas ? r1((nilai / a.kapasitas) * 100, 0) : null,
  };
}

// Puncak muka laut 24 jam dibanding persentil 2022–2026.
export function statusLaut(l, tambah = 0) {
  const nilai = (l.puncak24?.tinggi ?? 0) + tambah;
  const a = l.ambang;
  const poin = nilai >= a.p99 ? 3 : nilai >= a.p95 ? 2 : nilai >= a.p90 ? 1 : 0;
  return { nilai: r1(nilai, 2), poin, status: STATUS[poin], waktuPuncak: l.puncak24?.waktu || null };
}

// data = { cuaca, sungai, laut, laporan, peringatan } (bentuk respons endpoint api/*)
// sim  = { hujan: mm tambahan, sungai: pengali debit, laut: m tambahan } untuk skenario "bagaimana jika".
export function nilaiSemua(data, sim = {}, now = Date.now()) {
  const kecList = data.cuaca?.kecamatan || [];
  const sungai = (data.sungai?.sungai || []).filter((s) => s.ok);
  const laut = data.laut?.laut?.ok ? data.laut.laut : null;
  const peringatan = data.peringatan?.bekasi || [];
  const laporan = (data.laporan?.laporan || []).filter((r) => !r.latihan);

  return kecList.map((k) => {
    const hujan = Math.max(k.hujan24Lalu || 0, k.hujan24Depan || 0, k.hujan24DepanBmkg || 0) + (sim.hujan || 0);
    const faktor = [];
    let skor = 0;

    const h = hujan >= 150 ? 4 : hujan >= 100 ? 3 : hujan >= 50 ? 2 : hujan >= 20 ? 1 : 0;
    if (h) { skor += h; faktor.push({ faktor: "hujan", poin: h, ket: `hujan ${Math.round(hujan)} mm (24 jam)` }); }

    if (peringatan.some((a) => a.kecamatan.includes(k.id))) { skor += 2; faktor.push({ faktor: "peringatan", poin: 2, ket: "peringatan dini BMKG aktif" }); }

    const lap = laporan.filter((r) => r.kecamatan?.id === k.id);
    if (lap.some((r) => now - new Date(r.waktu) < 864e5)) { skor += 2; faktor.push({ faktor: "laporan", poin: 2, ket: `laporan banjir warga 24 jam (${lap.length})` }); }
    else if (lap.length) { skor += 1; faktor.push({ faktor: "laporan", poin: 1, ket: `laporan banjir warga 7 hari (${lap.length})` }); }

    let sg = 0, sgNama = null;
    for (const s of sungai) {
      if ((s.kecamatan || []).includes(k.id)) {
        const p = statusSungai(s, sim.sungai || 1).poin;
        if (p > sg) { sg = p; sgNama = s.nama; }
      }
    }
    if (sg) { skor += sg; faktor.push({ faktor: "sungai", poin: sg, ket: `${sg >= 3 ? "debit ekstrem" : sg >= 2 ? "debit sangat tinggi" : "debit tinggi"} – ${sgNama}` }); }

    if (laut && laut.kecamatan.includes(k.id)) {
      const pl = statusLaut(laut, sim.laut || 0).poin;
      if (pl) { skor += pl; faktor.push({ faktor: "rob", poin: pl, ket: pl >= 3 ? "pasang laut ekstrem (rob)" : pl >= 2 ? "pasang laut sangat tinggi (rob)" : "pasang laut tinggi (rob)" }); }
    }

    if (skor > 0 && k.elevasi != null && k.elevasi <= 5) { skor += 1; faktor.push({ faktor: "elevasi", poin: 1, ket: `dataran rendah ${k.elevasi} m` }); }

    const status = skor >= 5 ? "awas" : skor >= 3 ? "siaga" : skor >= 1 ? "waspada" : "normal";
    return {
      id: k.id, nama: k.nama, desaPantau: k.desa, lat: k.lat, lon: k.lon, elevasi: k.elevasi,
      skor, status, hujanMaks24: r1(hujan),
      hujan24Lalu: k.hujan24Lalu, hujan24Depan: k.hujan24Depan, hujan24DepanBmkg: k.hujan24DepanBmkg,
      cuacaSekarang: k.sekarang ? { cuaca: k.sekarang.cuaca, suhu: k.sekarang.suhu, waktu: k.sekarang.waktu } : null,
      faktor,
    };
  });
}

export function ringkasKabupaten(kec) {
  const urut = [...kec].sort((a, b) => b.skor - a.skor || (b.hujanMaks24 || 0) - (a.hujanMaks24 || 0) || a.nama.localeCompare(b.nama));
  const terburuk = urut[0];
  const status = terburuk ? terburuk.status : "normal";
  const jumlah = Object.fromEntries(STATUS.map((s) => [s, kec.filter((k) => k.status === s).map((k) => k.nama)]));
  return {
    statusKabupaten: status,
    label: LABEL[status],
    jumlahPerStatus: Object.fromEntries(STATUS.map((s) => [s, jumlah[s].length])),
    kecamatanPerStatus: jumlah,
    top5: urut.slice(0, 5).map((k) => ({ nama: k.nama, status: k.status, skor: k.skor, faktor: k.faktor.map((f) => f.ket) })),
    rekomendasi: POLICY[status],
  };
}
