// GET /api/briefing  → briefing singkat kondisi banjir kabupaten, ditulis oleh AI Agent.
//   ?kirim=1        kirim juga ke Telegram (butuh TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID)
//   ?min=siaga      hanya kirim jika status kabupaten ≥ min (normal|waspada|siaga|awas) → mode alarm
// Dipanggil otomatis oleh Vercel Cron (lihat vercel.json). Jika CRON_SECRET diatur, pengiriman Telegram
// hanya dilakukan untuk request yang membawa header Authorization: Bearer <CRON_SECRET>.
import { sumberData } from "./_data.js";
import { jalankanAgen, promptSistem } from "./_agen.js";
import { nilaiSemua, ringkasKabupaten, STATUS } from "./_risiko.js";

export const config = { maxDuration: 60 };

async function kirimTelegram(teks) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { terkirim: false, alasan: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diatur" };
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: teks, disable_web_page_preview: true }),
  });
  const j = await r.json().catch(() => ({}));
  return { terkirim: !!j.ok, alasan: j.ok ? null : j.description || r.status };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  try {
    const src = sumberData(req);
    const d = await src.semua();
    if (d.cuaca?._error) throw new Error(`Data cuaca gagal: ${d.cuaca._error}`);
    const ring = ringkasKabupaten(nilaiSemua(d));

    const min = STATUS.includes(req.query.min) ? req.query.min : "normal";
    const lewatAmbang = STATUS.indexOf(ring.statusKabupaten) >= STATUS.indexOf(min);

    let briefing = null;
    if (lewatAmbang) {
      const system = promptSistem() + `

FORMAT BRIEFING
Tulis briefing untuk grup Telegram petugas Pemkab/BPBD. Teks polos tanpa markdown, maksimal 900 karakter:
baris 1: "BRIEFING SIAGA BANJIR KAB. BEKASI – <tanggal, jam> WIB"
lalu: status kabupaten, kecamatan Siaga/Awas (jika ada) dan penyebabnya, kondisi sungai dan rob, hujan 24 jam ke depan,
3 tindakan prioritas, dan penutup "Info: bekasi-siaga-banjir.vercel.app (bukan status resmi BPBD)".`;
      const h = await jalankanAgen([{ role: "user", content: "Buat briefing kondisi saat ini." }], src, { system, maxTokens: 900 });
      briefing = h.jawaban;
    }

    const bolehKirim = !process.env.CRON_SECRET || req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
    const mauKirim = req.query.kirim === "1" || req.headers["user-agent"]?.startsWith("vercel-cron");
    const telegram = briefing && mauKirim ? (bolehKirim ? await kirimTelegram(briefing) : { terkirim: false, alasan: "Authorization tidak valid" }) : null;

    res.status(200).send(JSON.stringify({ statusKabupaten: ring.statusKabupaten, ambangKirim: min, lewatAmbang, briefing, telegram, sumberGagal: d.gagal }));
  } catch (e) {
    res.status(500).send(JSON.stringify({ error: String(e.message || e) }));
  }
}
