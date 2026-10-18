import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useRoom } from './useRoom';
import { admission, snapshot } from './test-fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function liveStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; }, cancel });
  return { response: new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }), controller, cancel, send: (room: ReturnType<typeof snapshot>) => controller.enqueue(new TextEncoder().encode(`event: snapshot\ndata: ${JSON.stringify(room)}\n\n`)) };
}

describe('useRoom live state', () => {
  it('authenticates streaming, ignores old snapshots, and cancels on unmount', async () => {
    const stream = liveStream();
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(snapshot())).mockResolvedValueOnce(stream.response);
    vi.stubGlobal('fetch', fetcher);
    const identity = admission().identity;
    const { result, unmount } = renderHook(() => useRoom('a'.repeat(32), identity));
    await waitFor(() => expect(result.current.connection).toBe('live'));
    expect(fetcher.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer fixture-only', Accept: 'text/event-stream' });
    expect(fetcher.mock.calls[1][0]).not.toContain('fixture-only');
    await act(async () => { stream.send(snapshot({ version: 4, title: 'Latest room' })); });
    expect(result.current.room?.title).toBe('Latest room');
    await act(async () => { stream.send(snapshot({ version: 2, title: 'Outdated room' })); });
    expect(result.current.room?.title).toBe('Latest room');
    expect(fetcher).toHaveBeenCalledTimes(2);
    unmount();
    expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
    stream.controller.close();
  });

  it('uses disconnected polling, then cancels polling after reconnect', async () => {
    vi.useFakeTimers();
    const stream = liveStream();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(snapshot()))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(Response.json(snapshot({ version: 2 })))
      .mockResolvedValueOnce(stream.response);
    vi.stubGlobal('fetch', fetcher);
    const identity = admission().identity;
    const { result, unmount } = renderHook(() => useRoom('a'.repeat(32), identity));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.connection).toBe('reconnecting');
    expect(result.current.room?.version).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(3500); });
    expect(result.current.connection).toBe('live');
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(fetcher).toHaveBeenCalledTimes(4);
    unmount(); stream.controller.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refreshes a stale command without replaying a transition', async () => {
    const stream = liveStream();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(snapshot()))
      .mockResolvedValueOnce(stream.response)
      .mockResolvedValueOnce(Response.json({ error: 'Round changed' }, { status: 409 }))
      .mockResolvedValueOnce(Response.json(snapshot({ version: 3, revision: 3, roundId: 'new-round' })));
    vi.stubGlobal('fetch', fetcher);
    const identity = admission().identity;
    const { result, unmount } = renderHook(() => useRoom('a'.repeat(32), identity));
    await waitFor(() => expect(result.current.connection).toBe('live'));
    await act(async () => { expect(await result.current.act({ type: 'reveal' })).toBe(false); });
    expect(result.current.room?.roundId).toBe('new-round');
    expect(result.current.error).toContain('Review it and try again');
    const commands = fetcher.mock.calls.filter(call => String(call[0]).endsWith('/commands'));
    expect(commands).toHaveLength(1);
    expect(JSON.parse(commands[0][1].body)).toEqual({ type: 'reveal', roundId: 'round-one', revision: 1 });
    unmount(); stream.controller.close();
  });
});
