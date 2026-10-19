import type { OperationId } from '@semanticauth/contracts';
import type { Db } from './db';

/** The signed authorization of one operation. Never leaves the gateway except to the merchant. */
export interface PaymentRecord {
  operationId: OperationId;
  payer: string;
  recipient: string;
  token: string;
  amount: bigint;
  chainId: number;
  nonce: string;
  validBefore: string;
  /** The exact PAYMENT-SIGNATURE header, sent unchanged. */
  paymentSignature: string;
  txHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRepository {
  insert(payment: PaymentRecord): void;
  findByOperation(operationId: OperationId): PaymentRecord | undefined;
  /** Records the transaction the merchant reported; false if the payment doesn't exist. */
  setTxHash(operationId: OperationId, txHash: string, at: string): boolean;
}

interface PaymentRow {
  operation_id: string;
  payer: string;
  recipient: string;
  token: string;
  amount: string;
  chain_id: number;
  nonce: string;
  valid_before: string;
  payment_signature: string;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

const toRecord = (row: PaymentRow): PaymentRecord => ({
  operationId: row.operation_id,
  payer: row.payer,
  recipient: row.recipient,
  token: row.token,
  amount: BigInt(row.amount),
  chainId: row.chain_id,
  nonce: row.nonce,
  validBefore: row.valid_before,
  paymentSignature: row.payment_signature,
  txHash: row.tx_hash,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function createPaymentRepository(db: Db): PaymentRepository {
  const insert = db.prepare(
    `INSERT INTO payments (operation_id, payer, recipient, token, amount, chain_id, nonce,
       valid_before, payment_signature, tx_hash, created_at, updated_at)
     VALUES (@operationId, @payer, @recipient, @token, @amount, @chainId, @nonce, @validBefore,
       @paymentSignature, @txHash, @createdAt, @updatedAt)`,
  );
  const byOperation = db.prepare<[string], PaymentRow>(
    'SELECT * FROM payments WHERE operation_id = ?',
  );
  const setTxHash = db.prepare(
    'UPDATE payments SET tx_hash = ?, updated_at = ? WHERE operation_id = ?',
  );

  return {
    insert: (payment) => void insert.run({ ...payment, amount: payment.amount.toString() }),
    findByOperation: (operationId) => {
      const row = byOperation.get(operationId);
      return row && toRecord(row);
    },
    setTxHash: (operationId, txHash, at) => setTxHash.run(txHash, at, operationId).changes === 1,
  };
}
