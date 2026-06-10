import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { authRoutes } from './auth.js';
import { leagueRoutes } from './leagues.js';

const app = Fastify({ logger: true });

const PORT = Number(process.env.PORT || 7432);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('Missing JWT_SECRET environment variable');
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: any;
    requireSuperadmin: any;
  }
}

app.register(cors, {
  origin: (origin, cb) => {
    // allow same-origin and local dev
    cb(null, true);
  },
  credentials: true,
});

app.register(jwt, { secret: JWT_SECRET });

app.decorate('authenticate', async (req: any, reply: any) => {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
});

app.decorate('requireSuperadmin', async (req: any, reply: any) => {
  const role = (req.user as any)?.role;
  if (role !== 'SUPERADMIN') return reply.code(403).send({ error: 'Forbidden' });
});

app.get('/health', async () => ({ ok: true }));

await authRoutes(app);
await leagueRoutes(app);

app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => app.log.info(`API running on http://localhost:${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
