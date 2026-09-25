# Itonami Agent Treasury — ETHGlobal Tokyo 2026

This public repository contains the event-time, standalone source for the
[live Itonami Treasury evidence page](https://treasury.itonami.cloud/).
The running Bot economy is integrated into Itonami's existing private
monorepo. This repository exposes the new risk-screening and Uniswap planning
modules so that reviewers can inspect and run them without access to unrelated
private workspace code.

## What runs now

- Intercepta Quick Scan gate for an x402 payee. Clear, risky and unavailable
  results are distinct.
- Uniswap v3 QuoterV2 WETH-to-USDC quote on Base and unsigned SwapRouter02
  transaction planning with balance, allowance, minimum-output, recipient
  and deadline checks.
- A public demo evidence page served at treasury.itonami.cloud.
- The small edge Worker serving that page from public Pages is included at
  workers/ethglobal-demo/worker.js.
- An unconfigured World ID for Agents sandbox OIDC adapter in
  workers/grok-bots/world_oidc.js. It requests fresh authentication with
  PKCE and verifies the signed ID token, issuer, audience, nonce and
  authentication time on the server. Tests use a local signing key; they are
  not a live World verification.

The live Bot economy at bots.itonami.cloud still reports simulation ledger
mode and no real fund movement. Without an Intercepta sandbox key,
counterparty screening holds payments. No swap or payment has been signed or
broadcast. Controlled test responses are not live sponsor API evidence.

World ID for Agents approval and ENSv2 Sepolia identity are planned
integrations, not completed prize qualifications. The OIDC adapter is not
yet wired into the running Bot action or a registered World client. Its
server-side transaction must be single-use and bound to the exact action
before any protected action can occur. The high-value approval path has
not been measured. The public source does not contain the existing
Itonami Bot economy, delegated signer, or authentication implementation.

## Reproduce

Run npm install, then npm test. Read the current quote at
https://bots.itonami.cloud/v1/bot-economy/swap-quote .
The authenticated POST /v1/bot-economy/swap-plan binds its recipient to
the linked Itonami wallet. It returns unsigned calldata and does not transact.

## AI use

Codex assisted with the event-time implementation, tests and documentation.
The existing Bot economy was built before ETHGlobal Tokyo 2026.

## License

MIT. See LICENSE.

The Uniswap feedback draft is in FEEDBACK.md. The sponsor feedback form
has not yet been submitted.
