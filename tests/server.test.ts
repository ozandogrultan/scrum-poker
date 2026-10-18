import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RoomService } from '../server/service';
import { createApp } from '../server/app';
import type { Admission, Command, Estimate, RoomSnapshot } from '../shared/types';

const services: RoomService[] = [];
const dirs: string[] = [];
afterEach(() => { for (const service of services.splice(0)) service.close(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup(now?: () => number) {
  const service = new RoomService(':memory:', now); services.push(service);
  const app = createApp(service, { now });
  const request = (path: string, method = 'GET', token?: string, body?: unknown, headers: Record<string, string> = {}) => app.request(`http://localhost${path}`, {
    method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const create = async (stories = ['First story', 'Second story'], name = 'Owner') => {
    const response = await request('/api/rooms', 'POST', undefined, { name, title: 'Planning', stories });
    expect(response.status).toBe(201); return await response.json() as Admission;
  };
  const joinRoom = async (room: Admission, name = 'Participant') => {
    const response = await request(`/api/rooms/${room.room.id}/join`, 'POST', undefined, { name });
    expect(response.status).toBe(201); return await response.json() as Admission;
  };
  const snapshot = (room: Admission) => service.snapshot(room.room.id, room.identity.token);
  const command = async (actor: Admission, payload: object, guard = snapshot(actor)) => request(`/api/rooms/${actor.room.id}/commands`, 'POST', actor.identity.token, { roundId: guard.roundId, revision: guard.revision, ...payload });
  return { service, app, request, create, joinRoom, snapshot, command };
}
function openStream(app: ReturnType<typeof createApp>, room: Admission) {
  const controller = new AbortController();
  const response = app.request(`http://localhost/api/rooms/${room.room.id}/events`, { signal: controller.signal, headers: { Authorization: `Bearer ${room.identity.token}` } });
  return { controller, response };
}
async function readFrame(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const value = await reader.read();
  expect(value.done).toBe(false);
  return new TextDecoder().decode(value.value);
}
const dataFrom = (frame: string) => JSON.parse(frame.match(/data: (.+)/)![1]) as RoomSnapshot;

describe('authoritative room transitions', () => {
  test('random rooms and duplicate participant names never overwrite identities', async () => {
    const s = setup(); const owner = await s.create(); const other = await s.create();
    const a = await s.joinRoom(owner, 'Owner'); const b = await s.joinRoom(owner, 'Owner');
    expect(owner.room.id).toMatch(/^[a-f0-9]{32}$/); expect(owner.room.id).not.toBe(other.room.id);
    expect(new Set([owner.identity.participantId, a.identity.participantId, b.identity.participantId]).size).toBe(3);
    expect(s.snapshot(owner).participants.filter((p) => p.facilitator)).toHaveLength(1);
    expect(s.snapshot(owner).participants).toHaveLength(3);
  });
  test('facilitator and participants persist mutable votes; reveal early; finalize advances and completes', async () => {
    const s = setup(); const owner = await s.create(); const a = await s.joinRoom(owner); await s.joinRoom(owner, 'Away');
    expect((await s.command(owner, { type: 'finalize', score: '3' })).status).toBe(409);
    for (const estimate of ['1', '8']) expect((await s.command(owner, { type: 'vote', estimate })).status).toBe(200);
    expect((await s.command(a, { type: 'vote', estimate: '5' })).status).toBe(200);
    expect(s.snapshot(owner).self.vote).toBe('8');
    expect((await s.command(owner, { type: 'reveal' })).status).toBe(200);
    expect(s.snapshot(a).participants.map((p) => p.estimate)).toEqual(['8', '5', undefined]);
    expect((await s.command(a, { type: 'vote', estimate: '2' })).status).toBe(409);
    expect((await s.command(owner, { type: 'finalize', score: '5' })).status).toBe(200);
    expect(s.snapshot(owner).currentStory).toBe(1); expect(s.snapshot(owner).phase).toBe('voting');
    expect(s.snapshot(owner).participants.every((p) => !p.hasVoted && !('estimate' in p))).toBe(true);
    expect(s.snapshot(owner).self.vote).toBeNull(); expect(s.snapshot(owner).stories[0].score).toBe('5');
    await s.command(owner, { type: 'reveal' }); await s.command(owner, { type: 'finalize', score: '½' });
    expect(s.snapshot(owner).phase).toBe('completed'); expect(s.snapshot(owner).currentStory).toBe(2);
    for (const payload of [{ type: 'vote', estimate: '3' }, { type: 'reset' }, { type: 'reveal' }, { type: 'finalize', score: '3' }]) expect((await s.command(owner, payload)).status).toBe(409);
    expect((await s.request(`/api/rooms/${owner.room.id}/join`, 'POST', undefined, { name: 'Late' })).status).toBe(409);
  });
  test('same-story reset invalidates every stale command, including stale resets with new revision', async () => {
    const s = setup(); const owner = await s.create();
    await s.command(owner, { type: 'vote', estimate: '13' }); const old = s.snapshot(owner);
    await s.command(owner, { type: 'reset' }); const current = s.snapshot(owner);
    expect(current.roundId).not.toBe(old.roundId); expect(current.currentStory).toBe(old.currentStory);
    expect(current.self.vote).toBeNull(); expect(current.participants[0].hasVoted).toBe(false);
    for (const payload of [{ type: 'vote', estimate: '3' }, { type: 'reset' }, { type: 'reveal' }, { type: 'finalize', score: '3' }]) {
      expect((await s.command(owner, payload, old)).status).toBe(409);
      expect((await s.command(owner, payload, { ...old, revision: current.revision })).status).toBe(409);
    }
    expect((await s.command(owner, { type: 'vote', estimate: '2' })).status).toBe(200);
  });
  test('concurrent revision-guarded transitions are acknowledged exactly once', async () => {
    const s = setup(); const owner = await s.create(); const guard = s.snapshot(owner);
    const results = await Promise.all([s.command(owner, { type: 'reveal' }, guard), s.command(owner, { type: 'reveal' }, guard)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const revealed = s.snapshot(owner);
    const final = await Promise.all([s.command(owner, { type: 'finalize', score: '3' }, revealed), s.command(owner, { type: 'finalize', score: '8' }, revealed)]);
    expect(final.map((r) => r.status).sort()).toEqual([200, 409]); expect(s.snapshot(owner).currentStory).toBe(1);
  });
});

describe('capabilities, projection privacy, and isolation', () => {
  test('missing, forged, hash-as-bearer and cross-room capabilities fail ALL reads, streams and commands', async () => {
    const s = setup(); const owner = await s.create(); const alien = await s.create();
    const hashed = createHash('sha256').update(owner.identity.token).digest('hex');
    const paths = ['', '/events', '/commands'];
    for (const bad of [undefined, 'a'.repeat(43), hashed, alien.identity.token]) {
      for (const suffix of paths) {
        const response = await s.request(`/api/rooms/${owner.room.id}${suffix}`, suffix === '/commands' ? 'POST' : 'GET', bad, suffix === '/commands' ? { type: 'reset', roundId: owner.room.roundId, revision: 0 } : undefined);
        expect(response.status).toBe(401); expect(response.headers.get('content-type')).toContain('application/json');
      }
      for (const payload of [{ type: 'vote', estimate: '3' }, { type: 'reveal' }, { type: 'reset' }, { type: 'finalize', score: '3' }]) {
        expect((await s.request(`/api/rooms/${owner.room.id}/commands`, 'POST', bad, { ...payload, roundId: owner.room.roundId, revision: 0 })).status).toBe(401);
      }
    }
    expect((await s.request(`/api/rooms/${owner.room.id}?token=${owner.identity.token}`)).status).toBe(401);
  });
  test('participant can read own snapshot/SSE and vote but cannot manage any round', async () => {
    const s = setup(); const owner = await s.create(); const a = await s.joinRoom(owner);
    for (const payload of [{ type: 'reveal' }, { type: 'reset' }, { type: 'finalize', score: '3' }]) expect((await s.command(a, payload)).status).toBe(403);
    expect((await s.command(a, { type: 'vote', estimate: '?' })).status).toBe(200);
    expect((await s.request(`/api/rooms/${owner.room.id}`, 'GET', a.identity.token)).status).toBe(200);
    const stream = openStream(s.app, a); const response = await stream.response; expect(response.status).toBe(200);
    const reader = response.body!.getReader(); expect(dataFrom(await readFrame(reader)).self.id).toBe(a.identity.participantId);
    stream.controller.abort(); await reader.cancel();
  });
  test('actual HTTP and SSE bytes before reveal expose only own vote, including reconnect snapshots', async () => {
    const s = setup(); const owner = await s.create(); const a = await s.joinRoom(owner, 'A'); const b = await s.joinRoom(owner, 'B');
    const actors = [owner, a, b]; const votes: Estimate[] = ['13', '21', '8'];
    for (let i = 0; i < actors.length; i++) await s.command(actors[i], { type: 'vote', estimate: votes[i] });
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i];
      const response = await s.request(`/api/rooms/${owner.room.id}`, 'GET', actor.identity.token);
      const text = await response.text(); const room = JSON.parse(text) as RoomSnapshot;
      expect(room.self.vote).toBe(votes[i]); expect(room.participants.every((p) => !('estimate' in p) && p.hasVoted)).toBe(true);
      expect(text).not.toContain('hash'); expect(text).not.toContain('token');
      for (const person of actors) expect(text).not.toContain(person.identity.token);
      for (let reconnect = 0; reconnect < 2; reconnect++) {
        const stream = openStream(s.app, actor); const response = await stream.response; const reader = response.body!.getReader();
        const wire = await readFrame(reader); const snapshot = dataFrom(wire);
        expect(snapshot.self.vote).toBe(votes[i]); expect(snapshot.participants.every((p) => !('estimate' in p))).toBe(true);
        for (let j = 0; j < votes.length; j++) if (j !== i) expect(wire).not.toContain(`"${votes[j]}"`);
        for (const person of actors) expect(wire).not.toContain(person.identity.token);
        stream.controller.abort(); await reader.cancel();
      }
    }
    await s.command(owner, { type: 'reveal' });
    const revealed = await s.request(`/api/rooms/${owner.room.id}`, 'GET', b.identity.token);
    expect((await revealed.json() as RoomSnapshot).participants.map((p) => p.estimate)).toEqual(votes);
  });
  test('SSE updates are per-viewer projections, full reconnect snapshots, and count multiple tabs correctly', async () => {
    const s = setup(); const owner = await s.create(); const a = await s.joinRoom(owner);
    const one = openStream(s.app, owner); const r1 = (await one.response).body!.getReader(); await readFrame(r1);
    const two = openStream(s.app, owner); const r2 = (await two.response).body!.getReader(); await readFrame(r2); await readFrame(r1);
    expect(s.snapshot(a).participants[0].online).toBe(true);
    one.controller.abort(); await r1.cancel(); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(s.snapshot(a).participants[0].online).toBe(true);
    two.controller.abort(); await r2.cancel(); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(s.snapshot(a).participants[0].online).toBe(false);
    await s.command(a, { type: 'vote', estimate: '21' });
    const three = openStream(s.app, owner); const r3 = (await three.response).body!.getReader(); const reconnect = dataFrom(await readFrame(r3));
    expect(reconnect.participants[1].hasVoted).toBe(true); expect(reconnect.participants[1].estimate).toBeUndefined();
    expect(reconnect.version).toBeGreaterThan(owner.room.version);
    three.controller.abort(); await r3.cancel();
  });
  test('strict request schemas reject impersonation, whole-state replacement and arbitrary final scores', async () => {
    const s = setup(); const owner = await s.create(); const a = await s.joinRoom(owner);
    for (const extra of [{ participantId: owner.identity.participantId }, { facilitator: true }, { stories: [] }, { sessionId: 'overwritten' }]) {
      expect((await s.command(a, { type: 'vote', estimate: '3', ...extra })).status).toBe(400);
    }
    expect((await s.command(owner, { type: 'finalize', score: '=IMPORTXML()' })).status).toBe(400);
    expect((await s.command(owner, { type: 'finalize', score: '?' })).status).toBe(400);
    expect((await s.command(owner, { type: 'vote', estimate: '999' })).status).toBe(400);
    expect((await s.request(`/api/rooms/${owner.room.id}`, 'PUT', undefined, { stories: [] })).status).toBe(404);
  });
  test('live stream updates hide estimates until reveal, then reset removes them from all viewers', async () => {
    const s = setup(); const owner = await s.create(); const a = await s.joinRoom(owner, 'A'); const b = await s.joinRoom(owner, 'B');
    const actors = [owner, a, b]; const streams = actors.map((actor) => openStream(s.app, actor));
    const readers = await Promise.all(streams.map(async (stream) => (await stream.response).body!.getReader()));
    // Opening another stream broadcasts presence to already connected viewers.
    for (let i = 0; i < readers.length; i++) for (let j = i; j < readers.length; j++) await readFrame(readers[i]);
    await s.command(a, { type: 'vote', estimate: '21' });
    for (let i = 0; i < readers.length; i++) {
      const frame = await readFrame(readers[i]); const snapshot = dataFrom(frame);
      expect(snapshot.participants.every((p) => !('estimate' in p))).toBe(true);
      expect(snapshot.self.vote).toBe(i === 1 ? '21' : null);
      if (i !== 1) expect(frame).not.toContain('"21"');
    }
    await s.command(owner, { type: 'reveal' });
    for (const reader of readers) expect(dataFrom(await readFrame(reader)).participants[1].estimate).toBe('21');
    await s.command(owner, { type: 'reset' });
    for (const reader of readers) {
      const snapshot = dataFrom(await readFrame(reader));
      expect(snapshot.self.vote).toBeNull(); expect(snapshot.participants.every((p) => !('estimate' in p) && !p.hasVoted)).toBe(true);
    }
    for (let i = 0; i < streams.length; i++) { streams[i].controller.abort(); await readers[i].cancel(); }
  });
});

describe('durability and failure behavior', () => {
  test('fresh SQLite connection restores persisted identity, votes, reset, reveal and final scores', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scrum-poker-')); dirs.push(dir); const path = join(dir, 'db.sqlite');
    let service = new RoomService(path); const owner = service.create({ name: 'Owner', title: 'Durable', stories: ['One', 'Two'] });
    const participant = service.join(owner.room.id, 'A');
    const run = (actor: Admission, payload: object) => {
      const current = service.snapshot(owner.room.id, actor.identity.token);
      return service.command(owner.room.id, actor.identity.token, { ...payload, roundId: current.roundId, revision: current.revision } as Command);
    };
    run(participant, { type: 'vote', estimate: '13' }); service.close();
    expect(readFileSync(path).includes(Buffer.from(participant.identity.token))).toBe(false);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    service = new RoomService(path); expect(service.snapshot(owner.room.id, participant.identity.token).self.vote).toBe('13');
    run(owner, { type: 'reset' }); service.close(); service = new RoomService(path);
    expect(service.snapshot(owner.room.id, participant.identity.token).self.vote).toBeNull();
    run(owner, { type: 'vote', estimate: '5' }); run(owner, { type: 'reveal' }); service.close(); service = new RoomService(path);
    expect(service.snapshot(owner.room.id, participant.identity.token).participants[0].estimate).toBe('5');
    run(owner, { type: 'finalize', score: '8' }); service.close(); service = new RoomService(path); services.push(service);
    const current = service.snapshot(owner.room.id, owner.identity.token);
    expect(current.stories[0].score).toBe('8'); expect(current.currentStory).toBe(1); expect(current.phase).toBe('voting');
    expect(current.participants.every((p) => !p.online)).toBe(true);
    const stored = service.db.query('SELECT state FROM rooms').get() as { state: string };
    const hashes = JSON.parse(stored.state).members.map((p: { hash: string }) => p.hash);
    expect(hashes).toContain(createHash('sha256').update(owner.identity.token).digest('hex'));
    expect(() => service.snapshot(owner.room.id, hashes[0])).toThrow();
  });
  test('persistence failure sends neither success nor mutation broadcast and rolls back', async () => {
    const s = setup(); const owner = await s.create(); const received: (RoomSnapshot | null)[] = [];
    const close = s.service.watch(owner.room.id, owner.identity.token, (snapshot) => received.push(snapshot));
    const initial = s.snapshot(owner); const messages = received.length;
    s.service.db.exec('PRAGMA query_only = ON');
    const response = await s.command(owner, { type: 'vote', estimate: '13' });
    expect(response.status).toBe(500); expect(await response.text()).not.toContain('SQLITE');
    expect(s.snapshot(owner).self.vote).toBeNull(); expect(s.snapshot(owner).revision).toBe(initial.revision);
    expect(received).toHaveLength(messages);
    s.service.db.exec('PRAGMA query_only = OFF'); close();
  });
  test('expiration is enforced at access time and active SSE receives expiry then closes', async () => {
    let time = 1000; const s = setup(() => time); const owner = await s.create();
    const stream = openStream(s.app, owner); const reader = (await stream.response).body!.getReader(); await readFrame(reader);
    time = owner.room.expiresAt;
    expect((await s.request(`/api/rooms/${owner.room.id}`, 'GET', owner.identity.token)).status).toBe(404);
    expect(await readFrame(reader)).toContain('event: expired'); expect((await reader.read()).done).toBe(true);
    expect((s.service.db.query('SELECT count(*) AS n FROM rooms').get() as { n: number }).n).toBe(0);
    expect((await s.request(`/api/rooms/${owner.room.id}/join`, 'POST', undefined, { name: 'New' })).status).toBe(404);
  });
});

describe('bounded attack surface', () => {
  test('hostile/null Origin and cross-site requests are rejected, same-origin and nonbrowser are allowed', async () => {
    const s = setup(); const owner = await s.create();
    for (const Origin of ['null', 'https://evil.example', 'http://localhost.evil.example']) {
      expect((await s.request('/api/rooms', 'POST', undefined, { name: 'A', title: 'X', stories: ['Y'] }, { Origin })).status).toBe(403);
      expect((await s.request(`/api/rooms/${owner.room.id}/join`, 'POST', undefined, { name: 'X' }, { Origin })).status).toBe(403);
      expect((await s.request(`/api/rooms/${owner.room.id}/commands`, 'POST', owner.identity.token, { type: 'reset', roundId: owner.room.roundId, revision: 0 }, { Origin })).status).toBe(403);
      expect((await s.request(`/api/rooms/${owner.room.id}/events`, 'GET', owner.identity.token, undefined, { Origin })).status).toBe(403);
    }
    const good = await s.request(`/api/rooms/${owner.room.id}`, 'GET', owner.identity.token, undefined, { Origin: 'http://localhost' });
    expect(good.status).toBe(200); expect(good.headers.get('access-control-allow-origin')).toBeNull();
    expect((await s.request(`/api/rooms/${owner.room.id}`, 'GET', owner.identity.token, undefined, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
  });
  test('body bytes, text sizes, story counts and participant counts are bounded', async () => {
    const s = setup();
    for (const input of [{ name: '', title: 'A', stories: ['B'] }, { name: 'a'.repeat(61), title: 'A', stories: ['B'] }, { name: 'A', title: 'b'.repeat(121), stories: ['B'] }, { name: 'A', title: 'B', stories: [] }, { name: 'A', title: 'B', stories: Array(101).fill('Story') }, { name: 'A', title: 'B', stories: ['x'.repeat(501)] }]) {
      expect((await s.request('/api/rooms', 'POST', undefined, input)).status).toBe(400);
    }
    expect((await s.request('/api/rooms', 'POST', undefined, { name: 'A', title: 'B', stories: ['x'.repeat(70000)] })).status).toBe(413);
    const owner = await s.create(); for (let i = 0; i < 49; i++) await s.joinRoom(owner, `P${i}`);
    expect((await s.request(`/api/rooms/${owner.room.id}/join`, 'POST', undefined, { name: 'Overflow' })).status).toBe(409);
  });
  test('room quota is enforced without accepting attacker-chosen IDs', () => {
    const s = setup(); const room = s.service.create({ name: 'A', title: 'B', stories: ['C'] });
    const raw = (s.service.db.query('SELECT state FROM rooms').get() as { state: string }).state;
    const insert = s.service.db.query('INSERT INTO rooms VALUES (?, ?, ?)');
    s.service.db.transaction(() => { for (let i = 1; i < 10000; i++) insert.run(`quota-${i}`, room.room.expiresAt, raw); })();
    expect(() => s.service.create({ name: 'A', title: 'B', stories: ['C'] })).toThrow('capacity');
  });
  test('SSE person and room quotas are bounded and release capacity after disconnect', async () => {
    const s = setup(); const owner = await s.create();
    const closers: (() => void)[] = [];
    for (let i = 0; i < 5; i++) closers.push(s.service.watch(owner.room.id, owner.identity.token, () => {}));
    expect(() => s.service.watch(owner.room.id, owner.identity.token, () => {})).toThrow('Too many');
    closers.pop()!(); closers.push(s.service.watch(owner.room.id, owner.identity.token, () => {}));
    for (let p = 0; p < 31; p++) {
      const person = s.service.join(owner.room.id, `Person ${p}`);
      for (let i = 0; i < 5; i++) closers.push(s.service.watch(owner.room.id, person.identity.token, () => {}));
    }
    const extra = s.service.join(owner.room.id, 'Extra'); expect(() => s.service.watch(owner.room.id, extra.identity.token, () => {})).toThrow('Too many');
    closers.forEach((close) => close());
    const close = s.service.watch(owner.room.id, extra.identity.token, () => {}); close();
  });
  test('global SSE quota is bounded across rooms', () => {
    const s = setup(); const closers: (() => void)[] = [];
    for (let roomIndex = 0; roomIndex < 13; roomIndex++) {
      const owner = s.service.create({ name: 'Owner', title: 'Capacity', stories: ['Story'] });
      for (let personIndex = 0; personIndex < 32; personIndex++) {
        const person = personIndex ? s.service.join(owner.room.id, `P${personIndex}`) : owner;
        for (let tab = 0; tab < 5; tab++) {
          if (closers.length === 2000) {
            expect(() => s.service.watch(owner.room.id, person.identity.token, () => {})).toThrow('Too many');
            closers.forEach((close) => close()); return;
          }
          closers.push(s.service.watch(owner.room.id, person.identity.token, () => {}));
        }
      }
    }
    throw new Error('Quota test did not reach capacity');
  });
  test('create/join/vote limits return retry hints and recover after bounded window', async () => {
    let time = 0; const s = setup(() => time); const owner = await s.create();
    for (let i = 1; i < 10; i++) await s.create();
    let limited = await s.request('/api/rooms', 'POST', undefined, { name: 'A', title: 'B', stories: ['C'] });
    expect(limited.status).toBe(429); expect(limited.headers.get('retry-after')).toBe('60');
    time += 60001; expect((await s.request('/api/rooms', 'POST', undefined, { name: 'A', title: 'B', stories: ['C'] })).status).toBe(201);
    for (let i = 0; i < 60; i++) await s.request(`/api/rooms/${'f'.repeat(32)}/join`, 'POST', undefined, { name: 'A' });
    expect((await s.request(`/api/rooms/${owner.room.id}/join`, 'POST', undefined, { name: 'A' })).status).toBe(429);
    for (let i = 0; i < 90; i++) expect((await s.command(owner, { type: 'vote', estimate: '3' })).status).toBe(200);
    limited = await s.command(owner, { type: 'vote', estimate: '5' }); expect(limited.status).toBe(429);
    time += 60001; expect((await s.command(owner, { type: 'vote', estimate: '5' })).status).toBe(200);
  });
  test('security headers are present; static serving excludes databases, backups, dotfiles and traversal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scrum-poker-static-')); dirs.push(dir);
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Scrum Poker</title>');
    writeFileSync(join(dir, 'secret.sqlite'), 'private database'); writeFileSync(join(dir, '.backup'), 'private');
    const s = setup(); const app = createApp(s.service, { assets: dir });
    const response = await app.request('http://localhost/');
    expect(response.status).toBe(200); expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff'); expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    for (const path of ['/secret.sqlite', '/secret.sqlite-wal', '/.backup', '/.data/db.sqlite', '/server/service.ts', '/assets/../../secret.sqlite', '/assets/%2e%2e/secret.sqlite', '/index.html', '/api/unknown']) {
      const result = await app.request(`http://localhost${path}`); expect(result.status).toBe(404); expect(await result.text()).not.toContain('private');
    }
  });
});
