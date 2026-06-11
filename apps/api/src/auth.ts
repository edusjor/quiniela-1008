import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, updateProfileSchema } from './schemas.js';
import { sendPasswordResetEmail } from './mailer.js';

function normalizeNationalId(value: string) {
  const compact = value.trim().replace(/\s+/g, '');
  const digitsOnly = compact.replace(/\D/g, '');
  return digitsOnly.length >= 5 ? digitsOnly : compact.toUpperCase();
}

function normalizeInstagramUsername(value?: string) {
  if (!value) return null;
  const normalized = value.trim().replace(/^@+/, '').toLowerCase();
  return normalized || null;
}

function normalizeUsername(value: string) {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function looksLikeEmail(value: string) {
  return value.includes('@');
}

function looksLikeNationalId(value: string) {
  return normalizeNationalId(value).length >= 5;
}

function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function buildPasswordResetUrl(rawToken: string) {
  const baseUrl = (process.env.WEB_URL || 'http://localhost:18931').trim().replace(/\/$/, '');
  return `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

function isLocalWebUrl(url: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(url);
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const {
      email,
      username,
      fullName,
      nationalId,
      instagramUsername,
      birthDate,
      followsInstagram,
      acceptedRules,
      password,
    } = parsed.data;

    // Explicitly consume this field so the register contract stays in sync with UI requirements.
    void acceptedRules;

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = normalizeUsername(username);
    const cleanFullName = fullName.trim();
    const cleanNationalId = normalizeNationalId(nationalId);
    const cleanInstagramUsername = normalizeInstagramUsername(instagramUsername);
    const birthDateValue = new Date(`${birthDate}T00:00:00.000Z`);

    if (cleanUsername.length < 3 || cleanUsername.length > 24) {
      return reply.code(400).send({ error: 'El nombre de usuario debe tener entre 3 y 24 caracteres' });
    }

    if (!/^[a-z0-9._]+$/.test(cleanUsername)) {
      return reply.code(400).send({ error: 'El nombre de usuario solo puede usar letras, números, punto y guion bajo' });
    }

    if (cleanNationalId.length < 5) {
      return reply.code(400).send({ error: 'Número de cédula inválido' });
    }

    if (cleanInstagramUsername && cleanInstagramUsername.length < 2) {
      return reply.code(400).send({ error: 'Usuario de Instagram inválido' });
    }

    if (Number.isNaN(birthDateValue.getTime())) {
      return reply.code(400).send({ error: 'Fecha de nacimiento inválida' });
    }

    if (birthDateValue > new Date()) {
      return reply.code(400).send({ error: 'La fecha de nacimiento no puede ser futura' });
    }

    const existsEmail = await prisma.user.findFirst({
      where: {
        email: {
          equals: cleanEmail,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });
    if (existsEmail) return reply.code(409).send({ error: 'Ya existe una cuenta con este correo electrónico' });

    const existsUsername = await prisma.user.findFirst({
      where: {
        username: {
          equals: cleanUsername,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });
    if (existsUsername) return reply.code(409).send({ error: 'Ya existe una cuenta con este nombre de usuario' });

    const existsNationalId = await prisma.user.findUnique({
      where: { nationalId: cleanNationalId },
      select: { id: true },
    });
    if (existsNationalId) return reply.code(409).send({ error: 'Ya existe una cuenta con este número de cédula' });

    try {
      const user = await prisma.user.create({
        data: {
          email: cleanEmail,
          username: cleanUsername,
          fullName: cleanFullName,
          nationalId: cleanNationalId,
          instagramUsername: cleanInstagramUsername,
          birthDate: birthDateValue,
          followsInstagram: Boolean(followsInstagram),
          passwordHash: await bcrypt.hash(password, 10),
        },
        select: {
          id: true,
          email: true,
          username: true,
          fullName: true,
          nationalId: true,
          instagramUsername: true,
          birthDate: true,
          followsInstagram: true,
          role: true,
        },
      });

      return reply.send({ user });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(',')
          : String(error.meta?.target ?? '');
        if (target.includes('email')) {
          return reply.code(409).send({ error: 'Ya existe una cuenta con este correo electrónico' });
        }
        if (target.includes('username')) {
          return reply.code(409).send({ error: 'Ya existe una cuenta con este nombre de usuario' });
        }
        if (target.includes('nationalId')) {
          return reply.code(409).send({ error: 'Ya existe una cuenta con este número de cédula' });
        }
        return reply.code(409).send({ error: 'Ya existe una cuenta con los datos indicados' });
      }
      throw error;
    }
  });

  app.post('/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload' });

    const { identifier, password } = parsed.data;
    const cleanIdentifier = identifier.trim();
    const user = await prisma.user.findFirst({
      where: looksLikeEmail(cleanIdentifier)
        ? {
            email: {
              equals: normalizeEmail(cleanIdentifier),
              mode: 'insensitive' as const,
            },
          }
        : looksLikeNationalId(cleanIdentifier)
          ? {
              nationalId: normalizeNationalId(cleanIdentifier),
            }
          : {
              username: {
                equals: normalizeUsername(cleanIdentifier),
                mode: 'insensitive' as const,
              },
            },
    });

    if (!user) return reply.code(401).send({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: 'Invalid credentials' });

    const token = app.jwt.sign({ uid: user.id, role: user.role });

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        nationalId: user.nationalId,
        instagramUsername: user.instagramUsername,
        birthDate: user.birthDate,
        followsInstagram: user.followsInstagram,
        role: user.role,
      },
    });
  });

  app.post('/auth/password/forgot', async (req, reply) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const cleanIdentifier = parsed.data.identifier.trim();
    const emailCandidate = looksLikeEmail(cleanIdentifier) ? normalizeEmail(cleanIdentifier) : null;
    let user: {
      id: string;
      email: string;
      fullName: string | null;
    } | null = null;

    if (emailCandidate) {
      if (!/^\S+@\S+\.\S+$/.test(emailCandidate)) {
        return reply.code(400).send({ error: 'Ingresa un correo electrónico válido o una cédula válida' });
      }

      user = await prisma.user.findFirst({
        where: {
          email: {
            equals: emailCandidate,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          email: true,
          fullName: true,
        },
      });
    } else {
      const nationalIdCandidate = normalizeNationalId(cleanIdentifier);
      if (nationalIdCandidate.length < 5) {
        return reply.code(400).send({ error: 'Ingresa un correo electrónico válido o una cédula válida' });
      }

      user = await prisma.user.findFirst({
        where: {
          nationalId: nationalIdCandidate,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
        },
      });
    }

    const exposeDebugDetails = process.env.NODE_ENV !== 'production' && process.env.PASSWORD_RESET_DEBUG !== 'false';
    const genericResponse: {
      ok: boolean;
      message: string;
      debug?: {
        userFound?: boolean;
        to?: string;
        resetUrl?: string;
        mailSent?: boolean;
        messageId?: string;
        smtpResponse?: string;
        error?: string;
      };
    } = {
      ok: true,
      message: 'Si los datos existen, te enviamos instrucciones para restablecer tu contraseña.',
    };

    if (!user) {
      if (exposeDebugDetails) {
        genericResponse.debug = {
          userFound: false,
          mailSent: false,
        };
      }
      return reply.send(genericResponse);
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    const resetUrl = buildPasswordResetUrl(rawToken);
    const localWebUrl = isLocalWebUrl(resetUrl);

    try {
      const sendResult = await sendPasswordResetEmail({
        to: user.email,
        name: user.fullName,
        resetUrl,
      });

      if (!sendResult.sent && sendResult.reason === 'missing-config') {
        app.log.error(
          {
            smtpHostConfigured: Boolean(process.env.SMTP_HOST?.trim()),
            smtpUserConfigured: Boolean(process.env.SMTP_USER?.trim()),
            smtpPassConfigured: Boolean(process.env.SMTP_PASS),
          },
          'SMTP is not configured. Missing SMTP_HOST/SMTP_USER/SMTP_PASS env vars.'
        );

        if (exposeDebugDetails) {
          genericResponse.debug = {
            userFound: true,
            to: user.email,
            resetUrl,
            mailSent: false,
            error: 'SMTP_MISSING_CONFIG',
          };
        }
      }

      if (sendResult.sent) {
        app.log.info(
          {
            userId: user.id,
            email: user.email,
            messageId: sendResult.messageId,
            smtpResponse: sendResult.response,
          },
          'Password reset email queued'
        );

        if (localWebUrl) {
          app.log.warn(
            {
              webUrl: process.env.WEB_URL,
            },
            'WEB_URL points to localhost. Email links only work on this machine and can hurt deliverability.'
          );
        }

        if (exposeDebugDetails) {
          genericResponse.debug = {
            userFound: true,
            to: user.email,
            resetUrl,
            mailSent: true,
            messageId: sendResult.messageId,
            smtpResponse: sendResult.response,
            ...(localWebUrl ? { error: 'WEB_URL_IS_LOCALHOST' } : {}),
          };
        }
      }
    } catch (error) {
      app.log.error(
        {
          err: error,
          userId: user.id,
          email: user.email,
          smtpHost: process.env.SMTP_HOST,
          smtpPort: process.env.SMTP_PORT,
          smtpSecure: process.env.SMTP_SECURE,
        },
        'Failed to send password reset email'
      );

      if (exposeDebugDetails) {
        genericResponse.debug = {
          userFound: true,
          to: user.email,
          resetUrl,
          mailSent: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return reply.send(genericResponse);
  });

  app.post('/auth/password/reset', async (req, reply) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const { token, password } = parsed.data;
    const tokenHash = hashResetToken(token);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
      return reply.code(400).send({ error: 'El enlace de recuperación es inválido o venció' });
    }

    const now = new Date();
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now },
      }),
      prisma.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          usedAt: null,
          id: { not: resetToken.id },
        },
        data: { usedAt: now },
      }),
    ]);

    return reply.send({ ok: true, message: 'Contraseña actualizada correctamente' });
  });

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (req: FastifyRequest, reply) => {
    const uid = (req.user as any).uid as string;
    const user = await prisma.user.findUnique({
      where: { id: uid },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        nationalId: true,
        instagramUsername: true,
        birthDate: true,
        followsInstagram: true,
        role: true,
        createdAt: true,
      },
    });
    return reply.send({ user });
  });

  app.patch('/auth/me', { preHandler: [app.authenticate] }, async (req: FastifyRequest, reply) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });

    const uid = (req.user as any).uid as string;
    const data = parsed.data;

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'No hay cambios para actualizar' });
    }

    const current = await prisma.user.findUnique({
      where: { id: uid },
      select: {
        id: true,
        email: true,
        username: true,
        nationalId: true,
      },
    });

    if (!current) return reply.code(404).send({ error: 'Usuario no encontrado' });

    const updateData: Prisma.UserUpdateInput = {};

    if (typeof data.email === 'string') {
      const cleanEmail = normalizeEmail(data.email);
      if (cleanEmail !== normalizeEmail(current.email)) {
        const existsEmail = await prisma.user.findFirst({
          where: {
            id: { not: uid },
            email: {
              equals: cleanEmail,
              mode: 'insensitive',
            },
          },
          select: { id: true },
        });
        if (existsEmail) return reply.code(409).send({ error: 'Ya existe una cuenta con este correo electrónico' });
      }
      updateData.email = cleanEmail;
    }

    if (typeof data.username === 'string') {
      const cleanUsername = normalizeUsername(data.username);
      if (cleanUsername.length < 3 || cleanUsername.length > 24) {
        return reply.code(400).send({ error: 'El nombre de usuario debe tener entre 3 y 24 caracteres' });
      }
      if (!/^[a-z0-9._]+$/.test(cleanUsername)) {
        return reply.code(400).send({ error: 'El nombre de usuario solo puede usar letras, números, punto y guion bajo' });
      }

      if (cleanUsername !== normalizeUsername(current.username)) {
        const existsUsername = await prisma.user.findFirst({
          where: {
            id: { not: uid },
            username: {
              equals: cleanUsername,
              mode: 'insensitive',
            },
          },
          select: { id: true },
        });
        if (existsUsername) return reply.code(409).send({ error: 'Ya existe una cuenta con este nombre de usuario' });
      }

      updateData.username = cleanUsername;
    }

    if (typeof data.fullName === 'string') {
      const cleanFullName = data.fullName.trim();
      if (cleanFullName.length < 5) {
        return reply.code(400).send({ error: 'El nombre completo debe tener al menos 5 caracteres' });
      }
      updateData.fullName = cleanFullName;
    }

    if (typeof data.nationalId === 'string') {
      const cleanNationalId = normalizeNationalId(data.nationalId);
      if (cleanNationalId.length < 5) {
        return reply.code(400).send({ error: 'Número de cédula inválido' });
      }

      if (cleanNationalId !== (current.nationalId ?? '')) {
        const existsNationalId = await prisma.user.findUnique({
          where: { nationalId: cleanNationalId },
          select: { id: true },
        });
        if (existsNationalId && existsNationalId.id !== uid) {
          return reply.code(409).send({ error: 'Ya existe una cuenta con este número de cédula' });
        }
      }

      updateData.nationalId = cleanNationalId;
    }

    if (typeof data.instagramUsername === 'string') {
      const cleanInstagramUsername = normalizeInstagramUsername(data.instagramUsername);
        if (!cleanInstagramUsername || cleanInstagramUsername.length < 2) {
        return reply.code(400).send({ error: 'Usuario de Instagram inválido' });
      }
      updateData.instagramUsername = cleanInstagramUsername;
    }

    if (typeof data.birthDate === 'string') {
      const birthDateValue = new Date(`${data.birthDate}T00:00:00.000Z`);
      if (Number.isNaN(birthDateValue.getTime())) {
        return reply.code(400).send({ error: 'Fecha de nacimiento inválida' });
      }
      if (birthDateValue > new Date()) {
        return reply.code(400).send({ error: 'La fecha de nacimiento no puede ser futura' });
      }
      updateData.birthDate = birthDateValue;
    }

    try {
      const user = await prisma.user.update({
        where: { id: uid },
        data: updateData,
        select: {
          id: true,
          email: true,
          username: true,
          fullName: true,
          nationalId: true,
          instagramUsername: true,
          birthDate: true,
          followsInstagram: true,
          role: true,
          createdAt: true,
        },
      });

      return reply.send({ user });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(',')
          : String(error.meta?.target ?? '');
        if (target.includes('email')) {
          return reply.code(409).send({ error: 'Ya existe una cuenta con este correo electrónico' });
        }
        if (target.includes('username')) {
          return reply.code(409).send({ error: 'Ya existe una cuenta con este nombre de usuario' });
        }
        if (target.includes('nationalId')) {
          return reply.code(409).send({ error: 'Ya existe una cuenta con este número de cédula' });
        }
      }
      throw error;
    }
  });
}
