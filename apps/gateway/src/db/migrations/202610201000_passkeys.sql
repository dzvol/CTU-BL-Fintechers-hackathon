-- Passkeys that confirm approvals in the dashboard. Public keys only; nothing secret is stored.
CREATE TABLE passkeys (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE, -- base64url
  public_key    TEXT NOT NULL,        -- base64url COSE key
  counter       INTEGER NOT NULL,
  transports    TEXT NOT NULL,        -- JSON array
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  last_used_at  TEXT
);

CREATE INDEX passkeys_user_id ON passkeys(user_id);

-- One-time WebAuthn challenges. used_at is set in the same transaction as the confirmed action.
CREATE TABLE webauthn_challenges (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL,         -- 'registration' | 'step_up'
  action     TEXT,                  -- canonical action JSON the challenge is bound to (step_up)
  challenge  TEXT NOT NULL,         -- base64url, what the authenticator signs
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

CREATE INDEX webauthn_challenges_user_id ON webauthn_challenges(user_id);

-- Audit: which passkey confirmed an approval (NULL when approved without one).
ALTER TABLE intents ADD COLUMN approved_passkey_id TEXT REFERENCES passkeys(id) ON DELETE SET NULL;
ALTER TABLE reviews ADD COLUMN approved_passkey_id TEXT REFERENCES passkeys(id) ON DELETE SET NULL;
