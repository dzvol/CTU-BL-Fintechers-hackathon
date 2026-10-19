-- Intents proposed by agents. Content never changes after insert; only status moves on.
CREATE TABLE intents (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id        TEXT NOT NULL REFERENCES api_keys(id),
  status            TEXT NOT NULL,
  purpose           TEXT NOT NULL,
  task              TEXT NOT NULL,
  allowed_purchases TEXT NOT NULL, -- JSON array of strings
  forbidden         TEXT NOT NULL, -- JSON array of strings
  budget            TEXT NOT NULL, -- USDC atomic units
  max_per_purchase  TEXT NOT NULL, -- USDC atomic units
  planned_purchases INTEGER NOT NULL,
  task_id           TEXT,
  created_at        TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  decided_at        TEXT
);

-- At most one intent waiting for approval per user.
CREATE UNIQUE INDEX intents_one_pending_per_user ON intents(user_id) WHERE status = 'pending_approval';

CREATE TABLE tasks (
  id         TEXT PRIMARY KEY,
  intent_id  TEXT NOT NULL UNIQUE REFERENCES intents(id),
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id TEXT NOT NULL REFERENCES api_keys(id),
  status     TEXT NOT NULL,
  budget     TEXT NOT NULL, -- USDC atomic units
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  closed_at  TEXT
);

-- At most one active task per user (and so per API key).
CREATE UNIQUE INDEX tasks_one_active_per_user ON tasks(user_id) WHERE status = 'active';
CREATE INDEX tasks_api_key_id ON tasks(api_key_id);
