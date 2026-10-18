# Security

## Deployment boundary

Run a single Bun server behind HTTPS on one origin. Set `PUBLIC_ORIGIN` to its exact public origin; do not add permissive CORS. Origin `null`, mismatched Origin and cross-site browser requests are rejected. Nonbrowser clients without Origin may call the API but still need the bearer capability for every room read, command and stream. No cookies carry authority, so a browser cannot attach ambient room credentials to a cross-site form submission. The development Vite proxy is for trusted local use, not public deployment.

Room links permit joining, not administration. Display names are unverified and can repeat. Each participant receives a random 256-bit bearer capability; the facilitator has a role on the same kind of identity. Only SHA-256 hashes are persisted, and hashes cannot be used as bearer tokens. Capabilities must never be put in URLs, logs, analytics, screenshots, or public snapshots. Browser localStorage retains identities: an XSS or compromised same-origin script could read them. There is no recovery, revocation UI, or protection from a person sharing their own capability. Treat a compromised facilitator capability as a compromised room and create a new room.

Only caller-specific projections leave the server. Before reveal, another person's estimate is omitted from HTTP and SSE payloads, including facilitator payloads. Estimates are not encrypted at rest: server operators, database readers and backups can access them. Do not use this app for secrets or regulated information without a separate assessment.

## Implemented controls

- Server-generated random room IDs; strict Zod schemas; explicit commands; participant/facilitator authorization; round and revision guards on all mutations.
- Prepared SQLite statements, full synchronous WAL transactions, success/event delivery only after commit. The entrypoint uses umask `077`, creates private data directories and sets the database to `0600`. Keep its volume, WAL/SHM files and backups private. Do not put persistence under `dist`.
- Production static serving restricts routes and file types; databases, backups, dotfiles and source files are not served. A self-only CSP, anti-framing, no-referrer, no-sniff and browser permissions headers cover production responses. Application code is not served through the development server in production.
- Fixed seven-day expiry, access-time enforcement, periodic cleanup and stream closure. Presence counts connections, not just people; aborts and heartbeats release disconnected streams.
- 64 KiB request bodies; 100 stories of at most 500 characters; 50 participants; 10,000 stored rooms. Streams: 5/person, 160/room, 2,000/server; bounded queued event writes.
- Per direct peer IP / minute: 10 create, 60 join, 1,000 command, 1,200 read/stream-open requests. Commands also have a 90/minute capability limit. Counters expire after a minute; the counter map is capped at 20,000 entries. Rejected attempts consume capacity too. Forwarded IP headers are deliberately not trusted; behind a proxy all visitors can share its limits. These are basic bounds, not a DDoS defense. Add edge limits and connection/body timeouts for an internet-facing deployment.
- Generic internal error responses omit stack traces, SQL details and private input. The app does not log requests or capabilities. Configure proxies to redact Authorization and avoid body logging.
- CSV export quotes fields and neutralizes spreadsheet formula prefixes and leading control characters. CSV consumers still control interpretation; validate exported files before automation.

## Verification and advisories

`bun test tests/server.test.ts` covers authorization on reads/commands/SSE, cross-room isolation, private HTTP/SSE bytes (including reconnects), stale and concurrent transitions, persistence failure, fresh SQLite connections, expiry, origin policy, limits and restricted static routes. Frontend tests cover workflow and CSV behavior. These are regression tests, not a penetration test or guarantee against vulnerabilities.

Dependency check executed during this rebuild: `bun audit` with Bun **1.4.2**, reporting **no vulnerabilities found (155 packages checked)**. No unresolved advisories were reported by that execution. Re-run against the current lockfile before deploying; the result is time-dependent and does not audit application logic or the Bun runtime.

## Reporting

Report suspected vulnerabilities privately to the repository owner using the hosting platform's private vulnerability reporting feature when available. Otherwise contact the owner privately before opening an issue. Include affected version, minimal reproduction, expected authorization boundary, and impact. Do not publish live room links, capabilities, participant data or exploit payloads containing secrets.
