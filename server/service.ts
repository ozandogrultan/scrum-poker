import { Database } from 'bun:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Admission, Command, Estimate, RoomSnapshot, Story } from '../shared/types';

export class Problem extends Error {
  constructor(public status: number, message: string) { super(message); }
}
interface Member { id: string; name: string; facilitator: boolean; hash: string; vote: Estimate | null }
interface Room {
  id: string; title: string; revision: number; roundId: string;
  phase: RoomSnapshot['phase']; currentStory: number; stories: Story[];
  members: Member[]; expiresAt: number;
}
type Listener = { memberId: string; send: (snapshot: RoomSnapshot | null, reason?: 'unavailable') => void };
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const ROOM_TTL = 7 * 24 * 60 * 60 * 1000;

export class RoomService {
  readonly db: Database;
  private listeners = new Map<string, Set<Listener>>();
  private versions = new Map<string, number>();
  private clock = Date.now() * 1000;
  constructor(path = ':memory:', private now = () => Date.now()) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path, { create: true, strict: true });
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, state TEXT NOT NULL); CREATE INDEX IF NOT EXISTS rooms_expiry ON rooms(expires_at)');
  }
  private read(id: string): Room {
    const row = this.db.query('SELECT state FROM rooms WHERE id = ?').get(id) as { state: string } | null;
    if (!row) throw new Problem(404, 'This room is unavailable or has expired.');
    const room = JSON.parse(row.state) as Room;
    if (room.expiresAt <= this.now()) {
      this.expire(id);
      throw new Problem(404, 'This room is unavailable or has expired.');
    }
    return room;
  }
  private save(room: Room) {
    this.db.query('INSERT INTO rooms (id, expires_at, state) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at, state=excluded.state').run(room.id, room.expiresAt, JSON.stringify(room));
  }
  private member(room: Room, token: string): Member {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Problem(401, 'Your room identity is missing or invalid. Join this room again.');
    const member = room.members.find((entry) => entry.hash === hash(token));
    if (!member) throw new Problem(401, 'Your room identity is missing or invalid. Join this room again.');
    return member;
  }
  private newMember(name: string, facilitator: boolean) {
    const token = randomBytes(32).toString('base64url');
    return { member: { id: randomUUID(), name, facilitator, hash: hash(token), vote: null } satisfies Member, token };
  }
  create(input: { name: string; title: string; stories: string[] }): Admission {
    const count = this.db.query('SELECT count(*) AS total FROM rooms').get() as { total: number };
    if (count.total >= 10000) throw new Problem(503, 'Room capacity reached. Please try again later.');
    const { member, token } = this.newMember(input.name, true);
    const room: Room = { id: randomBytes(16).toString('hex'), title: input.title, revision: 0, roundId: randomUUID(), phase: 'voting', currentStory: 0, stories: input.stories.map((title) => ({ id: randomUUID(), title, score: null })), members: [member], expiresAt: this.now() + ROOM_TTL };
    this.db.transaction(() => this.save(room))();
    this.bump(room.id);
    return { identity: { token, participantId: member.id }, room: this.project(room, member.id) };
  }
  join(id: string, name: string): Admission {
    this.read(id);
    const { member, token } = this.newMember(name, false);
    const room = this.db.transaction(() => {
      const room = this.read(id);
      if (room.members.length >= 50) throw new Problem(409, 'This room has reached its 50-person limit.');
      if (room.phase === 'completed') throw new Problem(409, 'This session is complete. Ask the facilitator for the exported worksheet.');
      room.members.push(member); room.revision++; this.save(room); return room;
    })();
    this.broadcast(room);
    return { identity: { token, participantId: member.id }, room: this.project(room, member.id) };
  }
  snapshot(id: string, token: string) {
    const room = this.read(id);
    return this.project(room, this.member(room, token).id);
  }
  command(id: string, token: string, command: Command) {
    this.read(id);
    const { room, memberId } = this.db.transaction(() => {
      const room = this.read(id); const member = this.member(room, token);
      if (command.type !== 'vote' && !member.facilitator) throw new Problem(403, 'Only the facilitator can manage the round.');
      if (command.roundId !== room.roundId || command.revision !== room.revision) throw new Problem(409, 'The round changed. Review the latest worksheet and try again.');
      if (room.phase === 'completed') throw new Problem(409, 'This session is complete.');
      if (command.type === 'vote') {
        if (room.phase !== 'voting') throw new Problem(409, 'Voting is closed for this round.');
        member.vote = command.estimate;
      } else if (command.type === 'reveal') {
        if (room.phase !== 'voting') throw new Problem(409, 'This round is already revealed.');
        room.phase = 'revealed';
      } else if (command.type === 'reset') {
        room.phase = 'voting'; room.roundId = randomUUID(); room.members.forEach((person) => { person.vote = null; });
      } else {
        if (room.phase !== 'revealed') throw new Problem(409, 'Reveal the estimates before finalizing.');
        room.stories[room.currentStory].score = command.score;
        room.currentStory++; room.roundId = randomUUID(); room.members.forEach((person) => { person.vote = null; });
        room.phase = room.currentStory === room.stories.length ? 'completed' : 'voting';
      }
      room.revision++; this.save(room); return { room, memberId: member.id };
    })();
    this.broadcast(room);
    return this.project(room, memberId);
  }
  private bump(id: string) { this.versions.set(id, ++this.clock); }
  private project(room: Room, memberId: string): RoomSnapshot {
    const self = room.members.find((member) => member.id === memberId)!;
    return {
      id: room.id, title: room.title, revision: room.revision, version: this.versions.get(room.id) ?? this.clock,
      roundId: room.roundId, phase: room.phase, currentStory: room.currentStory, stories: room.stories,
      expiresAt: room.expiresAt,
      participants: room.members.map((person) => ({ id: person.id, name: person.name, facilitator: person.facilitator,
        online: [...(this.listeners.get(room.id) ?? [])].some((listener) => listener.memberId === person.id),
        hasVoted: person.vote !== null,
        ...(room.phase === 'revealed' && person.vote !== null ? { estimate: person.vote } : {}),
      })),
      self: { id: self.id, facilitator: self.facilitator, vote: self.vote },
    };
  }
  watch(id: string, token: string, send: Listener['send']) {
    const room = this.read(id); const member = this.member(room, token);
    const set = this.listeners.get(id) ?? new Set<Listener>();
    if (set.size >= 160 || [...set].filter((listener) => listener.memberId === member.id).length >= 5 || [...this.listeners.values()].reduce((n, listeners) => n + listeners.size, 0) >= 2000) throw new Problem(429, 'Too many open room tabs. Close another tab and retry.');
    const listener = { memberId: member.id, send }; set.add(listener); this.listeners.set(id, set); this.broadcast(room);
    let closed = false;
    return () => {
      if (closed) return; closed = true; set.delete(listener); if (!set.size) this.listeners.delete(id);
      try { this.broadcast(this.read(id)); } catch { /* Expired rooms have no remaining presence. */ }
    };
  }
  private broadcast(room: Room) {
    this.bump(room.id);
    for (const listener of this.listeners.get(room.id) ?? []) {
      try { listener.send(this.project(room, listener.memberId)); }
      catch { this.listeners.get(room.id)?.delete(listener); }
    }
  }
  private expire(id: string) {
    this.db.query('DELETE FROM rooms WHERE id = ?').run(id);
    const listeners = this.listeners.get(id); this.listeners.delete(id); this.versions.delete(id);
    for (const listener of listeners ?? []) { try { listener.send(null); } catch { /* The room is already removed. */ } }
  }
  sweep() {
    const rows = this.db.query('SELECT id FROM rooms WHERE expires_at <= ?').all(this.now()) as { id: string }[];
    rows.forEach(({ id }) => this.expire(id));
    for (const id of this.versions.keys()) if (!this.listeners.has(id)) this.versions.delete(id);
  }
  close() {
    for (const set of this.listeners.values()) for (const listener of set) { try { listener.send(null, 'unavailable'); } catch { /* Shutdown continues after disconnected clients. */ } }
    this.listeners.clear(); this.db.close();
  }
}
