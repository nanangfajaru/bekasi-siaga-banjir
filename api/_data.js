// Pengambil data untuk AI Agent: memanggil endpoint dashboard sendiri (api/cuaca, api/sungai, ...),
// sehingga ikut cache CDN Vercel dan tidak membebani BMKG/Open-Meteo dua kali.
import { getJSON } from "./_lib.js";

export function baseUrl(req) {
  if (process.env.DATA_BASE_URL) return process.env.DATA_BASE_URL.replace(/\/$/, "");
  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host;
  if (host) return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  return "https://bekasi-siaga-banjir.vercel.app";
}

// Satu objek per request: tiap sumber diambil paling banyak sekali walau dipanggil beberapa tool.
export function sumberData(req) {
  const base = baseUrl(req);
  const memo = {};
  const ambil = (nama, path) => (memo[nama] ??= getJSON(`${base}${path}`, 30000).catch((e) => ({ _error: String(e.message || e) })));
  return {
    base,
    cuaca: () => ambil("cuaca", "/api/cuaca"),
    sungai: () => ambil("sungai", "/api/sungai"),
    laut: () => ambil("laut", "/api/laut"),
    peringatan: () => ambil("peringatan", "/api/peringatan"),
    laporan: () => ambil("laporan", "/api/laporan"),
    simulasi: (tgl) => ambil(`sim-${tgl}`, `/api/simulasi?tanggal=${encodeURIComponent(tgl)}`),
    async semua() {
      const [cuaca, sungai, laut, peringatan, laporan] = await Promise.all([this.cuaca(), this.sungai(), this.laut(), this.peringatan(), this.laporan()]);
      const gagal = Object.entries({ cuaca, sungai, laut, peringatan, laporan }).filter(([, v]) => v?._error).map(([k]) => k);
      return { cuaca, sungai, laut, peringatan, laporan, gagal };
    },
  };
}
