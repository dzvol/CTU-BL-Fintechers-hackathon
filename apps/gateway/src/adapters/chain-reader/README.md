# ChainReader

`createRpcChainReader(config?, { client? })` creates a read-only RPC verifier.
The default network is Base Sepolia. No merchant response or facilitator success
claim is accepted as proof of payment.

```ts
import { createRpcChainReader, loadChainReaderConfig } from './adapters/chain-reader';

const chainReader = createRpcChainReader(loadChainReaderConfig());
const verification = await chainReader.verifyPayment({
  txHash: merchantTransactionHash, // Only a lookup hint, independently verified through RPC.
  chainId: 84532,
  token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  payer: sponsorAddress,
  recipient: recordedOffer.payTo,
  amount: BigInt(recordedOffer.amount),
  authorizationNonce: persistedAuthorization.nonce,
});

if (verification.status === 'settled') {
  // verification.settlement contains txHash and the selected network's explorer URL.
  // The payment is confirmed; delivery of content is a separate condition.
}
```

The expected chain, token, payer, recipient, amount, and nonce must come from the
gateway's recorded offer and persisted authorization. Only the transaction hash
may be obtained from the merchant's `PAYMENT-RESPONSE` header. A missing hash cannot
be verified by this reader; the failure path must close the task conservatively.

## Verification

Each call checks the RPC chain ID and the transaction receipt, including its hash
and success status. It requires USDC `AuthorizationUsed` for the persisted payer
and nonce, immediately followed by the corresponding USDC `Transfer` with the exact
payer, recipient, and atomic amount. Events are paired in log-index order so a
batch cannot supply the correct nonce from one payment and a matching transfer
from another. The transaction sender can be a facilitator; it is not the USDC payer.

The reader also checks log consistency, removed logs, the configured confirmation
threshold, and the receipt block against the canonical block at that height.
One confirmation is the default and is not a claim of irreversible L1 finality.
Atomic amounts remain `bigint`; no floating-point conversion is performed.

| `status`  | Meaning                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `settled` | All required on-chain evidence matched at the observed block                                                                    |
| `failed`  | Invalid expected input, unsupported configured profile, reverted transaction, or mismatched evidence                            |
| `unknown` | RPC unavailable, missing receipt, wrong RPC network, malformed RPC data, insufficient confirmations, or detected reorganization |

Neither `failed` nor `unknown` is permission to refund or release an issued
authorization. A reverted or missing transaction does not prove that the same
authorization was never executed in a different transaction. The simple failure
handler closes the task and leaves financial/operation records untouched.

## Network configuration

| `network`      | Chain ID | Native USDC                                  |
| -------------- | -------- | -------------------------------------------- |
| `base-sepolia` | 84532    | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| `base-mainnet` | 8453     | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

Network presets use viem's network RPC/explorer configuration and the native USDC
addresses listed by [Circle](https://developers.circle.com/stablecoins/usdc-contract-addresses).
Authorization event semantics follow [ERC-3009](https://eips.ethereum.org/EIPS/eip-3009)
and [Circle's USDC implementation](https://github.com/circlefin/stablecoin-evm/blob/master/contracts/v2/EIP3009.sol).

Configure explicitly:

```ts
const chainReader = createRpcChainReader({
  network: 'base-mainnet',
  rpcUrl: 'https://your-base-rpc.example',
  confirmations: 2,
  timeoutMs: 10_000,
});
```

Or use `loadChainReaderConfig()` with these variables:

```dotenv
PAYMENT_NETWORK=base-mainnet          # the gateway's one payment network; the reader follows it
CHAIN_READER_NETWORK=base-mainnet     # optional override, the gateway refuses a mismatch
CHAIN_READER_RPC_URL=https://your-base-rpc.example
CHAIN_READER_CONFIRMATIONS=2
CHAIN_READER_TIMEOUT_MS=10000
```

An empty RPC override uses the selected network's viem default. On Sepolia only,
the existing `BASE_SEPOLIA_RPC_URL` is respected. Selecting mainnet never inherits
the Sepolia RPC or the existing merchant `USDC_ADDRESS` setting. The Signer takes its network
from `PAYMENT_NETWORK` too, and the gateway refuses to start when the two differ.

The default timeout is 10 seconds for the whole verification; HTTP RPC retries
and RPC caching are disabled. Inject the small `ChainReaderRpc` interface for
offline tests. No private key, signing, payment submission, or database access is used.

```bash
npm test -w @semanticauth/gateway -- chain-reader
```
