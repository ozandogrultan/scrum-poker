import { RoomService } from './service';
import { createApp } from './app';

process.umask(0o077);
const service = new RoomService(process.env.DATABASE_PATH ?? '.data/scrum-poker.sqlite');
const app = createApp(service, { origin: process.env.PUBLIC_ORIGIN, assets: 'dist' });
const server = Bun.serve({
  hostname: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3001), idleTimeout: 60,
  fetch: (request, server) => app.fetch(request, { ip: server.requestIP(request)?.address ?? 'unknown' }),
});
const sweep = setInterval(() => service.sweep(), 60000);
const shutdown = () => { clearInterval(sweep); service.close(); void server.stop(true); };
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
console.info(`Scrum Poker listening on ${server.url.origin}`);
