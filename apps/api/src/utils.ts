import crypto from 'crypto';

export const DEFAULT_TEAMS = [
  { name: 'Costa Rica', code: 'CRC' },
  { name: 'Argentina', code: 'ARG' },
  { name: 'España', code: 'ESP' },
  { name: 'Brasil', code: 'BRA' },
];

export function buildDefaultMatchTemplates(baseDate = new Date()) {
  const hour = 60 * 60 * 1000;

  return [
    {
      homeCode: 'CRC',
      awayCode: 'ARG',
      kickoffAt: new Date(baseDate.getTime() + 24 * hour),
    },
    {
      homeCode: 'ESP',
      awayCode: 'BRA',
      kickoffAt: new Date(baseDate.getTime() + 48 * hour),
    },
    {
      homeCode: 'ARG',
      awayCode: 'BRA',
      kickoffAt: new Date(baseDate.getTime() + 72 * hour),
    },
  ].map((match) => ({
    ...match,
    lockAt: match.kickoffAt,
  }));
}

export function makeJoinCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export function nowUtc() {
  return new Date();
}
