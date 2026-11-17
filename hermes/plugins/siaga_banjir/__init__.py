"""Plugin Hermes: Siaga Banjir Kabupaten Bekasi.

- 11 tool (toolset `siaga_banjir`) untuk membaca data live, simulasi, riwayat, kejadian, evaluasi, dan siaran.
- Hook `pre_llm_call`: menyisipkan ringkasan status terkini ke giliran percakapan (hanya saat status berubah).
- Hook `pre_tool_call`: siaran publik selalu melewati persetujuan manusia.
- Slash command `/siaga [kecamatan]`: status instan tanpa memanggil model (nol token).
"""

from __future__ import annotations

import logging
import time

from . import core, schemas, tools

logger = logging.getLogger(__name__)
TOOLSET = "siaga_banjir"

_terakhir: dict[str, str] = {}  # session_id -> teks status terakhir yang disisipkan
_snap: tuple[float, str] | None = None


def _status_teks() -> str | None:
    global _snap
    if _snap and time.time() - _snap[0] < 600:
        return _snap[1]
    d = core.ambil_semua()
    if d["cuaca"].get("_error"):
        return None
    kec = core.nilai_semua(d)
    teks = core.teks_status_singkat(kec, d["cuaca"].get("diperbarui"))
    if d["gagal"]:
        teks += f"\nSumber gagal dimuat: {', '.join(d['gagal'])}"
    _snap = (time.time(), teks)
    return teks


def _on_pre_llm_call(session_id: str = "", is_first_turn: bool = False, **kwargs):
    try:
        teks = _status_teks()
    except Exception as e:  # hook tidak boleh menggagalkan giliran
        logger.debug("siaga_banjir: gagal menyiapkan konteks: %s", e)
        return None
    if not teks or _terakhir.get(session_id) == teks:
        return None
    _terakhir[session_id] = teks
    if len(_terakhir) > 500:
        _terakhir.pop(next(iter(_terakhir)))
    return {"context": "[Konteks otomatis Siaga Banjir – status live dashboard, bukan status resmi BPBD]\n" + teks}


def _on_pre_tool_call(tool_name: str = "", args: dict | None = None, **kwargs):
    if tool_name == "siaga_kirim_siaran":
        pratinjau = str((args or {}).get("pesan", ""))[:300]
        return {"action": "approve", "message": f"Kirim siaran publik ke warga?\n\n{pratinjau}", "rule_key": "siaga:siaran"}
    return None


def _cmd_siaga(raw_args: str) -> str:
    q = (raw_args or "").strip()
    d = core.ambil_semua()
    if d["cuaca"].get("_error"):
        return f"Data belum bisa dimuat: {d['cuaca']['_error']}"
    kec = core.nilai_semua(d)
    if not q:
        return core.teks_status_singkat(kec, d["cuaca"].get("diperbarui")) + "\n\nDetail: /siaga <nama kecamatan>"
    hit = core.cari_kecamatan(q)
    if not hit:
        return f'Kecamatan "{q}" tidak ditemukan.'
    k = next(x for x in kec if x["id"] == hit[0])
    baris = [f"{k['nama']}: {core.LABEL[k['status']]} (skor {k['skor']})",
             f"Hujan maks 24 jam: {k['hujanMaks24']} mm · elevasi {k['elevasi']} m"]
    baris += [f"- {f['ket']} (+{f['poin']})" for f in k["faktor"]] or ["- tidak ada faktor risiko aktif"]
    baris += ["Tindakan:"] + [f"• {p}" for p in core.POLICY[k["status"]]]
    baris.append(f"Data: {d['cuaca'].get('diperbarui')} · informatif, bukan status resmi BPBD")
    return "\n".join(baris)


def register(ctx):
    for skema in schemas.SEMUA:
        ctx.register_tool(name=skema["name"], toolset=TOOLSET, schema=skema, handler=tools.HANDLERS[skema["name"]])

    if ctx.get_config("inject_status", default=True):
        ctx.register_hook("pre_llm_call", _on_pre_llm_call)
    ctx.register_hook("pre_tool_call", _on_pre_tool_call)
    ctx.register_command("siaga", handler=_cmd_siaga, description="Status siaga banjir Kab. Bekasi (tanpa AI)", args_hint="[kecamatan]")
