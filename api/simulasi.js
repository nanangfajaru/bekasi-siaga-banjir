// Simulasi per tanggal: curah hujan per kecamatan + debit sungai untuk tanggal pilihan.
//  - tanggal mendatang (s.d. 15 hari) dan 80 hari terakhir: prakiraan Open-Meteo
//  - tanggal lebih lama (sejak 2019): arsip reanalisis ERA5 (Open-Meteo Archive)
import { KECAMATAN, SUNGAI, getJSON, send, fail, ringkasSungai } from "./_lib.js";

const hari = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

export default async function handler(req, res) {
  try {
    const tgl = String(req.query.tanggal || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) return fail(res, "Format tanggal harus YYYY-MM-DD");
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const selisih = Math.round((Date.parse(tgl) - Date.parse(today)) / 864e5);
    if (tgl < "2019-01-01") return fail(res, "Tanggal paling awal 1 Januari 2019");
    if (selisih > 15) return fail(res, "Prakiraan hanya tersedia sampai 15 hari ke depan");

    const pakaiArsip = selisih < -80;
    const lat = KECAMATAN.map((k) => k.lat).join(",");
    const lon = KECAMATAN.map((k) => k.lon).join(",");
    const base = pakaiArsip ? "https://archive-api.open-meteo.com/v1/archive" : "https://api.open-meteo.com/v1/forecast";
    const hujanUrl = `${base}?latitude=${lat}&longitude=${lon}&start_date=${hari(tgl, -1)}&end_date=${tgl}&hourly=precipitation&timezone=Asia%2FJakarta`;

    const [hj, ...sg] = await Promise.all([
      getJSON(hujanUrl, 20000),
      ...SUNGAI.map((s) => getJSON(`https://flood-api.open-meteo.com/v1/flood?latitude=${s.lat}&longitude=${s.lon}` +
        `&daily=river_discharge&start_date=${hari(tgl, -14)}&end_date=${hari(tgl, 7)}`).catch((e) => ({ error: String(e) }))),
    ]);
    const arr = Array.isArray(hj) ? hj : [hj];
    const kecamatan = KECAMATAN.map((k, i) => {
      const o = arr[i];
      const p = o?.hourly?.precipitation || [];
      const t = o?.hourly?.time || [];
      const sum = (a) => +a.reduce((x, y) => x + (y || 0), 0).toFixed(1);
      return {
        ...k, elevasi: o?.elevation ?? null,
        hujan24Lalu: sum(p.slice(0, 24)),
        hujan24Depan: sum(p.slice(24, 48)),
        hujan24DepanBmkg: null, sekarang: null, bmkg: [], bmkgOk: false,
        perJam: t.map((x, j) => [x.slice(5, 13), p[j]]),
      };
    });
    const sungai = SUNGAI.map((s, n) => {
      const j = sg[n];
      if (!j || j.error || !j.daily) return { id: s.id, nama: s.nama, lat: s.lat, lon: s.lon, kecamatan: s.kecamatan, ok: false };
      const i = Math.max(0, j.daily.time.indexOf(tgl));
      return ringkasSungai(s, j.daily, i);
    });
    send(res, {
      tanggal: tgl, selisihHari: selisih,
      sumberHujan: pakaiArsip ? "Arsip reanalisis ERA5 (Open-Meteo Archive)" : (selisih > 0 ? "Prakiraan Open-Meteo" : "Open-Meteo (data model terkini)"),
      kecamatan, sungai,
    }, pakaiArsip ? 86400 : 1800);
  } catch (e) {
    fail(res, e);
  }
}
