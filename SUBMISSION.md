# ETHGlobal Tokyo 2026 submission copy

This is a reviewable draft for the ETHGlobal project form. It records the
current evidence boundary; update it only after a live sponsor integration
has actually succeeded. **A saved project draft is not a final submission.**

## Project fields

- **Name:** Itonami Treasury
- **One-line description:** A policy-governed Itonami Bot treasury that checks
  x402 counterparties, prepares Uniswap liquidity, and gates sensitive agent
  payments on fresh human identity verification.
- **Live demo:** https://treasury.itonami.cloud/
- **Public source:** https://github.com/network-awai/itonami-agent-treasury-tokyo2026
- **Sponsor families to select:** World, Uniswap Foundation, ENS (three total).
- **Track:** Use the team's actual registered Continuity track. The Itonami
  Bot economy predates the event; this is an event-time feature extension.

## Project description

Itonami Treasury extends an existing Itonami Bot x402 economy with a
human-gated payment policy. An agent can discover an x402 challenge only from
the pinned service host. Existing rules admit the exact service, endpoint,
recipient, Base USDC asset, and spending limit. The event-time risk adapter
checks the payee before any delegated signer call and holds or blocks risky or
unavailable verdicts. For higher-value actions, a fresh World ID for Agents
OIDC request is bound to a hash of the exact payment proposal; the backend
validates the signed identity response and consumes an approval only once.
The treasury also reads a live Uniswap v3 Base quote and prepares bounded,
unsigned SwapRouter02 calldata for a linked wallet. The public demo offers an
explicit wallet handoff for approval and swap. A live ENSv2 Sepolia preflight
reads the official registrar for an agent name and price, while a separate
registration planner prepares commit, approval, and reveal transactions for a
user-provided wallet and deployed resolver. A supporting 1inch Aqua/SwapVM
reader verifies the official Base contracts and can inspect a named strategy's
virtual token balance; this is not an Aqua app or a shipped strategy.

The public demo separates live read-only API observations from controlled
test paths. The Bot ledger is currently in simulation mode. No real payment,
swap, or ENS registration has been submitted. World OIDC has no registered
live client yet; the controlled tests prove successful token validation and
denied/cancelled/replayed paths, but not a live World identity journey.
Intercepta screening is held because its sandbox key is not configured.

## Sponsor evidence and remaining qualification

### World ID for Agents

- Fresh OIDC/PKCE request and RS256/JWKS server validation:
  [world_oidc.js](workers/grok-bots/world_oidc.js#L24-L41),
  [world_oidc.js](workers/grok-bots/world_oidc.js#L54-L84).
- Exact action binding: [world_action.js](workers/grok-bots/world_action.js#L1-L18).
- The private Itonami integration deploys authenticated approval start,
  one-time callback state, and a purchase gate. The public endpoint refuses
  unknown callback state and unauthenticated approval start.
- **Not yet qualified:** no World portal client, completed live verification,
  or live protected action. Controlled signatures are not sponsor proofs.

### Uniswap Foundation

- Base QuoterV2 live read: [uniswap_quote.js](workers/grok-bots/uniswap_quote.js#L23-L65).
- Recipient-bound unsigned SwapRouter02 plan, wallet balance and allowance,
  50 bps minimum output, and two-minute deadline:
  [uniswap_quote.js](workers/grok-bots/uniswap_quote.js#L82-L126).
- The browser handoff in [public/index.html](public/index.html) requests each
  signature from the connected wallet and waits for a receipt. No receipt has
  yet been captured for this project.
- Public [FEEDBACK.md](FEEDBACK.md) explains integration friction.
- **Not yet qualified:** no swap signature/broadcast/receipt, and the
  required Uniswap Developer Feedback Form has not been submitted.

### ENS

- Dynamic ENSv2 Sepolia availability and MockUSDC price from the official
  ETH Registrar: [ensv2_preflight.js](workers/grok-bots/ensv2_preflight.js).
- An unsigned commit-reveal registration plan validates the owner and a
  deployed resolver's owner roles, reads the commitment and age bounds from the official
  registrar, and returns exact transaction calldata.
- **Not yet qualified:** no registered agent name, resolver record, or
  delegated ENSv2 permission. The preflight is read-only.

### 1inch (supporting integration; no prize selected)

- The Bot and public demo read the official Base Aqua registry and SwapVM
  router deployment and expose an exact virtual-balance lookup:
  [aqua_position.js](workers/grok-bots/aqua_position.js).
- **Not a 1inch prize entry:** no Aqua app, SwapVM strategy shipped, or
  onchain token transfer. The three selected sponsor families remain World,
  Uniswap Foundation, and ENS.

## Event-time and AI attribution

Before hacking began, Itonami already had Bots, an x402 challenge validator,
spending caps, a delegated signer boundary, and a simulated loan-position
ledger. During ETHGlobal Tokyo 2026, the team added the Intercepta risk
adapter, Uniswap quote and unsigned plan, World OIDC adapter and action gate,
ENSv2 preflight and registration planner, 1inch Aqua reader, public demo,
and tests. The private integration is in
[draft PR #677](https://github.com/network-awai/cloud-itonami/pull/677)
(access restricted); the event-time standalone modules and reproducible tests
are in this public repository.

Codex assisted with the event-time implementation, tests, and documentation.
The concept, prize priorities, and direction came from the project owner.
The AI-produced work was reviewed through focused tests, Wrangler deployment,
and live read-only browser/API checks. The signed transactions and sponsor
integrations listed as incomplete above were not generated or claimed.
