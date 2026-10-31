// Status risiko banjir siap pakai: skor, status, dan alasan per kecamatan, dihitung dengan rumus yang sama
// dengan dashboard (assets/skor.js). Untuk bot/agent (Hermes Agent) dan pihak lain yang tidak membuka web.
//   /api/status                     semua kecamatan
//   /api/status?kecamatan=babelan   satu kecamatan (id "02" atau nama, huruf besar/kecil bebas)
//   /api/status?lat=-6.1&lon=107.03 kecamatan dengan titik pantau terdekat
import "../assets/skor.js";
import { KECAMATAN, send, fail, norm, jarakKm } from "./_lib.js";
import cuaca from "./cuaca.js";
import sungai from "./sungai.js";
import laporan from "./laporan.js";
import peringatan from "./peringatan.js";
import laut from "./laut.js";

const { LABEL, POLICY, nilai, statusSungai, statusLaut, laporanNyata, terburuk } = globalThis.SkorBanjir;
const DASHBOARD = "https://bekasi-siaga-banjir.vercel.app";

// Jalankan handler endpoint lain di proses yang sama dan ambil JSON-nya.
function ambil(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      code: 200,
      setHeader() {},
      status(c) { this.code = c; return this; },
      send(body) {
        const j = JSON.parse(body);
        this.code >= 400 ? reject(new Error(j.error || `status ${this.code}`)) : resolve(j);
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function cariKecamatan(q) {
  if (q.kecamatan) {
    const key = norm(q.kecamatan);
    const k = KECAMATAN.find((x) => x.id === String(q.kecamatan).padStart(2, "0") || norm(x.nama) === key);
    return k ? { k } : { error: `kecamatan "${q.kecamatan}" tidak dikenal` };
  }
  const lat = parseFloat(q.lat), lon = parseFloat(q.lon);
  if (!isNaN(lat) && !isNaN(lon)) {
    let best = null;
    for (const k of KECAMATAN) {
      const d = jarakKm(lat, lon, k.lat, k.lon);
      if (!best || d < best.d) best = { k, d };
    }
    return { k: best.k, jarakKm: +best.d.toFixed(1) };
  }
  return null;
}

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const pilih = cariKecamatan(q);
    if (pilih?.error) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(400).send(JSON.stringify({ error: pilih.error, pilihan: KECAMATAN.map((k) => k.nama) }));
    }

    const nama = ["cuaca", "sungai", "laporan", "peringatan", "laut"];
    const hasil = await Promise.allSettled([cuaca, sungai, laporan, peringatan, laut].map((h) => ambil(h, { query: {} })));
    const [c, s, l, p, t] = hasil.map((x) => (x.status === "fulfilled" ? x.value : null));
    if (!c) throw new Error("data cuaca tidak tersedia: " + hasil[0].reason);
    const sumberGagal = nama.filter((n, i) => hasil[i].status !== "fulfilled" || (n === "laut" && !t?.laut?.ok));

    const d = { peringatan: p?.bekasi, laporan: l?.laporan, sungai: s?.sungai, laut: t?.laut };
    const lap = laporanNyata(d.laporan);
    const kec = c.kecamatan.map((k) => {
      const n = nilai(k, d);
      return {
        id: k.id, nama: k.nama, desa: k.desa, lat: k.lat, lon: k.lon, elevasi: k.elevasi,
        skor: n.skor, status: n.status, label: LABEL[n.status], alasan: n.alasan,
        hujan: { maks24: n.hujan, lalu24: k.hujan24Lalu, depan24: k.hujan24Depan, depan24Bmkg: k.hujan24DepanBmkg },
        cuacaSekarang: k.sekarang ? { waktu: k.sekarang.waktu, cuaca: k.sekarang.cuaca, suhu: k.sekarang.suhu } : null,
        prakiraan2Hari: (k.duaHari || []).map((h) => ({
          tanggal: h.tanggal,
          ...Object.fromEntries(["pagi", "siang", "malam"].map((w) => [w, h[w] ? { cuaca: h[w].cuaca, hujan: h[w].hujan, suhu: h[w].suhu } : null])),
        })),
        peringatanDini: (d.peringatan || []).filter((a) => a.kecamatan.includes(k.id)).map((a) => ({ judul: a.judul, terbit: a.terbit, link: a.link })),
        laporanWarga7Hari: lap.filter((r) => r.kecamatan?.id === k.id).length,
      };
    }).sort((a, b) => b.skor - a.skor || (b.hujan.maks24 || 0) - (a.hujan.maks24 || 0) || a.nama.localeCompare(b.nama));

    const status = terburuk(kec);
    const out = {
      diperbarui: new Date().toISOString(),
      catatan: "Informatif, bukan penetapan status bencana resmi. Keadaan darurat: BPBD Kabupaten Bekasi atau 112.",
      dashboard: DASHBOARD,
      sumberGagal,
      kabupaten: {
        status, label: LABEL[status],
        jumlah: Object.fromEntries(Object.keys(LABEL).map((st) => [st, kec.filter((k) => k.status === st).length])),
        tertinggi: kec.filter((k) => k.skor > 0).slice(0, 5).map((k) => ({ id: k.id, nama: k.nama, skor: k.skor, status: k.status })),
        rekomendasi: POLICY[status],
      },
      sungai: (d.sungai || []).filter((x) => x.ok).map((x) => {
        const st = statusSungai(x);
        return { id: x.id, nama: x.nama, tanggal: x.tanggal, debit: x.kini, puncak3Hari: x.puncak3, normal: x.ambang.p50, satuan: x.satuan, status: st.status };
      }),
      laut: d.laut?.ok ? { nama: d.laut.nama, kini: d.laut.kini, puncak24: d.laut.puncak24, batasWaspada: d.laut.ambang.p90, satuan: "m", status: statusLaut(d.laut).status } : null,
      laporanWarga7Hari: lap.filter((r) => r.wilayah === "Kabupaten Bekasi").length,
    };

    if (pilih) {
      out.kecamatan = kec.find((k) => k.id === pilih.k.id);
      if (pilih.jarakKm != null) out.kecamatan.jarakKm = pilih.jarakKm;
      out.kecamatan.rekomendasi = POLICY[out.kecamatan.status];
    } else {
      out.kecamatan = kec;
    }
    send(res, out, 300);
  } catch (e) {
    fail(res, e);
  }
}
