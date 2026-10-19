-- Sponsored ledger: one entry per operation that reserved funds from the sponsor pool
-- (USDC atomic units). reserved → spent (from `issued` on) | released; spent → released only
-- when reconciliation proves the payment never settled.
-- operation_id has no FK on purpose: the ledger stays independent of the operations schema.
CREATE TABLE ledger_entries (
  operation_id TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id      TEXT NOT NULL REFERENCES tasks(id),
  amount       TEXT NOT NULL,
  state        TEXT NOT NULL CHECK (state IN ('reserved', 'spent', 'released')),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX ledger_entries_user ON ledger_entries(user_id, state);
CREATE INDEX ledger_entries_task ON ledger_entries(task_id, state);
