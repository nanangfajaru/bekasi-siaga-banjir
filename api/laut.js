// Tinggi muka laut per jam (pasang/rob) di pesisir utara Bekasi: 2 hari lalu + 7 hari prakiraan.
import { LAUT, getJSON, send, fail, ringkasLaut, marineUrl } from "./_lib.js";

export default async function handler(req, res) {
  try {
    const j = await getJSON(marineUrl("past_days=2&forecast_days=7"));
    const t = j.hourly.time, v = j.hourly.sea_level_height_msl;
    const jamIni = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 13) + ":00";
    const i = Math.max(0, t.indexOf(jamIni));
    send(res, { diperbarui: new Date().toISOString(), laut: ringkasLaut(t, v, i) }, 1800);
  } catch (e) {
    send(res, { diperbarui: new Date().toISOString(), laut: { id: LAUT.id, nama: LAUT.nama, lat: LAUT.lat, lon: LAUT.lon, kecamatan: LAUT.kecamatan, ok: false, error: String(e.message || e) } }, 300);
  }
}
