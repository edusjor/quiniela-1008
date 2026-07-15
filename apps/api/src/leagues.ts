import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';
import { adminLeagueTeamSchema, adminSetUserPasswordSchema, bulkDeleteSchema, bulkDeleteTeamsSchema, bulkPredictionsSchema, createLeagueSchema, createMatchSchema, importMatchesCsvSchema, joinLeagueSchema, predictionSchema, setResultSchema } from './schemas.js';
import { makeJoinCode } from './utils.js';
import { calcPoints, CORRECT_WINNER_POINTS, EXACT_SCORE_POINTS } from './points.js';

type CsvMatchRow = {
  rowNumber: number;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: Date;
  lockAt: Date;
  groupName: string | null;
  homeCode: string | null;
  awayCode: string | null;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
};

type CsvImportError = {
  row: number;
  message: string;
};

type CsvImportPreviewMatch = {
  row: number;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  groupName: string | null;
  reason?: string;
};

function normalizeTeamForMatchKey(value: string) {
  return value.trim().toLowerCase();
}

function buildCsvMatchPreviewKey(row: CsvMatchRow) {
  return `${normalizeTeamForMatchKey(row.homeTeam)}|${normalizeTeamForMatchKey(row.awayTeam)}|${row.kickoffAt.getTime()}`;
}

function toCsvImportPreviewMatch(row: CsvMatchRow, reason?: string): CsvImportPreviewMatch {
  return {
    row: row.rowNumber,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    kickoffAt: row.kickoffAt.toISOString(),
    groupName: row.groupName,
    reason,
  };
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      cells.push(current.trim().replace(/\r/g, ''));
      current = '';
      continue;
    }

    current += ch;
  }

  cells.push(current.trim().replace(/\r/g, ''));
  return cells;
}

function normalizeCsvHeader(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

function findCsvColumn(headers: string[], aliases: string[]) {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index >= 0) return index;
  }

  return -1;
}

function parseCsvDateValue(raw: string) {
  const value = raw.trim();
  if (!value) return null;

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
    ? `${normalized}:00`
    : normalized;

  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/i.test(withSeconds);
  if (hasTimezone) {
    const parsedWithTimezone = new Date(withSeconds);
    if (Number.isNaN(parsedWithTimezone.getTime())) return null;
    return parsedWithTimezone;
  }

  const localMatch = withSeconds.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!localMatch) return null;

  const year = Number(localMatch[1]);
  const month = Number(localMatch[2]);
  const day = Number(localMatch[3]);
  const hour = Number(localMatch[4]);
  const minute = Number(localMatch[5]);
  const second = Number(localMatch[6] ?? '0');

  // Costa Rica is UTC-6 all year; convert local wall time to UTC instant.
  const parsedCostaRica = new Date(Date.UTC(year, month - 1, day, hour + 6, minute, second));
  if (Number.isNaN(parsedCostaRica.getTime())) return null;
  return parsedCostaRica;
}

function parseMatchesCsv(csvContent: string) {
  const lines = csvContent
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    throw new Error('El CSV esta vacio');
  }

  const headers = parseCsvLine(lines[0]).map(normalizeCsvHeader);

  const homeTeamIndex = findCsvColumn(headers, ['hometeam', 'home', 'local', 'equipolocal']);
  const awayTeamIndex = findCsvColumn(headers, ['awayteam', 'away', 'visitante', 'equipovisitante']);
  const kickoffAtIndex = findCsvColumn(headers, ['kickoffat', 'kickoff', 'horario', 'fecha', 'inicio', 'datetime']);
  const lockAtIndex = findCsvColumn(headers, ['lockat', 'lock', 'cierre']);
  const groupIndex = findCsvColumn(headers, ['group', 'groupname', 'grupo']);
  const homeCodeIndex = findCsvColumn(headers, ['homecode', 'codigolocal']);
  const awayCodeIndex = findCsvColumn(headers, ['awaycode', 'codigovisitante']);
  const homeLogoUrlIndex = findCsvColumn(headers, ['homelogourl', 'logolocal']);
  const awayLogoUrlIndex = findCsvColumn(headers, ['awaylogourl', 'logovisitante']);

  if (homeTeamIndex < 0 || awayTeamIndex < 0 || kickoffAtIndex < 0) {
    throw new Error('Encabezados requeridos: homeTeam, awayTeam, kickoffAt');
  }

  const rows: CsvMatchRow[] = [];
  const errors: CsvImportError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const cells = parseCsvLine(lines[i]);

    const getCell = (index: number) => (index >= 0 ? (cells[index] || '').trim() : '');

    const homeTeam = getCell(homeTeamIndex);
    const awayTeam = getCell(awayTeamIndex);
    const kickoffRaw = getCell(kickoffAtIndex);
    const lockRaw = getCell(lockAtIndex);

    if (!homeTeam && !awayTeam && !kickoffRaw) continue;

    if (!homeTeam || !awayTeam || !kickoffRaw) {
      errors.push({ row: rowNumber, message: 'Faltan columnas requeridas en la fila' });
      continue;
    }

    if (homeTeam.toLowerCase() === awayTeam.toLowerCase()) {
      errors.push({ row: rowNumber, message: 'Local y visitante no pueden ser el mismo equipo' });
      continue;
    }

    const kickoffAt = parseCsvDateValue(kickoffRaw);
    if (!kickoffAt) {
      errors.push({ row: rowNumber, message: `Horario inválido: ${kickoffRaw}` });
      continue;
    }

    const lockAt = lockRaw ? parseCsvDateValue(lockRaw) : kickoffAt;
    if (!lockAt) {
      errors.push({ row: rowNumber, message: `Cierre inválido: ${lockRaw}` });
      continue;
    }

    if (lockAt > kickoffAt) {
      errors.push({ row: rowNumber, message: 'El cierre no puede ser después del kickoff' });
      continue;
    }

    rows.push({
      rowNumber,
      homeTeam,
      awayTeam,
      kickoffAt,
      lockAt,
      groupName: getCell(groupIndex) || null,
      homeCode: getCell(homeCodeIndex).toUpperCase() || null,
      awayCode: getCell(awayCodeIndex).toUpperCase() || null,
      homeLogoUrl: getCell(homeLogoUrlIndex) || null,
      awayLogoUrl: getCell(awayLogoUrlIndex) || null,
    });
  }

  return { rows, errors };
}

async function findOrCreateTeamForCsvImport(params: {
  leagueId: string;
  name: string;
  code: string | null;
  logoUrl: string | null;
}) {
  const leagueId = params.leagueId;
  const normalizedName = params.name.trim();
  const normalizedCode = params.code?.trim().toUpperCase() || null;
  const normalizedLogo = params.logoUrl?.trim() || null;

  const byName = await prisma.team.findFirst({
    where: {
      leagueId,
      name: {
        equals: normalizedName,
        mode: 'insensitive',
      },
    },
  });

  if (byName) {
    let nextCode = byName.code;

    if (normalizedCode && byName.code !== normalizedCode) {
      const codeOwner = await prisma.team.findFirst({ where: { leagueId, code: normalizedCode } });
      if (!codeOwner || codeOwner.id === byName.id) {
        nextCode = normalizedCode;
      }
    }

    const nextLogo = normalizedLogo || byName.logoUrl;
    const requiresUpdate = byName.name !== normalizedName || byName.code !== nextCode || byName.logoUrl !== nextLogo;

    if (!requiresUpdate) {
      return { team: byName, created: false, updated: false };
    }

    const updatedTeam = await prisma.team.update({
      where: { id: byName.id },
      data: {
        name: normalizedName,
        code: nextCode,
        logoUrl: nextLogo,
      },
    });

    return { team: updatedTeam, created: false, updated: true };
  }

  if (normalizedCode) {
    const byCode = await prisma.team.findFirst({ where: { leagueId, code: normalizedCode } });
    if (byCode) {
      const updatedTeam = await prisma.team.update({
        where: { id: byCode.id },
        data: {
          name: normalizedName,
          logoUrl: normalizedLogo || byCode.logoUrl,
        },
      });

      return { team: updatedTeam, created: false, updated: true };
    }
  }

  const createdTeam = await prisma.team.create({
    data: {
      leagueId,
      name: normalizedName,
      code: normalizedCode,
      logoUrl: normalizedLogo,
    },
  });

  return { team: createdTeam, created: true, updated: false };
}

function isSuperadmin(req: any) {
  return (req.user as any)?.role === 'SUPERADMIN';
}

async function findActiveLeagueById(id: string) {
  return prisma.league.findFirst({ where: { id, deletedAt: null } });
}

async function findDeletedLeagueById(id: string) {
  return prisma.league.findFirst({ where: { id, deletedAt: { not: null } } });
}

function isCatalogFlagUrl(url: string | null | undefined) {
  if (!url) return false;
  return /^https:\/\/flagcdn\.com\/w\d+\//i.test(url.trim());
}

type UpsertPredictionInput = {
  leagueId: string;
  userId: string;
  matchId: string;
  predHome: number;
  predAway: number;
  predPenaltyWinnerIsHome?: boolean | null;
};

type UpsertPredictionResult =
  | { ok: true; prediction: any }
  | { ok: false; status: number; code: 'MATCH_NOT_IN_LEAGUE' | 'PREDICTION_LOCKED'; error: string; matchId: string };

async function upsertLeaguePrediction(input: UpsertPredictionInput): Promise<UpsertPredictionResult> {
  const { leagueId, userId, matchId, predHome, predAway } = input;
  const predPenaltyWinnerIsHome = predHome === predAway ? (input.predPenaltyWinnerIsHome ?? null) : null;

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || match.leagueId !== leagueId) {
    return { ok: false, status: 400, code: 'MATCH_NOT_IN_LEAGUE', error: 'Match not in league', matchId };
  }

  if (new Date() >= match.lockAt) {
    return { ok: false, status: 400, code: 'PREDICTION_LOCKED', error: 'Predictions locked for this match', matchId };
  }

  const points =
    match.finalHome !== null && match.finalAway !== null
      ? calcPoints(
        predHome,
        predAway,
        match.finalHome,
        match.finalAway,
        predPenaltyWinnerIsHome,
        match.finalPenaltyWinnerIsHome,
      )
      : null;

  const prediction = await prisma.prediction.upsert({
    where: { leagueId_userId_matchId: { leagueId, userId, matchId } },
    update: { predHome, predAway, predPenaltyWinnerIsHome, points },
    create: { leagueId, userId, matchId, predHome, predAway, predPenaltyWinnerIsHome, points },
  });

  return { ok: true, prediction };
}

export async function leagueRoutes(app: FastifyInstance) {
  // Crear quiniela (solo superadmin)
  app.post('/leagues', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isSuperadmin(req)) return reply.code(403).send({ error: 'Only superadmin can create leagues' });

    const parsed = createLeagueSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const uid = (req.user as any).uid as string;
    const { name, description, isPublic } = parsed.data;

    // joinCode único
    let code = makeJoinCode(6);
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.league.findUnique({ where: { joinCode: code } });
      if (!exists) break;
      code = makeJoinCode(6);
    }

    const league = await prisma.league.create({
      data: {
        name,
        description,
        isPublic,
        joinCode: code,
        createdById: uid,
        pointsExact: EXACT_SCORE_POINTS,
        pointsOutcome: CORRECT_WINNER_POINTS,
        members: {
          create: { userId: uid, role: 'OWNER' },
        },
      },
    });

    return reply.send({ league });
  });

  // Unirse por código
  app.post('/leagues/join', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = joinLeagueSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload' });

    const uid = (req.user as any).uid as string;
    const { joinCode } = parsed.data;

    const league = await prisma.league.findUnique({ where: { joinCode } });
    if (!league) return reply.code(404).send({ error: 'League not found' });

    await prisma.leagueMember.upsert({
      where: { leagueId_userId: { leagueId: league.id, userId: uid } },
      update: {},
      create: { leagueId: league.id, userId: uid, role: 'MEMBER' },
    });

    return reply.send({ leagueId: league.id });
  });

  // Mis ligas
  app.get('/leagues/mine', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isSuperadmin(req)) return reply.send({ leagues: [] });

    const uid = (req.user as any).uid as string;

    const leagues = await prisma.league.findMany({
      where: { deletedAt: null, members: { some: { userId: uid } } },
      include: {
        _count: {
          select: { members: true, matches: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ leagues });
  });

  // Quinielas activas creadas por super admins
  app.get('/leagues/active', { preHandler: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as any).uid as string;

    const leagues = await prisma.league.findMany({
      where: {
        deletedAt: null,
        createdBy: {
          role: 'SUPERADMIN',
        },
      },
      include: {
        createdBy: { select: { id: true, username: true, fullName: true } },
        members: {
          where: { userId: uid },
          select: { userId: true },
        },
        _count: {
          select: { members: true, matches: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const items = leagues.map((league) => ({
      ...league,
      isMember: league.members.length > 0,
    }));

    return reply.send({ leagues: items });
  });

  // SUPERADMIN: ver todas las quinielas
  app.get('/admin/leagues', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (_req, reply) => {
    const leagues = await prisma.league.findMany({
      where: { deletedAt: null },
      include: {
        createdBy: { select: { id: true, username: true, fullName: true, email: true } },
        _count: {
          select: { members: true, matches: true, predictions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ leagues });
  });

  app.get('/admin/leagues/deleted', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (_req, reply) => {
    const leagues = await prisma.league.findMany({
      where: { deletedAt: { not: null } },
      include: {
        createdBy: { select: { id: true, username: true, fullName: true, email: true } },
        _count: {
          select: { members: true, matches: true, predictions: true },
        },
      },
      orderBy: { deletedAt: 'desc' },
    });

    return reply.send({ leagues });
  });

  // SUPERADMIN: ver todos los usuarios
  app.get('/admin/users', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (_req, reply) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        nationalId: true,
        instagramUsername: true,
        birthDate: true,
        followsInstagram: true,
        purchaseProofImage: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            leagues: true,
            createdLeagues: true,
            predictions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      users: users.map((user) => ({
        ...user,
        hasPurchaseProof: Boolean(user.purchaseProofImage),
      })),
    });
  });

  // SUPERADMIN: ver detalle de un usuario
  app.get('/admin/users/:id', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (req, reply) => {
    const id = (req.params as any).id as string;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        nationalId: true,
        instagramUsername: true,
        birthDate: true,
        followsInstagram: true,
        purchaseProofImage: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            leagues: true,
            createdLeagues: true,
            predictions: true,
          },
        },
        leagues: {
          orderBy: { joinedAt: 'desc' },
          select: {
            role: true,
            joinedAt: true,
            league: {
              select: {
                id: true,
                name: true,
                joinCode: true,
              },
            },
          },
        },
        createdLeagues: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            joinCode: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) return reply.code(404).send({ error: 'User not found' });

    return reply.send({
      user: {
        ...user,
        hasPurchaseProof: Boolean(user.purchaseProofImage),
      },
    });
  });

  app.post('/admin/users/:id/password', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (req, reply) => {
    const id = (req.params as any).id as string;
    const parsed = adminSetUserPasswordSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) return reply.code(404).send({ error: 'User not found' });

    const nextPasswordHash = await bcrypt.hash(parsed.data.password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { passwordHash: nextPasswordHash },
      }),
      prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
    ]);

    return reply.send({ ok: true, message: 'Contraseña actualizada correctamente' });
  });

  app.post('/admin/users/bulk-delete', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (req, reply) => {
    const parsed = bulkDeleteSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const requesterId = (req.user as any).uid as string;
    const ids = Array.from(new Set(parsed.data.ids.map((id) => id.trim()).filter(Boolean)));

    let deleted = 0;
    const errors: Array<{ id: string; message: string }> = [];

    for (const id of ids) {
      if (id === requesterId) {
        errors.push({ id, message: 'No puedes borrar tu propio usuario' });
        continue;
      }

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          role: true,
          _count: {
            select: {
              createdLeagues: true,
            },
          },
        },
      });

      if (!user) {
        errors.push({ id, message: 'Usuario no encontrado' });
        continue;
      }

      if (user.role === 'SUPERADMIN') {
        errors.push({ id, message: 'No se puede borrar un usuario SUPERADMIN' });
        continue;
      }

      if (user._count.createdLeagues > 0) {
        errors.push({ id, message: 'No se puede borrar un usuario que creo quinielas' });
        continue;
      }

      try {
        await prisma.$transaction([
          prisma.prediction.deleteMany({ where: { userId: id } }),
          prisma.leagueMember.deleteMany({ where: { userId: id } }),
          prisma.finalPick.deleteMany({ where: { userId: id } }),
          prisma.userProfile.deleteMany({ where: { userId: id } }),
          prisma.user.delete({ where: { id } }),
        ]);
        deleted += 1;
      } catch (error: any) {
        errors.push({ id, message: error?.message ?? 'No se pudo borrar el usuario' });
      }
    }

    return reply.send({
      summary: {
        requested: ids.length,
        deleted,
        skipped: errors.length,
      },
      errors: errors.slice(0, 50),
    });
  });

  app.post('/admin/leagues/:id/trash', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (req, reply) => {
    const leagueId = String((req.params as any).id || '').trim();
    const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const league = await prisma.league.findFirst({ where: { id: leagueId, deletedAt: null } });
    if (!league) return reply.code(404).send({ error: 'League not found' });

    if (league.name.trim() !== parsed.data.name.trim()) {
      return reply.code(400).send({ error: 'El nombre de la quiniela no coincide' });
    }

    const deletedAt = new Date();
    const trashed = await prisma.league.update({
      where: { id: league.id },
      data: { deletedAt },
    });

    return reply.send({ league: trashed });
  });

  app.post('/admin/leagues/:id/restore', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (req, reply) => {
    const leagueId = String((req.params as any).id || '').trim();

    const league = await findDeletedLeagueById(leagueId);
    if (!league) return reply.code(404).send({ error: 'League not found' });

    const restored = await prisma.league.update({
      where: { id: league.id },
      data: { deletedAt: null },
    });

    return reply.send({ league: restored });
  });

  app.post('/admin/leagues/:id/permanent-delete', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (req, reply) => {
    const leagueId = String((req.params as any).id || '').trim();
    const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const league = await findDeletedLeagueById(leagueId);
    if (!league) return reply.code(404).send({ error: 'League not found' });

    if (league.name.trim() !== parsed.data.name.trim()) {
      return reply.code(400).send({ error: 'El nombre de la quiniela no coincide' });
    }

    await prisma.$transaction([
      prisma.prediction.deleteMany({ where: { leagueId } }),
      prisma.match.deleteMany({ where: { leagueId } }),
      prisma.team.deleteMany({ where: { leagueId } }),
      prisma.leagueMember.deleteMany({ where: { leagueId } }),
      prisma.league.delete({ where: { id: leagueId } }),
    ]);

    return reply.send({ ok: true });
  });

  app.get('/admin/teams', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (req, reply) => {
    const leagueId = String((req.query as any)?.leagueId || '').trim();
    const q = String((req.query as any)?.q || '').trim();

    if (!leagueId) {
      return reply.code(400).send({ error: 'leagueId is required' });
    }

    const teams = await prisma.team.findMany({
      where: q
        ? { leagueId, league: { deletedAt: null }, name: { contains: q, mode: 'insensitive' } }
        : { leagueId, league: { deletedAt: null } },
      orderBy: [{ name: 'asc' }],
      take: 300,
    });

    return reply.send({ teams });
  });

  app.get('/admin/team-images', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (_req, reply) => {
    const leagueRows = await prisma.team.findMany({
      where: { logoUrl: { not: null }, league: { deletedAt: null } },
      select: { logoUrl: true },
      distinct: ['logoUrl'],
      take: 200,
      orderBy: { createdAt: 'desc' },
    });

    const images = Array.from(
      new Set(
        leagueRows
          .map((row) => row.logoUrl)
          .filter((url): url is string => Boolean(url) && !isCatalogFlagUrl(url))
      )
    );

    return reply.send({ images: images.slice(0, 200) });
  });

  app.post('/admin/teams', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (req, reply) => {
    const parsed = adminLeagueTeamSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const leagueId = parsed.data.leagueId.trim();
    const name = parsed.data.name.trim();
    const logoUrl = parsed.data.logoUrl.trim();

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league || league.deletedAt) return reply.code(404).send({ error: 'League not found' });

    const team = await prisma.team.create({
      data: { leagueId, name, logoUrl },
    });

    return reply.send({ team });
  });

  app.patch('/admin/teams/:id', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (req, reply) => {
    const parsed = adminLeagueTeamSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const id = (req.params as any).id as string;
    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Team not found' });

    const leagueId = parsed.data.leagueId.trim();
    if (existing.leagueId !== leagueId) {
      return reply.code(400).send({ error: 'Team does not belong to this league' });
    }

    const name = parsed.data.name.trim();
    const logoUrl = parsed.data.logoUrl.trim();

    const team = await prisma.team.update({
      where: { id },
      data: { name, logoUrl },
    });

    return reply.send({ team });
  });

  app.delete('/admin/teams/:id', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (req, reply) => {
    const id = (req.params as any).id as string;
    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Team not found' });

    const matchesUsingTeam = await prisma.match.count({
      where: {
        OR: [{ homeTeamId: id }, { awayTeamId: id }],
      },
    });

    if (matchesUsingTeam > 0) {
      return reply.code(409).send({
        error: `No puedes eliminar este equipo porque tiene ${matchesUsingTeam} partidos. Primero borra esos partidos y luego elimina el equipo.`,
      });
    }

    await prisma.team.delete({ where: { id } });
    return reply.send({ ok: true });
  });

  app.post('/admin/teams/bulk-delete', { preHandler: [app.authenticate, app.requireSuperadmin] }, async (req, reply) => {
    const parsed = bulkDeleteTeamsSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const leagueId = parsed.data.leagueId.trim();
    const ids = Array.from(new Set(parsed.data.ids.map((id) => id.trim()).filter(Boolean)));

    let deleted = 0;
    const errors: Array<{ id: string; message: string }> = [];

    for (const id of ids) {
      const team = await prisma.team.findUnique({
        where: { id },
        select: { id: true, leagueId: true, name: true },
      });

      if (!team) {
        errors.push({ id, message: 'Equipo no encontrado' });
        continue;
      }

      if (team.leagueId !== leagueId) {
        errors.push({ id, message: 'El equipo no pertenece a la quiniela seleccionada' });
        continue;
      }

      const matchesUsingTeam = await prisma.match.count({
        where: {
          OR: [{ homeTeamId: id }, { awayTeamId: id }],
        },
      });

      if (matchesUsingTeam > 0) {
        errors.push({ id, message: `Tiene ${matchesUsingTeam} partidos. Primero borra esos partidos y luego elimina el equipo.` });
        continue;
      }

      try {
        await prisma.team.delete({ where: { id } });
        deleted += 1;
      } catch (error: any) {
        errors.push({ id, message: error?.message ?? 'No se pudo borrar el equipo' });
      }
    }

    return reply.send({
      summary: {
        requested: ids.length,
        deleted,
        skipped: errors.length,
      },
      errors: errors.slice(0, 50),
    });
  });

  // Equipos por quiniela (miembros pueden ver, OWNER puede crear)
  app.get('/leagues/:id/teams', { preHandler: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as any).uid as string;
    const leagueId = (req.params as any).id as string;
    const q = String((req.query as any)?.q || '').trim();

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league || league.deletedAt) return reply.code(404).send({ error: 'League not found' });

    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: uid } },
    });
    if (!membership && !isSuperadmin(req)) return reply.code(403).send({ error: 'Not a member' });

    const canManage = membership?.role === 'OWNER' || isSuperadmin(req);

    const teams = await prisma.team.findMany({
      where: q
        ? { leagueId, name: { contains: q, mode: 'insensitive' } }
        : { leagueId },
      orderBy: [{ name: 'asc' }],
      take: 300,
    });

    return reply.send({ teams, canManage });
  });

  app.get('/leagues/:id/team-images', { preHandler: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as any).uid as string;
    const leagueId = (req.params as any).id as string;

    const league = await findActiveLeagueById(leagueId);
    if (!league) return reply.code(404).send({ error: 'League not found' });

    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: uid } },
    });
    if (!membership && !isSuperadmin(req)) return reply.code(403).send({ error: 'Not a member' });

    const rows = await prisma.team.findMany({
      where: { logoUrl: { not: null } },
      select: { logoUrl: true },
      distinct: ['logoUrl'],
      take: 200,
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      images: rows
        .map((row) => row.logoUrl)
        .filter((url): url is string => Boolean(url) && !isCatalogFlagUrl(url)),
    });
  });

  app.post('/leagues/:id/teams', { preHandler: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as any).uid as string;
    const leagueId = (req.params as any).id as string;

    const parsed = adminLeagueTeamSchema.safeParse({
      ...(req.body as Record<string, unknown>),
      leagueId,
    });
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: uid } },
    });

    const canManage = membership?.role === 'OWNER' || isSuperadmin(req);
    if (!canManage) return reply.code(403).send({ error: 'Forbidden' });

    const league = await findActiveLeagueById(leagueId);
    if (!league) return reply.code(404).send({ error: 'League not found' });

    const name = parsed.data.name.trim();
    const logoUrl = parsed.data.logoUrl.trim();

    const team = await prisma.team.create({
      data: { leagueId, name, logoUrl },
    });

    return reply.send({ team });
  });

  // Detalle liga + miembros
  app.get('/leagues/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as any).uid as string;
    const id = (req.params as any).id as string;

    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId: id, userId: uid } },
    });
    if (!membership && !isSuperadmin(req)) return reply.code(403).send({ error: 'Not a member' });

    const league = await prisma.league.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, username: true, fullName: true } },
        members: { include: { user: { select: { id: true, username: true, fullName: true } } } },
        _count: { select: { matches: true, predictions: true } },
      },
    });

    return reply.send({ league });
  });

  // Calendario de la liga + mi predicción por partido
  app.get('/leagues/:id/matches', { preHandler: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as any).uid as string;
    const id = (req.params as any).id as string;

    const league = await findActiveLeagueById(id);
    if (!league) return reply.code(404).send({ error: 'League not found' });

    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId: id, userId: uid } },
    });
    if (!membership && !isSuperadmin(req)) return reply.code(403).send({ error: 'Not a member' });

    const canManage = membership?.role === 'OWNER';

    const matches = await prisma.match.findMany({
      where: { leagueId: league.id },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffAt: 'asc' },
    });

    const preds = await prisma.prediction.findMany({
      where: { leagueId: id, userId: uid },
      select: { matchId: true, predHome: true, predAway: true, predPenaltyWinnerIsHome: true, points: true },
    });

    const predMap = new Map(preds.map(p => [p.matchId, p]));

    const items = matches.map(m => ({
      ...m,
      myPrediction: predMap.get(m.id) ?? null,
    }));

    return reply.send({ league, matches: items, canManage });
  });

  // OWNER o SUPERADMIN: crear partido dentro de la quiniela
  app.post('/leagues/:id/matches', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = createMatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const uid = (req.user as any).uid as string;
    const leagueId = (req.params as any).id as string;
    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: uid } },
    });

    const canManage = membership?.role === 'OWNER' || isSuperadmin(req);
    if (!canManage) return reply.code(403).send({ error: 'Forbidden' });

    const league = await findActiveLeagueById(leagueId);
    if (!league) return reply.code(404).send({ error: 'League not found' });

    const { homeTeam, awayTeam, kickoffAt, lockAt, group } = parsed.data;
    if (homeTeam.trim().toLowerCase() === awayTeam.trim().toLowerCase()) {
      return reply.code(400).send({ error: 'Los equipos deben ser distintos' });
    }

    const kickoffDate = new Date(kickoffAt);
    const lockDate = lockAt ? new Date(lockAt) : kickoffDate;
    if (Number.isNaN(kickoffDate.getTime()) || Number.isNaN(lockDate.getTime())) {
      return reply.code(400).send({ error: 'Fecha inválida' });
    }
    if (lockDate > kickoffDate) {
      return reply.code(400).send({ error: 'El cierre no puede ser después del kickoff' });
    }

    const normalizedHome = homeTeam.trim();
    const normalizedAway = awayTeam.trim();
    const normalizedGroup = group?.trim() || null;

    const [home, away] = await Promise.all([
      prisma.team.findFirst({ where: { leagueId, name: normalizedHome } }),
      prisma.team.findFirst({ where: { leagueId, name: normalizedAway } }),
    ]);

    if (!home || !away) {
      return reply.code(400).send({
        error: 'Primero registra ambos equipos en la seccion Agregar equipos de esta quiniela',
      });
    }

    const match = await prisma.match.create({
      data: {
        leagueId,
        homeTeamId: home.id,
        awayTeamId: away.id,
        kickoffAt: kickoffDate,
        lockAt: lockDate,
        groupName: normalizedGroup,
      },
      include: { homeTeam: true, awayTeam: true },
    });

    return reply.send({ match });
  });

  // OWNER o SUPERADMIN: importar partidos desde CSV (nombre de equipo + horario)
  app.post('/leagues/:id/matches/import-csv', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = importMatchesCsvSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const uid = (req.user as any).uid as string;
    const leagueId = (req.params as any).id as string;

    const league = await findActiveLeagueById(leagueId);
    if (!league) return reply.code(404).send({ error: 'League not found' });

    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: uid } },
    });

    const canManage = membership?.role === 'OWNER' || isSuperadmin(req);
    if (!canManage) return reply.code(403).send({ error: 'Forbidden' });

    let parsedCsv: { rows: CsvMatchRow[]; errors: CsvImportError[] };
    try {
      parsedCsv = parseMatchesCsv(parsed.data.csvContent);
    } catch (error: any) {
      return reply.code(400).send({ error: error?.message ?? 'CSV inválido' });
    }

    const existingMatches = await prisma.match.findMany({
      where: { leagueId },
      select: {
        kickoffAt: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    });

    const existingKeys = new Set(
      existingMatches.map((match) => `${normalizeTeamForMatchKey(match.homeTeam.name)}|${normalizeTeamForMatchKey(match.awayTeam.name)}|${match.kickoffAt.getTime()}`),
    );

    const csvKeys = new Set<string>();
    const matchesToCreateRows: CsvMatchRow[] = [];
    const repeatedRows: CsvImportPreviewMatch[] = [];

    for (const row of parsedCsv.rows) {
      const rowKey = buildCsvMatchPreviewKey(row);

      if (csvKeys.has(rowKey)) {
        repeatedRows.push(toCsvImportPreviewMatch(row, 'Duplicado dentro del CSV'));
        continue;
      }

      csvKeys.add(rowKey);

      if (existingKeys.has(rowKey)) {
        repeatedRows.push(toCsvImportPreviewMatch(row, 'Ya existe en esta quiniela (mismos equipos y misma hora)'));
        continue;
      }

      matchesToCreateRows.push(row);
    }

    if (!parsed.data.confirmImport) {
      return reply.send({
        confirmationRequired: true,
        summary: {
          rowsReceived: parsedCsv.rows.length,
          validRows: parsedCsv.rows.length,
          matchesToCreate: matchesToCreateRows.length,
          repeatedMatches: repeatedRows.length,
          createdTeams: 0,
          updatedTeams: 0,
          createdMatches: 0,
          updatedMatches: 0,
          unchangedMatches: 0,
          errorRows: parsedCsv.errors.length,
        },
        preview: {
          toCreate: matchesToCreateRows.slice(0, 80).map((row) => toCsvImportPreviewMatch(row)),
          repeated: repeatedRows.slice(0, 80),
        },
        errors: parsedCsv.errors.slice(0, 40),
      });
    }

    let createdTeams = 0;
    let updatedTeams = 0;
    let createdMatches = 0;
    let repeatedOnImport = 0;

    const errors = [...parsedCsv.errors];
    const repeatedAfterConfirm: CsvImportPreviewMatch[] = [...repeatedRows];

    for (const row of matchesToCreateRows) {
      try {
        const homeResult = await findOrCreateTeamForCsvImport({
          leagueId,
          name: row.homeTeam,
          code: row.homeCode,
          logoUrl: row.homeLogoUrl,
        });

        const awayResult = await findOrCreateTeamForCsvImport({
          leagueId,
          name: row.awayTeam,
          code: row.awayCode,
          logoUrl: row.awayLogoUrl,
        });

        if (homeResult.created) createdTeams += 1;
        if (awayResult.created) createdTeams += 1;
        if (homeResult.updated) updatedTeams += 1;
        if (awayResult.updated) updatedTeams += 1;

        const existing = await prisma.match.findFirst({
          where: {
            leagueId,
            homeTeamId: homeResult.team.id,
            awayTeamId: awayResult.team.id,
            kickoffAt: row.kickoffAt,
          },
        });

        if (existing) {
          repeatedOnImport += 1;
          repeatedAfterConfirm.push(
            toCsvImportPreviewMatch(row, 'Ya existe en esta quiniela (mismos equipos y misma hora)'),
          );
          continue;
        }

        await prisma.match.create({
          data: {
            leagueId,
            homeTeamId: homeResult.team.id,
            awayTeamId: awayResult.team.id,
            kickoffAt: row.kickoffAt,
            lockAt: row.lockAt,
            groupName: row.groupName,
          },
        });
        createdMatches += 1;
      } catch (error: any) {
        errors.push({
          row: row.rowNumber,
          message: error?.message ?? 'Error inesperado al importar fila',
        });
      }
    }

    return reply.send({
      confirmationRequired: false,
      summary: {
        rowsReceived: parsedCsv.rows.length,
        validRows: parsedCsv.rows.length,
        matchesToCreate: matchesToCreateRows.length,
        repeatedMatches: repeatedAfterConfirm.length,
        createdTeams,
        updatedTeams,
        createdMatches,
        updatedMatches: 0,
        unchangedMatches: repeatedOnImport,
        errorRows: errors.length,
      },
      preview: {
        toCreate: matchesToCreateRows.slice(0, 80).map((row) => toCsvImportPreviewMatch(row)),
        repeated: repeatedAfterConfirm.slice(0, 80),
      },
      errors: errors.slice(0, 40),
    });
  });

  // OWNER o SUPERADMIN: editar partido
  app.patch('/leagues/:leagueId/matches/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = createMatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const uid = (req.user as any).uid as string;
    const leagueId = (req.params as any).leagueId as string;
    const matchId = (req.params as any).id as string;

    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: uid } },
    });

    const canManage = membership?.role === 'OWNER' || isSuperadmin(req);
    if (!canManage) return reply.code(403).send({ error: 'Forbidden' });

    const existingMatch = await prisma.match.findUnique({ where: { id: matchId } });
    if (!existingMatch || existingMatch.leagueId !== leagueId) {
      return reply.code(404).send({ error: 'Match not found in this league' });
    }

    const { homeTeam, awayTeam, kickoffAt, lockAt, group } = parsed.data;
    if (homeTeam.trim().toLowerCase() === awayTeam.trim().toLowerCase()) {
      return reply.code(400).send({ error: 'Los equipos deben ser distintos' });
    }

    const kickoffDate = new Date(kickoffAt);
    const lockDate = lockAt ? new Date(lockAt) : kickoffDate;
    if (Number.isNaN(kickoffDate.getTime()) || Number.isNaN(lockDate.getTime())) {
      return reply.code(400).send({ error: 'Fecha inválida' });
    }
    if (lockDate > kickoffDate) {
      return reply.code(400).send({ error: 'El cierre no puede ser después del kickoff' });
    }

    const normalizedHome = homeTeam.trim();
    const normalizedAway = awayTeam.trim();
    const normalizedGroup = group?.trim() || null;

    const [home, away] = await Promise.all([
      prisma.team.findFirst({ where: { leagueId, name: normalizedHome } }),
      prisma.team.findFirst({ where: { leagueId, name: normalizedAway } }),
    ]);

    if (!home || !away) {
      return reply.code(400).send({
        error: 'Primero registra ambos equipos en la seccion Agregar equipos de esta quiniela',
      });
    }

    const match = await prisma.match.update({
      where: { id: matchId },
      data: {
        homeTeamId: home.id,
        awayTeamId: away.id,
        kickoffAt: kickoffDate,
        lockAt: lockDate,
        groupName: normalizedGroup,
      },
      include: { homeTeam: true, awayTeam: true },
    });

    return reply.send({ match });
  });

  // OWNER o SUPERADMIN: eliminar partido
  app.delete('/leagues/:leagueId/matches/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as any).uid as string;
    const leagueId = (req.params as any).leagueId as string;
    const matchId = (req.params as any).id as string;

    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: uid } },
    });

    const canManage = membership?.role === 'OWNER' || isSuperadmin(req);
    if (!canManage) return reply.code(403).send({ error: 'Forbidden' });

    const existingMatch = await prisma.match.findUnique({ where: { id: matchId } });
    if (!existingMatch || existingMatch.leagueId !== leagueId) {
      return reply.code(404).send({ error: 'Match not found in this league' });
    }

    await prisma.$transaction([
      prisma.prediction.deleteMany({ where: { matchId } }),
      prisma.match.delete({ where: { id: matchId } }),
    ]);

    return reply.send({ ok: true });
  });

  app.post('/leagues/:leagueId/matches/bulk-delete', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = bulkDeleteSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const uid = (req.user as any).uid as string;
    const leagueId = (req.params as any).leagueId as string;

    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: uid } },
    });

    const canManage = membership?.role === 'OWNER' || isSuperadmin(req);
    if (!canManage) return reply.code(403).send({ error: 'Forbidden' });

    const ids = Array.from(new Set(parsed.data.ids.map((id) => id.trim()).filter(Boolean)));

    const existing = await prisma.match.findMany({
      where: {
        leagueId,
        id: { in: ids },
      },
      select: { id: true },
    });

    const existingIds = existing.map((item) => item.id);

    if (existingIds.length > 0) {
      await prisma.$transaction([
        prisma.prediction.deleteMany({ where: { matchId: { in: existingIds } } }),
        prisma.match.deleteMany({ where: { leagueId, id: { in: existingIds } } }),
      ]);
    }

    return reply.send({
      summary: {
        requested: ids.length,
        deleted: existingIds.length,
        skipped: ids.length - existingIds.length,
      },
      missingIds: ids.filter((id) => !existingIds.includes(id)).slice(0, 50),
    });
  });

  // Guardar pronóstico (upsert)
  app.post('/leagues/:id/predictions', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = predictionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload' });

    const uid = (req.user as any).uid as string;
    const leagueId = (req.params as any).id as string;

    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: uid } },
    });
    if (!membership) return reply.code(403).send({ error: 'Not a member' });

    const league = await findActiveLeagueById(leagueId);
    if (!league) return reply.code(404).send({ error: 'League not found' });

    const { matchId, predHome, predAway, predPenaltyWinnerIsHome } = parsed.data;

    const result = await upsertLeaguePrediction({
      leagueId: league.id,
      userId: uid,
      matchId,
      predHome,
      predAway,
      predPenaltyWinnerIsHome,
    });

    if (!result.ok) {
      return reply.code(result.status).send({ error: result.error, code: result.code, matchId: result.matchId });
    }

    const prediction = result.prediction;

    return reply.send({ prediction });
  });

  // Guardar varios pronósticos de una sola vez
  app.post('/leagues/:id/predictions/bulk', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = bulkPredictionsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    const incomingPredictions = Array.isArray(parsed.data) ? parsed.data : parsed.data.predictions;

    const uid = (req.user as any).uid as string;
    const leagueId = (req.params as any).id as string;

    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: uid } },
    });
    if (!membership) return reply.code(403).send({ error: 'Not a member' });

    const league = await findActiveLeagueById(leagueId);
    if (!league) return reply.code(404).send({ error: 'League not found' });

    // Keep last edit for repeated match IDs.
    const byMatch = new Map<string, { matchId: string; predHome: number; predAway: number; predPenaltyWinnerIsHome?: boolean | null }>();
    incomingPredictions.forEach((item) => {
      byMatch.set(item.matchId, item);
    });

    const uniquePredictions = Array.from(byMatch.values());
    const saved: any[] = [];
    const failed: Array<{ matchId: string; error: string; code: string }> = [];

    for (const item of uniquePredictions) {
      const result = await upsertLeaguePrediction({
        leagueId: league.id,
        userId: uid,
        matchId: item.matchId,
        predHome: item.predHome,
        predAway: item.predAway,
        predPenaltyWinnerIsHome: item.predPenaltyWinnerIsHome,
      });

      if (result.ok) {
        saved.push(result.prediction);
      } else {
        failed.push({
          matchId: result.matchId,
          error: result.error,
          code: result.code,
        });
      }
    }

    return reply.send({
      summary: {
        requested: incomingPredictions.length,
        processed: uniquePredictions.length,
        saved: saved.length,
        failed: failed.length,
      },
      saved,
      failed,
    });
  });

  // Leaderboard por liga (sum points)
  app.get('/leagues/:id/leaderboard', { preHandler: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as any).uid as string;
    const leagueId = (req.params as any).id as string;

    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: uid } },
    });
    if (!membership && !isSuperadmin(req)) return reply.code(403).send({ error: 'Not a member' });

    const members = await prisma.leagueMember.findMany({
      where: { leagueId },
      include: { user: { select: { id: true, username: true, fullName: true, role: true } } },
    });

    const points = await prisma.prediction.groupBy({
      by: ['userId'],
      where: { leagueId, points: { not: null } },
      _sum: { points: true },
    });

    const map = new Map(points.map(p => [p.userId, p._sum.points ?? 0]));

    const leaderboard = members
      .filter((m) => m.user.role !== 'SUPERADMIN')
      .map((m) => {
        const displayName = m.user.fullName?.trim() || `@${m.user.username}`;
        return {
          userId: m.user.id,
          username: m.user.username,
          fullName: m.user.fullName,
          displayName,
          totalPoints: map.get(m.user.id) ?? 0,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints || a.displayName.localeCompare(b.displayName));

    return reply.send({ leaderboard });
  });

  // OWNER: set match result + recalc points for all predictions for that match
  app.patch('/leagues/:leagueId/matches/:id/result', { preHandler: [app.authenticate] }, async (req, reply) => {
    const uid = (req.user as any).uid as string;
    const leagueId = (req.params as any).leagueId as string;
    const matchId = (req.params as any).id as string;
    const parsed = setResultSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload' });

    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId: uid } },
    });
    if (membership?.role !== 'OWNER') return reply.code(403).send({ error: 'Only league owner can set results' });

    const existingMatch = await prisma.match.findUnique({ where: { id: matchId } });
    if (!existingMatch || existingMatch.leagueId !== leagueId) {
      return reply.code(404).send({ error: 'Match not found in this league' });
    }

    const { finalHome, finalAway } = parsed.data;
    const finalPenaltyWinnerIsHome = finalHome === finalAway ? (parsed.data.finalPenaltyWinnerIsHome ?? null) : null;

    const match = await prisma.match.update({
      where: { id: matchId },
      data: { finalHome, finalAway, finalPenaltyWinnerIsHome },
    });

    // find all predictions for this match across all leagues
    const preds = await prisma.prediction.findMany({
      where: { matchId },
      include: { league: true },
    });

    const updates = preds.map(p => {
      const pts = calcPoints(
        p.predHome, p.predAway,
        finalHome,
        finalAway,
        p.predPenaltyWinnerIsHome,
        finalPenaltyWinnerIsHome,
      );
      return prisma.prediction.update({ where: { id: p.id }, data: { points: pts } });
    });

    await prisma.$transaction(updates);

    return reply.send({ match, updatedPredictions: preds.length });
  });

}
