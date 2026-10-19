-- Sponsored pool allocation per user, assigned on first login (USDC atomic units).
-- Spending and reservations are tracked by the ledger in its own tables.
CREATE TABLE allocations (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  amount     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
