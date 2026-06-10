import {
	Prisma,
	PrismaClient,
} from '@prisma/client';

export const prisma = new PrismaClient();

const RETRYABLE_ACTIONS = new Set<Prisma.PrismaAction>([
	'findUnique',
	'findUniqueOrThrow',
	'findFirst',
	'findFirstOrThrow',
	'findMany',
	'count',
	'aggregate',
	'groupBy',
]);

const RETRYABLE_ERROR_CODES = new Set(['P1001', 'P1002', 'P1017', 'P2024']);
const MAX_DB_RETRIES = Math.max(1, Number(process.env.DB_RETRY_ATTEMPTS || 3));
const RETRY_BASE_DELAY_MS = Math.max(100, Number(process.env.DB_RETRY_BASE_DELAY_MS || 500));

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableDbError(error: unknown) {
	if (!(error instanceof Error)) return false;

	const code = (error as { code?: string }).code;
	if (code && RETRYABLE_ERROR_CODES.has(code)) return true;

	const message = error.message.toLowerCase();
	if (message.includes("can't reach database server")) return true;
	if (message.includes('server has closed the connection')) return true;
	if (message.includes('timed out')) return true;
	return false;
}

prisma.$use(async (params, next) => {
	if (!RETRYABLE_ACTIONS.has(params.action as Prisma.PrismaAction)) {
		return next(params);
	}

	let attempt = 0;
	while (attempt < MAX_DB_RETRIES) {
		try {
			return await next(params);
		} catch (error) {
			attempt += 1;
			const canRetry = isRetryableDbError(error) && attempt < MAX_DB_RETRIES;
			if (!canRetry) throw error;

			await prisma.$connect().catch(() => undefined);
			await sleep(RETRY_BASE_DELAY_MS * attempt);
		}
	}

	return next(params);
});
