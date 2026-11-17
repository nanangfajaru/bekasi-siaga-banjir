/* Asisten Siaga Banjir – panel chat AI Agent (memanggil /api/agent) */
(() => {
  const SARAN = [
    "Bagaimana kondisi banjir Kabupaten Bekasi sekarang?",
    "Kenapa Pebayuran statusnya begitu?",
    "Apakah ada potensi rob di Muaragembong 2 hari ini?",
    "Bagaimana jika hujan 120 mm dan debit Citarum naik 50%?",
    "Simulasikan kondisi 1 Januari 2020",
  ];
  const KUNCI = "asisten-banjir-riwayat";
  let riwayat = [];
  try { riwayat = JSON.parse(sessionStorage.getItem(KUNCI) || "[]"); } catch { riwayat = []; }
  const simpan = () => { try { sessionStorage.setItem(KUNCI, JSON.stringify(riwayat.slice(-20))); } catch {} };

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Markdown ringan: **tebal**, daftar "- ", baris baru.
  const md = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^#{1,4} (.+)$/gm, "<b>$1</b>")
    .replace(/^\s*[-•] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>")
    .replace(/<\/li>\n<li>/g, "</li><li>")
    .replace(/\n?(<\/?ul>)\n?/g, "$1")
    .replace(/\n/g, "<br>");

  const btn = el("button", "ai-fab", "💬 Tanya Asisten");
  btn.type = "button";
  btn.setAttribute("aria-label", "Buka Asisten Siaga Banjir");
  const panel = el("section", "ai-panel");
  panel.setAttribute("aria-label", "Asisten Siaga Banjir");
  panel.innerHTML = `
    <header><div><b>Asisten Siaga Banjir</b><span>AI Agent · data live dashboard</span></div>
      <button type="button" class="ai-reset" title="Mulai percakapan baru">↺</button>
      <button type="button" class="ai-close" aria-label="Tutup">✕</button></header>
    <div class="ai-log" aria-live="polite"></div>
    <div class="ai-saran"></div>
    <form class="ai-form"><textarea rows="1" maxlength="1500" placeholder="Tanya kondisi banjir, sungai, rob, prakiraan…"></textarea><button type="submit">Kirim</button></form>
    <p class="ai-note">Informatif, bukan status resmi. Darurat: hubungi 112 / BPBD Kab. Bekasi.</p>`;
  document.body.append(btn, panel);

  const log = panel.querySelector(".ai-log"), form = panel.querySelector("form"), ta = form.querySelector("textarea"), saran = panel.querySelector(".ai-saran");

  const tambah = (role, teks, extra) => {
    const b = el("div", `ai-msg ${role}`, role === "assistant" ? md(teks) : esc(teks));
    if (extra) b.append(el("div", "ai-tools", extra));
    log.append(b);
    log.scrollTop = log.scrollHeight;
    return b;
  };
  const tampilSaran = () => {
    saran.innerHTML = "";
    if (riwayat.length) return;
    SARAN.forEach((s) => { const c = el("button", null, esc(s)); c.type = "button"; c.onclick = () => kirim(s); saran.append(c); });
  };
  const awal = () => {
    log.innerHTML = "";
    tambah("assistant", "Halo! Saya **Asisten Siaga Banjir Kabupaten Bekasi**. Saya membaca data live dashboard ini (BMKG, debit sungai, pasang laut, laporan warga) dan bisa menjelaskan status tiap kecamatan, prakiraan, simulasi tanggal, atau skenario \"bagaimana jika\".");
    riwayat.forEach((m) => tambah(m.role, m.content));
    tampilSaran();
  };

  let sibuk = false;
  async function kirim(teks) {
    teks = teks.trim();
    if (!teks || sibuk) return;
    sibuk = true; form.querySelector("button").disabled = true;
    riwayat.push({ role: "user", content: teks }); simpan();
    tambah("user", teks); ta.value = ""; saran.innerHTML = "";
    const tunggu = tambah("assistant", "Sedang memeriksa data…"); tunggu.classList.add("loading");
    try {
      const r = await fetch("api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: riwayat }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      tunggu.remove();
      riwayat.push({ role: "assistant", content: j.jawaban }); simpan();
      tambah("assistant", j.jawaban, j.toolDipakai?.length ? `data: ${[...new Set(j.toolDipakai)].join(", ").replace(/_/g, " ")}` : null);
    } catch (e) {
      tunggu.remove();
      riwayat.pop(); simpan();
      tambah("assistant", `Maaf, asisten sedang tidak dapat dihubungi (${e.message}). Coba lagi sebentar.`).classList.add("err");
    } finally {
      sibuk = false; form.querySelector("button").disabled = false; ta.focus();
    }
  }

  form.onsubmit = (e) => { e.preventDefault(); kirim(ta.value); };
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); kirim(ta.value); } };
  btn.onclick = () => { panel.classList.add("open"); btn.hidden = true; ta.focus(); };
  panel.querySelector(".ai-close").onclick = () => { panel.classList.remove("open"); btn.hidden = false; };
  panel.querySelector(".ai-reset").onclick = () => { riwayat = []; simpan(); awal(); };
  awal();
})();
