// Prakiraan cuaca BMKG per kecamatan + akumulasi hujan Open-Meteo (24 jam lalu & 24 jam ke depan).
import { KECAMATAN, getJSON, send, fail } from "./_lib.js";

async function bmkg(k) {
  try {
    const j = await getJSON(`https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${k.adm4}`);
    const slots = (j.data?.[0]?.cuaca || []).flat().map((c) => ({
      waktu: c.local_datetime, suhu: c.t, hujan: c.tp, cuaca: c.weather_desc, lembap: c.hu, angin: c.ws, ikon: c.image ? c.image.replace(/ /g, "%20") : null,
    }));
    return { ok: true, slots: slots.slice(0, 12), analisis: j.data?.[0]?.cuaca?.[0]?.[0]?.analysis_date || null };
  } catch (e) {
    return { ok: false, slots: [], error: String(e.message || e) };
  }
}

export default async function handler(req, res) {
  try {
    const lat = KECAMATAN.map((k) => k.lat).join(",");
    const lon = KECAMATAN.map((k) => k.lon).join(",");
    const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=precipitation&past_days=1&forecast_days=2&timezone=Asia%2FJakarta`;
    const [om, ...bm] = await Promise.all([getJSON(omUrl).catch((e) => ({ error: String(e) })), ...KECAMATAN.map(bmkg)]);
    const omArr = Array.isArray(om) ? om : [];
    const now = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 13); // jam WIB, format YYYY-MM-DDTHH

    const kec = KECAMATAN.map((k, i) => {
      const o = omArr[i];
      let lalu = null, depan = null, perJam = [];
      if (o && o.hourly) {
        const t = o.hourly.time, p = o.hourly.precipitation;
        const idx = Math.max(0, t.findIndex((x) => x.slice(0, 13) === now));
        lalu = +p.slice(Math.max(0, idx - 24), idx).reduce((a, b) => a + (b || 0), 0).toFixed(1);
        depan = +p.slice(idx, idx + 24).reduce((a, b) => a + (b || 0), 0).toFixed(1);
        perJam = t.slice(Math.max(0, idx - 24), idx + 24).map((x, j) => [x.slice(5, 13), p[Math.max(0, idx - 24) + j]]);
      }
      const b = bm[i];
      const bmkgDepan = +b.slots.slice(0, 8).reduce((a, s) => a + (s.hujan || 0), 0).toFixed(1);
      return {
        ...k,
        elevasi: o?.elevation ?? null,
        hujan24Lalu: lalu,
        hujan24Depan: depan,
        hujan24DepanBmkg: b.ok ? bmkgDepan : null,
        sekarang: b.slots[0] || null,
        bmkg: b.slots,
        bmkgOk: b.ok,
        perJam,
      };
    });
    send(res, { diperbarui: new Date().toISOString(), analisisBmkg: bm.find((b) => b.analisis)?.analisis || null, kecamatan: kec }, 900);
  } catch (e) {
    fail(res, e);
  }
}
