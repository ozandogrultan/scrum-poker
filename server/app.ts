import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { commandSchema, createSchema, joinSchema } from './validation';
import { Problem, RoomService } from './service';

export function createApp(service: RoomService, options: { origin?: string; now?: () => number; assets?: string } = {}) {
  const app = new Hono<{ Bindings: { ip?: string } }>();
  const buckets = new Map<string, { count: number; until: number }>();
  const now = options.now ?? Date.now;
  const cleanup = () => { for (const [key, value] of buckets) if (value.until <= now()) buckets.delete(key); };
  app.use('*', secureHeaders({
    contentSecurityPolicy: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], fontSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'none'"], frameAncestors: ["'none'"], formAction: ["'self'"] },
    referrerPolicy: 'no-referrer', crossOriginResourcePolicy: 'same-origin',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
  }));
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    const origin = c.req.header('Origin');
    const expected = options.origin ?? new URL(c.req.url).origin;
    if ((origin && origin !== expected) || c.req.header('Sec-Fetch-Site') === 'cross-site') throw new Problem(403, 'Cross-origin requests are not allowed.');
    cleanup();
    const ip = c.env?.ip ?? 'local';
    const category = c.req.path === '/api/rooms' ? 'create' : c.req.path.endsWith('/join') ? 'join' : c.req.path.endsWith('/commands') ? 'command' : 'read';
    const limit = { create: 10, join: 60, command: 1000, read: 1200 }[category];
    const capabilityKey = createHash('sha256').update(c.req.header('Authorization') ?? 'anonymous').digest('hex');
    const keys = [`${ip}:${category}`, ...(category === 'command' ? [`cap:${capabilityKey}`] : [])];
    for (const key of keys) {
      const bucket = buckets.get(key) ?? { count: 0, until: now() + 60000 };
      if (++bucket.count > (key.startsWith('cap:') ? 90 : limit)) {
        c.header('Retry-After', String(Math.max(1, Math.ceil((bucket.until - now()) / 1000))));
        throw new Problem(429, 'Too many requests. Wait a minute and try again.');
      }
      if (buckets.size >= 20000 && !buckets.has(key)) throw new Problem(503, 'The server is busy. Please try again shortly.');
      buckets.set(key, bucket);
    }
    await next();
  });
  app.use('/api/*', bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: 'Request is too large. Use at most 100 stories of 500 characters.' }, 413) }));
  const token = (authorization?: string) => {
    if (!authorization?.startsWith('Bearer ')) throw new Problem(401, 'Your room identity is missing or invalid. Join this room again.');
    return authorization.slice(7);
  };
  const id = (value: string) => {
    if (!/^[a-f0-9]{32}$/.test(value)) throw new Problem(404, 'This room is unavailable or has expired.');
    return value;
  };
  app.post('/api/rooms', async (c) => c.json(service.create(createSchema.parse(await c.req.json())), 201));
  app.post('/api/rooms/:id/join', async (c) => c.json(service.join(id(c.req.param('id')), joinSchema.parse(await c.req.json()).name), 201));
  app.get('/api/rooms/:id', (c) => c.json(service.snapshot(id(c.req.param('id')), token(c.req.header('Authorization')))));
  app.post('/api/rooms/:id/commands', async (c) => {
    const roomId = id(c.req.param('id')); const capability = token(c.req.header('Authorization'));
    return c.json(service.command(roomId, capability, commandSchema.parse(await c.req.json())));
  });
  app.get('/api/rooms/:id/events', (c) => {
    const roomId = id(c.req.param('id')); const capability = token(c.req.header('Authorization'));
    service.snapshot(roomId, capability);
    return streamSSE(c, async (stream) => {
      let finish!: () => void;
      const done = new Promise<void>((resolve) => { finish = resolve; });
      let unsubscribe: (() => void) | undefined;
      let pending = Promise.resolve();
      let queued = 0;
      const send = (data: unknown, event = 'snapshot') => {
        if (++queued > 20) { stream.abort(); finish(); return; }
        pending = pending.then(async () => { await stream.writeSSE({ event, data: JSON.stringify(data) }); }).catch(() => finish()).finally(() => { queued--; });
      };
      stream.onAbort(() => finish());
      const onAbort = () => { stream.abort(); finish(); };
      c.req.raw.signal.addEventListener('abort', onAbort, { once: true });
      const heartbeat = setInterval(() => send({ time: Date.now() }, 'heartbeat'), 15000);
      try {
        unsubscribe = service.watch(roomId, capability, (snapshot, reason) => {
          if (snapshot) send(snapshot);
          else { send(reason ? { error: 'Server reconnecting. Please retry shortly.' } : {}, reason ? 'stream-error' : 'expired'); finish(); }
        });
        if (c.req.raw.signal.aborted) onAbort();
        await done;
      } catch (error) { send({ error: error instanceof Problem ? error.message : 'Stream unavailable.' }, 'stream-error'); }
      finally {
        clearInterval(heartbeat); c.req.raw.signal.removeEventListener('abort', onAbort);
        unsubscribe?.(); await pending;
      }
    });
  });
  if (options.assets) {
    const assets = resolve(options.assets);
    app.get('*', async (c) => {
      if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found.' }, 404);
      let pathname: string;
      try { pathname = decodeURIComponent(c.req.path); } catch { return c.text('Not found', 404); }
      const assetPath = /^\/assets\/[\w./-]+\.(js|css|woff2?|svg|png|jpe?g|webp|ico)$/.test(pathname) || pathname === '/favicon.svg';
      if (pathname.split('/').some((part) => part.startsWith('.')) || (!assetPath && pathname !== '/' && !/^\/rooms\/[a-f0-9]{32}$/.test(pathname))) return c.text('Not found', 404);
      const path = resolve(assets, `.${pathname}`);
      if (path !== assets && !path.startsWith(assets + sep)) return c.text('Not found', 404);
      const file = Bun.file(path);
      if (assetPath && await file.exists()) {
        c.header('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
        return c.body(file);
      }
      if (pathname !== '/' && !/^\/rooms\/[a-f0-9]{32}$/.test(pathname)) return c.text('Not found', 404);
      const index = Bun.file(resolve(assets, 'index.html'));
      if (!await index.exists()) return c.text('Build the web app with bun run build, or use the Vite development server.', 503);
      c.header('Cache-Control', 'no-cache'); return c.html(await index.text());
    });
  }
  app.notFound((c) => c.json({ error: 'Not found.' }, 404));
  app.onError((error, c) => {
    if (error instanceof Problem) return c.json({ error: error.message }, error.status as 400);
    if (error instanceof z.ZodError) return c.json({ error: 'Check your input. Names: 1–60 characters; title: 1–120; stories: 1–100, up to 500 characters each. Use an available estimate and the current round.' }, 400);
    if (error instanceof SyntaxError) return c.json({ error: 'Invalid JSON request.' }, 400);
    return c.json({ error: 'The server could not complete this request. Please try again.' }, 500);
  });
  return app;
}
