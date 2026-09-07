-- SHDW.world · the store (docs/SHOW.md §8). items = the show as it stands; log = every write, the history.
CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, json TEXT NOT NULL, who TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS log (ts INTEGER NOT NULL, who TEXT NOT NULL, op TEXT NOT NULL, id TEXT NOT NULL, json TEXT);
CREATE INDEX IF NOT EXISTS items_ts ON items (ts);
CREATE INDEX IF NOT EXISTS log_ts ON log (ts);
CREATE INDEX IF NOT EXISTS log_op_ts ON log (op, ts);
