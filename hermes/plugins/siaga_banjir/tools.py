"""Handler tool Siaga Banjir. Aturan Hermes: terima (args, **kwargs), selalu kembalikan string JSON, jangan raise."""

from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime

from . import core

PLATFORM_LOKAL = {"", "cli", "tui", "desktop", "local"}


def _json(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)


def _aman(fn):
    def wrapper(args: dict, **kwargs) -> str:
        try:
            return _json(fn(args or {}, **kwargs))
        except Exception as e:  # tool tidak boleh raise
            return _json({"error": f"{type(e).__name__}: {e}"})
    wrapper.__name__ = fn.__name__
    return wrapper


def _sesi(nama: str) -> str:
    try:
        from gateway.session_context import get_session_env
        return get_session_env(nama) or ""
    except Exception:
        return os.environ.get(nama, "")


def _petugas() -> tuple[bool, str]:
    """(apakah pemanggil petugas, id aktor). Tanpa SIAGA_PETUGAS_IDS semua dianggap petugas."""
    daftar = {x.strip() for x in os.environ.get("SIAGA_PETUGAS_IDS", "").split(",") if x.strip()}
    platform = _sesi("HERMES_SESSION_PLATFORM").lower()
    aktor = _sesi("HERMES_SESSION_ACTOR_ID") or _sesi("HERMES_SESSION_USER_ID")
    if not daftar or platform in PLATFORM_LOKAL:
        return True, aktor
    return aktor in daftar, aktor


def _gagal_cuaca(d: dict):
    c = d.get("cuaca") or {}
    return {"error": f"Data cuaca gagal dimuat: {c.get('_error')}"} if c.get("_error") else None


@_aman
def status_kabupaten(args, **kw):
    d = core.ambil_semua()
    if err := _gagal_cuaca(d):
        return err
    kec = core.nilai_semua(d)
    sg = d["sungai"].get("sungai", []) if not d["sungai"].get("_error") else []
    lt = d["laut"].get("laut") if not d["laut"].get("_error") else None
    return {
        "waktuData": d["cuaca"].get("diperbarui"), "sumberGagal": d["gagal"],
        **core.ringkas_kabupaten(kec),
        "semuaKecamatan": [{"nama": k["nama"], "status": k["status"], "skor": k["skor"], "hujanMaks24": k["hujanMaks24"]} for k in kec],
        "sungai": [{x: core.ringkas_sungai(s).get(x) for x in ("nama", "ok", "status", "debitHariIni", "puncak3Hari")} for s in sg],
        "laut": {"status": core.LABEL[core.status_laut(lt)["status"]], "puncak24Jam": lt.get("puncak24")} if lt and lt.get("ok") else None,
        "jumlahPeringatanDiniBekasi": len(d["peringatan"].get("bekasi") or []) if not d["peringatan"].get("_error") else None,
        "jumlahLaporanWarga7Hari": len([x for x in d["laporan"].get("laporan") or [] if not x.get("latihan") and x.get("wilayah") == "Kabupaten Bekasi"]) if not d["laporan"].get("_error") else None,
        "sumber": core.SUMBER,
    }


@_aman
def detail_kecamatan(args, **kw):
    hit = core.cari_kecamatan(args.get("kecamatan", ""))
    if not hit:
        return {"error": f'Kecamatan "{args.get("kecamatan")}" tidak ditemukan. Pilihan: {", ".join(core.KECAMATAN.values())}'}
    kid = hit[0]
    d = core.ambil_semua()
    if err := _gagal_cuaca(d):
        return err
    kec = core.nilai_semua(d)
    h = next(k for k in kec if k["id"] == kid)
    peringkat = [k["id"] for k in core.urutkan(kec)].index(kid) + 1
    mentah = next((k for k in d["cuaca"]["kecamatan"] if k["id"] == kid), {})
    sungai = [s["nama"] for s in d["sungai"].get("sungai", []) if kid in (s.get("kecamatan") or [])] if not d["sungai"].get("_error") else []
    lt = d["laut"].get("laut") or {} if not d["laut"].get("_error") else {}

    def slot(s):
        return f"{s.get('cuaca')}, {s.get('suhu')}°C, hujan {s.get('hujan') or 0} mm" if s else None

    return {
        "waktuData": d["cuaca"].get("diperbarui"), **h, "peringkatRisiko": f"{peringkat} dari {len(kec)}",
        "hujanPer3Jam": [{"waktu": w, "mm": mm} for i, (w, mm) in enumerate(mentah.get("perJam") or []) if i % 3 == 0],
        "prakiraanBmkg2Hari": [{"tanggal": x.get("tanggal"), "pagi": slot(x.get("pagi")), "siang": slot(x.get("siang")), "malam": slot(x.get("malam"))} for x in mentah.get("duaHari") or []],
        "peringatanDini": [{"judul": a.get("judul"), "terbit": a.get("terbit"), "isi": (a.get("isi") or "")[:400]}
                           for a in (d["peringatan"].get("bekasi") or []) if kid in (a.get("kecamatan") or [])] if not d["peringatan"].get("_error") else None,
        "laporanWarga": [{"waktu": x.get("waktu"), "kedalamanCm": x.get("kedalaman"), "teks": x.get("teks")}
                         for x in (d["laporan"].get("laporan") or []) if not x.get("latihan") and (x.get("kecamatan") or {}).get("id") == kid] if not d["laporan"].get("_error") else None,
        "sungaiMelintas": sungai, "pesisir": kid in (lt.get("kecamatan") or ["01", "02", "17"]),
        "rekomendasi": core.POLICY[h["status"]],
    }


@_aman
def debit_sungai(args, **kw):
    s = core.ambil("sungai")
    if s.get("_error"):
        return {"error": s["_error"]}
    return {"waktuData": s.get("diperbarui"), "sumber": core.SUMBER["sungai"],
            "sungai": [{**core.ringkas_sungai(x), "deretHarian": [{"tanggal": p.get("tanggal"), "debit": p.get("debit"), "prakiraan": p.get("setelah")} for p in x.get("seri") or []]} for x in s.get("sungai", [])]}


@_aman
def pasang_laut(args, **kw):
    l = core.ambil("laut")
    if l.get("_error"):
        return {"error": l["_error"]}
    return {"waktuData": l.get("diperbarui"), "sumber": core.SUMBER["laut"], **core.ringkas_laut(l.get("laut"))}


@_aman
def peringatan_laporan(args, **kw):
    p, l = core.ambil("peringatan"), core.ambil("laporan")
    return {
        "peringatanDini": {"error": p["_error"]} if p.get("_error") else {
            "waktuData": p.get("diperbarui"), "jumlahJawaBarat": p.get("jumlahJawaBarat"),
            "bekasi": [{"judul": a.get("judul"), "terbit": a.get("terbit"), "kecamatan": [core.KECAMATAN.get(i, i) for i in a.get("kecamatan") or []], "isi": (a.get("isi") or "")[:500]} for a in p.get("bekasi") or []],
        },
        "laporanWarga": {"error": l["_error"]} if l.get("_error") else {
            "waktuData": l.get("diperbarui"), "sumber": core.SUMBER["laporan"],
            "laporan": [{"waktu": x.get("waktu"), "wilayah": x.get("wilayah"), "kecamatanTerdekat": (x.get("kecamatan") or {}).get("nama"),
                         "kedalamanCm": x.get("kedalaman"), "teks": x.get("teks")} for x in (l.get("laporan") or []) if not x.get("latihan")][:25],
        },
    }


@_aman
def simulasi_tanggal(args, **kw):
    tgl = str(args.get("tanggal", ""))
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", tgl):
        return {"error": "Format tanggal harus YYYY-MM-DD"}
    s = core.ambil(f"sim-{tgl}", f"/api/simulasi?tanggal={urllib.parse.quote(tgl)}", ttl=1800)
    if s.get("_error"):
        return {"error": s["_error"]}
    kec = core.nilai_semua({"cuaca": {"kecamatan": s.get("kecamatan", [])}, "sungai": {"sungai": s.get("sungai", [])}, "laut": {"laut": s.get("laut")}})
    return {
        "tanggal": s.get("tanggal"), "selisihHari": s.get("selisihHari"), "sumberHujan": s.get("sumberHujan"),
        "catatan": "Simulasi tanpa peringatan dini dan laporan warga, sehingga skor bisa lebih rendah dari kejadian nyata.",
        **core.ringkas_kabupaten(kec),
        "semuaKecamatan": [{"nama": k["nama"], "status": k["status"], "skor": k["skor"], "hujanMaks24": k["hujanMaks24"]} for k in kec],
        "sungai": [core.ringkas_sungai(x) for x in s.get("sungai", [])], "laut": core.ringkas_laut(s.get("laut")),
    }


@_aman
def skenario(args, **kw):
    def angka(k, lo, hi, dflt):
        try:
            return min(hi, max(lo, float(args.get(k) if args.get(k) is not None else dflt)))
        except (TypeError, ValueError):
            return dflt
    sim = {"hujan": angka("tambah_hujan_mm", 0, 300, 0), "sungai": angka("pengali_debit", 0.5, 4, 1), "laut": angka("tambah_laut_m", 0, 1, 0)}
    d = core.ambil_semua()
    if err := _gagal_cuaca(d):
        return err
    awal, baru = core.nilai_semua(d), core.nilai_semua(d, sim)
    idx = {k["id"]: k for k in awal}
    berubah = [{"nama": k["nama"], "dari": idx[k["id"]]["status"], "menjadi": k["status"], "skorBaru": k["skor"], "faktor": [f["ket"] for f in k["faktor"]]}
               for k in baru if k["status"] != idx[k["id"]]["status"]]
    return {"skenario": sim, "sebelum": core.ringkas_kabupaten(awal)["statusKabupaten"], "sesudah": core.ringkas_kabupaten(baru), "kecamatanBerubahStatus": berubah}


@_aman
def riwayat(args, **kw):
    return core.riwayat(args.get("kecamatan") or None, args.get("jam") or 72)


@_aman
def catat_kejadian(args, **kw):
    boleh, aktor = _petugas()
    verif = bool(args.get("terverifikasi"))
    catatan_izin = None
    if verif and not boleh:
        verif = False
        catatan_izin = "Dicatat sebagai BELUM terverifikasi: hanya petugas (SIAGA_PETUGAS_IDS) yang dapat memverifikasi."
    hasil = core.catat_kejadian(
        args.get("kecamatan", ""), args.get("waktu_kejadian"), args.get("desa"), args.get("kedalaman_cm"),
        args.get("jenis"), args.get("sumber") or _sesi("HERMES_SESSION_PLATFORM") or None, args.get("catatan"),
        verif, aktor or None)
    if catatan_izin and hasil.get("ok"):
        hasil["catatan"] = catatan_izin
    return hasil


@_aman
def evaluasi(args, **kw):
    hv = args.get("hanya_terverifikasi")
    return core.evaluasi(args.get("hari") or 90, True if hv is None else bool(hv))


@_aman
def kirim_siaran(args, **kw):
    pesan = str(args.get("pesan") or "").strip()
    if not pesan:
        return {"error": "Pesan kosong"}
    boleh, aktor = _petugas()
    if not boleh:
        return {"error": "Hanya petugas terdaftar (SIAGA_PETUGAS_IDS) yang boleh mengirim siaran publik."}
    token = os.environ.get("SIAGA_SIARAN_BOT_TOKEN") or os.environ.get("TELEGRAM_BOT_TOKEN")
    chat = os.environ.get("SIAGA_SIARAN_CHAT_ID")
    if not token or not chat:
        return {"error": "Siaran belum dikonfigurasi: isi SIAGA_SIARAN_CHAT_ID (dan token bot) di .env profil.", "draf": pesan}
    body = json.dumps({"chat_id": chat, "text": pesan[:1500], "disable_web_page_preview": True}).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=body, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            j = json.loads(resp.read().decode())
    except Exception as e:
        return {"error": f"Gagal mengirim siaran: {type(e).__name__}"}
    log = core.db_path().parent / "siaran.jsonl"
    with log.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"waktu": datetime.now(core.WIB).isoformat(), "aktor": aktor, "kecamatan": args.get("kecamatan"), "pesan": pesan, "ok": j.get("ok")}, ensure_ascii=False) + "\n")
    return {"terkirim": bool(j.get("ok")), "keterangan": None if j.get("ok") else j.get("description")}


HANDLERS = {
    "siaga_status_kabupaten": status_kabupaten,
    "siaga_detail_kecamatan": detail_kecamatan,
    "siaga_debit_sungai": debit_sungai,
    "siaga_pasang_laut": pasang_laut,
    "siaga_peringatan_laporan": peringatan_laporan,
    "siaga_simulasi_tanggal": simulasi_tanggal,
    "siaga_skenario": skenario,
    "siaga_riwayat": riwayat,
    "siaga_catat_kejadian": catat_kejadian,
    "siaga_evaluasi": evaluasi,
    "siaga_kirim_siaran": kirim_siaran,
}
