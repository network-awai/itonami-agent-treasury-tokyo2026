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
- The demo reads current Bot treasury status, Base Uniswap quote, and ENSv2
  Sepolia preflight in the browser, with a visible unavailable state on errors.
  These are read-only observations; the three-path table is controlled test
  evidence.
- The small edge Worker serving that page from public Pages is included at
  workers/ethglobal-demo/worker.js.
- A World ID for Agents sandbox OIDC adapter in
  workers/grok-bots/world_oidc.js, plus the exact-payment hash in
  workers/grok-bots/world_action.js. It requests fresh authentication with
  PKCE and verifies the signed ID token, issuer, audience, nonce and
  authentication time on the server. Tests use a local signing key; they are
  not a live World verification.
- A read-only ENSv2 Sepolia preflight at
  https://treasury.itonami.cloud/ens-preflight?label=itonami-agent-treasury-2026 .
  It queries the official ETH Registrar for live availability and one-year
  MockUSDC price. It does not register a name or assign agent permissions.

The live Bot economy at bots.itonami.cloud still reports simulation ledger
mode and no real fund movement. Without an Intercepta sandbox key,
counterparty screening holds payments. No swap or payment has been signed or
broadcast. Controlled test responses are not live sponsor API evidence.

World ID for Agents approval and ENSv2 Sepolia identity are not completed
prize qualifications. The OIDC adapter is wired into the private running
Bot Durable Object: authenticated start, one-time callback state, and a
payment gate bound to the exact x402 challenge. The production Worker has no
registered World client, so no live human verification has completed. The
default approval threshold is $50, above the current trial per-call cap.
Controlled tests use a lower threshold to exercise the gate. The public
source does not contain the existing
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
