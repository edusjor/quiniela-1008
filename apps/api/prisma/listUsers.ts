import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      username: true,
      fullName: true,
      nationalId: true,
      birthDate: true,
      followsInstagram: true,
      role: true,
      createdAt: true,
    },
  });

  if (users.length === 0) {
    console.log('No users found.');
    return;
  }

  console.table(
    users.map((user) => ({
      ...user,
      birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
      createdAt: user.createdAt.toISOString(),
    }))
  );
}

main()
  .catch((error) => {
    console.error('Failed to list users:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
