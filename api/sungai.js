// Debit sungai harian (model GloFAS via Open-Meteo Flood API): 14 hari lalu + 7 hari prakiraan.
import { SUNGAI, getJSON, send, fail } from "./_lib.js";

export default async function handler(req, res) {
  try {
    const out = await Promise.all(SUNGAI.map(async (s) => {
      try {
        const j = await getJSON(`https://flood-api.open-meteo.com/v1/flood?latitude=${s.lat}&longitude=${s.lon}` +
          `&daily=river_discharge,river_discharge_median,river_discharge_max&past_days=14&forecast_days=7`);
        const d = j.daily;
        const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
        const i = Math.max(0, d.time.indexOf(today));
        const median = d.river_discharge_median.slice(0, i + 1).filter((x) => x != null);
        const normal = median.length ? median.reduce((a, b) => a + b, 0) / median.length : null;
        const kini = d.river_discharge[i];
        const puncak7 = Math.max(...d.river_discharge.slice(i, i + 7).filter((x) => x != null));
        return {
          ...s, ok: true, satuan: "m³/s", hariIni: d.time[i], kini, normal: normal && +normal.toFixed(2),
          rasio: normal ? +(kini / normal).toFixed(2) : null,
          puncak7, rasioPuncak: normal ? +(puncak7 / normal).toFixed(2) : null,
          seri: d.time.map((t, k) => ({ tanggal: t, debit: d.river_discharge[k], median: d.river_discharge_median[k], maks: d.river_discharge_max[k], prakiraan: k > i })),
        };
      } catch (e) {
        return { ...s, ok: false, error: String(e.message || e) };
      }
    }));
    send(res, { diperbarui: new Date().toISOString(), sungai: out }, 3600);
  } catch (e) {
    fail(res, e);
  }
}
