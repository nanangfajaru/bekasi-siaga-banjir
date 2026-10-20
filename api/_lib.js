// Data bersama untuk semua endpoint.
// Kode desa (adm4) mengikuti kode wilayah Kemendagri yang dipakai BMKG.
// Satu desa per kecamatan dipakai sebagai titik pantau.
export const KECAMATAN = [
  { id: "01", nama: "Tarumajaya", adm4: "32.16.01.2001", desa: "Sagara Makmur", lat: -6.1081, lon: 106.9798 },
  { id: "02", nama: "Babelan", adm4: "32.16.02.2001", desa: "Bunibakti", lat: -6.1074, lon: 107.0352 },
  { id: "03", nama: "Sukawangi", adm4: "32.16.03.2001", desa: "Sukaringin", lat: -6.0906, lon: 107.0839 },
  { id: "04", nama: "Tambelang", adm4: "32.16.04.2001", desa: "Sukawijaya", lat: -6.1516, lon: 107.1462 },
  { id: "05", nama: "Tambun Utara", adm4: "32.16.05.2001", desa: "Satriajaya", lat: -6.2112, lon: 107.0517 },
  { id: "06", nama: "Tambun Selatan", adm4: "32.16.06.1001", desa: "Jatimulya", lat: -6.2671, lon: 107.0291 },
  { id: "07", nama: "Cibitung", adm4: "32.16.07.1001", desa: "Wanasari", lat: -6.247, lon: 107.0883 },
  { id: "08", nama: "Cikarang Barat", adm4: "32.16.08.2001", desa: "Telagamurni", lat: -6.2589, lon: 107.1173 },
  { id: "09", nama: "Cikarang Utara", adm4: "32.16.09.2001", desa: "Cikarangkota", lat: -6.2619, lon: 107.1516 },
  { id: "10", nama: "Karang Bahagia", adm4: "32.16.10.2001", desa: "Sukaraya", lat: -6.2325, lon: 107.1674 },
  { id: "11", nama: "Cikarang Timur", adm4: "32.16.11.2001", desa: "Tanjungbaru", lat: -6.2761, lon: 107.2236 },
  { id: "12", nama: "Kedung Waringin", adm4: "32.16.12.2001", desa: "Karangsambung", lat: -6.2583, lon: 107.2254 },
  { id: "13", nama: "Pebayuran", adm4: "32.16.13.2001", desa: "Karangharja", lat: -6.1086, lon: 107.2132 },
  { id: "14", nama: "Sukakarya", adm4: "32.16.14.2001", desa: "Sukamurni", lat: -6.1248, lon: 107.1476 },
  { id: "15", nama: "Sukatani", adm4: "32.16.15.2001", desa: "Sukamulya", lat: -6.1613, lon: 107.1718 },
  { id: "16", nama: "Cabangbungin", adm4: "32.16.16.2001", desa: "Jayabakti", lat: -6.0798, lon: 107.1026 },
  { id: "17", nama: "Muaragembong", adm4: "32.16.17.2001", desa: "Pantai Mekar", lat: -6.006, lon: 107.0422 },
  { id: "18", nama: "Setu", adm4: "32.16.18.2001", desa: "Cijengkol", lat: -6.3207, lon: 107.0411 },
  { id: "19", nama: "Cikarang Selatan", adm4: "32.16.19.2001", desa: "Cibatu", lat: -6.3378, lon: 107.1541 },
  { id: "20", nama: "Cikarang Pusat", adm4: "32.16.20.2001", desa: "Cicau", lat: -6.3679, lon: 107.1503 },
  { id: "21", nama: "Serang Baru", adm4: "32.16.21.2001", desa: "Sukaragam", lat: -6.3935, lon: 107.1078 },
  { id: "22", nama: "Cibarusah", adm4: "32.16.22.2001", desa: "Sirnajati", lat: -6.4465, lon: 107.1017 },
  { id: "23", nama: "Bojongmangu", adm4: "32.16.23.2001", desa: "Karangmulya", lat: -6.4639, lon: 107.1771 },
];

// Titik sungai pada grid model GloFAS (Open-Meteo Flood API).
// Ambang = persentil debit harian model 1 Jan 2019 – 19 Okt 2026 (2.849 hari), dihitung dari Open-Meteo Flood API.
//   p50 = debit "normal" (median), p90 = jarang terjadi, p95 = sangat tinggi, p99 = ekstrem.
// Referensi kapasitas Citarum hilir ±1.100 m³/s (Bappenas); banjir Pebayuran Feb 2021 ±1.300 m³/s.
export const SUNGAI = [
  { id: "citarum", nama: "Sungai Citarum (hilir, Pebayuran–Muaragembong)", lat: -6.075, lon: 107.125,
    p50: 239.4, p90: 681.3, p95: 766.4, p99: 870.0, kapasitas: 1100,
    kecamatan: ["12", "13", "14", "16", "17"] },
  { id: "kali-bekasi", nama: "Kali Bekasi (Tambun–Babelan)", lat: -6.225, lon: 107.025,
    p50: 17.9, p90: 43.0, p95: 51.2, p99: 75.9, kapasitas: null,
    kecamatan: ["01", "02", "05", "06"] },
];

// Titik pantau muka laut (pasang/rob) di Laut Jawa, utara pesisir Bekasi.
// Model MeteoFrance SMOC via Open-Meteo Marine API (pasang surut + efek tekanan udara), data sejak 23 Nov 2022.
// Ambang = persentil tinggi muka laut maksimum harian 23 Nov 2022 – 19 Okt 2026 (1.411 hari), acuan rata-rata muka laut.
// Puncak tertinggi tercatat 14–17 Des 2024 (1,35–1,38 m), bersamaan dengan rob besar di pesisir utara Jakarta–Bekasi.
export const LAUT = {
  id: "laut", nama: "Pasang laut pesisir utara (Muaragembong–Tarumajaya)", lat: -5.958, lon: 106.958,
  p50: 0.99, p90: 1.20, p95: 1.26, p99: 1.34, mulai: "2022-11-23",
  kecamatan: ["01", "02", "17"],
};

// Ringkas deret muka laut per jam mulai index i (jam acuan): nilai kini, puncak 24 jam, dan puncak harian.
export function ringkasLaut(t, v, i) {
  const r1 = (x) => (x == null ? null : Math.round(x * 100) / 100);
  let puncak = null;
  for (let k = i; k < Math.min(v.length, i + 24); k++) if (v[k] != null && (!puncak || v[k] > puncak.tinggi)) puncak = { waktu: t[k], tinggi: v[k] };
  const harian = {};
  t.forEach((w, k) => {
    if (v[k] == null) return;
    const d = w.slice(0, 10);
    if (!harian[d] || v[k] > harian[d].tinggi) harian[d] = { tanggal: d, waktu: w, tinggi: v[k] };
  });
  return {
    id: LAUT.id, nama: LAUT.nama, lat: LAUT.lat, lon: LAUT.lon, kecamatan: LAUT.kecamatan,
    ambang: { p50: LAUT.p50, p90: LAUT.p90, p95: LAUT.p95, p99: LAUT.p99 },
    ok: puncak != null, satuan: "m", acuan: t[i], kini: r1(v[i]), puncak24: puncak,
    harian: Object.values(harian),
    seri: t.map((w, k) => ({ waktu: w, tinggi: v[k], setelah: k > i })),
  };
}

export const marineUrl = (q) => `https://marine-api.open-meteo.com/v1/marine?latitude=${LAUT.lat}&longitude=${LAUT.lon}` +
  `&hourly=sea_level_height_msl&timezone=Asia%2FJakarta&${q}`;

// Ringkas deret debit harian di sekitar tanggal acuan (index i).
export function ringkasSungai(s, d, i) {
  const v = d.river_discharge;
  const kini = v[i];
  const jendela = v.slice(i, i + 4).filter((x) => x != null);
  const puncak3 = jendela.length ? Math.max(...jendela) : kini;
  const depan = v.slice(i, i + 8).filter((x) => x != null);
  const puncak7 = depan.length ? Math.max(...depan) : kini;
  return {
    id: s.id, nama: s.nama, lat: s.lat, lon: s.lon, kecamatan: s.kecamatan,
    ambang: { p50: s.p50, p90: s.p90, p95: s.p95, p99: s.p99, kapasitas: s.kapasitas },
    ok: true, satuan: "m³/s", tanggal: d.time[i], kini, puncak3, puncak7,
    seri: d.time.map((t, k) => ({ tanggal: t, debit: v[k], setelah: k > i })),
  };
}

const UA = { "User-Agent": "bekasi-siaga-banjir/1.0 (dashboard tugas smart city)" };

export async function getJSON(url, timeout = 15000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export async function getText(url, timeout = 15000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

export function send(res, data, maxAge = 600) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", `s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 3}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).send(JSON.stringify(data));
}

export function fail(res, e) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(502).send(JSON.stringify({ error: String(e && e.message ? e.message : e) }));
}

export const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z]/g, "");

export function jarakKm(a, b, c, d) {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
