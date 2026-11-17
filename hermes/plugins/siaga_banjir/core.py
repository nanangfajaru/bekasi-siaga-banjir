"""Inti Siaga Banjir Bekasi untuk Hermes Agent.

Mengambil data live dari dashboard Bekasi Siaga Banjir (api/cuaca, api/sungai, ...),
menghitung skor risiko per kecamatan dengan rumus yang SAMA dengan dashboard
(assets/app.js dan api/_risiko.js), dan menyimpan riwayat status + kejadian banjir
di SQLite untuk analisis tren dan evaluasi akurasi.

Hanya memakai pustaka standar Python, sehingga bisa diimpor oleh plugin (di dalam
proses Hermes) maupun oleh skrip watchdog cron (proses terpisah).
"""

from __future__ import annotations

import json
import math
import os
import re
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

WIB = timezone(timedelta(hours=7))
STATUS = ["normal", "waspada", "siaga", "awas"]
LABEL = {"normal": "Normal", "waspada": "Waspada", "siaga": "Siaga", "awas": "Awas"}

POLICY = {
    "normal": ["Bersihkan saluran, gorong-gorong, dan pintu air secara rutin", "Uji kesiapan pompa air dan perahu karet BPBD", "Sosialisasi jalur evakuasi ke RT/RW di desa rawan"],
    "waspada": ["Pantau cuaca, debit sungai, dan jadwal pasang laut setiap 3 jam", "Siagakan pompa portabel di titik genangan langganan", "Kirim info dini ke warga lewat RT/RW dan media sosial Pemkab"],
    "siaga": ["Buka posko siaga banjir di kantor kecamatan", "Perahu karet dan personel BPBD standby di lokasi", "Siapkan evakuasi lansia, anak, dan penyandang disabilitas", "Koordinasi operasi pintu air dengan BBWS Citarum", "Saat pasang tinggi: periksa tanggul pesisir dan tutup pintu air muara di Muaragembong, Tarumajaya, Babelan"],
    "awas": ["Evakuasi warga dari permukiman tergenang", "Aktifkan dapur umum dan pengungsian", "Usulkan status tanggap darurat bencana kepada Bupati", "Tutup sementara akses jalan yang terendam"],
}

# id dan nama kecamatan, sama dengan api/_lib.js (data lengkap ikut dari endpoint).
KECAMATAN = {
    "01": "Tarumajaya", "02": "Babelan", "03": "Sukawangi", "04": "Tambelang", "05": "Tambun Utara",
    "06": "Tambun Selatan", "07": "Cibitung", "08": "Cikarang Barat", "09": "Cikarang Utara",
    "10": "Karang Bahagia", "11": "Cikarang Timur", "12": "Kedung Waringin", "13": "Pebayuran",
    "14": "Sukakarya", "15": "Sukatani", "16": "Cabangbungin", "17": "Muaragembong", "18": "Setu",
    "19": "Cikarang Selatan", "20": "Cikarang Pusat", "21": "Serang Baru", "22": "Cibarusah", "23": "Bojongmangu",
}

SUMBER = {
    "cuaca": "BMKG prakiraan per desa + Open-Meteo curah hujan per jam",
    "sungai": "Model GloFAS via Open-Meteo Flood API (debit m³/s, bukan tinggi muka air)",
    "laut": "MeteoFrance SMOC via Open-Meteo Marine API (muka laut terhadap rata-rata)",
    "peringatan": "BMKG nowcast (peringatan dini cuaca)",
    "laporan": "PetaBencana.id (laporan banjir warga 7 hari)",
}


# --------------------------------------------------------------------------- util

def rank(status: str) -> int:
    return STATUS.index(status) if status in STATUS else 0


def r(x: Any, d: int = 1) -> float | None:
    """Pembulatan setengah-ke-atas seperti Math.round di JS."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    f = 10 ** d
    return math.floor(float(x) * f + 0.5) / f


def norm(s: str) -> str:
    return re.sub(r"[^A-Z]", "", str(s or "").upper())


def cari_kecamatan(q: str) -> tuple[str, str] | None:
    n = norm(q)
    if not n:
        return None
    for kid, nama in KECAMATAN.items():
        if norm(nama) == n:
            return kid, nama
    for kid, nama in KECAMATAN.items():
        if n in norm(nama) or norm(nama) in n:
            return kid, nama
    return None


def parse_waktu(s: str | None) -> datetime | None:
    if not s:
        return None
    s = str(s).strip().replace("Z", "+00:00")
    if " " in s and "T" not in s:
        s = s.replace(" ", "T", 1)
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=WIB)


def sekarang_wib() -> datetime:
    return datetime.now(WIB)


# --------------------------------------------------------------------------- data

def base_url() -> str:
    return os.environ.get("SIAGA_BASE_URL", "https://bekasi-siaga-banjir.vercel.app").rstrip("/")


_CACHE: dict[str, tuple[float, Any]] = {}
_TTL = {"cuaca": 600, "sungai": 1800, "laut": 900, "peringatan": 300, "laporan": 300}


def ambil(nama: str, path: str | None = None, ttl: int | None = None) -> dict:
    """GET JSON dari endpoint dashboard, dengan cache in-memory. Tidak pernah raise."""
    path = path or f"/api/{nama}"
    ttl = _TTL.get(nama, 600) if ttl is None else ttl
    hit = _CACHE.get(path)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    req = urllib.request.Request(base_url() + path, headers={"User-Agent": "hermes-siaga-banjir-bekasi/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
        return {"_error": f"{path}: {e}"}
    if isinstance(data, dict) and data.get("error"):
        return {"_error": f"{path}: {data['error']}"}
    _CACHE[path] = (time.time(), data)
    return data


def ambil_semua() -> dict:
    d = {k: ambil(k) for k in ("cuaca", "sungai", "laut", "peringatan", "laporan")}
    d["gagal"] = [k for k, v in d.items() if isinstance(v, dict) and v.get("_error")]
    return d


# --------------------------------------------------------------------------- skor (port api/_risiko.js)

def status_sungai(s: dict, kali: float = 1) -> dict:
    nilai = max(s.get("kini") or 0, s.get("puncak3") or 0) * kali
    a = s.get("ambang") or {}
    poin = 3 if nilai >= a.get("p99", math.inf) else 2 if nilai >= a.get("p95", math.inf) else 1 if nilai >= a.get("p90", math.inf) else 0
    return {
        "nilai": r(nilai), "poin": poin, "status": STATUS[poin],
        "persenNormal": r(nilai / a["p50"] * 100, 0) if a.get("p50") else None,
        "persenKapasitas": r(nilai / a["kapasitas"] * 100, 0) if a.get("kapasitas") else None,
    }


def status_laut(l: dict, tambah: float = 0) -> dict:
    nilai = ((l.get("puncak24") or {}).get("tinggi") or 0) + tambah
    a = l.get("ambang") or {}
    poin = 3 if nilai >= a.get("p99", math.inf) else 2 if nilai >= a.get("p95", math.inf) else 1 if nilai >= a.get("p90", math.inf) else 0
    return {"nilai": r(nilai, 2), "poin": poin, "status": STATUS[poin], "waktuPuncak": (l.get("puncak24") or {}).get("waktu")}


def _ok(x: Any) -> bool:
    return isinstance(x, dict) and not x.get("_error")


def nilai_semua(data: dict, sim: dict | None = None, now: float | None = None) -> list[dict]:
    sim = sim or {}
    now = time.time() if now is None else now
    kec_list = (data.get("cuaca") or {}).get("kecamatan") or [] if _ok(data.get("cuaca")) else []
    sungai = [s for s in ((data.get("sungai") or {}).get("sungai") or []) if s.get("ok")] if _ok(data.get("sungai")) else []
    lt = (data.get("laut") or {}).get("laut") if _ok(data.get("laut")) else None
    laut = lt if lt and lt.get("ok") else None
    peringatan = (data.get("peringatan") or {}).get("bekasi") or [] if _ok(data.get("peringatan")) else []
    laporan = [x for x in ((data.get("laporan") or {}).get("laporan") or []) if not x.get("latihan")] if _ok(data.get("laporan")) else []

    hasil = []
    for k in kec_list:
        hujan = max(k.get("hujan24Lalu") or 0, k.get("hujan24Depan") or 0, k.get("hujan24DepanBmkg") or 0) + (sim.get("hujan") or 0)
        faktor: list[dict] = []
        skor = 0

        h = 4 if hujan >= 150 else 3 if hujan >= 100 else 2 if hujan >= 50 else 1 if hujan >= 20 else 0
        if h:
            skor += h
            faktor.append({"faktor": "hujan", "poin": h, "ket": f"hujan {int(r(hujan, 0))} mm (24 jam)"})

        if any(k["id"] in (a.get("kecamatan") or []) for a in peringatan):
            skor += 2
            faktor.append({"faktor": "peringatan", "poin": 2, "ket": "peringatan dini BMKG aktif"})

        lap = [x for x in laporan if (x.get("kecamatan") or {}).get("id") == k["id"]]
        baru = [x for x in lap if (w := parse_waktu(x.get("waktu"))) and now - w.timestamp() < 86400]
        if baru:
            skor += 2
            faktor.append({"faktor": "laporan", "poin": 2, "ket": f"laporan banjir warga 24 jam ({len(lap)})"})
        elif lap:
            skor += 1
            faktor.append({"faktor": "laporan", "poin": 1, "ket": f"laporan banjir warga 7 hari ({len(lap)})"})

        sg, sg_nama = 0, None
        for s in sungai:
            if k["id"] in (s.get("kecamatan") or []):
                p = status_sungai(s, sim.get("sungai") or 1)["poin"]
                if p > sg:
                    sg, sg_nama = p, s.get("nama")
        if sg:
            skor += sg
            jenis = "debit ekstrem" if sg >= 3 else "debit sangat tinggi" if sg >= 2 else "debit tinggi"
            faktor.append({"faktor": "sungai", "poin": sg, "ket": f"{jenis} – {sg_nama}"})

        if laut and k["id"] in (laut.get("kecamatan") or []):
            pl = status_laut(laut, sim.get("laut") or 0)["poin"]
            if pl:
                skor += pl
                jenis = "pasang laut ekstrem (rob)" if pl >= 3 else "pasang laut sangat tinggi (rob)" if pl >= 2 else "pasang laut tinggi (rob)"
                faktor.append({"faktor": "rob", "poin": pl, "ket": jenis})

        if skor > 0 and k.get("elevasi") is not None and k["elevasi"] <= 5:
            skor += 1
            faktor.append({"faktor": "elevasi", "poin": 1, "ket": f"dataran rendah {k['elevasi']} m"})

        status = "awas" if skor >= 5 else "siaga" if skor >= 3 else "waspada" if skor >= 1 else "normal"
        sk = k.get("sekarang") or None
        hasil.append({
            "id": k["id"], "nama": k["nama"], "desaPantau": k.get("desa"), "lat": k.get("lat"), "lon": k.get("lon"),
            "elevasi": k.get("elevasi"), "skor": skor, "status": status, "hujanMaks24": r(hujan),
            "hujan24Lalu": k.get("hujan24Lalu"), "hujan24Depan": k.get("hujan24Depan"), "hujan24DepanBmkg": k.get("hujan24DepanBmkg"),
            "cuacaSekarang": {"cuaca": sk.get("cuaca"), "suhu": sk.get("suhu"), "waktu": sk.get("waktu")} if sk else None,
            "faktor": faktor,
        })
    return hasil


def urutkan(kec: list[dict]) -> list[dict]:
    return sorted(kec, key=lambda k: (-k["skor"], -(k["hujanMaks24"] or 0), k["nama"]))


def ringkas_kabupaten(kec: list[dict]) -> dict:
    urut = urutkan(kec)
    status = urut[0]["status"] if urut else "normal"
    per = {s: [k["nama"] for k in kec if k["status"] == s] for s in STATUS}
    return {
        "statusKabupaten": status, "label": LABEL[status],
        "jumlahPerStatus": {s: len(per[s]) for s in STATUS},
        "kecamatanPerStatus": per,
        "top5": [{"nama": k["nama"], "status": k["status"], "skor": k["skor"], "faktor": [f["ket"] for f in k["faktor"]]} for k in urut[:5]],
        "rekomendasi": POLICY[status],
    }


def ringkas_sungai(s: dict, kali: float = 1) -> dict:
    if not s.get("ok"):
        return {"nama": s.get("nama"), "ok": False, "error": s.get("error") or "data tidak tersedia"}
    st = status_sungai(s, kali)
    return {
        "nama": s["nama"], "ok": True, "tanggal": s.get("tanggal"), "satuan": s.get("satuan", "m³/s"),
        "debitHariIni": s.get("kini"), "puncak3Hari": s.get("puncak3"), "puncak7Hari": s.get("puncak7"),
        "ambang": s.get("ambang"), "status": LABEL[st["status"]], "nilaiDinilai": st["nilai"],
        "persenDariNormal": st["persenNormal"], "persenKapasitas": st["persenKapasitas"],
        "kecamatanTerdampak": [KECAMATAN.get(i, i) for i in s.get("kecamatan") or []],
    }


def ringkas_laut(l: dict | None, tambah: float = 0) -> dict:
    if not l or not l.get("ok"):
        return {"ok": False, "alasan": (l or {}).get("alasan") or (l or {}).get("error") or "data tidak tersedia"}
    st = status_laut(l, tambah)
    return {
        "nama": l.get("nama"), "ok": True, "satuan": "m", "acuan": l.get("acuan"), "sekarang": l.get("kini"),
        "puncak24Jam": l.get("puncak24"), "status": LABEL[st["status"]], "ambang": l.get("ambang"),
        "kecamatanPesisir": [KECAMATAN.get(i, i) for i in l.get("kecamatan") or []],
        "puncakHarian": [{"tanggal": h["tanggal"], "jam": str(h.get("waktu", ""))[11:16], "tinggi": r(h.get("tinggi"), 2)} for h in l.get("harian") or []],
    }


# --------------------------------------------------------------------------- penyimpanan riwayat

def hermes_home() -> Path:
    # <profil>/plugins/siaga_banjir/core.py → <profil>. Diturunkan dari lokasi file (bukan env HERMES_HOME)
    # supaya plugin (proses gateway) dan skrip watchdog (proses cron) selalu memakai basis data yang sama.
    return Path(__file__).resolve().parents[2]


def db_path() -> Path:
    override = os.environ.get("SIAGA_DB_PATH")
    if override:
        p = Path(override)
    else:
        p = hermes_home() / "plugin-data" / "siaga_banjir" / "riwayat.db"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path(), timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS snapshot (
            waktu TEXT NOT NULL, kecamatan_id TEXT NOT NULL, nama TEXT, skor INTEGER, status TEXT,
            hujan REAL, faktor TEXT, PRIMARY KEY (waktu, kecamatan_id));
        CREATE INDEX IF NOT EXISTS snapshot_kec ON snapshot (kecamatan_id, waktu);
        CREATE TABLE IF NOT EXISTS kabupaten (
            waktu TEXT PRIMARY KEY, status TEXT, skor_maks INTEGER, ringkas TEXT);
        CREATE TABLE IF NOT EXISTS kejadian (
            id INTEGER PRIMARY KEY AUTOINCREMENT, dicatat TEXT NOT NULL, waktu_kejadian TEXT NOT NULL,
            kecamatan_id TEXT NOT NULL, desa TEXT, kedalaman_cm REAL, jenis TEXT, sumber TEXT,
            catatan TEXT, terverifikasi INTEGER DEFAULT 0, pelapor TEXT);
        CREATE TABLE IF NOT EXISTS alarm (
            kecamatan_id TEXT PRIMARY KEY, status TEXT, waktu TEXT);
    """)
    return conn


def simpan_snapshot(kec: list[dict], waktu: datetime | None = None) -> str:
    waktu_s = (waktu or sekarang_wib()).replace(second=0, microsecond=0).isoformat()
    ring = ringkas_kabupaten(kec)
    with db() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO snapshot VALUES (?,?,?,?,?,?,?)",
            [(waktu_s, k["id"], k["nama"], k["skor"], k["status"], k["hujanMaks24"], json.dumps([f["ket"] for f in k["faktor"]], ensure_ascii=False)) for k in kec],
        )
        conn.execute("INSERT OR REPLACE INTO kabupaten VALUES (?,?,?,?)",
                     (waktu_s, ring["statusKabupaten"], max((k["skor"] for k in kec), default=0), json.dumps(ring["jumlahPerStatus"])))
        batas = (sekarang_wib() - timedelta(days=400)).isoformat()
        conn.execute("DELETE FROM snapshot WHERE waktu < ?", (batas,))
        conn.execute("DELETE FROM kabupaten WHERE waktu < ?", (batas,))
    return waktu_s


def riwayat(kecamatan: str | None = None, jam: int = 72) -> dict:
    jam = max(1, min(int(jam or 72), 24 * 90))
    sejak = (sekarang_wib() - timedelta(hours=jam)).isoformat()
    with db() as conn:
        if kecamatan:
            hit = cari_kecamatan(kecamatan)
            if not hit:
                return {"error": f'Kecamatan "{kecamatan}" tidak ditemukan.'}
            rows = conn.execute("SELECT waktu, skor, status, hujan, faktor FROM snapshot WHERE kecamatan_id=? AND waktu>=? ORDER BY waktu", (hit[0], sejak)).fetchall()
            nama = hit[1]
        else:
            rows = conn.execute("SELECT waktu, skor_maks AS skor, status, NULL AS hujan, ringkas AS faktor FROM kabupaten WHERE waktu>=? ORDER BY waktu", (sejak,)).fetchall()
            nama = "Kabupaten Bekasi"
    if not rows:
        return {"wilayah": nama, "jam": jam, "jumlahTitik": 0,
                "catatan": "Belum ada riwayat. Riwayat diisi oleh cron 'siaga-watchdog' setiap 15 menit; pastikan job itu aktif."}
    # Ringkas: hanya titik saat status berubah + nilai puncak, supaya hemat token.
    perubahan, prev = [], None
    for row in rows:
        if row["status"] != prev:
            perubahan.append({"waktu": row["waktu"], "status": row["status"], "skor": row["skor"],
                              "faktor": json.loads(row["faktor"]) if row["faktor"] and kecamatan else None})
            prev = row["status"]
    puncak = max(rows, key=lambda x: (rank(x["status"]), x["skor"] or 0))
    durasi = {s: 0 for s in STATUS}
    for a, b in zip(rows, rows[1:]):
        dt = (parse_waktu(b["waktu"]) - parse_waktu(a["waktu"])).total_seconds() / 3600
        durasi[a["status"]] += min(dt, 1.0)  # celah data >1 jam tidak dihitung penuh
    return {
        "wilayah": nama, "jam": jam, "jumlahTitik": len(rows), "dari": rows[0]["waktu"], "sampai": rows[-1]["waktu"],
        "statusSekarang": rows[-1]["status"], "puncak": {"waktu": puncak["waktu"], "status": puncak["status"], "skor": puncak["skor"]},
        "jamPerStatus": {s: r(v) for s, v in durasi.items()},
        "perubahanStatus": perubahan[-30:],
        "tren": _tren(rows),
    }


def _tren(rows) -> str:
    if len(rows) < 3:
        return "data belum cukup"
    akhir = [x["skor"] or 0 for x in rows[-8:]]  # ±2 jam terakhir
    awal = [x["skor"] or 0 for x in rows[-16:-8]] or akhir
    d = sum(akhir) / len(akhir) - sum(awal) / len(awal)
    return "memburuk" if d >= 0.75 else "membaik" if d <= -0.75 else "stabil"


def catat_kejadian(kecamatan: str, waktu_kejadian: str | None, desa: str | None = None, kedalaman_cm: float | None = None,
                   jenis: str | None = None, sumber: str | None = None, catatan: str | None = None,
                   terverifikasi: bool = False, pelapor: str | None = None) -> dict:
    hit = cari_kecamatan(kecamatan)
    if not hit:
        return {"error": f'Kecamatan "{kecamatan}" tidak ditemukan. Pilihan: {", ".join(KECAMATAN.values())}'}
    w = parse_waktu(waktu_kejadian) if waktu_kejadian else sekarang_wib()
    if not w:
        return {"error": "Format waktu_kejadian harus ISO, mis. 2026-11-17T14:30"}
    if w > sekarang_wib() + timedelta(hours=1):
        return {"error": "Waktu kejadian tidak boleh di masa depan"}
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO kejadian (dicatat, waktu_kejadian, kecamatan_id, desa, kedalaman_cm, jenis, sumber, catatan, terverifikasi, pelapor) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (sekarang_wib().isoformat(), w.astimezone(WIB).isoformat(), hit[0], desa, kedalaman_cm, jenis or "banjir",
             sumber, (catatan or "")[:1000], 1 if terverifikasi else 0, pelapor))
        kid = cur.lastrowid
    return {"ok": True, "id": kid, "kecamatan": hit[1], "waktuKejadian": w.astimezone(WIB).isoformat(),
            "terverifikasi": bool(terverifikasi)}


def daftar_kejadian(hari: int = 30) -> list[dict]:
    sejak = (sekarang_wib() - timedelta(days=hari)).isoformat()
    with db() as conn:
        rows = conn.execute("SELECT * FROM kejadian WHERE waktu_kejadian>=? ORDER BY waktu_kejadian DESC", (sejak,)).fetchall()
    return [dict(x) | {"kecamatan": KECAMATAN.get(x["kecamatan_id"])} for x in rows]


def evaluasi(hari: int = 90, hanya_terverifikasi: bool = True) -> dict:
    """Bandingkan status yang diberikan sistem dengan kejadian banjir yang tercatat.

    - Terdeteksi (hit): dalam 24 jam sebelum kejadian, status kecamatan itu pernah ≥ Siaga.
    - Lead time: selang dari status ≥ Siaga pertama (dalam jendela 24 jam) sampai kejadian.
    - Alarm palsu: hari-kecamatan berstatus ≥ Siaga tanpa kejadian pada hari itu atau sehari sesudahnya.
    """
    hari = max(7, min(int(hari or 90), 400))
    sejak = (sekarang_wib() - timedelta(days=hari)).isoformat()
    with db() as conn:
        q = "SELECT * FROM kejadian WHERE waktu_kejadian>=?" + (" AND terverifikasi=1" if hanya_terverifikasi else "")
        kej = conn.execute(q, (sejak,)).fetchall()
        snap_n = conn.execute("SELECT COUNT(*) FROM snapshot WHERE waktu>=?", (sejak,)).fetchone()[0]
        hasil, faktor_lewat = [], {}
        for e in kej:
            t = parse_waktu(e["waktu_kejadian"])
            rows = conn.execute("SELECT waktu, status, faktor FROM snapshot WHERE kecamatan_id=? AND waktu BETWEEN ? AND ? ORDER BY waktu",
                                (e["kecamatan_id"], (t - timedelta(hours=24)).isoformat(), t.isoformat())).fetchall()
            if not rows:
                hasil.append({"id": e["id"], "kecamatan": KECAMATAN.get(e["kecamatan_id"]), "waktu": e["waktu_kejadian"], "hasil": "tanpa data"})
                continue
            maks = max(rank(x["status"]) for x in rows)
            pertama = next((x for x in rows if rank(x["status"]) >= 2), None)
            lead = r((t - parse_waktu(pertama["waktu"])).total_seconds() / 3600) if pertama else None
            label = "terdeteksi" if maks >= 2 else "lemah (hanya Waspada)" if maks == 1 else "terlewat"
            if maks < 2:
                for f in json.loads(rows[-1]["faktor"] or "[]"):
                    key = f.split(" ")[0]
                    faktor_lewat[key] = faktor_lewat.get(key, 0) + 1
            hasil.append({"id": e["id"], "kecamatan": KECAMATAN.get(e["kecamatan_id"]), "waktu": e["waktu_kejadian"],
                          "statusMaks24Jam": STATUS[maks], "leadTimeJam": lead, "hasil": label})

        alarm_hari = conn.execute(
            "SELECT kecamatan_id, substr(waktu,1,10) AS tgl FROM snapshot WHERE waktu>=? AND status IN ('siaga','awas') GROUP BY kecamatan_id, tgl",
            (sejak,)).fetchall()
    kej_set = {(e["kecamatan_id"], str(e["waktu_kejadian"])[:10]) for e in kej}
    palsu = []
    for a in alarm_hari:
        d = datetime.fromisoformat(a["tgl"]).date()
        if not any((a["kecamatan_id"], (d + timedelta(days=i)).isoformat()) in kej_set for i in (0, 1)):
            palsu.append({"kecamatan": KECAMATAN.get(a["kecamatan_id"]), "tanggal": a["tgl"]})

    dinilai = [h for h in hasil if h["hasil"] != "tanpa data"]
    hit = [h for h in dinilai if h["hasil"] == "terdeteksi"]
    pod = r(len(hit) / len(dinilai), 2) if dinilai else None
    far = r(len(palsu) / len(alarm_hari), 2) if alarm_hari else None
    leads = [h["leadTimeJam"] for h in hit if h["leadTimeJam"] is not None]
    saran = []
    if not kej:
        saran.append("Belum ada kejadian tercatat. Catat kejadian banjir (tool siaga_catat_kejadian) agar akurasi bisa diukur.")
    if pod is not None and pod < 0.7:
        saran.append(f"Tingkat deteksi {int(pod*100)}% masih rendah: pertimbangkan menurunkan ambang hujan (mis. +1 poin mulai 15 mm) atau menaikkan bobot laporan warga.")
    if far is not None and far > 0.5:
        saran.append(f"{int(far*100)}% hari Siaga/Awas tanpa kejadian: pertimbangkan menaikkan ambang atau mensyaratkan ≥2 faktor berbeda untuk Siaga.")
    if faktor_lewat:
        saran.append("Faktor yang muncul pada kejadian terlewat: " + ", ".join(f"{k} ({v}x)" for k, v in sorted(faktor_lewat.items(), key=lambda x: -x[1])))
    if snap_n == 0:
        saran.append("Tidak ada riwayat snapshot pada periode ini; aktifkan cron 'siaga-watchdog'.")
    return {
        "periodeHari": hari, "hanyaTerverifikasi": hanya_terverifikasi, "jumlahKejadian": len(kej), "dinilai": len(dinilai),
        "terdeteksi": len(hit), "probabilitasDeteksi": pod, "hariAlarm": len(alarm_hari), "alarmPalsu": len(palsu),
        "rasioAlarmPalsu": far, "leadTimeRataJam": r(sum(leads) / len(leads)) if leads else None,
        "rincian": hasil[:50], "contohAlarmPalsu": palsu[:20], "saran": saran,
    }


# --------------------------------------------------------------------------- deteksi eskalasi (dipakai watchdog)

def deteksi_perubahan(kec: list[dict], cooldown_jam: float = 3.0, min_status: str = "siaga") -> dict:
    """Bandingkan status sekarang dengan status alarm terakhir per kecamatan.

    Eskalasi: status naik ke ≥ min_status (mis. Waspada→Siaga, Siaga→Awas).
    Pemulihan: kecamatan yang sebelumnya ≥ min_status kini turun ke Normal/Waspada.
    Status yang sama dalam masa cooldown tidak diulang.
    """
    now = sekarang_wib()
    eskalasi, pulih = [], []
    with db() as conn:
        lama = {x["kecamatan_id"]: x for x in conn.execute("SELECT * FROM alarm").fetchall()}
        for k in kec:
            prev = lama.get(k["id"])
            prev_rank = rank(prev["status"]) if prev else 0
            cur_rank = rank(k["status"])
            if cur_rank >= rank(min_status) and cur_rank > prev_rank:
                eskalasi.append({"kecamatan": k["nama"], "dari": prev["status"] if prev else "normal", "ke": k["status"],
                                 "skor": k["skor"], "faktor": [f["ket"] for f in k["faktor"]]})
                conn.execute("INSERT OR REPLACE INTO alarm VALUES (?,?,?)", (k["id"], k["status"], now.isoformat()))
            elif prev and prev_rank >= rank(min_status) and cur_rank < rank(min_status):
                umur = (now - parse_waktu(prev["waktu"])).total_seconds() / 3600
                if umur >= cooldown_jam:  # hindari naik-turun cepat (flapping)
                    pulih.append({"kecamatan": k["nama"], "dari": prev["status"], "ke": k["status"]})
                    conn.execute("DELETE FROM alarm WHERE kecamatan_id=?", (k["id"],))
            elif prev and cur_rank < prev_rank and cur_rank >= rank(min_status):
                # turun tapi masih ≥ min (Awas→Siaga): simpan level baru tanpa notifikasi
                conn.execute("INSERT OR REPLACE INTO alarm VALUES (?,?,?)", (k["id"], k["status"], prev["waktu"]))
    return {"eskalasi": eskalasi, "pulih": pulih}


# --------------------------------------------------------------------------- tampilan ringkas (slash command / hook)

def teks_status_singkat(kec: list[dict], waktu: str | None = None) -> str:
    ring = ringkas_kabupaten(kec)
    j = ring["jumlahPerStatus"]
    baris = [f"Status Kab. Bekasi: {ring['label'].upper()} · Awas {j['awas']} · Siaga {j['siaga']} · Waspada {j['waspada']} · Normal {j['normal']}"]
    for k in urutkan(kec):
        if k["status"] == "normal":
            break
        baris.append(f"- {k['nama']}: {LABEL[k['status']]} (skor {k['skor']}) – " + "; ".join(f["ket"] for f in k["faktor"]))
    if waktu:
        baris.append(f"Data: {waktu}")
    return "\n".join(baris)
