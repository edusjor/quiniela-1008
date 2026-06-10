import nodemailer from 'nodemailer';

type PasswordResetEmailInput = {
  to: string;
  name?: string | null;
  resetUrl: string;
};

type MailerConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

type MailSendResult = {
  sent: boolean;
  reason?: 'missing-config';
  messageId?: string;
  response?: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedTransporterKey: string | null = null;

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return fallback;
}

function getMailerConfig(): MailerConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  const parsedPort = Number(process.env.SMTP_PORT || '465');
  const port = Number.isFinite(parsedPort) ? parsedPort : 465;
  const secure = parseBooleanEnv(process.env.SMTP_SECURE, port === 465);
  const from = process.env.SMTP_FROM?.trim() || user;

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
  };
}

function getTransporter(config: MailerConfig) {
  const key = `${config.host}:${config.port}:${config.secure}:${config.user}`;
  if (cachedTransporter && cachedTransporterKey === key) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
  cachedTransporterKey = key;
  return cachedTransporter;
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<MailSendResult> {
  const config = getMailerConfig();
  if (!config) {
    return { sent: false, reason: 'missing-config' };
  }

  const displayName = input.name?.trim() || 'participante';
  const subject = 'Recuperación de contraseña - Quiniela 1008';
  const text = [
    `Hola ${displayName},`,
    '',
    'Recibimos una solicitud para restablecer tu contraseña.',
    'Usa este enlace para cambiarla:',
    input.resetUrl,
    '',
    'Este enlace vence en 60 minutos.',
    'Si no solicitaste este cambio, ignora este correo.',
  ].join('\n');

  try {
    const transporter = getTransporter(config);
    const info = await transporter.sendMail({
      from: config.from,
      to: input.to,
      subject,
      text,
    });

    return {
      sent: true,
      messageId: info.messageId,
      response: info.response,
    };
  } catch (error) {
    cachedTransporter = null;
    cachedTransporterKey = null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`EMAIL_SEND_FAILED: ${message}`);
  }
}
