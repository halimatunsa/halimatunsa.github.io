-- Skema pangkalan data rekod murid (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS murid (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nama      TEXT NOT NULL,
  nama_norm TEXT NOT NULL,
  ic        TEXT NOT NULL DEFAULT '',
  ic_norm   TEXT NOT NULL DEFAULT '',
  tingkatan TEXT NOT NULL DEFAULT '',
  kelas     TEXT NOT NULL DEFAULT '',
  contoh    INTEGER NOT NULL DEFAULT 0,
  exam_json TEXT NOT NULL DEFAULT '[]',
  pbd_json  TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_murid_nama ON murid(nama_norm);
CREATE INDEX IF NOT EXISTS idx_murid_ic ON murid(ic_norm);
