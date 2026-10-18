import type { Admission, RoomSnapshot } from '../shared/types';

export function snapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    id: 'a'.repeat(32), title: 'Platform planning', revision: 1, version: 1, roundId: 'round-one', phase: 'voting', currentStory: 0,
    stories: [{ id: 'first', title: 'Improve search relevance', score: null }, { id: 'second', title: 'Add saved filters', score: null }],
    participants: [
      { id: 'host', name: 'Robin', facilitator: true, online: true, hasVoted: false },
      { id: 'guest', name: 'Sam', facilitator: false, online: true, hasVoted: false },
    ],
    self: { id: 'host', facilitator: true, vote: null }, expiresAt: 2000000000000,
    ...overrides,
  };
}

export function admission(): Admission { return { identity: { token: 'fixture-only', participantId: 'host' }, room: snapshot() }; }
