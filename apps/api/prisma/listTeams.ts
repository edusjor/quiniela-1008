import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const teams = await prisma.team.findMany({
    orderBy: [{ leagueId: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      leagueId: true,
      name: true,
      code: true,
      logoUrl: true,
    },
  });

  console.table(
    teams.map((team) => ({
      ...team,
      logoUrl: team.logoUrl ? (team.logoUrl.length > 80 ? `${team.logoUrl.slice(0, 80)}...` : team.logoUrl) : null,
    }))
  );
}

main()
  .catch((error) => {
    console.error('Failed to list teams:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
