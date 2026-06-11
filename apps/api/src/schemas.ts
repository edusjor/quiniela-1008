import { z } from 'zod';

const imageDataUrlSchema = z.string().regex(/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+$/);

export const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^@?[A-Za-z0-9._]+$/),
  fullName: z.string().min(5).max(120),
  nationalId: z.string().min(5).max(32).regex(/^[0-9A-Za-z\-\s]+$/),
  instagramUsername: z.string().min(2).max(40).regex(/^@?[A-Za-z0-9._]+$/).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  followsInstagram: z.boolean().optional(),
  acceptedRules: z.boolean().refine((value) => value, {
    message: 'Debes aceptar el reglamento de la quiniela',
  }),
  password: z.string().min(6).max(72),
});

export const loginSchema = z.object({
  identifier: z.string().min(3), // correo o cédula
  password: z.string().min(6).max(72),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().min(3),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(512),
  password: z.string().min(6).max(72),
});

export const updateProfileSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(3).max(30).regex(/^@?[A-Za-z0-9._]+$/).optional(),
  fullName: z.string().min(5).max(120).optional(),
  nationalId: z.string().min(5).max(32).regex(/^[0-9A-Za-z\-\s]+$/).optional(),
  instagramUsername: z.string().min(2).max(40).regex(/^@?[A-Za-z0-9._]+$/).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const createLeagueSchema = z.object({
  name: z.string().min(2).max(64),
  description: z.string().max(255).optional(),
  isPublic: z.boolean().optional().default(false),
});

export const joinLeagueSchema = z.object({
  joinCode: z.string().min(4).max(12),
});

export const createMatchSchema = z.object({
  homeTeam: z.string().min(2).max(64),
  awayTeam: z.string().min(2).max(64),
  kickoffAt: z.string().datetime(),
  lockAt: z.string().datetime().optional(),
  group: z.string().trim().min(1).max(64).optional(),
});

export const importMatchesCsvSchema = z.object({
  csvContent: z.string().min(1).max(2_000_000),
});

const bulkIdsSchema = z.array(z.string().min(3)).min(1).max(500);

export const bulkDeleteSchema = z.object({
  ids: bulkIdsSchema,
});

export const bulkDeleteTeamsSchema = z.object({
  leagueId: z.string().min(3),
  ids: bulkIdsSchema,
});

export const predictionSchema = z.object({
  matchId: z.string(),
  predHome: z.number().int().min(0).max(99),
  predAway: z.number().int().min(0).max(99),
});

const predictionsArraySchema = z.array(predictionSchema).min(1).max(200);

export const bulkPredictionsSchema = z.union([
  predictionsArraySchema,
  z.object({ predictions: predictionsArraySchema }),
]);

export const setResultSchema = z.object({
  finalHome: z.number().int().min(0).max(99),
  finalAway: z.number().int().min(0).max(99),
});
const imageHttpUrlSchema = z.string().url().refine((url) => {
  const clean = url.split('#')[0].split('?')[0].toLowerCase();
  return /\.(png|jpg|jpeg|webp|gif|svg)$/.test(clean);
}, { message: 'logoUrl must be a direct image URL' });
const teamImageSchema = z.union([imageHttpUrlSchema, imageDataUrlSchema]);

export const adminLeagueTeamSchema = z.object({
  leagueId: z.string().min(3),
  name: z.string().min(2).max(64),
  logoUrl: teamImageSchema,
});
