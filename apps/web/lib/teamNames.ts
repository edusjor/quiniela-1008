export type TeamCatalogItem = {
  name: string;
  spanishName: string;
  flagCode: string;
};

export const TEAM_CATALOG: TeamCatalogItem[] = [
  { name: 'Mexico', spanishName: 'México', flagCode: 'mx' },
  { name: 'South Africa', spanishName: 'Sudáfrica', flagCode: 'za' },
  { name: 'South Korea', spanishName: 'Corea del Sur', flagCode: 'kr' },
  { name: 'Czech Republic', spanishName: 'República Checa', flagCode: 'cz' },
  { name: 'Canada', spanishName: 'Canadá', flagCode: 'ca' },
  { name: 'Bosnia and Herzegovina', spanishName: 'Bosnia y Herzegovina', flagCode: 'ba' },
  { name: 'Qatar', spanishName: 'Catar', flagCode: 'qa' },
  { name: 'Switzerland', spanishName: 'Suiza', flagCode: 'ch' },
  { name: 'Brazil', spanishName: 'Brasil', flagCode: 'br' },
  { name: 'Morocco', spanishName: 'Marruecos', flagCode: 'ma' },
  { name: 'Haiti', spanishName: 'Haití', flagCode: 'ht' },
  { name: 'Scotland', spanishName: 'Escocia', flagCode: 'gb' },
  { name: 'United States', spanishName: 'Estados Unidos', flagCode: 'us' },
  { name: 'Paraguay', spanishName: 'Paraguay', flagCode: 'py' },
  { name: 'Australia', spanishName: 'Australia', flagCode: 'au' },
  { name: 'Turkey', spanishName: 'Turquía', flagCode: 'tr' },
  { name: 'Germany', spanishName: 'Alemania', flagCode: 'de' },
  { name: 'Curacao', spanishName: 'Curazao', flagCode: 'cw' },
  { name: 'Ivory Coast', spanishName: 'Costa de Marfil', flagCode: 'ci' },
  { name: 'Ecuador', spanishName: 'Ecuador', flagCode: 'ec' },
  { name: 'Netherlands', spanishName: 'Países Bajos', flagCode: 'nl' },
  { name: 'Japan', spanishName: 'Japón', flagCode: 'jp' },
  { name: 'Sweden', spanishName: 'Suecia', flagCode: 'se' },
  { name: 'Tunisia', spanishName: 'Túnez', flagCode: 'tn' },
  { name: 'Belgium', spanishName: 'Bélgica', flagCode: 'be' },
  { name: 'Egypt', spanishName: 'Egipto', flagCode: 'eg' },
  { name: 'Iran', spanishName: 'Irán', flagCode: 'ir' },
  { name: 'New Zealand', spanishName: 'Nueva Zelanda', flagCode: 'nz' },
  { name: 'Spain', spanishName: 'España', flagCode: 'es' },
  { name: 'Cape Verde', spanishName: 'Cabo Verde', flagCode: 'cv' },
  { name: 'Saudi Arabia', spanishName: 'Arabia Saudita', flagCode: 'sa' },
  { name: 'Uruguay', spanishName: 'Uruguay', flagCode: 'uy' },
  { name: 'France', spanishName: 'Francia', flagCode: 'fr' },
  { name: 'Senegal', spanishName: 'Senegal', flagCode: 'sn' },
  { name: 'Iraq', spanishName: 'Irak', flagCode: 'iq' },
  { name: 'Norway', spanishName: 'Noruega', flagCode: 'no' },
  { name: 'Argentina', spanishName: 'Argentina', flagCode: 'ar' },
  { name: 'Algeria', spanishName: 'Argelia', flagCode: 'dz' },
  { name: 'Austria', spanishName: 'Austria', flagCode: 'at' },
  { name: 'Jordan', spanishName: 'Jordania', flagCode: 'jo' },
  { name: 'Portugal', spanishName: 'Portugal', flagCode: 'pt' },
  { name: 'DR Congo', spanishName: 'RD del Congo', flagCode: 'cd' },
  { name: 'Uzbekistan', spanishName: 'Uzbekistán', flagCode: 'uz' },
  { name: 'Colombia', spanishName: 'Colombia', flagCode: 'co' },
  { name: 'England', spanishName: 'Inglaterra', flagCode: 'gb' },
  { name: 'Croatia', spanishName: 'Croacia', flagCode: 'hr' },
  { name: 'Ghana', spanishName: 'Ghana', flagCode: 'gh' },
  { name: 'Panama', spanishName: 'Panamá', flagCode: 'pa' },
  { name: 'Costa Rica', spanishName: 'Costa Rica', flagCode: 'cr' },
];

const spanishNameByTeam = Object.fromEntries(TEAM_CATALOG.map((item) => [item.name, item.spanishName])) as Record<string, string>;

const LEGACY_SPANISH_NAME_ALIASES: Record<string, string> = {
  Espana: 'España',
  Mexico: 'México',
  Sudafrica: 'Sudáfrica',
  'Republica Checa': 'República Checa',
  Turquia: 'Turquía',
  Canada: 'Canadá',
  Haiti: 'Haití',
  'Paises Bajos': 'Países Bajos',
  Japon: 'Japón',
  Tunez: 'Túnez',
  Belgica: 'Bélgica',
  Iran: 'Irán',
  Uzbekistan: 'Uzbekistán',
  Panama: 'Panamá',
};

export const flagCodeByTeam = Object.fromEntries(TEAM_CATALOG.map((item) => [item.name, item.flagCode])) as Record<string, string>;

export const flagCatalog = TEAM_CATALOG.map((item) => ({
  name: item.name,
  spanishName: item.spanishName,
  url: `https://flagcdn.com/w80/${item.flagCode}.png`,
}));

export function toSpanishTeamName(name: string) {
  return spanishNameByTeam[name] || LEGACY_SPANISH_NAME_ALIASES[name] || name;
}

export function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isCatalogFlagUrl(value: string | null | undefined) {
  if (!value) return false;
  return /^https:\/\/flagcdn\.com\/w\d+\//i.test(value.trim());
}
