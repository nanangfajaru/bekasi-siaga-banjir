/* Bekasi Siaga Banjir – dashboard realtime */
const $ = (id) => document.getElementById(id);
const fmt = (n, d = 1) => (n == null || isNaN(n) ? "–" : Number(n).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d }));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

const STATUS = ["normal", "waspada", "siaga", "awas"];
const LABEL = { normal: "Normal", waspada: "Waspada", siaga: "Siaga", awas: "Awas" };
const ICON = { normal: "✓", waspada: "!", siaga: "!!", awas: "!!!" };
const badge = (s) => `<span class="st ${s}"><i aria-hidden="true">${ICON[s]}</i>${LABEL[s]}</span>`;
const color = (s) => css(`--${s}`);


const POLICY = {
  normal: ["Bersihkan saluran, gorong-gorong, dan pintu air secara rutin", "Uji kesiapan pompa air dan perahu karet BPBD", "Sosialisasi jalur evakuasi ke RT/RW di desa rawan"],
  waspada: ["Pantau cuaca dan debit sungai setiap 3 jam", "Siagakan pompa portabel di titik genangan langganan", "Kirim info dini ke warga lewat RT/RW dan media sosial Pemkab"],
  siaga: ["Buka posko siaga banjir di kantor kecamatan", "Perahu karet dan personel BPBD standby di lokasi", "Siapkan evakuasi lansia, anak, dan penyandang disabilitas", "Koordinasi operasi pintu air dengan BBWS Citarum"],
  awas: ["Evakuasi warga dari permukiman tergenang", "Aktifkan dapur umum dan pengungsian", "Usulkan status tanggap darurat bencana kepada Bupati", "Tutup sementara akses jalan yang terendam"],
};

let DATA = { cuaca: null, sungai: null, laporan: null, peringatan: null };
let map, layer, charts = {}, selKec = null;
const SIM = { on: false, rain: 0, river: 1 };
let MODE = "live";          // live | tanggal | manual
let SIMT = null;            // hasil /api/simulasi
const tglID = (d) => new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// Data yang sedang ditampilkan: live atau hasil simulasi tanggal
function V() {
  if (MODE === "tanggal" && SIMT) return { cuaca: { kecamatan: SIMT.kecamatan }, sungai: { sungai: SIMT.sungai }, laporan: null, peringatan: null, tanggal: SIMT };
  return DATA;
}

async function getJSON(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

async function load() {
  $("liveDot").classList.remove("err");
  $("updated").textContent = "memuat…";
  const [c, s, l, p] = await Promise.allSettled(["api/cuaca", "api/sungai", "api/laporan", "api/peringatan"].map(getJSON));
  DATA = {
    cuaca: c.status === "fulfilled" ? c.value : null,
    sungai: s.status === "fulfilled" ? s.value : null,
    laporan: l.status === "fulfilled" ? l.value : null,
    peringatan: p.status === "fulfilled" ? p.value : null,
  };
  const gagal = [c, s, l, p].filter((x) => x.status !== "fulfilled").length;
  if (gagal) $("liveDot").classList.add("err");
  $("updated").textContent = new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) + (gagal ? ` · ${gagal} sumber gagal` : "");
  render();
}

/* ---------- Penilaian risiko ---------- */
function laporanNyata() {
  return (V().laporan?.laporan || []).filter((r) => !r.latihan);
}

// Status sungai: debit (hari acuan s.d. 3 hari ke depan) dibanding persentil historis 2019–2026.
// ≥P90 waspada (+1), ≥P95 siaga (+2), ≥P99 awas (+3).
function statusSungai(s) {
  const m = SIM.on ? SIM.river : 1;
  const nilai = Math.max(s.kini || 0, s.puncak3 || 0) * m;
  const a = s.ambang || {};
  const poin = nilai >= a.p99 ? 3 : nilai >= a.p95 ? 2 : nilai >= a.p90 ? 1 : 0;
  return { nilai, poin, status: STATUS[poin], persenNormal: a.p50 ? (nilai / a.p50) * 100 : null, persenKap: a.kapasitas ? (nilai / a.kapasitas) * 100 : null };
}

function nilai(k) {
  const add = SIM.on ? SIM.rain : 0;
  const hujan = Math.max(k.hujan24Lalu || 0, k.hujan24Depan || 0, k.hujan24DepanBmkg || 0) + add;
  const alasan = [];
  let skor = 0;
  const h = hujan >= 150 ? 4 : hujan >= 100 ? 3 : hujan >= 50 ? 2 : hujan >= 20 ? 1 : 0;
  if (h) { skor += h; alasan.push(`hujan ${fmt(hujan, 0)} mm`); }

  const pd = (V().peringatan?.bekasi || []).some((a) => a.kecamatan.includes(k.id));
  if (pd) { skor += 2; alasan.push("peringatan dini BMKG"); }

  const now = Date.now();
  const lap = laporanNyata().filter((r) => r.kecamatan?.id === k.id);
  if (lap.some((r) => now - new Date(r.waktu) < 864e5)) { skor += 2; alasan.push("laporan banjir 24 jam"); }
  else if (lap.length) { skor += 1; alasan.push("laporan banjir 7 hari"); }

  let sg = 0;
  for (const s of V().sungai?.sungai || []) {
    if (s.ok && (s.kecamatan || []).includes(k.id)) sg = Math.max(sg, statusSungai(s).poin);
  }
  if (sg) { skor += sg; alasan.push(sg >= 3 ? "debit sungai ekstrem" : sg >= 2 ? "debit sungai sangat tinggi" : "debit sungai tinggi"); }

  if (skor > 0 && k.elevasi != null && k.elevasi <= 5) { skor += 1; alasan.push(`dataran rendah ${k.elevasi} m`); }
  const status = skor >= 5 ? "awas" : skor >= 3 ? "siaga" : skor >= 1 ? "waspada" : "normal";
  return { skor, status, hujan, alasan };
}

function semua() {
  return (V().cuaca?.kecamatan || []).map((k) => ({ ...k, ...nilai(k) }));
}

/* ---------- Render ---------- */
function render() {
  const kec = semua();
  renderKPI(kec);
  renderMap(kec);
  renderRank(kec);
  renderSel(kec);
  renderRain();
  renderForecast();
  renderRivers();
  renderAlerts();
  renderReports();
  renderPolicy(kec);
  renderTable(kec);
  $("statusKey").innerHTML = `Skor 0 ${badge("normal")} · 1–2 ${badge("waspada")} · 3–4 ${badge("siaga")} · ≥5 ${badge("awas")}`;
  $("mapLegend").innerHTML = STATUS.map(badge).join("");
}

function renderKPI(kec) {
  if (!kec.length) { $("kpis").innerHTML = `<div class="kpi" style="grid-column:1/-1">Data cuaca belum tersedia. Coba muat ulang.</div>`; return; }
  const worst = kec.reduce((a, b) => (b.skor > a.skor ? b : a), kec[0]);
  const st = worst.status;
  const nSiaga = kec.filter((k) => k.status === "siaga" || k.status === "awas").length;
  const nWaspada = kec.filter((k) => k.status === "waspada").length;
  const maxLalu = kec.reduce((a, b) => ((b.hujan24Lalu || 0) > (a.hujan24Lalu || 0) ? b : a), kec[0]);
  const maxDepan = kec.reduce((a, b) => (Math.max(b.hujan24Depan || 0, b.hujan24DepanBmkg || 0) > Math.max(a.hujan24Depan || 0, a.hujan24DepanBmkg || 0) ? b : a), kec[0]);
  const cit = V().sungai?.sungai?.find((s) => s.id === "citarum");
  const T = V().tanggal;
  const pd = V().peringatan?.bekasi?.length || 0;
  const lap = laporanNyata().filter((r) => r.wilayah === "Kabupaten Bekasi").length;
  $("kpis").innerHTML = `
    <div class="kpi main" style="background:${color(st)};${st === "waspada" ? "color:#111" : ""}">
      <div class="k">Status Kabupaten</div><div class="v">${LABEL[st]}</div>
      <div class="d">${st === "normal" ? "semua kecamatan aman" : `tertinggi: ${worst.nama}`}</div></div>
    <div class="kpi"><div class="k">Kecamatan siaga/awas</div><div class="v">${nSiaga}<small style="font-size:14px;color:var(--muted)"> / 23</small></div><div class="d">${nWaspada} kecamatan waspada</div></div>
    <div class="kpi"><div class="k">${T ? "Hujan sehari sebelumnya" : "Hujan 24 jam terakhir"}</div><div class="v">${fmt(maxLalu.hujan24Lalu)} mm</div><div class="d">tertinggi di ${maxLalu.nama}</div></div>
    <div class="kpi"><div class="k">${T ? "Hujan pada tanggal itu" : "Prakiraan hujan 24 jam"}</div><div class="v">${fmt(Math.max(maxDepan.hujan24Depan || 0, maxDepan.hujan24DepanBmkg || 0))} mm</div><div class="d">tertinggi di ${maxDepan.nama}</div></div>
    <div class="kpi"><div class="k">Debit Citarum hilir</div><div class="v">${cit?.ok ? fmt(cit.kini, 0) : "–"} <small style="font-size:13px">m³/s</small></div><div class="d">${cit?.ok ? `${fmt((cit.kini / cit.ambang.p50) * 100, 0)}% dari normal · ${fmt((cit.kini / cit.ambang.kapasitas) * 100, 0)}% kapasitas` : "data belum tersedia"}</div></div>
    <div class="kpi"><div class="k">Peringatan & laporan</div><div class="v">${T ? "–" : `${pd} · ${lap}`}</div><div class="d">${T ? "tidak tersedia untuk simulasi" : "peringatan dini BMKG · laporan warga"}</div></div>`;
}

function renderMap(kec) {
  if (!window.L) { $("map").innerHTML = `<div class="empty">Peta tidak dapat dimuat.</div>`; return; }
  if (!map) {
    map = L.map("map", { scrollWheelZoom: false }).setView([-6.22, 107.12], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 16, attribution: "&copy; OpenStreetMap" }).addTo(map);
  }
  if (layer) layer.remove();
  layer = L.layerGroup().addTo(map);
  for (const k of kec) {
    const m = L.circleMarker([k.lat, k.lon], { radius: 9 + k.skor * 2, color: "#fff", weight: 2, fillColor: color(k.status), fillOpacity: 0.95 });
    const now = k.sekarang;
    m.bindPopup(`<h3>${k.nama}</h3>${badge(k.status)}<br>
      ${V().tanggal ? `Hujan sehari sebelumnya: <b>${fmt(k.hujan24Lalu)} mm</b><br>Hujan pada tanggal: <b>${fmt(k.hujan24Depan)} mm</b><br>` :
      `Hujan 24 jam lalu: <b>${fmt(k.hujan24Lalu)} mm</b><br>Prakiraan 24 jam: <b>${fmt(k.hujan24Depan)} mm</b> (Open-Meteo), <b>${fmt(k.hujan24DepanBmkg)} mm</b> (BMKG)<br>`}
      ${now ? `Cuaca BMKG: ${now.cuaca}, ${now.suhu}°C<br>` : ""}Elevasi: ${k.elevasi ?? "–"} m · Desa pantau: ${k.desa}<br>
      <span style="color:#7d8896">${k.alasan.length ? "Faktor: " + k.alasan.join(", ") : "Tidak ada faktor risiko"}</span>`);
    m.on("click", () => pilih(k.id));
    m.bindTooltip(k.nama);
    m.addTo(layer);
  }
  for (const s of V().sungai?.sungai || []) {
    const icon = L.divIcon({ className: "", html: `<div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:14px solid ${css("--water")}"></div>`, iconSize: [16, 14] });
    L.marker([s.lat, s.lon], { icon }).bindPopup(`<h3>${s.nama}</h3>${s.ok ? `${badge(statusSungai(s).status)}<br>Debit ${s.tanggal}: <b>${fmt(s.kini)} m³/s</b><br>Normal (median): ${fmt(s.ambang.p50)} m³/s<br>Batas waspada (P90): ${fmt(s.ambang.p90, 0)} m³/s` : "Data tidak tersedia"}`).addTo(layer);
  }
  for (const r of laporanNyata()) {
    L.circleMarker([r.lat, r.lon], { radius: 6, color: "#0b3d66", weight: 2, fillColor: "#ffffff", fillOpacity: 1 })
      .bindPopup(`<h3>Laporan banjir warga</h3>${new Date(r.waktu).toLocaleString("id-ID")}<br>${r.wilayah}${r.kedalaman != null ? ` · kedalaman ${r.kedalaman} cm` : ""}<br>${r.teks || ""}`).addTo(layer);
  }
}

function renderRank(kec) {
  const s = [...kec].sort((a, b) => b.skor - a.skor || (b.hujan || 0) - (a.hujan || 0));
  $("rank").innerHTML = s.map((k, i) => `<li data-id="${k.id}"><span class="n">${i + 1}</span>
    <span class="nm">${k.nama}<span class="why">${k.alasan.length ? k.alasan.join(" · ") : `hujan ${fmt(k.hujan, 1)} mm · elevasi ${k.elevasi ?? "–"} m`}</span></span>${badge(k.status)}</li>`).join("");
  $("rank").querySelectorAll("li").forEach((li) => li.addEventListener("click", () => pilih(li.dataset.id)));
}

function renderSel(kec) {
  const sel = $("kecSel");
  if (!sel.options.length) {
    sel.innerHTML = kec.map((k) => `<option value="${k.id}">${k.nama}</option>`).join("");
    sel.addEventListener("change", () => pilih(sel.value));
  }
  if (!selKec) {
    const top = [...kec].sort((a, b) => b.skor - a.skor || b.hujan - a.hujan)[0];
    selKec = top?.id || "09";
  }
  sel.value = selKec;
}

function pilih(id) {
  selKec = id;
  $("kecSel").value = id;
  renderRain();
  renderForecast();
}

function kecTerpilih() {
  return (V().cuaca?.kecamatan || []).find((k) => k.id === selKec);
}

function renderRain() {
  const k = kecTerpilih();
  if (!k || !k.perJam?.length) return;
  $("rainNote").innerHTML = V().tanggal
    ? `<span class="sw past"></span>sehari sebelum &nbsp; <span class="sw fut"></span>${tglID(V().tanggal.tanggal)} (${V().tanggal.sumberHujan}).`
    : `<span class="sw past"></span>24 jam terakhir &nbsp; <span class="sw fut"></span>24 jam ke depan (Open-Meteo).`;
  const labels = k.perJam.map(([t]) => `${t.slice(3, 5)}/${t.slice(0, 2)} ${t.slice(6, 8)}:00`);
  const vals = k.perJam.map(([, v]) => v ?? 0);
  const water = css("--water"), soft = css("--water-soft");
  const bg = vals.map((_, i) => (i < 24 ? water : soft));
  if (charts.rain) charts.rain.destroy();
  charts.rain = new Chart($("chartRain"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Curah hujan (mm)", data: vals, backgroundColor: bg, borderRadius: 3, barPercentage: 0.9, categoryPercentage: 0.9 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${fmt(c.raw)} mm ${V().tanggal ? (c.dataIndex < 24 ? "(sehari sebelumnya)" : "(tanggal simulasi)") : c.dataIndex < 24 ? "(24 jam lalu)" : "(prakiraan)"}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: css("--muted"), maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: { beginAtZero: true, suggestedMax: 5, title: { display: true, text: "mm/jam", color: css("--muted") }, grid: { color: css("--line") }, ticks: { color: css("--muted") } },
      },
    },
  });
}

function renderForecast() {
  const k = kecTerpilih();
  if (!k) return;
  $("bmkgDesa").textContent = `${k.nama} · Desa ${k.desa}`;
  if (V().tanggal) { $("forecast").innerHTML = `<div class="empty">Prakiraan BMKG per desa hanya tersedia untuk 2 hari ke depan dalam mode live.</div>`; return; }
  if (!k.bmkgOk || !k.duaHari?.length) { $("forecast").innerHTML = `<div class="empty">Prakiraan BMKG belum tersedia.</div>`; return; }
  const slot = (lbl, jam, s) => s
    ? `<div class="fc-i">${s.ikon ? `<img src="${s.ikon}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : "<span></span>"}
        <div><div class="fc-t">${lbl} ${jam}${s.waktu.slice(11, 16).replace(":", ".") !== jam ? ` <span class="fc-x">jam data BMKG ${s.waktu.slice(11, 16).replace(":", ".")}</span>` : ""}</div><div class="fc-d">${s.cuaca}</div>
        <div class="fc-n">${s.suhu}°C · hujan ${fmt(s.hujan)} mm · ${s.lembap}%</div></div></div>`
    : `<div class="fc-i"><span></span><div><div class="fc-t">${lbl} ${jam}</div><div class="fc-n">belum tersedia</div></div></div>`;
  $("forecast").innerHTML = k.duaHari.map((h) => `<div class="fc-day">
      <h3>${new Date(h.tanggal + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}</h3>
      ${slot("Pagi", "06.00", h.pagi)}${slot("Siang", "12.00", h.siang)}${slot("Malam", "18.00", h.malam)}
    </div>`).join("");
}

function renderRivers() {
  const list = V().sungai?.sungai || [];
  if (!list.length) { $("rivers").innerHTML = `<div class="empty">Data debit sungai belum tersedia.</div>`; return; }
  const T = V().tanggal;
  $("rivers").innerHTML = list.map((s) => {
    if (!s.ok) return `<div class="river"><h3>${s.nama}</h3><div class="empty">Data tidak tersedia</div></div>`;
    const ss = statusSungai(s), a = s.ambang;
    return `<div class="river"><h3>${s.nama}</h3>${badge(ss.status)}
      <div class="nums"><span>${T ? tglID(s.tanggal).split(",")[1] : "hari ini"} <b>${fmt(s.kini)}</b> m³/s</span><span>normal <b>${fmt(a.p50)}</b></span>${a.kapasitas ? `<span>kapasitas <b>${fmt(a.kapasitas, 0)}</b></span>` : ""}</div>
      <div class="sub">${fmt(ss.persenNormal, 0)}% dari normal${ss.persenKap != null ? ` · ${fmt(ss.persenKap, 0)}% kapasitas` : ""} · batas waspada ${fmt(a.p90, 0)}, siaga ${fmt(a.p95, 0)}, awas ${fmt(a.p99, 0)} m³/s</div>
      <div class="rb"><canvas id="rv-${s.id}" aria-label="Grafik debit ${s.nama}"></canvas></div></div>`;
  }).join("");
  for (const s of list.filter((x) => x.ok)) {
    const key = "rv-" + s.id;
    if (charts[key]) charts[key].destroy();
    const iNow = s.seri.findIndex((x) => x.setelah);
    const maxSeri = Math.max(...s.seri.map((x) => x.debit || 0));
    const tampilBatas = maxSeri >= s.ambang.p90 * 0.5;
    const garis = (v, lbl, col) => ({ label: lbl, data: s.seri.map(() => v), borderColor: col, borderWidth: 1, borderDash: [4, 4], pointRadius: 0 });
    const ds = [
      { label: "Debit", data: s.seri.map((x) => x.debit), borderColor: css("--water"), backgroundColor: css("--water"), borderWidth: 2, pointRadius: s.seri.map((x, i) => (i === iNow - 1 ? 4 : 0)), tension: 0.25,
        segment: { borderDash: (c) => (iNow > 0 && c.p0DataIndex >= iNow - 1 ? [5, 4] : undefined) } },
      garis(s.ambang.p50, "Normal (median)", css("--muted")),
    ];
    if (tampilBatas) ds.push(garis(s.ambang.p90, "Batas waspada (P90)", css("--waspada")), garis(s.ambang.p95, "Batas siaga (P95)", css("--siaga")));
    charts[key] = new Chart($(key), {
      type: "line",
      data: { labels: s.seri.map((x) => x.tanggal.slice(8, 10) + "/" + x.tanggal.slice(5, 7)), datasets: ds },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(c.raw)} m³/s${c.datasetIndex === 0 && iNow > 0 && c.dataIndex >= iNow ? (T ? " (sesudah tanggal)" : " (prakiraan)") : ""}` } } },
        scales: { x: { grid: { display: false }, ticks: { color: css("--muted"), maxTicksLimit: 6, maxRotation: 0 } }, y: { beginAtZero: true, grid: { color: css("--line") }, ticks: { color: css("--muted"), maxTicksLimit: 4 } } },
      },
    });
  }
}

function renderAlerts() {
  const p = V().peringatan;
  if (V().tanggal) { $("pdSub").textContent = ""; $("alerts").innerHTML = `<div class="empty">Peringatan dini BMKG tidak tersedia untuk tanggal simulasi.</div>`; return; }
  if (!p) { $("alerts").innerHTML = `<div class="empty">Peringatan dini BMKG tidak dapat dimuat.</div>`; return; }
  $("pdSub").textContent = `${p.jumlahJawaBarat} peringatan aktif di Jawa Barat`;
  const ids = new Set((p.bekasi || []).map((a) => a.link));
  const kecNama = (ids2) => ids2.map((id) => (V().cuaca?.kecamatan || []).find((k) => k.id === id)?.nama).filter(Boolean).join(", ");
  let html = "";
  if (!p.bekasi?.length) html += `<div class="empty"><b>Tidak ada peringatan dini untuk Kabupaten Bekasi</b>BMKG sedang tidak menerbitkan peringatan hujan lebat untuk kecamatan di Bekasi.</div>`;
  html += (p.bekasi || []).map((a) => `<div class="item hit"><h4>${a.judul}</h4><div class="meta">${a.terbit}</div><p>Kecamatan Bekasi terdampak: <b>${kecNama(a.kecamatan)}</b></p><a href="${a.link}" target="_blank" rel="noopener">Lihat peringatan BMKG</a></div>`).join("");
  html += (p.jawaBarat || []).filter((a) => !ids.has(a.link)).map((a) => `<div class="item"><h4>${a.judul} <span class="meta">(di luar Bekasi)</span></h4><div class="meta">${a.terbit}</div><p>${a.isi.split("\n")[0]}</p></div>`).join("");
  $("alerts").innerHTML = html;
}

function renderReports() {
  const d = V().laporan;
  if (V().tanggal) { $("reports").innerHTML = `<div class="empty">Laporan warga tidak tersedia untuk tanggal simulasi.</div>`; return; }
  if (!d) { $("reports").innerHTML = `<div class="empty">Laporan PetaBencana.id tidak dapat dimuat.</div>`; return; }
  const nyata = laporanNyata();
  const latihan = (d.laporan || []).length - nyata.length;
  let html = nyata.length ? "" : `<div class="empty"><b>Tidak ada laporan banjir dari warga Bekasi</b>dalam 7 hari terakhir.${latihan ? ` (${latihan} laporan latihan/simulasi tidak dihitung)` : ""}</div>`;
  html += nyata.map((r) => `<div class="item hit"><h4>${r.wilayah}${r.kecamatan ? ` · dekat ${r.kecamatan.nama}` : ""}</h4>
    <div class="meta">${new Date(r.waktu).toLocaleString("id-ID")}${r.kedalaman != null ? ` · kedalaman ${r.kedalaman} cm` : ""}</div>
    <p>${r.teks || ""}</p>${r.foto ? `<a href="${r.foto}" target="_blank" rel="noopener">Lihat foto</a>` : ""}</div>`).join("");
  $("reports").innerHTML = html;
}

function renderPolicy(kec) {
  const worst = kec.reduce((a, b) => (STATUS.indexOf(b.status) > STATUS.indexOf(a) ? b.status : a), "normal");
  $("policy").innerHTML = STATUS.map((s) => {
    const list = kec.filter((k) => k.status === s).map((k) => k.nama);
    return `<div class="pol ${s} ${s === worst ? "active" : ""}"><h3>${badge(s)}<span class="cnt">${list.length} kecamatan</span></h3>
      <p class="kec">${s === "normal" ? (list.length === 23 ? "Semua kecamatan" : list.length ? `${list.length} kecamatan lainnya` : "–") : list.join(", ") || "–"}</p>
      <ul>${POLICY[s].map((x) => `<li>${x}</li>`).join("")}</ul></div>`;
  }).join("");
}

function renderTable(kec) {
  const rows = [...kec].sort((a, b) => b.skor - a.skor || a.nama.localeCompare(b.nama));
  $("tbl").innerHTML = `<thead><tr><th>Kecamatan</th><th>Status</th><th>Skor</th><th>${V().tanggal ? "Hujan H-1 (mm)" : "Hujan 24j lalu (mm)"}</th><th>${V().tanggal ? "Hujan hari-H (mm)" : "Prakiraan 24j Open-Meteo"}</th><th>Prakiraan 24j BMKG</th><th>Cuaca sekarang (BMKG)</th><th>Suhu</th><th>Elevasi (m)</th></tr></thead>
  <tbody>${rows.map((k) => `<tr><td>${k.nama}</td><td>${badge(k.status)}</td><td>${k.skor}</td><td>${fmt(k.hujan24Lalu)}</td><td>${fmt(k.hujan24Depan)}</td><td>${fmt(k.hujan24DepanBmkg)}</td>
    <td>${k.sekarang?.cuaca || "–"}</td><td>${k.sekarang ? k.sekarang.suhu + "°C" : "–"}</td><td>${k.elevasi ?? "–"}</td></tr>`).join("")}</tbody>`;
}

/* ---------- Simulasi ---------- */
const hariIni = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const tambahHari = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

async function simTanggal(tgl) {
  $("simDate").value = tgl;
  $("simInfo").textContent = "memuat data " + tglID(tgl) + "…";
  try {
    const r = await fetch("api/simulasi?tanggal=" + tgl);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    SIMT = j;
    const jenis = j.selisihHari > 0 ? `prakiraan ${j.selisihHari} hari ke depan` : j.selisihHari === 0 ? "hari ini" : `${-j.selisihHari} hari yang lalu`;
    $("simInfo").innerHTML = `<b>${tglID(tgl)}</b> · ${jenis} · hujan: ${j.sumberHujan} · sungai: model GloFAS`;
  } catch (e) {
    SIMT = null;
    $("simInfo").textContent = "Gagal memuat simulasi: " + e.message;
  }
  render();
}

function setMode(m) {
  MODE = m;
  SIM.on = m === "manual";
  document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === m));
  $("simTgl").hidden = m !== "tanggal";
  $("simCtl").hidden = m !== "manual";
  $("simbar").classList.toggle("on", m !== "live");
  if (m === "tanggal") simTanggal($("simDate").value || tambahHari(hariIni(), 1));
  else render();
}

function bindSim() {
  const d = $("simDate");
  d.min = "2019-01-01";
  d.max = tambahHari(hariIni(), 15);
  d.value = tambahHari(hariIni(), 1);
  d.addEventListener("change", () => d.value && simTanggal(d.value));
  document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  document.querySelectorAll(".chips button").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.d;
    simTanggal(v.startsWith("+") ? tambahHari(hariIni(), +v.slice(1)) : v);
  }));
  const rain = $("simRain"), river = $("simRiver");
  const upd = () => {
    SIM.rain = +rain.value; SIM.river = +river.value;
    $("simRainV").textContent = SIM.rain;
    $("simRiverV").textContent = fmt(SIM.river, 1);
    if (DATA.cuaca) render();
  };
  [rain, river].forEach((el) => el.addEventListener("input", upd));
}

bindSim();
$("refresh").addEventListener("click", () => (MODE === "tanggal" ? simTanggal($("simDate").value) : load()));
load();
setInterval(load, 10 * 60 * 1000);
