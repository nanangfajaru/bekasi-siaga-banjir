/* Rumus skor risiko banjir. Dipakai bersama oleh dashboard (browser) dan api/status (server),
   supaya status di web, di API, dan di bot selalu sama. Tanpa DOM, tanpa import. */
(function (g) {
  const STATUS = ["normal", "waspada", "siaga", "awas"];
  const LABEL = { normal: "Normal", waspada: "Waspada", siaga: "Siaga", awas: "Awas" };

  const POLICY = {
    normal: ["Bersihkan saluran, gorong-gorong, dan pintu air secara rutin", "Uji kesiapan pompa air dan perahu karet BPBD", "Sosialisasi jalur evakuasi ke RT/RW di desa rawan"],
    waspada: ["Pantau cuaca, debit sungai, dan jadwal pasang laut setiap 3 jam", "Siagakan pompa portabel di titik genangan langganan", "Kirim info dini ke warga lewat RT/RW dan media sosial Pemkab"],
    siaga: ["Buka posko siaga banjir di kantor kecamatan", "Perahu karet dan personel BPBD standby di lokasi", "Siapkan evakuasi lansia, anak, dan penyandang disabilitas", "Koordinasi operasi pintu air dengan BBWS Citarum", "Saat pasang tinggi: periksa tanggul pesisir dan tutup pintu air muara di Muaragembong, Tarumajaya, Babelan"],
    awas: ["Evakuasi warga dari permukiman tergenang", "Aktifkan dapur umum dan pengungsian", "Usulkan status tanggap darurat bencana kepada Bupati", "Tutup sementara akses jalan yang terendam"],
  };

  const fmt0 = (n) => (n == null || isNaN(n) ? "–" : Number(n).toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 }));

  // Laporan latihan/simulasi PetaBencana tidak dihitung.
  const laporanNyata = (laporan) => (laporan || []).filter((r) => !r.latihan);

  // Status sungai: debit (hari acuan s.d. 3 hari ke depan) dibanding persentil historis 2019–2026.
  // ≥P90 waspada (+1), ≥P95 siaga (+2), ≥P99 awas (+3). kali = pengali simulasi manual.
  function statusSungai(s, kali = 1) {
    const nilai = Math.max(s.kini || 0, s.puncak3 || 0) * kali;
    const a = s.ambang || {};
    const poin = nilai >= a.p99 ? 3 : nilai >= a.p95 ? 2 : nilai >= a.p90 ? 1 : 0;
    return { nilai, poin, status: STATUS[poin], persenNormal: a.p50 ? (nilai / a.p50) * 100 : null, persenKap: a.kapasitas ? (nilai / a.kapasitas) * 100 : null };
  }

  // Status pasang laut: puncak muka laut 24 jam (atau pada tanggal simulasi) dibanding persentil 2022–2026.
  // tambah = tambahan muka laut simulasi manual (m).
  function statusLaut(l, tambah = 0) {
    const nilai = (l.puncak24?.tinggi ?? 0) + tambah;
    const a = l.ambang;
    const poin = nilai >= a.p99 ? 3 : nilai >= a.p95 ? 2 : nilai >= a.p90 ? 1 : 0;
    return { nilai, poin, status: STATUS[poin] };
  }

  // Skor satu kecamatan.
  // d = { peringatan: [{kecamatan:[id]}], laporan: [...], sungai: [...], laut: {...}|null }
  // sim = { hujan: mm tambahan, sungai: pengali, laut: m tambahan } (simulasi manual; default tanpa simulasi)
  function nilai(k, d, sim = {}, now = Date.now()) {
    const hujan = Math.max(k.hujan24Lalu || 0, k.hujan24Depan || 0, k.hujan24DepanBmkg || 0) + (sim.hujan || 0);
    const alasan = [];
    let skor = 0;
    const h = hujan >= 150 ? 4 : hujan >= 100 ? 3 : hujan >= 50 ? 2 : hujan >= 20 ? 1 : 0;
    if (h) { skor += h; alasan.push(`hujan ${fmt0(hujan)} mm`); }

    const pd = (d.peringatan || []).some((a) => a.kecamatan.includes(k.id));
    if (pd) { skor += 2; alasan.push("peringatan dini BMKG"); }

    const lap = laporanNyata(d.laporan).filter((r) => r.kecamatan?.id === k.id);
    if (lap.some((r) => now - new Date(r.waktu) < 864e5)) { skor += 2; alasan.push("laporan banjir 24 jam"); }
    else if (lap.length) { skor += 1; alasan.push("laporan banjir 7 hari"); }

    let sg = 0;
    for (const s of d.sungai || []) {
      if (s.ok && (s.kecamatan || []).includes(k.id)) sg = Math.max(sg, statusSungai(s, sim.sungai ?? 1).poin);
    }
    if (sg) { skor += sg; alasan.push(sg >= 3 ? "debit sungai ekstrem" : sg >= 2 ? "debit sungai sangat tinggi" : "debit sungai tinggi"); }

    const lt = d.laut?.ok ? d.laut : null;
    if (lt && lt.kecamatan.includes(k.id)) {
      const pl = statusLaut(lt, sim.laut || 0).poin;
      if (pl) { skor += pl; alasan.push(pl >= 3 ? "pasang laut ekstrem (rob)" : pl >= 2 ? "pasang laut sangat tinggi (rob)" : "pasang laut tinggi (rob)"); }
    }

    if (skor > 0 && k.elevasi != null && k.elevasi <= 5) { skor += 1; alasan.push(`dataran rendah ${k.elevasi} m`); }
    const status = skor >= 5 ? "awas" : skor >= 3 ? "siaga" : skor >= 1 ? "waspada" : "normal";
    return { skor, status, hujan, alasan };
  }

  // Status terburuk dari daftar kecamatan yang sudah dinilai.
  const terburuk = (kec) => kec.reduce((a, b) => (STATUS.indexOf(b.status) > STATUS.indexOf(a) ? b.status : a), "normal");

  g.SkorBanjir = { STATUS, LABEL, POLICY, laporanNyata, statusSungai, statusLaut, nilai, terburuk };
})(globalThis);
