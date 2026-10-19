-- The signed EIP-3009 authorization of an operation, persisted before it leaves the gateway
-- (operation state `issued`). Once a row exists the amount counts as spent until
-- reconciliation proves the authorization never settled.
CREATE TABLE payments (
  operation_id      TEXT PRIMARY KEY REFERENCES operations(id),
  payer             TEXT NOT NULL, -- sponsor EOA
  recipient         TEXT NOT NULL,
  token             TEXT NOT NULL,
  amount            TEXT NOT NULL,
  chain_id          INTEGER NOT NULL,
  nonce             TEXT NOT NULL UNIQUE, -- EIP-3009 authorization nonce
  valid_before      TEXT NOT NULL, -- unix seconds; the authorization is void afterwards
  payment_signature TEXT NOT NULL, -- the exact PAYMENT-SIGNATURE header sent to the merchant
  tx_hash           TEXT, -- as reported by the merchant; ChainReader verifies it
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
