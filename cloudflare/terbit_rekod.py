# ============================================================
# TERBIT REKOD MURID KE PANGKALAN DATA
# Hantar kandungan rekod_murid.json ke API (Cloudflare Worker
# atau PHP) menggunakan tindakan replaceAll.
#
# Cara guna:
#   python terbit_rekod.py <URL_API> <KUNCI_ADMIN>
# Contoh:
#   python terbit_rekod.py http://localhost:8793 cikgu-halimatun-2026
#   python terbit_rekod.py https://halimatun-api.NAMA.workers.dev KUNCI
# ============================================================
import json, os, sys, urllib.request

if len(sys.argv) != 3:
    print(__doc__ or "Guna: python terbit_rekod.py <URL_API> <KUNCI_ADMIN>")
    sys.exit(1)

url = sys.argv[1].rstrip("/") + "/rekod_admin.php"
kunci = sys.argv[2]
fail = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rekod_murid.json")

with open(fail, encoding="utf-8") as f:
    rekod = json.load(f)

badan = json.dumps({"action": "replaceAll", "rekod": rekod}).encode("utf-8")
req = urllib.request.Request(url, data=badan, method="POST", headers={
    "Content-Type": "application/json",
    "X-Admin-Key": kunci,
    # User-Agent lalai Python ("Python-urllib/x.y") disekat oleh
    # perlindungan bot Cloudflare pada sub-domain workers.dev (403
    # Forbidden sebelum sampai ke worker). Guna UA biasa sebagai ganti.
    "User-Agent": "Mozilla/5.0 (terbit_rekod.py)",
})
try:
    with urllib.request.urlopen(req) as r:
        print(r.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')}")
    sys.exit(1)
