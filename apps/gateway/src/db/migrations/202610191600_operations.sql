-- One row per paid_fetch attempt. State moves only along the operation state machine.
CREATE TABLE operations (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url         TEXT NOT NULL, -- normalized with new URL(...).toString()
  state       TEXT NOT NULL,
  verdict     TEXT,
  reason      TEXT,
  offer       TEXT, -- JSON NormalizedOffer
  settlement  TEXT, -- JSON Settlement
  message     TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Idempotency: the same URL within one task is always the same operation (no double payment).
CREATE UNIQUE INDEX operations_task_url ON operations(task_id, url);
CREATE INDEX operations_user_id ON operations(user_id);
