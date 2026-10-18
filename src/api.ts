import type { Admission, Command, Identity, RoomSnapshot } from '../shared/types';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function request<T>(path: string, options: { method?: string; body?: unknown; identity?: Identity; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.identity ? { Authorization: `Bearer ${options.identity.token}` } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.any([AbortSignal.timeout(15000), ...(options.signal ? [options.signal] : [])]),
  });
  if (!response.ok) {
    let message = 'The server could not complete that request. Please try again.';
    try { message = (await response.json()).error || message; } catch { /* Non-JSON upstream failures still need an actionable message. */ }
    throw new ApiError(response.status, message);
  }
  return response.json() as Promise<T>;
}

export const createRoom = (body: { name: string; title: string; stories: string[] }) => request<Admission>('/rooms', { method: 'POST', body });
export const joinRoom = (id: string, name: string) => request<Admission>(`/rooms/${id}/join`, { method: 'POST', body: { name } });
export const readRoom = (id: string, identity: Identity, signal?: AbortSignal) => request<RoomSnapshot>(`/rooms/${id}`, { identity, signal });
export const sendCommand = (id: string, identity: Identity, command: Command) => request<RoomSnapshot>(`/rooms/${id}/commands`, { method: 'POST', identity, body: command });

const key = (id: string) => `scrum-poker:room:${id}`;
const memory = new Map<string, Identity>();
export function readIdentity(id: string): { identity: Identity | null; storageWarning: boolean } {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return { identity: memory.get(id) ?? null, storageWarning: false };
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && 'token' in value && 'participantId' in value && typeof value.token === 'string' && typeof value.participantId === 'string') {
      return { identity: value as Identity, storageWarning: false };
    }
    return { identity: memory.get(id) ?? null, storageWarning: true };
  } catch { return { identity: memory.get(id) ?? null, storageWarning: true }; }
}

export function saveIdentity(id: string, identity: Identity): boolean {
  memory.set(id, identity);
  try { localStorage.setItem(key(id), JSON.stringify(identity)); return true; } catch { return false; }
}

export function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'This room was not found or has expired. Check your invite link or start a new session.';
    if (error.status === 401 || error.status === 403) return 'Your room access is no longer valid. You can rejoin with your name, but facilitator access cannot be recovered.';
    if (error.status === 409) return 'The round changed while you were acting. We’ve refreshed the room. Review it and try again.';
    if (error.status === 429) return 'Too many requests. Wait a moment, then try again.';
    return error.message;
  }
  return 'We couldn’t reach the server. Check your connection and try again.';
}
