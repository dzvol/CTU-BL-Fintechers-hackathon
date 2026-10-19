-- User decisions on operations that got a REVIEW verdict. One review per operation.
CREATE TABLE reviews (
  id           TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE REFERENCES operations(id),
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id      TEXT NOT NULL REFERENCES tasks(id),
  status       TEXT NOT NULL,
  reason       TEXT NOT NULL,
  offer        TEXT NOT NULL, -- JSON NormalizedOffer the user decides on
  detail       TEXT NOT NULL, -- why the decision table asked (no merchant text)
  created_at   TEXT NOT NULL,
  -- pending: deadline for the user's decision; approved: deadline for the agent to resume.
  expires_at   TEXT NOT NULL,
  decided_at   TEXT
);

CREATE INDEX reviews_user_id ON reviews(user_id);
