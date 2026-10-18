export const DECK = ['0', '½', '1', '2', '3', '5', '8', '13', '21', '?'] as const;
export const SCORES = ['0', '½', '1', '2', '3', '5', '8', '13', '21'] as const;
export type Estimate = typeof DECK[number];
export type Score = typeof SCORES[number];
export interface Story { id: string; title: string; score: Score | null }
export interface PublicParticipant {
  id: string; name: string; facilitator: boolean; online: boolean; hasVoted: boolean;
  estimate?: Estimate;
}
export interface RoomSnapshot {
  id: string; title: string; revision: number; version: number; roundId: string;
  phase: 'voting' | 'revealed' | 'completed'; currentStory: number;
  stories: Story[]; participants: PublicParticipant[];
  self: { id: string; facilitator: boolean; vote: Estimate | null };
  expiresAt: number;
}
export interface Identity { token: string; participantId: string }
export interface Admission { identity: Identity; room: RoomSnapshot }
export type Command = { roundId: string; revision: number } & (
  { type: 'vote'; estimate: Estimate } | { type: 'reveal' } |
  { type: 'reset' } | { type: 'finalize'; score: Score }
);
