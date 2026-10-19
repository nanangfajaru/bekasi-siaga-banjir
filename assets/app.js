/* Bekasi Siaga Banjir – dashboard realtime */
const $ = (id) => document.getElementById(id);
const fmt = (n, d = 1) => (n == null || isNaN(n) ? "–" : Number(n).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d }));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

const STATUS = ["normal", "waspada", "siaga", "awas"];
const LABEL = { normal: "Normal", waspada: "Waspada", siaga: "Siaga", awas: "Awas" };
const ICON = { normal: "✓", waspada: "!", siaga: "!!", awas: "!!!" };
const badge = (s) => `<span class="st ${s}"><i aria-hidden="true">${ICON[s]}</i>${LABEL[s]}</span>`;
const color = (s) => css(`--${s}`);

// Kecamatan yang dilintasi sungai pantau
const SUNGAI_KEC = { "citarum": ["12", "13", "14", "16", "17"], "kali-bekasi": ["01", "02", "05", "06"] };

const POLICY = {
  normal: ["Bersihkan saluran, gorong-gorong, dan pintu air secara rutin", "Uji kesiapan pompa air dan perahu karet BPBD", "Sosialisasi jalur evakuasi ke RT/RW di desa rawan"],
  waspada: ["Pantau cuaca dan debit sungai setiap 3 jam", "Siagakan pompa portabel di titik genangan langganan", "Kirim info dini ke warga lewat RT/RW dan media sosial Pemkab"],
  siaga: ["Buka posko siaga banjir di kantor kecamatan", "Perahu karet dan personel BPBD standby di lokasi", "Siapkan evakuasi lansia, anak, dan penyandang disabilitas", "Koordinasi operasi pintu air dengan BBWS Citarum"],
  awas: ["Evakuasi warga dari permukiman tergenang", "Aktifkan dapur umum dan pengungsian", "Usulkan status tanggap darurat bencana kepada Bupati", "Tutup sementara akses jalan yang terendam"],
};

let DATA = { cuaca: null, sungai: null, laporan: null, peringatan: null };
let map, layer, charts = {}, selKec = null;
const SIM = { on: false, rain: 0, river: 1 };

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
  return (DATA.laporan?.laporan || []).filter((r) => !r.latihan);
}

// Status sungai: puncak 7 hari ke depan dibanding rata-rata 14 hari,
// dan hanya dihitung jika melampaui debit tertinggi 14 hari terakhir.
function statusSungai(s) {
  const m = SIM.on ? SIM.river : 1;
  const puncak = (s.puncak7 || 0) * m;
  const rasio = s.normal ? puncak / s.normal : 0;
  const maksLalu = Math.max(...s.seri.filter((x) => !x.prakiraan).map((x) => x.debit || 0));
  const lewat = puncak > maksLalu;
  const poin = lewat ? (rasio >= 2 ? 2 : rasio >= 1.5 ? 1 : 0) : 0;
  return { puncak, rasio, maksLalu, lewat, poin, status: ["normal", "waspada", "siaga"][poin] };
}

function sungaiRasio() {
  const out = {};
  for (const s of DATA.sungai?.sungai || []) {
    if (!s.ok) continue;
    const key = s.id.startsWith("citarum") ? "citarum" : s.id;
    out[key] = Math.max(out[key] || 0, statusSungai(s).poin);
  }
  return out;
}

function nilai(k) {
  const add = SIM.on ? SIM.rain : 0;
  const hujan = Math.max(k.hujan24Lalu || 0, k.hujan24Depan || 0, k.hujan24DepanBmkg || 0) + add;
  const alasan = [];
  let skor = 0;
  const h = hujan >= 150 ? 4 : hujan >= 100 ? 3 : hujan >= 50 ? 2 : hujan >= 20 ? 1 : 0;
  if (h) { skor += h; alasan.push(`hujan ${fmt(hujan, 0)} mm`); }

  const pd = (DATA.peringatan?.bekasi || []).some((a) => a.kecamatan.includes(k.id));
  if (pd) { skor += 2; alasan.push("peringatan dini BMKG"); }

  const now = Date.now();
  const lap = laporanNyata().filter((r) => r.kecamatan?.id === k.id);
  if (lap.some((r) => now - new Date(r.waktu) < 864e5)) { skor += 2; alasan.push("laporan banjir 24 jam"); }
  else if (lap.length) { skor += 1; alasan.push("laporan banjir 7 hari"); }

  const rs = sungaiRasio();
  let sg = 0;
  for (const [sid, list] of Object.entries(SUNGAI_KEC)) {
    if (list.includes(k.id) && rs[sid] > sg) sg = rs[sid];
  }
  if (sg) { skor += sg; alasan.push("debit sungai naik"); }

  if (skor > 0 && k.elevasi != null && k.elevasi <= 5) { skor += 1; alasan.push(`dataran rendah ${k.elevasi} m`); }
  const status = skor >= 5 ? "awas" : skor >= 3 ? "siaga" : skor >= 1 ? "waspada" : "normal";
  return { skor, status, hujan, alasan };
}

function semua() {
  return (DATA.cuaca?.kecamatan || []).map((k) => ({ ...k, ...nilai(k) }));
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
  const cit = DATA.sungai?.sungai?.find((s) => s.id === "citarum-hilir");
  const pd = DATA.peringatan?.bekasi?.length || 0;
  const lap = laporanNyata().filter((r) => r.wilayah === "Kabupaten Bekasi").length;
  $("kpis").innerHTML = `
    <div class="kpi main" style="background:${color(st)};${st === "waspada" ? "color:#111" : ""}">
      <div class="k">Status Kabupaten</div><div class="v">${LABEL[st]}</div>
      <div class="d">${st === "normal" ? "semua kecamatan aman" : `tertinggi: ${worst.nama}`}</div></div>
    <div class="kpi"><div class="k">Kecamatan siaga/awas</div><div class="v">${nSiaga}<small style="font-size:14px;color:var(--muted)"> / 23</small></div><div class="d">${nWaspada} kecamatan waspada</div></div>
    <div class="kpi"><div class="k">Hujan 24 jam terakhir</div><div class="v">${fmt(maxLalu.hujan24Lalu)} mm</div><div class="d">tertinggi di ${maxLalu.nama}</div></div>
    <div class="kpi"><div class="k">Prakiraan hujan 24 jam</div><div class="v">${fmt(Math.max(maxDepan.hujan24Depan || 0, maxDepan.hujan24DepanBmkg || 0))} mm</div><div class="d">tertinggi di ${maxDepan.nama}</div></div>
    <div class="kpi"><div class="k">Debit Citarum hilir</div><div class="v">${cit?.ok ? fmt(cit.kini, 0) : "–"} <small style="font-size:13px">m³/s</small></div><div class="d">${cit?.ok ? `${fmt((cit.kini / cit.normal) * 100, 0)}% dari rata-rata 14 hari` : "data belum tersedia"}</div></div>
    <div class="kpi"><div class="k">Peringatan & laporan</div><div class="v">${pd} · ${lap}</div><div class="d">peringatan dini BMKG · laporan warga</div></div>`;
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
      Hujan 24 jam lalu: <b>${fmt(k.hujan24Lalu)} mm</b><br>
      Prakiraan 24 jam: <b>${fmt(k.hujan24Depan)} mm</b> (Open-Meteo), <b>${fmt(k.hujan24DepanBmkg)} mm</b> (BMKG)<br>
      ${now ? `Cuaca BMKG: ${now.cuaca}, ${now.suhu}°C<br>` : ""}Elevasi: ${k.elevasi ?? "–"} m · Desa pantau: ${k.desa}<br>
      <span style="color:#7d8896">${k.alasan.length ? "Faktor: " + k.alasan.join(", ") : "Tidak ada faktor risiko"}</span>`);
    m.on("click", () => pilih(k.id));
    m.bindTooltip(k.nama);
    m.addTo(layer);
  }
  for (const s of DATA.sungai?.sungai || []) {
    const icon = L.divIcon({ className: "", html: `<div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:14px solid ${css("--water")}"></div>`, iconSize: [16, 14] });
    L.marker([s.lat, s.lon], { icon }).bindPopup(`<h3>${s.nama}</h3>${s.ok ? `Debit hari ini: <b>${fmt(s.kini)} m³/s</b><br>Rata-rata 14 hari: ${fmt(s.normal)} m³/s<br>Puncak 7 hari ke depan: ${fmt(s.puncak7)} m³/s` : "Data tidak tersedia"}`).addTo(layer);
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
  return (DATA.cuaca?.kecamatan || []).find((k) => k.id === selKec);
}

function renderRain() {
  const k = kecTerpilih();
  if (!k || !k.perJam?.length) return;
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
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${fmt(c.raw)} mm ${c.dataIndex < 24 ? "(24 jam lalu)" : "(prakiraan)"}` } } },
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
  if (!k.bmkgOk || !k.bmkg.length) { $("forecast").innerHTML = `<div class="empty">Prakiraan BMKG belum tersedia.</div>`; return; }
  $("forecast").innerHTML = k.bmkg.slice(0, 8).map((s) => {
    const d = new Date(s.waktu.replace(" ", "T"));
    const t = d.toLocaleString("id-ID", { weekday: "short", hour: "2-digit", minute: "2-digit" });
    return `<div class="fc-i">${s.ikon ? `<img src="${s.ikon}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : "<span></span>"}
      <div><div class="fc-t">${t}</div><div class="fc-d">${s.cuaca}</div><div class="fc-n">${s.suhu}°C · hujan ${fmt(s.hujan)} mm · ${s.lembap}%</div></div></div>`;
  }).join("");
}

function renderRivers() {
  const list = DATA.sungai?.sungai || [];
  if (!list.length) { $("rivers").innerHTML = `<div class="empty">Data debit sungai belum tersedia.</div>`; return; }
  $("rivers").innerHTML = list.map((s) => {
    if (!s.ok) return `<div class="river"><h3>${s.nama}</h3><div class="empty">Data tidak tersedia</div></div>`;
    const ss = statusSungai(s);
    const st = ss.status;
    const tren = ss.puncak > s.kini * 1.1 ? "diprakirakan naik" : "stabil/menurun";
    return `<div class="river"><h3>${s.nama}</h3>${badge(st)}
      <div class="nums"><span>hari ini <b>${fmt(s.kini)}</b> m³/s</span><span>rata-rata 14 hari <b>${fmt(s.normal)}</b></span></div>
      <div class="sub">Puncak 7 hari ke depan ${fmt(ss.puncak)} m³/s (${fmt(ss.rasio, 1)}× rata-rata) · ${tren}${ss.lewat ? " · melampaui puncak 14 hari" : ""}</div>
      <div class="rb"><canvas id="rv-${s.id}" aria-label="Grafik debit ${s.nama}"></canvas></div></div>`;
  }).join("");
  for (const s of list.filter((x) => x.ok)) {
    const key = "rv-" + s.id;
    if (charts[key]) charts[key].destroy();
    const iNow = s.seri.findIndex((x) => x.prakiraan);
    charts[key] = new Chart($(key), {
      type: "line",
      data: {
        labels: s.seri.map((x) => x.tanggal.slice(8, 10) + "/" + x.tanggal.slice(5, 7)),
        datasets: [
          { label: "Debit", data: s.seri.map((x) => x.debit), borderColor: css("--water"), backgroundColor: css("--water"), borderWidth: 2, pointRadius: 0, tension: 0.25,
            segment: { borderDash: (c) => (iNow > 0 && c.p0DataIndex >= iNow - 1 ? [5, 4] : undefined) } },
          { label: "Rata-rata 14 hari", data: s.seri.map(() => s.normal), borderColor: css("--muted"), borderWidth: 1, borderDash: [2, 3], pointRadius: 0 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(c.raw)} m³/s${c.datasetIndex === 0 && iNow > 0 && c.dataIndex >= iNow ? " (prakiraan)" : ""}` } } },
        scales: { x: { grid: { display: false }, ticks: { color: css("--muted"), maxTicksLimit: 6, maxRotation: 0 } }, y: { beginAtZero: true, grid: { color: css("--line") }, ticks: { color: css("--muted"), maxTicksLimit: 4 } } },
      },
    });
  }
}

function renderAlerts() {
  const p = DATA.peringatan;
  if (!p) { $("alerts").innerHTML = `<div class="empty">Peringatan dini BMKG tidak dapat dimuat.</div>`; return; }
  $("pdSub").textContent = `${p.jumlahJawaBarat} peringatan aktif di Jawa Barat`;
  const ids = new Set((p.bekasi || []).map((a) => a.link));
  const kecNama = (ids2) => ids2.map((id) => (DATA.cuaca?.kecamatan || []).find((k) => k.id === id)?.nama).filter(Boolean).join(", ");
  let html = "";
  if (!p.bekasi?.length) html += `<div class="empty"><b>Tidak ada peringatan dini untuk Kabupaten Bekasi</b>BMKG sedang tidak menerbitkan peringatan hujan lebat untuk kecamatan di Bekasi.</div>`;
  html += (p.bekasi || []).map((a) => `<div class="item hit"><h4>${a.judul}</h4><div class="meta">${a.terbit}</div><p>Kecamatan Bekasi terdampak: <b>${kecNama(a.kecamatan)}</b></p><a href="${a.link}" target="_blank" rel="noopener">Lihat peringatan BMKG</a></div>`).join("");
  html += (p.jawaBarat || []).filter((a) => !ids.has(a.link)).map((a) => `<div class="item"><h4>${a.judul} <span class="meta">(di luar Bekasi)</span></h4><div class="meta">${a.terbit}</div><p>${a.isi.split("\n")[0]}</p></div>`).join("");
  $("alerts").innerHTML = html;
}

function renderReports() {
  const d = DATA.laporan;
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
  $("tbl").innerHTML = `<thead><tr><th>Kecamatan</th><th>Status</th><th>Skor</th><th>Hujan 24j lalu (mm)</th><th>Prakiraan 24j Open-Meteo</th><th>Prakiraan 24j BMKG</th><th>Cuaca sekarang (BMKG)</th><th>Suhu</th><th>Elevasi (m)</th></tr></thead>
  <tbody>${rows.map((k) => `<tr><td>${k.nama}</td><td>${badge(k.status)}</td><td>${k.skor}</td><td>${fmt(k.hujan24Lalu)}</td><td>${fmt(k.hujan24Depan)}</td><td>${fmt(k.hujan24DepanBmkg)}</td>
    <td>${k.sekarang?.cuaca || "–"}</td><td>${k.sekarang ? k.sekarang.suhu + "°C" : "–"}</td><td>${k.elevasi ?? "–"}</td></tr>`).join("")}</tbody>`;
}

/* ---------- Simulasi ---------- */
function bindSim() {
  const on = $("simOn"), rain = $("simRain"), river = $("simRiver");
  const upd = () => {
    SIM.on = on.checked; SIM.rain = +rain.value; SIM.river = +river.value;
    $("simCtl").hidden = !SIM.on;
    $("simbar").classList.toggle("on", SIM.on);
    $("simRainV").textContent = SIM.rain;
    $("simRiverV").textContent = fmt(SIM.river, 1);
    if (DATA.cuaca) render();
  };
  [on, rain, river].forEach((el) => el.addEventListener("input", upd));
}

bindSim();
$("refresh").addEventListener("click", load);
load();
setInterval(load, 10 * 60 * 1000);
