import { useCallback, useEffect, useRef, useState } from 'react';
import type { Command, Identity, RoomSnapshot } from '../shared/types';
import { ApiError, friendlyError, readRoom, sendCommand } from './api';

export type RoomAction = Command extends infer T ? T extends Command ? Omit<T, 'roundId' | 'revision'> : never : never;
export type Connection = 'connecting' | 'live' | 'reconnecting';

export function useRoom(id: string, identity: Identity) {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  const accept = useCallback((next: RoomSnapshot) => {
    if (!mounted.current || (roomRef.current && next.version < roomRef.current.version)) return;
    roomRef.current = next;
    setRoom(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
    let stopped = false;
    let connected = false;
    let terminal = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let pollController: AbortController | undefined;
    let streamController: AbortController | undefined;
    const initialController = new AbortController();
    setFatal(null);
    setConnection('connecting');

    function handleTerminal(failure: unknown) {
      if (failure instanceof ApiError && [401, 403, 404, 410].includes(failure.status)) {
        terminal = true;
        setFatal(failure.status);
        setError(friendlyError(failure));
        clearTimeout(pollTimer);
        pollController?.abort();
        return true;
      }
      return false;
    }

    async function poll() {
      if (stopped || connected || terminal) return;
      pollController?.abort();
      pollController = new AbortController();
      try { accept(await readRoom(id, identity, pollController.signal)); }
      catch (failure) { if (!stopped && !(failure instanceof DOMException && failure.name === 'AbortError')) handleTerminal(failure); }
      if (!stopped && !connected && !terminal) pollTimer = setTimeout(poll, 5000);
    }

    async function connect() {
      if (stopped || terminal) return;
      streamController = new AbortController();
      const touch = () => { clearTimeout(watchdog); watchdog = setTimeout(() => streamController?.abort(), 40000); };
      try {
        touch();
        const response = await fetch(`/api/rooms/${id}/events`, { headers: { Authorization: `Bearer ${identity.token}`, Accept: 'text/event-stream' }, signal: streamController.signal });
        if (!response.ok) {
          let message = 'Live connection unavailable.';
          try { message = (await response.json()).error || message; } catch { /* Proxy errors may not be JSON. */ }
          throw new ApiError(response.status, message);
        }
        if (!response.body) throw new Error('Streaming is unavailable.');
        connected = true;
        clearTimeout(pollTimer);
        pollController?.abort();
        if (!stopped) setConnection('live');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (!stopped) {
            const result = await reader.read();
            if (result.done) break;
            touch();
            buffer += decoder.decode(result.value, { stream: true }).replace(/\r/g, '');
            let boundary: number;
            while ((boundary = buffer.indexOf('\n\n')) !== -1) {
              const event = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
              const type = event.split('\n').find(line => line.startsWith('event:'))?.slice(6).trim();
              const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
              if (type === 'snapshot') accept(JSON.parse(data) as RoomSnapshot);
              if (type === 'expired') throw new ApiError(404, 'This room has expired.');
              if (type === 'stream-error') throw new Error('Live updates are temporarily unavailable.');
            }
          }
        } finally { await reader.cancel().catch(() => undefined); }
      } catch (failure) {
        if (!stopped) handleTerminal(failure);
      } finally {
        clearTimeout(watchdog);
        connected = false;
        if (!stopped && !terminal) {
          setConnection('reconnecting');
          void poll();
          reconnectTimer = setTimeout(connect, 3500);
        }
      }
    }

    async function start() {
      try { accept(await readRoom(id, identity, initialController.signal)); }
      catch (failure) { if (stopped || handleTerminal(failure)) return; }
      if (!stopped) void connect();
    }
    const online = () => { if (!stopped) setAttempt(value => value + 1); };
    window.addEventListener('online', online);
    void start();
    return () => {
      stopped = true; mounted.current = false;
      window.removeEventListener('online', online);
      clearTimeout(reconnectTimer); clearTimeout(pollTimer); clearTimeout(watchdog);
      initialController.abort(); streamController?.abort(); pollController?.abort();
    };
  }, [id, identity, accept, attempt]);

  const act = useCallback(async (action: RoomAction): Promise<boolean> => {
    if (!roomRef.current || busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError('');
    const current = roomRef.current;
    try {
      accept(await sendCommand(id, identity, { ...action, roundId: current.roundId, revision: current.revision } as Command));
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        try { accept(await readRoom(id, identity)); } catch { /* Retain the conflict recovery message if refresh is offline. */ }
      }
      if (mounted.current) setError(friendlyError(failure));
      return false;
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }, [id, identity, accept]);

  return { room, connection, error, fatal, busy, act, retry: () => { setError(''); setAttempt(value => value + 1); } };
}
