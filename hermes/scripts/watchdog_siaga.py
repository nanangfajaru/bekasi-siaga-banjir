#!/usr/bin/env python3
"""Watchdog Siaga Banjir – pra-cek cron setiap 15 menit (gerbang `wakeAgent`).

1. Ambil data live dashboard dan hitung skor 23 kecamatan (tanpa LLM, nol token).
2. Simpan snapshot ke riwayat (untuk tren & evaluasi akurasi).
3. Bandingkan dengan status alarm terakhir:
   - ada eskalasi (naik ke ≥ Siaga) atau pemulihan → bangunkan agent dengan konteks perubahan;
   - tidak ada perubahan → {"wakeAgent": false}: tick senyap, tidak ada biaya model.

Baris terakhir stdout WAJIB berupa JSON gerbang Hermes.
"""

import json
import os
import sys
from pathlib import Path

HOME = Path(__file__).resolve().parents[1]          # <profil>/scripts/ → <profil>
sys.path.insert(0, str(HOME / "plugins" / "siaga_banjir"))

import core  # noqa: E402


def main() -> None:
    d = core.ambil_semua()
    if d["cuaca"].get("_error"):
        # Data utama gagal: jangan membangunkan agent tiap 15 menit; cukup senyap.
        # (Kegagalan beruntun tetap terlihat di `hermes cron runs` / riwayat kosong.)
        print(json.dumps({"wakeAgent": False, "reason": "data cuaca gagal: " + d["cuaca"]["_error"][:200]}))
        return

    kec = core.nilai_semua(d)
    waktu = core.simpan_snapshot(kec)
    min_status = os.environ.get("SIAGA_ALARM_MIN", "siaga")
    if min_status not in core.STATUS:
        min_status = "siaga"
    ubah = core.deteksi_perubahan(kec, cooldown_jam=float(os.environ.get("SIAGA_COOLDOWN_JAM", "3")), min_status=min_status)

    if not ubah["eskalasi"] and not ubah["pulih"]:
        print(json.dumps({"wakeAgent": False}))
        return

    ring = core.ringkas_kabupaten(kec)
    konteks = {
        "waktuSnapshot": waktu,
        "waktuData": d["cuaca"].get("diperbarui"),
        "statusKabupaten": ring["statusKabupaten"],
        "jumlahPerStatus": ring["jumlahPerStatus"],
        "eskalasi": ubah["eskalasi"],
        "pulih": ubah["pulih"],
        "sumberGagal": d["gagal"],
    }
    print(json.dumps({"wakeAgent": True, "context": konteks}, ensure_ascii=False))


if __name__ == "__main__":
    main()
