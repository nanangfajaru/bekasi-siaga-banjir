// POST /api/agent  { messages: [{ role: "user"|"assistant", content: "teks" }, ...] }
// → { jawaban, toolDipakai }
// Riwayat percakapan disimpan di browser; server tidak menyimpan apa pun.
import { sumberData } from "./_data.js";
import { jalankanAgen } from "./_agen.js";

export const config = { maxDuration: 60 };

const MAKS_RIWAYAT = 12;
const MAKS_KARAKTER = 1500;

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const asal = process.env.AGENT_ALLOWED_ORIGIN; // opsional: batasi domain yang boleh memanggil
  if (asal) res.setHeader("Access-Control-Allow-Origin", asal);
  if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Headers", "content-type"); return res.status(204).end(); }
  if (req.method !== "POST") return res.status(405).send(JSON.stringify({ error: "Gunakan POST" }));
  if (asal && req.headers.origin && req.headers.origin !== asal) return res.status(403).send(JSON.stringify({ error: "Origin tidak diizinkan" }));

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-MAKS_RIWAYAT)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAKS_KARAKTER) }));
    while (messages.length && messages[0].role !== "user") messages.shift();
    if (!messages.length || messages.at(-1).role !== "user") return res.status(400).send(JSON.stringify({ error: "Pesan terakhir harus dari user" }));

    const hasil = await jalankanAgen(messages, sumberData(req));
    res.status(200).send(JSON.stringify({ jawaban: hasil.jawaban, toolDipakai: hasil.toolDipakai }));
  } catch (e) {
    res.status(500).send(JSON.stringify({ error: String(e.message || e) }));
  }
}
