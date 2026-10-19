CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  google_sub    TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  name          TEXT,
  picture       TEXT,
  created_at    TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

-- Only a SHA-256 hash of the session token is stored; the token itself lives in the cookie.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX sessions_user_id ON sessions(user_id);
