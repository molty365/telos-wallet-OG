# Balance not displayed when RPC endpoint fails

## Description

When the RPC endpoint (`rpc.telos.net`) experiences temporary issues, the wallet UI shows no balance instead of gracefully handling the error or displaying cached values.

## Root Cause

In `src/antelope/stores/balances.ts`, the `updateSystemBalanceForAccount()` function throws an error when:
1. Price fetching fails (`getUsdPrice()`)
2. Balance fetching fails (`getSystemTokenBalance()`)

When either fails, the entire function throws `antelope.evm.error_update_system_balance_failed`, causing the UI to display no balance.

## Reproduction

1. Connect wallet on Telos EVM
2. Simulate RPC failure (network issues, endpoint down)
3. Observe balance disappears entirely

## Technical Details

```
RPC endpoint: https://rpc.telos.net
Status: Responding ✅ (verified block 0x1ac23573)
Issue location: Frontend error handling in BalanceProvider
```

## Proposed Fix

1. **Separate error handling** for price fetching vs balance fetching
2. **Don't throw** on balance fetch failures - log warning and preserve existing/cached balance
3. **Add fallback RPC endpoints** for redundancy:
   - `mainnet.telos.net/evm`
   - `telos.drpc.org`
   - `rpc1.us.telos.net/evm`

## Impact

- Users see "0" or empty balance during temporary RPC outages
- Creates confusion and potential support tickets
- May prevent users from completing transactions

## Labels

`bug`, `frontend`, `ux`, `evm`
