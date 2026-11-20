-- Personal Ultra TV library, stage 1 only.
-- Create a private Cloudflare D1 database, then execute this migration
-- BEFORE enabling ULTRA_SYNC_DB binding and setting the setup secret.
CREATE TABLE IF NOT EXISTS sync_devices (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('owner','tv')),
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))
);
CREATE TABLE IF NOT EXISTS sync_pair_codes (
  code_hash TEXT PRIMARY KEY,
  issued_by TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(issued_by) REFERENCES sync_devices(id)
);
CREATE INDEX IF NOT EXISTS idx_pair_expiration ON sync_pair_codes(expires_at);
CREATE TABLE IF NOT EXISTS sync_pair_attempts (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempt_expiration ON sync_pair_attempts(expires_at);
CREATE TABLE IF NOT EXISTS sync_library (
  show_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  tracked INTEGER NOT NULL CHECK(tracked IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_library_changed ON sync_library(updated_at DESC);
