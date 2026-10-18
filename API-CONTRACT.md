# Scrum Poker integration contract

Stable shared module: `shared/types.ts` (types and deck constants; no runtime server imports).

## HTTP

All routes `/api`. JSON errors `{ error: string }`, HTTP 400/401/403/404/409/413/429/500/503. No CORS. Bearer capability in `Authorization: Bearer <token>` for ALL room reads, commands and SSE. Never token URLs. Create/join return a new identity once; store per-room identity in browser localStorage (handle unavailable storage). Room IDs are random 32 lowercase hex characters. No unauthenticated room metadata endpoint.

- `POST /api/rooms` body `{name, title, stories: string[]}` → 201 `Admission`
- `POST /api/rooms/:id/join` body `{name}` → 201 `Admission`. Duplicate names create distinct participants, never replace identities.
- `GET /api/rooms/:id` → `RoomSnapshot`
- `POST /api/rooms/:id/commands` body `Command` → `RoomSnapshot`
- `GET /api/rooms/:id/events` → fetch-authenticated SSE. `event: snapshot` / JSON `RoomSnapshot` immediately and after changes; `event: heartbeat` every 15s; `event: expired` ends expired streams; `event: stream-error` with `{error}` ends unavailable streams. Abort fetch to disconnect. HTTP errors possible before stream; process stream-error too.

Commands always include `{roundId: string, revision: number}` from current snapshot. Types: `{type:'vote', estimate: Estimate}`, `{type:'reveal'}`, `{type:'reset'}`, `{type:'finalize', score: Score}`. Stale guard → 409, refresh latest snapshot and ask user to retry (do not silently replay transitions). Only facilitator may reveal/reset/finalize. All participants including facilitator vote through same command. Reset invalidates roundId and clears votes. Finalize only revealed; advances next story automatically, or completes.

## Shared exports (exact)

```ts
export const DECK = ['0','½','1','2','3','5','8','13','21','?'] as const;
export const SCORES = ['0','½','1','2','3','5','8','13','21'] as const;
export type Estimate = typeof DECK[number];
export type Score = typeof SCORES[number];
export interface Story { id: string; title: string; score: Score | null }
export interface PublicParticipant {
  id: string; name: string; facilitator: boolean; online: boolean;
  hasVoted: boolean; estimate?: Estimate;
}
export interface RoomSnapshot {
  id: string; title: string; revision: number; version: number; roundId: string;
  phase: 'voting'|'revealed'|'completed'; currentStory: number;
  stories: Story[]; participants: PublicParticipant[];
  self: {id: string; facilitator: boolean; vote: Estimate|null};
  expiresAt: number;
}
export interface Identity {token: string; participantId: string}
export interface Admission {identity: Identity; room: RoomSnapshot}
export type Command = {roundId:string; revision:number} & (
  {type:'vote';estimate:Estimate}|{type:'reveal'}|{type:'reset'}|{type:'finalize';score:Score}
);
```

`currentStory` is zero-based; equals stories.length when completed. `version` orders delivery snapshots (ignore older versions); `revision` guards persisted mutations. Presence may update version without revision. Never expose other votes until phase revealed; self.vote is private in all projections. Finalized story score is public; prior per-person votes cleared. No tokens/hashes in snapshots.

## Toolchain / limits

Bun 1.4.2, React 19, Vite 8, TypeScript. Scripts: `bun run dev` backend watch :3001; `bun run dev:web` Vite :5173 with /api proxy; `bun run build`; `bun start` built SPA + API :3001; `bun test tests/server.test.ts`; `bun run test:ui` Vitest; `bun run typecheck`.

Max name 60, title 120, story 500 chars; 1–100 stories; 50 people; 7-day fixed room expiry; 64KiB body. Bound SSE tabs (5 per person, 160 per room, 2000 server). Native controls / numeric deck finalize. CSV formula defense belongs frontend: neutralize cells starting with whitespace/control then = + - @ (and initial tab/CR/LF), quote/escape every field. No simultaneous connected polling + SSE. Reconnect snapshot; fallback polling only while disconnected, abort timers/requests on cleanup; no query token.

Production `PUBLIC_ORIGIN=https://your-host` configures expected Origin; dev default request origin (Vite proxy keeps localhost origin via config). Reject Origin null/hostile and Sec-Fetch-Site cross-site. No secrets in logs. Static production assets are restricted to `/assets/*` JS/CSS/font/image files and `/favicon.svg`; no database, dotfile, backup, source, or arbitrary public-file serving. Use a self-hosted font package; production CSP disallows inline styles/scripts, external fonts, and remote requests.

Implementation status: installed and running API watch :3001 + Vite :5173. Vitest discovers `src/**/*.test.tsx` and `tests/**/*.test.tsx`; import `@testing-library/jest-dom/vitest` directly in tests (no setupFiles). `bun audit` reports no vulnerabilities across 155 packages. Server suite currently 20 passing tests / 466 assertions.
