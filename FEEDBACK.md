# Uniswap developer feedback — ETHGlobal Tokyo 2026

## Integration

Itonami Agent Treasury reads Uniswap v3 QuoterV2 on Base to estimate a
bounded WETH-to-USDC top-up before the agent can request a payment. The
official Base QuoterV2 and WETH addresses came from the
[Base deployments page](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments).
The ABI is the official
[IQuoterV2 interface](https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/IQuoterV2.sol).

The standalone implementation is in `workers/grok-bots/uniswap_quote.js`.
The public route is integrated into Itonami's existing private Worker.
`test/uniswap_quote.test.mjs`
checks the exact target contract, `eth_call` method, minimum output, and
failure behavior. The fixed public demo amount is 0.005 WETH and the returned
50 bps minimum output is a planning floor. It is not a signed swap or price
guarantee. No token transfer is claimed.

An authenticated `POST /v1/bot-economy/swap-plan` now binds the recipient to
the position's linked wallet, reads its WETH balance and Router allowance,
and encodes an unsigned `SwapRouter02.multicall` with a two-minute onchain
deadline and the QuoterV2 minimum output. It provides an exact-amount WETH
approval transaction only when allowance is insufficient. This uses the
official Base SwapRouter02 deployment; the current Universal Router is
preferred for new applications, and migrating this plan remains open.
The endpoint neither signs nor broadcasts either transaction.

## Experience

Time from starting the QuoterV2 implementation to the first successful real
Base RPC quote: under 30 minutes on 2026-09-25. The first call returned
13.473603 USDC for 0.005 WETH through the 0.05% pool. A public RPC call
required no API key, which made a read-only integration fast to test.

The main friction was choosing the right protocol entrypoint for an agent
treasury. QuoterV2 gives a real onchain estimate, while an executable route
also needs wallet balance, allowance, minimum output, a deadline, and a
recipient bound to the linked position. SwapRouter02 has a compact v3
`exactInputSingle` interface that let us validate those pieces. The
Universal Router is the recommended current execution path. Wiring a
delegated signer, enforcing quote freshness at signing, and observing a
confirmed receipt remain open work.

The most useful documentation improvement would be one end-to-end example
that starts with a v3 or v4 quote, binds a minimum output and short deadline,
then composes the executable Universal Router call with a delegated wallet.

This file is a feedback draft. The required Uniswap Developer Feedback Form
has not yet been submitted.
