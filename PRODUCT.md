# Scrum Poker

## Product

Scrum Poker is a small, synchronous estimation worksheet for a team discussing a prepared story list. Its primary surface is the working room—not a dashboard or marketing page. The facilitator participates in the same private voting process as everyone else, reveals the estimates when ready, and records the agreed score.

## Workflow

1. Create a session with facilitator name, title, and one story per line. Empty lines are discarded by the form.
2. Share the random `/rooms/:id` link. Invitees join with a display name; matching names never reuse or replace an existing identity.
3. Select or change a private estimate. Teammates see only whether a person has voted. The caller sees their own saved estimate.
4. The facilitator reveals at any time, including when someone is away. The distribution and individual estimates become visible to all room members.
5. Discuss, then choose a final score from the numeric deck. Finalizing advances to the next story automatically.
6. Reset the current story if another private round is useful. Reset changes the round ID, invalidates old requests, and removes all votes.
7. Complete the list and export the agreed story scores as formula-safe CSV.

## Identities and connectivity

Room membership is represented by a server-generated, per-person bearer capability. The browser saves its room identity locally for reloads. All tabs in the same browser profile share that identity; stream counts keep someone online while any of their tabs remain connected. Storage failures are surfaced rather than promising recovery. Facilitator access cannot be recreated from a name or room link.

Authenticated fetch SSE provides full caller-specific snapshots and heartbeats. Disconnected clients use fallback reads and reconnect; they do not continuously poll alongside a healthy stream. Snapshot versions reject older deliveries. Mutation revisions and round IDs reject stale requests; users review refreshed state before retrying. Network or clipboard failures are reported with recovery actions.

## State and architecture

One Bun process runs Hono, serves the production Vite SPA, and owns SQLite plus live stream fan-out. Durable snapshots use synchronous atomic SQLite transactions; room state is never replaced by a client-provided story array. The backend is authoritative for voting, reveal, reset, finalization, permissions and expiry. Public/shared types are in `shared/types.ts`; integration details are in `API-CONTRACT.md`.

The client uses React 19, TypeScript, native form controls, self-hosted typography and a responsive worksheet layout: story progress, the current story / estimate deck, and team presence. There is one unified room surface for both roles. Role-specific management controls are separate from the shared voting task.

## Limits and non-goals

- Fixed Fibonacci-style deck: `0, ½, 1, 2, 3, 5, 8, 13, 21, ?`. Final score must be numeric.
- 1–100 stories, 500 characters per story, 50 members, 60-character names, 120-character titles, 64 KiB request body.
- Fixed seven-day room life; 10,000-room storage cap. Members can revisit a completed room until it expires; completed rooms reject new members.
- Five simultaneous streams per person, 160 per room, 2,000 total; bounded per-minute create/join/command/read rates.
- No accounts, verified names, facilitator recovery/transfer, member deletion, story editing after creation, or retrospective individual-vote history.
- No multi-process fan-out, cloud dependencies, deployment orchestration, or migration of anonymous legacy sessions. The rebuilt schema is separate from the obsolete legacy server storage.

## Verification

Server/security regressions run with Bun; React interactions and CSV safety run with Vitest and Testing Library. TypeScript and production bundling are separate checks. Dependency advisories are checked by `bun audit`. UI/browser inspection remains a separate verification step; none of these checks imply a security certification.
