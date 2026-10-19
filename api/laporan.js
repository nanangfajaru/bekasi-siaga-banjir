// Laporan banjir warga dari PetaBencana.id (Jawa Barat, 7 hari terakhir), difilter ke Bekasi.
import { KECAMATAN, getJSON, send, fail, jarakKm } from "./_lib.js";

export default async function handler(req, res) {
  try {
    const j = await getJSON("https://api.petabencana.id/reports?admin=ID-JB&disaster=flood&timeperiod=604800&geoformat=geojson");
    const feats = j.result?.features || [];
    const laporan = feats
      .filter((f) => ["3216", "3275"].includes(f.properties?.tags?.region_code))
      .map((f) => {
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties;
        let terdekat = null;
        for (const k of KECAMATAN) {
          const d = jarakKm(lat, lon, k.lat, k.lon);
          if (!terdekat || d < terdekat.jarak) terdekat = { id: k.id, nama: k.nama, jarak: +d.toFixed(1) };
        }
        return {
          id: p.pkey, waktu: p.created_at, lat, lon,
          wilayah: p.tags.region_code === "3216" ? "Kabupaten Bekasi" : "Kota Bekasi",
          kecamatan: p.tags.region_code === "3216" ? terdekat : null,
          kedalaman: p.report_data?.flood_depth ?? null,
          teks: (p.text || "").slice(0, 280),
          foto: p.image_url || null,
          latihan: !!p.is_training,
          sumber: p.source || null,
        };
      })
      .sort((a, b) => (a.waktu < b.waktu ? 1 : -1));
    send(res, {
      diperbarui: new Date().toISOString(),
      totalJawaBarat: feats.filter((f) => !f.properties?.is_training).length,
      laporan,
    }, 300);
  } catch (e) {
    fail(res, e);
  }
}
