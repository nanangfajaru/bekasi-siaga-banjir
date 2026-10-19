// Peringatan dini cuaca BMKG (nowcast RSS). Diambil yang menyebut kecamatan di Kabupaten Bekasi.
import { KECAMATAN, getText, send, fail, norm } from "./_lib.js";

const ALIAS = { "Muaragembong": ["MUARAGEMBONG"], "Karang Bahagia": ["KARANGBAHAGIA"], "Kedung Waringin": ["KEDUNGWARINGIN"] };

export default async function handler(req, res) {
  try {
    const xml = await getText("https://www.bmkg.go.id/alerts/nowcast/id/rss.xml");
    const pick = (s, tag) => (s.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1]?.trim() || "";
    const items = xml.split("<item>").slice(1).map((s) => ({
      judul: pick(s, "title"), isi: pick(s, "description"), link: pick(s, "link"), terbit: pick(s, "pubDate"),
    }));
    const jabar = items.filter((it) => /jawa barat/i.test(it.judul));
    const bekasi = jabar.map((it) => {
      const daftar = (it.isi.match(/khususnya di ([^.]+)\./i) || [])[1] || "";
      const tokens = daftar.split(",").map(norm);
      const kena = KECAMATAN.filter((k) => {
        const keys = ALIAS[k.nama] || [norm(k.nama)];
        return keys.some((key) => tokens.includes(key));
      }).map((k) => k.id);
      return { ...it, kecamatan: kena };
    }).filter((it) => it.kecamatan.length);
    send(res, {
      diperbarui: new Date().toISOString(),
      jumlahNasional: items.length,
      jumlahJawaBarat: jabar.length,
      jawaBarat: jabar.map((it) => ({ judul: it.judul, isi: it.isi, link: it.link, terbit: it.terbit })),
      bekasi,
    }, 300);
  } catch (e) {
    fail(res, e);
  }
}
