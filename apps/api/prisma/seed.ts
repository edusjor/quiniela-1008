import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { buildDefaultMatchTemplates, DEFAULT_TEAMS } from '../src/utils.js';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_SUPERADMIN_EMAIL?.trim();
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  const username = process.env.SEED_SUPERADMIN_USERNAME?.trim() || 'superadmin';
  if (!email || !password) {
    throw new Error('Missing SEED_SUPERADMIN_EMAIL or SEED_SUPERADMIN_PASSWORD in environment');
  }
  const fullName = 'Administrador 1008';
  const nationalId = 'ADMIN-0001';
  const birthDate = new Date('1990-01-01T00:00:00.000Z');
  const purchaseProofImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5+3ioAAAAASUVORK5CYII=';

  await prisma.user.upsert({
    where: { email },
    update: {
      username,
      fullName,
      nationalId,
      birthDate,
      purchaseProofImage,
      followsInstagram: true,
      passwordHash: await bcrypt.hash(password, 10),
      role: Role.SUPERADMIN,
    },
    create: {
      email,
      username,
      fullName,
      nationalId,
      birthDate,
      purchaseProofImage,
      followsInstagram: true,
      passwordHash: await bcrypt.hash(password, 10),
      role: Role.SUPERADMIN,
    },
  });

  const adminUser = await prisma.user.findUnique({ where: { email } });
  if (adminUser) {
    const league = await prisma.league.upsert({
      where: { id: 'demo_league' },
      update: {
        name: 'Quiniela Demo',
        description: 'Quiniela base para probar el flujo completo.',
      },
      create: {
        id: 'demo_league',
        name: 'Quiniela Demo',
        description: 'Quiniela base para probar el flujo completo.',
        joinCode: 'DEMO12',
        createdById: adminUser.id,
        pointsExact: 3,
        pointsOutcome: 1,
        isPublic: false,
      },
    });

    for (const team of DEFAULT_TEAMS) {
      const existing = await prisma.team.findFirst({
        where: { leagueId: league.id, code: team.code },
      });

      if (existing) {
        await prisma.team.update({
          where: { id: existing.id },
          data: { name: team.name },
        });
      } else {
        await prisma.team.create({
          data: {
            leagueId: league.id,
            name: team.name,
            code: team.code,
          },
        });
      }
    }

    const crc = await prisma.team.findFirst({ where: { leagueId: league.id, code: 'CRC' } });
    const arg = await prisma.team.findFirst({ where: { leagueId: league.id, code: 'ARG' } });
    const esp = await prisma.team.findFirst({ where: { leagueId: league.id, code: 'ESP' } });
    const bra = await prisma.team.findFirst({ where: { leagueId: league.id, code: 'BRA' } });

    if (!crc || !arg || !esp || !bra) throw new Error('League teams not created');

    await prisma.leagueMember.upsert({
      where: { leagueId_userId: { leagueId: league.id, userId: adminUser.id } },
      update: { role: 'OWNER' },
      create: { leagueId: league.id, userId: adminUser.id, role: 'OWNER' },
    });

    const matches = buildDefaultMatchTemplates();
    const teamByCode = {
      CRC: crc,
      ARG: arg,
      ESP: esp,
      BRA: bra,
    } as const;

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const homeTeam = teamByCode[match.homeCode as keyof typeof teamByCode];
      const awayTeam = teamByCode[match.awayCode as keyof typeof teamByCode];

      await prisma.match.upsert({
        where: { id: `demo_league_match_${i + 1}` },
        update: {
          leagueId: league.id,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          kickoffAt: match.kickoffAt,
          lockAt: match.lockAt,
        },
        create: {
          id: `demo_league_match_${i + 1}`,
          leagueId: league.id,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          kickoffAt: match.kickoffAt,
          lockAt: match.lockAt,
        },
      });
    }
  }

  console.log('Seed listo ✅');
  console.log(`SUPERADMIN: ${email}`);
  console.log('Quiniela demo joinCode: DEMO12');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
