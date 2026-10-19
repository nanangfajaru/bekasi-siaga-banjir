// Debit sungai harian (model GloFAS via Open-Meteo Flood API): 14 hari lalu + 7 hari prakiraan.
import { SUNGAI, getJSON, send, fail, ringkasSungai } from "./_lib.js";

export default async function handler(req, res) {
  try {
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const out = await Promise.all(SUNGAI.map(async (s) => {
      try {
        const j = await getJSON(`https://flood-api.open-meteo.com/v1/flood?latitude=${s.lat}&longitude=${s.lon}` +
          `&daily=river_discharge&past_days=14&forecast_days=7`);
        const i = Math.max(0, j.daily.time.indexOf(today));
        return ringkasSungai(s, j.daily, i);
      } catch (e) {
        return { id: s.id, nama: s.nama, lat: s.lat, lon: s.lon, kecamatan: s.kecamatan, ok: false, error: String(e.message || e) };
      }
    }));
    send(res, { diperbarui: new Date().toISOString(), sungai: out }, 3600);
  } catch (e) {
    fail(res, e);
  }
}
