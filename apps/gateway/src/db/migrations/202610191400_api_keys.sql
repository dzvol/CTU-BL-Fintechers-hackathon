-- Agent API keys. Only a SHA-256 hash of the key is stored; the key is shown to the user once.
CREATE TABLE api_keys (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at   TEXT
);

CREATE INDEX api_keys_user_id ON api_keys(user_id);

-- A user has at most one active key; creating a new one revokes the old one.
CREATE UNIQUE INDEX api_keys_one_active_per_user ON api_keys(user_id) WHERE revoked_at IS NULL;
