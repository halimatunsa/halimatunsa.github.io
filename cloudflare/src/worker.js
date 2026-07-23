/* ============================================================
   API REKOD MURID - CLOUDFLARE WORKER + D1 (SQLite)
   Port daripada api/*.php supaya laman di hosting statik
   (GitHub Pages) boleh guna pangkalan data sebenar.

   Laluan (sengaja dikekalkan sama dengan versi PHP supaya
   index.html dan admin.html tidak perlu diubah):
     POST /semak.php           - semakan awam (nama / IC)
     POST /cadang.php          - cadangan nama (autolengkap)
     GET  /rekod_admin.php     - senarai penuh (perlu kunci)
     POST /rekod_admin.php     - ping / replaceAll (perlu kunci)
     POST /kandungan_admin.php - simpan data.js terus ke repo GitHub (perlu kunci)

   Tetapan (secrets & vars):
     npx wrangler secret put ADMIN_KEY
     npx wrangler secret put GITHUB_TOKEN     (fine-grained PAT, kebenaran
                                                Contents: Read and write,
                                                skop pada repo ini sahaja)
     wrangler.toml [vars]: GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, GITHUB_PATH

   Jika GITHUB_TOKEN belum ditetapkan, /kandungan_admin.php akan
   memulangkan mesej ralat yang menyuruh guna butang Muat Turun
   sebagai ganti (admin.html sudah mengendalikan sandaran ini).
   ============================================================ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });

const normNama = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const normIc = (s) => String(s || "").replace(/[^0-9]/g, "");

const rowKeRekod = (r, denganIc) => ({
  nama: r.nama,
  ...(denganIc ? { ic: r.ic } : {}),
  tingkatan: r.tingkatan,
  kelas: r.kelas,
  contoh: !!r.contoh,
  exam: JSON.parse(r.exam_json || "[]"),
  pbd: JSON.parse(r.pbd_json || "[]"),
});

async function badanJson(request) {
  try { return await request.json(); } catch { return {}; }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    const path = new URL(request.url).pathname;
    try {
      if (path.endsWith("/semak.php")) return await semak(request, env);
      if (path.endsWith("/cadang.php")) return await cadang(request, env);
      if (path.endsWith("/rekod_admin.php")) return await rekodAdmin(request, env);
      if (path.endsWith("/kandungan_admin.php")) return await kandunganAdmin(request, env);
      return json({ ok: false, mesej: "Laluan tidak dijumpai" }, 404);
    } catch (e) {
      return json({ ok: false, mesej: "Ralat pelayan" }, 500);
    }
  },
};

/* ---------- semakan awam ---------- */
async function semak(request, env) {
  if (request.method !== "POST") {
    return json({ ok: false, mesej: "Kaedah tidak dibenarkan" }, 405);
  }
  const q = String((await badanJson(request)).q || "").trim();
  if (!q) return json({ ok: false, mesej: "Tiada input" }, 400);

  let row = await env.DB
    .prepare("SELECT * FROM murid WHERE nama_norm = ? LIMIT 1")
    .bind(normNama(q))
    .first();

  if (!row) {
    const icN = normIc(q);
    if (icN.length >= 6) {
      row = await env.DB
        .prepare("SELECT * FROM murid WHERE ic_norm = ? LIMIT 1")
        .bind(icN)
        .first();
    }
  }

  if (!row) return json({ ok: false, mesej: "Tiada rekod dijumpai" }, 404);
  /* nombor IC sengaja TIDAK dipulangkan dalam respons awam */
  return json({ ok: true, rekod: rowKeRekod(row, false) });
}

/* ---------- cadangan nama (autolengkap) ----------
   Guardrail privasi: minimum 4 aksara, maksimum 5 nama,
   nama sahaja tanpa kelas / tingkatan / markah. */
async function cadang(request, env) {
  if (request.method !== "POST") {
    return json({ ok: false, mesej: "Kaedah tidak dibenarkan" }, 405);
  }
  const q = normNama(String((await badanJson(request)).q || ""));
  if (q.length < 4 || /^\d+$/.test(q.replace(/[\s-]/g, ""))) {
    return json({ ok: true, nama: [] });
  }
  const qEsc = q.replace(/[\\%_]/g, (c) => "\\" + c);
  /* padanan awalan nama diutamakan sebelum padanan tengah nama */
  const { results } = await env.DB
    .prepare(
      "SELECT nama FROM murid WHERE nama_norm LIKE ? ESCAPE '\\' " +
      "ORDER BY CASE WHEN nama_norm LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, nama_norm LIMIT 5"
    )
    .bind("%" + qEsc + "%", qEsc + "%")
    .all();
  return json({ ok: true, nama: results.map((r) => r.nama) });
}

/* ---------- API admin (perlu X-Admin-Key) ---------- */
async function rekodAdmin(request, env) {
  const kunci = request.headers.get("X-Admin-Key") || "";
  if (!env.ADMIN_KEY || kunci !== env.ADMIN_KEY) {
    return json({ ok: false, mesej: "Kunci admin salah" }, 401);
  }

  if (request.method === "GET") {
    const { results } = await env.DB
      .prepare("SELECT * FROM murid ORDER BY nama_norm")
      .all();
    return json({ ok: true, rekod: results.map((r) => rowKeRekod(r, true)) });
  }

  if (request.method === "POST") {
    const b = await badanJson(request);

    if (b.action === "ping") {
      const row = await env.DB.prepare("SELECT COUNT(*) AS jumlah FROM murid").first();
      return json({ ok: true, mesej: "Sambungan berjaya", jumlah: row.jumlah });
    }

    if (b.action === "replaceAll") {
      if (!Array.isArray(b.rekod)) {
        return json({ ok: false, mesej: "Senarai rekod tidak sah" }, 400);
      }
      const penyata = [env.DB.prepare("DELETE FROM murid")];
      let masuk = 0;
      for (const r of b.rekod) {
        if (!r || typeof r !== "object") continue;
        const nama = String(r.nama || "").trim();
        if (!nama) continue;
        penyata.push(
          env.DB.prepare(
            "INSERT INTO murid (nama, nama_norm, ic, ic_norm, tingkatan, kelas, contoh, exam_json, pbd_json) VALUES (?,?,?,?,?,?,?,?,?)"
          ).bind(
            nama,
            normNama(nama),
            String(r.ic || ""),
            normIc(String(r.ic || "")),
            String(r.tingkatan || ""),
            String(r.kelas || ""),
            r.contoh ? 1 : 0,
            JSON.stringify(Array.isArray(r.exam) ? r.exam : []),
            JSON.stringify(Array.isArray(r.pbd) ? r.pbd : [])
          )
        );
        masuk++;
      }
      await env.DB.batch(penyata);
      return json({ ok: true, mesej: "Rekod diterbitkan", jumlah: masuk });
    }

    return json({ ok: false, mesej: "Tindakan tidak dikenali" }, 400);
  }

  return json({ ok: false, mesej: "Kaedah tidak dibenarkan" }, 405);
}

/* ---------- simpan kandungan (data.js) terus ke repo GitHub ---------- */
async function kandunganAdmin(request, env) {
  const kunci = request.headers.get("X-Admin-Key") || "";
  if (!env.ADMIN_KEY || kunci !== env.ADMIN_KEY) {
    return json({ ok: false, mesej: "Kunci admin salah" }, 401);
  }
  if (request.method !== "POST") {
    return json({ ok: false, mesej: "Kaedah tidak dibenarkan" }, 405);
  }

  const b = await badanJson(request);
  if (b.action !== "save") {
    return json({ ok: false, mesej: "Tindakan tidak dikenali" }, 400);
  }
  const data = b.data;
  if (!data || typeof data !== "object" || !data.profil || !data.bahan) {
    return json({ ok: false, mesej: "Struktur kandungan tidak sah" }, 400);
  }

  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    return json({
      ok: false,
      mesej: "GitHub belum dikonfigurasi pada Worker. Guna butang Muat Turun data.js sebagai ganti, atau tetapkan GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO.",
    }, 501);
  }

  try {
    const hasil = await simpanKeGitHub(env, data);
    return json({ ok: true, mesej: "Kandungan disimpan terus ke GitHub", komit: hasil.sha || null });
  } catch (e) {
    return json({ ok: false, mesej: "Gagal simpan ke GitHub: " + e.message }, 502);
  }
}

async function simpanKeGitHub(env, data) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || "main";
  const laluan = (env.GITHUB_PATH || "data.js").replace(/^\/+/, "");
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${laluan
    .split("/").map(encodeURIComponent).join("/")}`;
  const header = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "halimatun-portfolio-worker",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  /* 1. dapatkan sha fail semasa (perlu untuk kemas kini; tiada jika fail baharu) */
  let sha;
  const cekR = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers: header });
  if (cekR.status === 200) {
    sha = (await cekR.json()).sha;
  } else if (cekR.status !== 404) {
    throw new Error(`GitHub GET gagal (${cekR.status})`);
  }

  /* 2. bina kandungan data.js, sama format dengan versi PHP */
  const teks =
    "/* ============================================================\n" +
    "   DATA KANDUNGAN LAMAN\n" +
    "   Disimpan melalui admin.html (Cloudflare Worker -> GitHub) pada " +
    new Date().toISOString() + ".\n" +
    "   Jangan edit fail ini secara manual; gunakan admin.html.\n" +
    "   ============================================================ */\n" +
    "window.SITE_DATA = " + JSON.stringify(data, null, 2) + ";\n";

  /* 3. hantar commit */
  const putR = await fetch(apiUrl, {
    method: "PUT",
    headers: { ...header, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Kemas kini kandungan laman melalui admin.html (${new Date().toISOString()})`,
      content: keBase64Utf8(teks),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!putR.ok) {
    const ralat = await putR.text();
    throw new Error(`GitHub PUT gagal (${putR.status}): ${ralat.slice(0, 200)}`);
  }
  const putJ = await putR.json();
  return { sha: putJ.content && putJ.content.sha };
}

function keBase64Utf8(teks) {
  const bait = new TextEncoder().encode(teks);
  let biner = "";
  bait.forEach((b) => { biner += String.fromCharCode(b); });
  return btoa(biner);
}
