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
export const SUNGAI = [
  { id: "citarum-hilir", nama: "Sungai Citarum (hilir, Pebayuran–Cabangbungin)", lat: -6.075, lon: 107.125 },
  { id: "citarum-muara", nama: "Sungai Citarum (muara, Muaragembong)", lat: -5.975, lon: 107.025 },
  { id: "kali-bekasi", nama: "Kali Bekasi (Tambun)", lat: -6.225, lon: 107.025 },
];

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
