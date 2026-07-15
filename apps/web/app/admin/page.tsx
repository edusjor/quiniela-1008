'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { logout } from '../../lib/auth';
import { apiFetch } from '../../lib/api';
import { flagCatalog, normalizeSearchText, toSpanishTeamName } from '../../lib/teamNames';
import { useMe } from '../../lib/hooks';

type Match = {
  id: string;
  kickoffAt: string;
  lockAt: string;
  groupName: string | null;
  finalHome: number | null;
  finalAway: number | null;
  finalPenaltyWinnerIsHome: boolean | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
};

type AdminLeague = {
  id: string;
  name: string;
  description: string | null;
  joinCode: string;
  deletedAt: string | null;
  createdBy: { username: string; email: string; fullName?: string | null };
  _count: { members: number; matches: number; predictions: number };
};

type AdminUser = {
  id: string;
  email: string;
  username: string;
  fullName: string | null;
  nationalId: string | null;
  instagramUsername: string | null;
  birthDate: string | null;
  followsInstagram: boolean;
  purchaseProofImage: string | null;
  hasPurchaseProof?: boolean;
  role: 'USER' | 'SUPERADMIN';
  _count: { leagues: number; createdLeagues: number; predictions: number };
};

type AdminTeam = {
  id: string;
  leagueId: string | null;
  name: string;
  logoUrl: string | null;
};

type LeagueMember = {
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
  user: {
    id: string;
    username: string;
    fullName: string | null;
  };
};

type BulkDeleteResponse = {
  summary: {
    requested: number;
    deleted: number;
    skipped: number;
  };
  errors?: Array<{
    id: string;
    message: string;
  }>;
  missingIds?: string[];
};

type CsvImportResponse = {
  confirmationRequired?: boolean;
  summary: {
    rowsReceived: number;
    validRows?: number;
    matchesToCreate?: number;
    repeatedMatches?: number;
    createdTeams: number;
    updatedTeams: number;
    createdMatches: number;
    updatedMatches: number;
    unchangedMatches: number;
    errorRows: number;
  };
  preview?: {
    toCreate: Array<{ row: number; homeTeam: string; awayTeam: string; kickoffAt: string; groupName: string | null }>;
    repeated: Array<{ row: number; homeTeam: string; awayTeam: string; kickoffAt: string; groupName: string | null; reason?: string }>;
  };
  errors: Array<{
    row: number;
    message: string;
  }>;
};

type QuinielaSection = 'sistema' | 'usuarios' | 'miembros' | 'equipos' | 'partidos';

type MatchStatusFilter = 'all' | 'pendiente' | 'con-resultado' | 'cerrado';
type MatchStatus = 'pendiente' | 'con-resultado' | 'cerrado';
type AdminNavItem = 'panel' | 'partidos' | 'grupos' | 'equipos' | 'fases' | 'usuarios' | 'resultados';
type AdminWorkspace = 'league' | 'system';
type SystemPanelSection = 'sistema' | 'usuarios' | 'borradas';
type MatchRow = {
  match: Match;
  order: number;
  group: string;
  status: MatchStatus;
};

type MatchBucket = {
  id: string;
  title: string;
  rows: MatchRow[];
};

type LeagueActionModalState = {
  league: AdminLeague;
  mode: 'trash' | 'permanent-delete';
};

const MIN_FLAG_SEARCH_CHARS = 2;
const MAX_FLAG_RESULTS = 18;
const ADMIN_SELECTED_LEAGUE_KEY = 'admin.selectedLeagueId';
const PENALTY_ELIGIBLE_DATE = '2026-06-28';
const COSTA_RICA_TIMEZONE = 'America/Costa_Rica';
const MATCH_GROUP_OPTIONS = ['Grupo A', 'Grupo B', 'Grupo C', 'Grupo D', 'Grupo E', 'Grupo F', 'Grupo G', 'Grupo H'];
const UNGROUPED_LABEL = 'Sin grupo';
const ADMIN_NAV_ITEMS: Array<{ id: AdminNavItem; label: string }> = [
  { id: 'panel', label: 'Panel principal' },
  { id: 'partidos', label: 'Partidos' },
  { id: 'grupos', label: 'Grupos' },
  { id: 'equipos', label: 'Equipos' },
  { id: 'fases', label: 'Fases' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'resultados', label: 'Resultados' },
];

function parseScoreInput(raw: string, label: string) {
  const value = raw.trim();
  if (value === '') throw new Error(`${label} es obligatorio`);
  if (!/^\d+$/.test(value)) throw new Error(`${label} debe ser un número entero`);

  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 99) {
    throw new Error(`${label} debe estar entre 0 y 99`);
  }

  return n;
}

function parseOptionalScore(raw: string) {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  return n;
}

function isPenaltyEligibleMatch(kickoffAt: string) {
  const kickoff = new Date(kickoffAt);
  if (Number.isNaN(kickoff.getTime())) return false;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COSTA_RICA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(kickoff);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return false;

  const costaRicaDate = `${year}-${month}-${day}`;
  return costaRicaDate >= PENALTY_ELIGIBLE_DATE;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo CSV'));
    reader.readAsText(file);
  });
}

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-CR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function toDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'sin-fecha';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function formatDateHeading(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';

  const heading = date.toLocaleDateString('es-CR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return heading.charAt(0).toUpperCase() + heading.slice(1);
}

function formatMatchTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const datePart = date.toLocaleDateString('es-CR', {
    day: '2-digit',
    month: '2-digit',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${datePart} ${timePart}`;
}

function getMatchStatus(match: Match, override?: MatchStatus): MatchStatus {
  if (override) return override;
  if (match.finalHome !== null && match.finalAway !== null) return 'con-resultado';

  const lockAt = new Date(match.lockAt).getTime();
  if (!Number.isNaN(lockAt) && lockAt <= Date.now()) return 'cerrado';

  return 'pendiente';
}

function getStatusLabel(status: MatchStatus) {
  if (status === 'con-resultado') return 'Con resultado';
  if (status === 'cerrado') return 'Cerrado';
  return 'Pendiente';
}

export default function AdminPage() {
  const { me, loading } = useMe();
  const router = useRouter();

  const [adminWorkspace, setAdminWorkspace] = useState<AdminWorkspace>('league');
  const [systemPanelSection, setSystemPanelSection] = useState<SystemPanelSection>('sistema');
  const [quinielaSection, setQuinielaSection] = useState<QuinielaSection>('sistema');
  const [activeAdminNav, setActiveAdminNav] = useState<AdminNavItem>('panel');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [leagues, setLeagues] = useState<AdminLeague[]>([]);
  const [deletedLeagues, setDeletedLeagues] = useState<AdminLeague[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [leagueId, setLeagueId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(ADMIN_SELECTED_LEAGUE_KEY) || '';
  });
  const [leagueMembers, setLeagueMembers] = useState<LeagueMember[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const [newLeagueName, setNewLeagueName] = useState('Nueva Quiniela');
  const [newLeagueDescription, setNewLeagueDescription] = useState('');

  const [finalHome, setFinalHome] = useState<Record<string, string>>({});
  const [finalAway, setFinalAway] = useState<Record<string, string>>({});
  const [finalPenaltyWinnerIsHome, setFinalPenaltyWinnerIsHome] = useState<Record<string, boolean | null>>({});
  const [editHomeTeam, setEditHomeTeam] = useState<Record<string, string>>({});
  const [editAwayTeam, setEditAwayTeam] = useState<Record<string, string>>({});
  const [editKickoffAt, setEditKickoffAt] = useState<Record<string, string>>({});
  const [editLockAt, setEditLockAt] = useState<Record<string, string>>({});
  const [editLockAutoSync, setEditLockAutoSync] = useState<Record<string, boolean>>({});

  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [teamImages, setTeamImages] = useState<string[]>([]);
  const [flagSearch, setFlagSearch] = useState('');
  const [flagSearchEditing, setFlagSearchEditing] = useState('');
  const [teamIdEditing, setTeamIdEditing] = useState<string | null>(null);
  const [teamNameEditing, setTeamNameEditing] = useState('');
  const [teamLogoUrlEditing, setTeamLogoUrlEditing] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamLogoUrl, setTeamLogoUrl] = useState('');
  const [showStoredTeamImages, setShowStoredTeamImages] = useState(false);
  const [invoicePreview, setInvoicePreview] = useState<{ src: string; userLabel: string } | null>(null);
  const [leagueActionModal, setLeagueActionModal] = useState<LeagueActionModalState | null>(null);
  const [leagueActionName, setLeagueActionName] = useState('');
  const [leagueActionSubmitting, setLeagueActionSubmitting] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [openMatchMenuId, setOpenMatchMenuId] = useState<string | null>(null);
  const [collapsedDateGroups, setCollapsedDateGroups] = useState<Record<string, boolean>>({});
  const [matchSearchQuery, setMatchSearchQuery] = useState('');
  const [matchDateFilter, setMatchDateFilter] = useState('');
  const [matchGroupFilter, setMatchGroupFilter] = useState('all');
  const [matchStatusFilter, setMatchStatusFilter] = useState<MatchStatusFilter>('all');
  const [newMatchHomeTeam, setNewMatchHomeTeam] = useState('');
  const [newMatchAwayTeam, setNewMatchAwayTeam] = useState('');
  const [newMatchKickoffAt, setNewMatchKickoffAt] = useState('');
  const [newMatchLockAt, setNewMatchLockAt] = useState('');
  const [newMatchLockAutoSync, setNewMatchLockAutoSync] = useState(true);
  const [newMatchGroup, setNewMatchGroup] = useState('');
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [showCsvPanel, setShowCsvPanel] = useState(false);
  const [editMatchGroup, setEditMatchGroup] = useState<Record<string, string>>({});
  const [editMatchStatus, setEditMatchStatus] = useState<Record<string, MatchStatus>>({});
  const [editMatchNotes, setEditMatchNotes] = useState<Record<string, string>>({});
  const [bulkDeletingUsers, setBulkDeletingUsers] = useState(false);
  const [bulkDeletingTeams, setBulkDeletingTeams] = useState(false);
  const [bulkDeletingMatches, setBulkDeletingMatches] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);
  const [showLeagueEditor, setShowLeagueEditor] = useState(false);

  function openInvoicePreview(src: string, userLabel: string) {
    setInvoicePreview({ src, userLabel });
  }

  function toggleSelection(setter: (updater: (current: string[]) => string[]) => void, id: string) {
    setter((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  function handleNewMatchKickoffChange(value: string) {
    setNewMatchKickoffAt(value);
    if (newMatchLockAutoSync || !newMatchLockAt.trim()) {
      setNewMatchLockAt(value);
    }
  }

  function handleNewMatchLockChange(value: string) {
    setNewMatchLockAt(value);
    setNewMatchLockAutoSync(value.trim() === '' || value === newMatchKickoffAt);
  }

  function handleEditKickoffChange(match: Match, value: string) {
    setEditKickoffAt((current) => ({ ...current, [match.id]: value }));

    const shouldSyncLock = editLockAutoSync[match.id] !== false;
    if (shouldSyncLock) {
      setEditLockAt((current) => ({ ...current, [match.id]: value }));
    }
  }

  function handleEditLockChange(match: Match, value: string) {
    setEditLockAt((current) => ({ ...current, [match.id]: value }));
    const kickoffValue = editKickoffAt[match.id] ?? toDateTimeLocal(match.kickoffAt);
    setEditLockAutoSync((current) => ({
      ...current,
      [match.id]: value.trim() === '' || value === kickoffValue,
    }));
  }

  async function loadCore() {
    const [leagueResponse, deletedLeagueResponse, userResponse] = await Promise.all([
      apiFetch<{ leagues: AdminLeague[] }>('/admin/leagues'),
      apiFetch<{ leagues: AdminLeague[] }>('/admin/leagues/deleted'),
      apiFetch<{ users: AdminUser[] }>('/admin/users'),
    ]);

    setLeagues(leagueResponse.leagues);
    setDeletedLeagues(deletedLeagueResponse.leagues);
    setUsers(userResponse.users);
    setLeagueId((current) => {
      const fallbackLeagueId = leagueResponse.leagues[0]?.id || '';
      const storedLeagueId = typeof window === 'undefined'
        ? ''
        : (window.localStorage.getItem(ADMIN_SELECTED_LEAGUE_KEY) || '');
      const preferredLeagueId = current || storedLeagueId;

      if (!preferredLeagueId) return fallbackLeagueId;

      const exists = leagueResponse.leagues.some((league) => league.id === preferredLeagueId);
      return exists ? preferredLeagueId : fallbackLeagueId;
    });
  }

  function openLeagueActionModal(league: AdminLeague, mode: LeagueActionModalState['mode']) {
    setLeagueActionModal({ league, mode });
    setLeagueActionName('');
  }

  function closeLeagueActionModal() {
    if (leagueActionSubmitting) return;
    setLeagueActionModal(null);
    setLeagueActionName('');
  }

  async function submitLeagueAction() {
    if (!leagueActionModal || leagueActionSubmitting) return;

    const { league, mode } = leagueActionModal;
    if (leagueActionName.trim() !== league.name.trim()) {
      setMsg('El nombre no coincide. Operación cancelada.');
      return;
    }

    setLeagueActionSubmitting(true);

    try {
      if (mode === 'trash') {
        await apiFetch(`/admin/leagues/${league.id}/trash`, {
          method: 'POST',
          body: JSON.stringify({ name: league.name }),
        });

        await loadCore();
        setMsg(`Quiniela movida a borradas: ${league.name}`);
      } else {
        await apiFetch(`/admin/leagues/${league.id}/permanent-delete`, {
          method: 'POST',
          body: JSON.stringify({ name: league.name }),
        });

        await loadCore();
        setMsg(`Quiniela eliminada definitivamente: ${league.name}`);
      }

      setLeagueActionModal(null);
      setLeagueActionName('');
    } finally {
      setLeagueActionSubmitting(false);
    }
  }

  async function trashLeague(league: AdminLeague) {
    openLeagueActionModal(league, 'trash');
  }

  async function restoreLeague(league: AdminLeague) {
    const confirmed = window.confirm(`¿Deseas restaurar la quiniela ${league.name}?`);
    if (!confirmed) return;

    await apiFetch(`/admin/leagues/${league.id}/restore`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    await loadCore();
    setMsg(`Quiniela restaurada: ${league.name}`);
  }

  async function deleteLeaguePermanently(league: AdminLeague) {
    openLeagueActionModal(league, 'permanent-delete');
  }

  async function loadMatches(currentLeagueId: string) {
    if (!currentLeagueId) {
      setMatches([]);
      setFinalPenaltyWinnerIsHome({});
      return;
    }
    const r = await apiFetch<{ matches: Match[] }>(`/leagues/${currentLeagueId}/matches`);
    setMatches(r.matches);
    const penalties: Record<string, boolean | null> = {};
    r.matches.forEach((match) => {
      penalties[match.id] = match.finalPenaltyWinnerIsHome ?? null;
    });
    setFinalPenaltyWinnerIsHome(penalties);
  }

  async function loadLeagueMembers(currentLeagueId: string) {
    if (!currentLeagueId) {
      setLeagueMembers([]);
      return;
    }

    const r = await apiFetch<{ league: { members: LeagueMember[] } }>(`/leagues/${currentLeagueId}`);
    setLeagueMembers(r.league.members);
  }

  async function loadTeams() {
    if (!leagueId) {
      setTeams([]);
      return;
    }
    const r = await apiFetch<{ teams: AdminTeam[] }>(`/admin/teams?leagueId=${leagueId}`);
    setTeams(r.teams);
  }

  async function loadTeamImages() {
    const r = await apiFetch<{ images: string[] }>('/admin/team-images');
    setTeamImages(r.images);
  }

  async function createLeague() {
    if (!newLeagueName.trim()) throw new Error('Nombre de quiniela obligatorio');

    await apiFetch('/leagues', {
      method: 'POST',
      body: JSON.stringify({
        name: newLeagueName.trim(),
        description: newLeagueDescription.trim() || undefined,
      }),
    });

    await loadCore();
    setMsg('Quiniela creada correctamente.');
  }

  function resetTeamForm() {
    setTeamName('');
    setTeamLogoUrl('');
  }

  function resetTeamEditForm() {
    setTeamIdEditing(null);
    setFlagSearchEditing('');
    setTeamNameEditing('');
    setTeamLogoUrlEditing('');
  }

  async function saveTeam() {
    setMsg(null);
    if (!leagueId) throw new Error('Selecciona una quiniela');
    if (!teamName.trim()) throw new Error('Nombre de equipo obligatorio');
    if (!teamLogoUrl.trim()) throw new Error('Debes subir o seleccionar una foto de equipo');

    const payload = {
      leagueId,
      name: teamName,
      logoUrl: teamLogoUrl,
    };

    await apiFetch('/admin/teams', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setMsg('Equipo creado.');

    await loadTeams();
    resetTeamForm();
  }

  async function saveEditingTeam() {
    setMsg(null);
    if (!leagueId) throw new Error('Selecciona una quiniela');
    if (!teamIdEditing) throw new Error('Selecciona un equipo para editar');
    if (!teamNameEditing.trim()) throw new Error('Nombre de equipo obligatorio');
    if (!teamLogoUrlEditing.trim()) throw new Error('Debes subir o seleccionar una foto de equipo');

    const payload = {
      leagueId,
      name: teamNameEditing,
      logoUrl: teamLogoUrlEditing,
    };

    await apiFetch(`/admin/teams/${teamIdEditing}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setMsg('Equipo actualizado.');

    await loadTeams();
    resetTeamEditForm();
  }

  async function removeTeam(team: AdminTeam) {
    setMsg(null);
    if (!leagueId) throw new Error('Selecciona una quiniela');

    const confirmed = window.confirm(`¿Deseas eliminar realmente el equipo ${toSpanishTeamName(team.name)}?`);
    if (!confirmed) return;

    await apiFetch(`/admin/teams/${team.id}`, { method: 'DELETE' });

    if (teamIdEditing === team.id) {
      resetTeamEditForm();
    }

    await Promise.all([loadTeams(), loadTeamImages()]);
    setMsg('Equipo eliminado.');
  }

  async function updateMatch(match: Match) {
    if (!leagueId) throw new Error('Selecciona una quiniela');

    const homeTeam = (editHomeTeam[match.id] ?? match.homeTeam.name).trim();
    const awayTeam = (editAwayTeam[match.id] ?? match.awayTeam.name).trim();
    const group = (editMatchGroup[match.id] ?? match.groupName ?? '').trim();
    const kickoffValue = editKickoffAt[match.id] ?? toDateTimeLocal(match.kickoffAt);
    const lockValue = editLockAt[match.id] ?? toDateTimeLocal(match.lockAt);

    if (!homeTeam || !awayTeam) throw new Error('Debes seleccionar ambos equipos');
    if (!kickoffValue) throw new Error('Kickoff inválido');
    if (!lockValue) throw new Error('Cierre inválido');

    const confirmed = window.confirm('¿Deseas cambiar realmente este partido?');
    if (!confirmed) return;

    await apiFetch(`/leagues/${leagueId}/matches/${match.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        homeTeam,
        awayTeam,
        kickoffAt: new Date(kickoffValue).toISOString(),
        lockAt: new Date(lockValue).toISOString(),
        group: group || undefined,
      }),
    });

    setMsg('Partido actualizado.');
    await loadMatches(leagueId);
  }

  async function createManualMatch() {
    if (creatingMatch) return;
    if (!leagueId) throw new Error('Selecciona una quiniela');

    const homeTeam = newMatchHomeTeam.trim();
    const awayTeam = newMatchAwayTeam.trim();
    const kickoffValue = newMatchKickoffAt.trim();
    const lockValue = newMatchLockAt.trim();
    const group = newMatchGroup.trim();

    if (!homeTeam || !awayTeam || !kickoffValue) {
      throw new Error('Completa local, visitante y kickoff para crear el partido');
    }
    if (homeTeam.toLowerCase() === awayTeam.toLowerCase()) {
      throw new Error('Los equipos deben ser distintos');
    }

    const kickoffDate = new Date(kickoffValue);
    if (Number.isNaN(kickoffDate.getTime())) {
      throw new Error('Kickoff inválido');
    }

    const lockDate = lockValue ? new Date(lockValue) : null;
    if (lockDate && Number.isNaN(lockDate.getTime())) {
      throw new Error('Cierre inválido');
    }
    if (lockDate && lockDate > kickoffDate) {
      throw new Error('El cierre no puede ser después del kickoff');
    }

    setMsg(null);
    setCreatingMatch(true);

    try {
      await apiFetch(`/leagues/${leagueId}/matches`, {
        method: 'POST',
        body: JSON.stringify({
          homeTeam,
          awayTeam,
          kickoffAt: kickoffDate.toISOString(),
          lockAt: lockDate ? lockDate.toISOString() : undefined,
          group: group || undefined,
        }),
      });

      await Promise.all([loadMatches(leagueId), loadCore()]);

      setNewMatchHomeTeam('');
      setNewMatchAwayTeam('');
      setNewMatchKickoffAt('');
      setNewMatchLockAt('');
      setNewMatchLockAutoSync(true);
      setNewMatchGroup('');

      setMsg('Partido creado.');
    } finally {
      setCreatingMatch(false);
    }
  }

  async function removeMatch(match: Match) {
    if (!leagueId) throw new Error('Selecciona una quiniela');

    const confirmed = window.confirm(`¿Deseas eliminar realmente el partido ${toSpanishTeamName(match.homeTeam.name)} vs ${toSpanishTeamName(match.awayTeam.name)}?`);
    if (!confirmed) return;

    await apiFetch(`/leagues/${leagueId}/matches/${match.id}`, {
      method: 'DELETE',
    });

    setMsg('Partido eliminado.');
    await loadMatches(leagueId);
  }

  async function saveMatchResult(match: Match) {
    if (!leagueId) throw new Error('Selecciona una quiniela');

    setMsg(null);
    const confirmed = window.confirm('¿Deseas cambiar realmente este resultado?');
    if (!confirmed) return;

    const fallbackHome = match.finalHome === null ? '' : String(match.finalHome);
    const fallbackAway = match.finalAway === null ? '' : String(match.finalAway);
    const fh = parseScoreInput(finalHome[match.id] ?? fallbackHome, 'Resultado local');
    const fa = parseScoreInput(finalAway[match.id] ?? fallbackAway, 'Resultado visitante');
    const finalPenaltyWinner =
      fh === fa && isPenaltyEligibleMatch(match.kickoffAt)
        ? (finalPenaltyWinnerIsHome[match.id] ?? null)
        : null;

    const response = await apiFetch<{ updatedPredictions: number }>(`/leagues/${leagueId}/matches/${match.id}/result`, {
      method: 'PATCH',
      body: JSON.stringify({ finalHome: fh, finalAway: fa, finalPenaltyWinnerIsHome: finalPenaltyWinner }),
    });

    setMsg(`Resultado guardado. Predicciones recalculadas: ${response.updatedPredictions}`);
    await loadMatches(leagueId);
  }

  function clearMatchDashboard() {
    setSelectedMatchIds([]);
    setMatchSearchQuery('');
    setMatchDateFilter('');
    setMatchGroupFilter('all');
    setMatchStatusFilter('all');
    setExpandedMatchId(null);
    setOpenMatchMenuId(null);
    setCollapsedDateGroups({});
    setCsvContent('');
    setCsvFileName('');
    setShowCsvPanel(false);
  }

  function toggleDateGroup(dateKey: string) {
    setCollapsedDateGroups((current) => ({
      ...current,
      [dateKey]: !current[dateKey],
    }));
  }

  function openMatchEditor(row: MatchRow) {
    const kickoffValue = editKickoffAt[row.match.id] ?? toDateTimeLocal(row.match.kickoffAt);
    const lockValue = editLockAt[row.match.id] ?? toDateTimeLocal(row.match.lockAt);

    setExpandedMatchId(row.match.id);
    setOpenMatchMenuId(null);
    setEditKickoffAt((current) => ({
      ...current,
      [row.match.id]: current[row.match.id] ?? kickoffValue,
    }));
    setEditLockAt((current) => ({
      ...current,
      [row.match.id]: current[row.match.id] ?? lockValue,
    }));
    setEditLockAutoSync((current) => ({
      ...current,
      [row.match.id]: current[row.match.id] ?? lockValue === kickoffValue,
    }));
    setEditMatchGroup((current) => ({
      ...current,
      [row.match.id]: current[row.match.id] ?? row.group,
    }));
    setEditMatchStatus((current) => ({
      ...current,
      [row.match.id]: current[row.match.id] ?? row.status,
    }));
  }

  function goToLeagueSection(section: QuinielaSection, navItem?: AdminNavItem) {
    if (!leagueId) {
      setMsg('Selecciona una quiniela primero');
      return;
    }

    setAdminWorkspace('league');
    setShowLeagueEditor(true);
    setQuinielaSection(section);
    if (navItem) setActiveAdminNav(navItem);
  }

  function openSystemPanel(section: SystemPanelSection = 'sistema') {
    setAdminWorkspace('system');
    setSystemPanelSection(section);
    setShowLeagueEditor(false);
    setMobileDrawerOpen(false);
  }

  function handleAdminNav(item: AdminNavItem) {
    setActiveAdminNav(item);
    setMobileDrawerOpen(false);

    if (item === 'panel') {
      goToLeagueSection('miembros', 'panel');
      return;
    }

    if (item === 'usuarios') {
      goToLeagueSection('miembros', 'usuarios');
      return;
    }

    if (item === 'equipos') {
      goToLeagueSection('equipos', 'equipos');
      return;
    }

    if (item === 'partidos' || item === 'grupos' || item === 'fases' || item === 'resultados') {
      goToLeagueSection('partidos', item);
      if (item === 'grupos') {
        setMatchDateFilter('');
        setMatchGroupFilter('all');
      }
      if (item !== 'resultados') {
        setMatchStatusFilter('all');
      }
      if (item === 'resultados') {
        setMatchStatusFilter('con-resultado');
      }
      return;
    }

  }

  function handleAdminLogout() {
    logout();
    router.push('/login');
  }

  async function importMatchesFromCsv() {
    if (importingCsv) return;
    if (!leagueId) throw new Error('Selecciona una quiniela');

    setMsg(null);
    setImportingCsv(true);

    try {
      const content = csvContent.trim();
      if (!content) throw new Error('Debes cargar o pegar el contenido CSV');

      const preview = await apiFetch<CsvImportResponse>(`/leagues/${leagueId}/matches/import-csv`, {
        method: 'POST',
        body: JSON.stringify({ csvContent: content, confirmImport: false }),
      });

      const toCreateCount = preview.summary.matchesToCreate ?? 0;
      const repeatedCount = preview.summary.repeatedMatches ?? 0;
      const errorCount = preview.summary.errorRows ?? 0;
      const toCreatePreview = (preview.preview?.toCreate ?? [])
        .slice(0, 5)
        .map((item) => `fila ${item.row}: ${item.homeTeam} vs ${item.awayTeam}`)
        .join('\n');
      const repeatedPreview = (preview.preview?.repeated ?? [])
        .slice(0, 5)
        .map((item) => `fila ${item.row}: ${item.homeTeam} vs ${item.awayTeam} (${item.reason ?? 'repetido'})`)
        .join('\n');

      if (toCreateCount === 0) {
        setMsg(`No hay partidos nuevos para importar. Repetidos: ${repeatedCount}. Errores: ${errorCount}.`);
        return;
      }

      const confirmationMessage = [
        `Vista previa del CSV:`,
        `Nuevos: ${toCreateCount}`,
        `Repetidos: ${repeatedCount}`,
        `Errores: ${errorCount}`,
        toCreatePreview ? `\nNuevos (ejemplos):\n${toCreatePreview}` : '',
        repeatedPreview ? `\nRepetidos (ejemplos):\n${repeatedPreview}` : '',
        '\n¿Deseas confirmar la importación de los partidos nuevos?',
      ].filter(Boolean).join('\n');

      const confirmed = window.confirm(confirmationMessage);
      if (!confirmed) {
        setMsg('Importación cancelada por el usuario.');
        return;
      }

      const response = await apiFetch<CsvImportResponse>(`/leagues/${leagueId}/matches/import-csv`, {
        method: 'POST',
        body: JSON.stringify({ csvContent: content, confirmImport: true }),
      });

      await Promise.all([loadMatches(leagueId), loadTeams(), loadCore()]);

      const previewErrors = response.errors
        .slice(0, 3)
        .map((item) => `fila ${item.row}: ${item.message}`)
        .join(' | ');

      let message =
        `Importación lista: ${response.summary.createdMatches} partidos nuevos, ` +
        `${response.summary.repeatedMatches ?? response.summary.unchangedMatches} repetidos, ` +
        `${response.summary.createdTeams} equipos nuevos.`;

      if (response.summary.errorRows > 0) {
        message += ` Filas con error: ${response.summary.errorRows}.`;
      }

      if (previewErrors) {
        message += ` Ejemplos: ${previewErrors}`;
      }

      setMsg(message);
    } catch (e: any) {
      setMsg(e?.message ?? 'No se pudo importar el CSV');
    } finally {
      setImportingCsv(false);
    }
  }

  async function bulkDeleteUsers() {
    if (bulkDeletingUsers || selectedUserIds.length === 0) return;

    const confirmed = window.confirm(`¿Deseas eliminar ${selectedUserIds.length} usuarios seleccionados?`);
    if (!confirmed) return;

    setMsg(null);
    setBulkDeletingUsers(true);

    try {
      const response = await apiFetch<BulkDeleteResponse>('/admin/users/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedUserIds }),
      });

      await loadCore();
      setSelectedUserIds([]);

      const sampleErrors = (response.errors || [])
        .slice(0, 2)
        .map((item) => `${item.id}: ${item.message}`)
        .join(' | ');

      let summary = `Usuarios eliminados: ${response.summary.deleted}/${response.summary.requested}.`;
      if (response.summary.skipped > 0) {
        summary += ` Omitidos: ${response.summary.skipped}.`;
      }
      if (sampleErrors) {
        summary += ` Ejemplos: ${sampleErrors}`;
      }

      setMsg(summary);
    } catch (e: any) {
      setMsg(e?.message ?? 'No se pudo eliminar usuarios masivamente');
    } finally {
      setBulkDeletingUsers(false);
    }
  }

  async function bulkDeleteTeams() {
    if (bulkDeletingTeams || selectedTeamIds.length === 0) return;
    if (!leagueId) throw new Error('Selecciona una quiniela');

    const confirmed = window.confirm(`¿Deseas eliminar ${selectedTeamIds.length} equipos seleccionados?`);
    if (!confirmed) return;

    setMsg(null);
    setBulkDeletingTeams(true);

    try {
      const response = await apiFetch<BulkDeleteResponse>('/admin/teams/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({
          leagueId,
          ids: selectedTeamIds,
        }),
      });

      if (teamIdEditing && selectedTeamIds.includes(teamIdEditing)) {
        resetTeamEditForm();
      }

      await Promise.all([loadTeams(), loadTeamImages()]);
      setSelectedTeamIds([]);

      const sampleErrors = (response.errors || [])
        .slice(0, 2)
        .map((item) => `${item.id}: ${item.message}`)
        .join(' | ');

      let summary = `Equipos eliminados: ${response.summary.deleted}/${response.summary.requested}.`;
      if (response.summary.skipped > 0) {
        summary += ` Omitidos: ${response.summary.skipped}.`;
      }
      if (sampleErrors) {
        summary += ` Ejemplos: ${sampleErrors}`;
      }

      setMsg(summary);
    } catch (e: any) {
      setMsg(e?.message ?? 'No se pudo eliminar equipos masivamente');
    } finally {
      setBulkDeletingTeams(false);
    }
  }

  async function bulkDeleteMatches() {
    if (bulkDeletingMatches || selectedMatchIds.length === 0) return;
    if (!leagueId) throw new Error('Selecciona una quiniela');

    const confirmed = window.confirm(`¿Deseas eliminar ${selectedMatchIds.length} partidos seleccionados?`);
    if (!confirmed) return;

    setMsg(null);
    setBulkDeletingMatches(true);

    try {
      const response = await apiFetch<BulkDeleteResponse>(`/leagues/${leagueId}/matches/bulk-delete`, {
        method: 'POST',
        body: JSON.stringify({ ids: selectedMatchIds }),
      });

      await Promise.all([loadMatches(leagueId), loadCore()]);
      setSelectedMatchIds([]);

      const sampleMissing = (response.missingIds || []).slice(0, 3).join(', ');

      let summary = `Partidos eliminados: ${response.summary.deleted}/${response.summary.requested}.`;
      if (response.summary.skipped > 0) {
        summary += ` Omitidos: ${response.summary.skipped}.`;
      }
      if (sampleMissing) {
        summary += ` No encontrados: ${sampleMissing}`;
      }

      setMsg(summary);
    } catch (e: any) {
      setMsg(e?.message ?? 'No se pudo eliminar partidos masivamente');
    } finally {
      setBulkDeletingMatches(false);
    }
  }

  useEffect(() => {
    if (!me || me.role !== 'SUPERADMIN') return;
    (async () => {
      try {
        await loadCore();
      } catch (e: any) {
        setMsg(e?.message ?? 'No se pudo cargar admin');
      }
    })();
  }, [me?.id, me?.role]);

  useEffect(() => {
    if (!leagueId) return;
    (async () => {
      try {
        await loadMatches(leagueId);
      } catch (e: any) {
        setMsg(e?.message ?? 'No se pudo cargar partidos');
      }
    })();
  }, [leagueId]);

  useEffect(() => {
    setSelectedUserIds((current) => current.filter((id) => users.some((user) => user.id === id)));
  }, [users]);

  useEffect(() => {
    setSelectedTeamIds((current) => current.filter((id) => teams.some((team) => team.id === id)));
  }, [teams]);

  useEffect(() => {
    setSelectedMatchIds((current) => current.filter((id) => matches.some((match) => match.id === id)));
  }, [matches]);

  useEffect(() => {
    setSelectedTeamIds([]);
    setSelectedMatchIds([]);
    setNewMatchHomeTeam('');
    setNewMatchAwayTeam('');
    setNewMatchKickoffAt('');
    setNewMatchLockAt('');
    setNewMatchLockAutoSync(true);
    setNewMatchGroup('');
    setCreatingMatch(false);
    setCsvContent('');
    setCsvFileName('');
    setShowCsvPanel(false);
    setMatchSearchQuery('');
    setMatchDateFilter('');
    setMatchGroupFilter('all');
    setMatchStatusFilter('all');
    setExpandedMatchId(null);
    setOpenMatchMenuId(null);
    setCollapsedDateGroups({});
    setEditMatchGroup({});
    setEditMatchStatus({});
    setEditMatchNotes({});
    setEditLockAutoSync({});
    resetTeamForm();
    resetTeamEditForm();
  }, [leagueId]);

  useEffect(() => {
    if (!expandedMatchId) return;
    if (!matches.some((match) => match.id === expandedMatchId)) {
      setExpandedMatchId(null);
    }
  }, [matches, expandedMatchId]);

  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [quinielaSection, showLeagueEditor]);

  useEffect(() => {
    if (!leagueId) return;
    (async () => {
      try {
        await Promise.all([loadTeams(), loadTeamImages()]);
      } catch (e: any) {
        setMsg(e?.message ?? 'No se pudo cargar equipos');
      }
    })();
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    (async () => {
      try {
        await loadLeagueMembers(leagueId);
      } catch (e: any) {
        setMsg(e?.message ?? 'No se pudo cargar miembros de la quiniela');
      }
    })();
  }, [leagueId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!leagueId) {
      window.localStorage.removeItem(ADMIN_SELECTED_LEAGUE_KEY);
      return;
    }

    window.localStorage.setItem(ADMIN_SELECTED_LEAGUE_KEY, leagueId);
  }, [leagueId]);

  const selectedLeague = useMemo(
    () => leagues.find((league) => league.id === leagueId) ?? null,
    [leagues, leagueId]
  );

  const isSystemWorkspace = adminWorkspace === 'system';
  const isLeagueWorkspace = adminWorkspace === 'league';
  const showModernMatchesView = isLeagueWorkspace && showLeagueEditor && quinielaSection === 'partidos';
  const isGroupsDashboardView = showModernMatchesView && activeAdminNav === 'grupos';
  const selectedLeagueName = selectedLeague?.name || 'Sin quiniela seleccionada';

  const filteredFlags = useMemo(() => {
    const query = normalizeSearchText(flagSearch);
    if (query.length < MIN_FLAG_SEARCH_CHARS) return [];
    return flagCatalog
      .filter((item) => normalizeSearchText(`${item.name} ${item.spanishName}`).includes(query))
      .slice(0, MAX_FLAG_RESULTS);
  }, [flagSearch]);

  const filteredFlagsEditing = useMemo(() => {
    const query = normalizeSearchText(flagSearchEditing);
    if (query.length < MIN_FLAG_SEARCH_CHARS) return [];
    return flagCatalog
      .filter((item) => normalizeSearchText(`${item.name} ${item.spanishName}`).includes(query))
      .slice(0, MAX_FLAG_RESULTS);
  }, [flagSearchEditing]);

  const teamLogoByName = useMemo(() => {
    const map = new Map<string, string>();
    teams.forEach((team) => {
      if (team.logoUrl) map.set(team.name, team.logoUrl);
    });
    return map;
  }, [teams]);

  const teamNameOptions = useMemo(() => {
    return Array.from(new Set(teams.map((team) => team.name))).sort((a, b) => a.localeCompare(b));
  }, [teams]);

  const matchRows = useMemo<MatchRow[]>(() => {
    const sorted = [...matches].sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());

    return sorted.map((match, index) => {
      const group = (editMatchGroup[match.id] ?? match.groupName ?? '').trim();
      return {
        match,
        order: index + 1,
        group,
        status: getMatchStatus(match, editMatchStatus[match.id]),
      };
    });
  }, [matches, editMatchGroup, editMatchStatus]);

  const matchStats = useMemo(() => {
    const totals = {
      total: matchRows.length,
      pendiente: 0,
      conResultado: 0,
      cerrados: 0,
    };

    matchRows.forEach((row) => {
      if (row.status === 'pendiente') totals.pendiente += 1;
      if (row.status === 'con-resultado') totals.conResultado += 1;
      if (row.status === 'cerrado') totals.cerrados += 1;
    });

    return totals;
  }, [matchRows]);

  const groupFilterOptions = useMemo(() => {
    return Array.from(new Set(matchRows.map((row) => row.group))).sort((a, b) => {
      if (!a && b) return -1;
      if (a && !b) return 1;
      return a.localeCompare(b);
    });
  }, [matchRows]);

  const availableGroupOptions = useMemo(() => {
    const extraGroups = groupFilterOptions
      .filter((group) => group && !MATCH_GROUP_OPTIONS.includes(group))
      .sort((a, b) => a.localeCompare(b));

    return [...MATCH_GROUP_OPTIONS, ...extraGroups];
  }, [groupFilterOptions]);

  const filteredMatchRows = useMemo(() => {
    const teamQuery = normalizeSearchText(matchSearchQuery);

    return matchRows.filter((row) => {
      if (teamQuery) {
        const haystack = normalizeSearchText(`${row.match.homeTeam.name} ${toSpanishTeamName(row.match.homeTeam.name)} ${row.match.awayTeam.name} ${toSpanishTeamName(row.match.awayTeam.name)}`);
        if (!haystack.includes(teamQuery)) return false;
      }

      if (matchDateFilter && toDateKey(row.match.kickoffAt) !== matchDateFilter) {
        return false;
      }

      if (matchGroupFilter !== 'all' && row.group !== matchGroupFilter) {
        return false;
      }

      if (matchStatusFilter !== 'all' && row.status !== matchStatusFilter) {
        return false;
      }

      return true;
    });
  }, [matchRows, matchSearchQuery, matchDateFilter, matchGroupFilter, matchStatusFilter]);

  const groupedMatchRowsByDate = useMemo<MatchBucket[]>(() => {
    const groups = new Map<string, MatchBucket>();

    filteredMatchRows.forEach((row) => {
      const dateKey = toDateKey(row.match.kickoffAt);
      const title = formatDateHeading(row.match.kickoffAt);
      const current = groups.get(dateKey);

      if (!current) {
        groups.set(dateKey, { id: dateKey, title, rows: [row] });
        return;
      }

      current.rows.push(row);
    });

    return Array.from(groups.values()).sort((a, b) => a.id.localeCompare(b.id));
  }, [filteredMatchRows]);

  const groupedMatchRowsByGroup = useMemo<MatchBucket[]>(() => {
    const groups = new Map<string, MatchBucket>();

    filteredMatchRows.forEach((row) => {
      const key = row.group || UNGROUPED_LABEL;
      const current = groups.get(key);

      if (!current) {
        groups.set(key, {
          id: `group-${key}`,
          title: key.toUpperCase(),
          rows: [row],
        });
        return;
      }

      current.rows.push(row);
    });

    return Array.from(groups.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [filteredMatchRows]);

  const renderSystemUsersCard = () => (
    <div className="card">
      <div className="row-actions" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Usuarios del sistema ({users.length})</h3>
        {!!users.length && (
          <div className="row-actions">
            <button
              className="btn"
              disabled={bulkDeletingUsers || selectedUserIds.length === 0}
              onClick={bulkDeleteUsers}
            >
              {bulkDeletingUsers ? 'Eliminando...' : `Eliminar seleccionados (${selectedUserIds.length})`}
            </button>
          </div>
        )}
      </div>
      {!users.length ? (
        <p className="small" style={{ margin: 0 }}>No hay usuarios registrados.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 48 }}>
                <input
                  type="checkbox"
                  checked={users.filter((user) => user.role !== 'SUPERADMIN' && user.id !== me?.id).length > 0 && users
                    .filter((user) => user.role !== 'SUPERADMIN' && user.id !== me?.id)
                    .every((user) => selectedUserIds.includes(user.id))}
                  onChange={(e) => {
                    const selectableIds = users
                      .filter((user) => user.role !== 'SUPERADMIN' && user.id !== me?.id)
                      .map((user) => user.id);
                    setSelectedUserIds(e.target.checked ? selectableIds : []);
                  }}
                />
              </th>
              <th>Usuario</th><th>Rol</th><th>Quinielas</th><th>Pronósticos</th><th>Factura</th><th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  {user.role === 'SUPERADMIN' || user.id === me?.id ? (
                    <span className="small">-</span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.id)}
                      onChange={() => toggleSelection(setSelectedUserIds, user.id)}
                    />
                  )}
                </td>
                <td>
                  <b>{user.fullName?.trim() || `@${user.username}`}</b>
                  <br />
                  <span className="small">{user.email}</span>
                </td>
                <td>{user.role}</td>
                <td>{user._count.leagues}</td>
                <td>{user._count.predictions}</td>
                <td>
                  {user.purchaseProofImage ? (
                    <button className="btn admin-equal-btn" onClick={() => openInvoicePreview(user.purchaseProofImage as string, user.username)}>Ver factura</button>
                  ) : 'No'}
                </td>
                <td>
                  <div className="row-actions admin-table-actions">
                    <Link className="btn admin-equal-btn" href={`/admin/users/${user.id}`}>Ver perfil</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderMatchesDashboard = () => {
    const isGroupsView = activeAdminNav === 'grupos';
    const dashboardBuckets = isGroupsView ? groupedMatchRowsByGroup : groupedMatchRowsByDate;

    if (!showLeagueEditor || !leagueId) {
      return (
        <div className="card admin-dashboard-placeholder">
          <h2 style={{ marginTop: 0 }}>{isGroupsView ? 'Grupos de esta quiniela' : 'Partidos de esta quiniela'}</h2>
          <p className="small" style={{ marginTop: 0 }}>
            Selecciona una quiniela activa para administrar partidos con vista compacta.
          </p>
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => goToLeagueSection('partidos')}>Abrir editor de partidos</button>
          </div>
        </div>
      );
    }

    return (
      <div className="admin-dashboard-matches">
        <div className="card admin-dashboard-header">
          <div className="admin-dashboard-header-main">
            <div>
              <h2 style={{ marginTop: 0, marginBottom: 8 }}>
                {isGroupsView ? `Grupos de ${selectedLeagueName}` : `Partidos de ${selectedLeagueName}`}
              </h2>
              <p className="small" style={{ margin: 0 }}>
                {isGroupsView
                  ? 'Administra los grupos y partidos por bloque de grupo.'
                  : 'Administra los partidos, horarios y resultados de la quiniela.'}
              </p>
            </div>

            <div className="admin-dashboard-actions">
              <button className="btn primary" onClick={() => setShowCsvPanel((value) => !value)}>
                Importar CSV
              </button>
              <button className="btn" onClick={clearMatchDashboard}>Limpiar</button>
              <button
                className="btn admin-dashboard-delete-btn"
                disabled={bulkDeletingMatches || selectedMatchIds.length === 0}
                onClick={async () => {
                  try {
                    await bulkDeleteMatches();
                  } catch (e: any) {
                    setMsg(e?.message ?? 'No se pudo eliminar partidos masivamente');
                  }
                }}
              >
                {bulkDeletingMatches ? 'Eliminando...' : `Eliminar seleccionados (${selectedMatchIds.length})`}
              </button>
            </div>
          </div>

          <div className="admin-dashboard-stats">
            <div className="admin-dashboard-stat-card">
              <span className="admin-dashboard-stat-icon">#</span>
              <div>
                <div className="small">Total de partidos</div>
                <div className="admin-dashboard-stat-value">{matchStats.total}</div>
              </div>
            </div>

            <div className="admin-dashboard-stat-card">
              <span className="admin-dashboard-stat-icon orange">o</span>
              <div>
                <div className="small">Pendientes</div>
                <div className="admin-dashboard-stat-value">{matchStats.pendiente}</div>
              </div>
            </div>

            <div className="admin-dashboard-stat-card">
              <span className="admin-dashboard-stat-icon green">ok</span>
              <div>
                <div className="small">Con resultado</div>
                <div className="admin-dashboard-stat-value">{matchStats.conResultado}</div>
              </div>
            </div>

            <div className="admin-dashboard-stat-card">
              <span className="admin-dashboard-stat-icon blue">x</span>
              <div>
                <div className="small">Cerrados</div>
                <div className="admin-dashboard-stat-value">{matchStats.cerrados}</div>
              </div>
            </div>
          </div>

          <div className="admin-dashboard-filters">
            <div>
              <div className="small" style={{ marginBottom: 6 }}>Buscar equipo</div>
              <input
                className="input"
                placeholder="Buscar equipo..."
                value={matchSearchQuery}
                onChange={(e) => setMatchSearchQuery(e.target.value)}
              />
            </div>

            <div>
              <div className="small" style={{ marginBottom: 6 }}>Fecha</div>
              <input
                className="input"
                type="date"
                value={matchDateFilter}
                onChange={(e) => setMatchDateFilter(e.target.value)}
              />
            </div>

            <div>
              <div className="small" style={{ marginBottom: 6 }}>Grupo</div>
              <select className="input" value={matchGroupFilter} onChange={(e) => setMatchGroupFilter(e.target.value)}>
                <option value="all">Todos</option>
                {groupFilterOptions.map((group) => (
                  <option key={group || 'ungrouped'} value={group}>
                    {group || UNGROUPED_LABEL}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="small" style={{ marginBottom: 6 }}>Estado</div>
              <select className="input" value={matchStatusFilter} onChange={(e) => setMatchStatusFilter(e.target.value as MatchStatusFilter)}>
                <option value="all">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="con-resultado">Con resultado</option>
                <option value="cerrado">Cerrado</option>
              </select>
            </div>

            <button className="btn admin-dashboard-clear-filters" onClick={() => {
              setMatchSearchQuery('');
              setMatchDateFilter('');
              setMatchGroupFilter('all');
              setMatchStatusFilter('all');
            }}>
              Limpiar filtros
            </button>
          </div>

          <div className="admin-dashboard-create-panel">
            <div className="small" style={{ marginBottom: 8 }}>
              Crear partido manualmente para esta quiniela. El grupo es opcional.
            </div>

            <div className="admin-dashboard-create-grid">
              <div>
                <div className="small" style={{ marginBottom: 6 }}>Equipo local</div>
                <select
                  className="input"
                  value={newMatchHomeTeam}
                  onChange={(e) => setNewMatchHomeTeam(e.target.value)}
                >
                  <option value="">Selecciona equipo</option>
                  {teamNameOptions.map((name) => <option key={`new-home-${name}`} value={name}>{toSpanishTeamName(name)}</option>)}
                </select>
              </div>

              <div>
                <div className="small" style={{ marginBottom: 6 }}>Equipo visitante</div>
                <select
                  className="input"
                  value={newMatchAwayTeam}
                  onChange={(e) => setNewMatchAwayTeam(e.target.value)}
                >
                  <option value="">Selecciona equipo</option>
                  {teamNameOptions.map((name) => <option key={`new-away-${name}`} value={name}>{toSpanishTeamName(name)}</option>)}
                </select>
              </div>

              <div>
                <div className="small" style={{ marginBottom: 6 }}>Kickoff</div>
                <input
                  className="input"
                  type="datetime-local"
                  value={newMatchKickoffAt}
                  onChange={(e) => handleNewMatchKickoffChange(e.target.value)}
                />
              </div>

              <div>
                <div className="small" style={{ marginBottom: 6 }}>Cierre (opcional)</div>
                <input
                  className="input"
                  type="datetime-local"
                  value={newMatchLockAt}
                  onChange={(e) => handleNewMatchLockChange(e.target.value)}
                />
              </div>

              <div>
                <div className="small" style={{ marginBottom: 6 }}>Grupo (opcional)</div>
                <select
                  className="input"
                  value={newMatchGroup}
                  onChange={(e) => setNewMatchGroup(e.target.value)}
                >
                  <option value="">{UNGROUPED_LABEL}</option>
                  {availableGroupOptions.map((groupOption) => <option key={`new-group-${groupOption}`} value={groupOption}>{groupOption}</option>)}
                </select>
              </div>
            </div>

            <div className="admin-dashboard-create-actions">
              <button
                className="btn primary"
                disabled={creatingMatch || !leagueId || teamNameOptions.length < 2}
                onClick={async () => {
                  try {
                    await createManualMatch();
                  } catch (e: any) {
                    setMsg(e?.message ?? 'No se pudo crear partido');
                  }
                }}
              >
                {creatingMatch ? 'Creando...' : 'Crear partido manual'}
              </button>
            </div>
          </div>

          {showCsvPanel && (
            <div className="admin-dashboard-csv-panel">
              <div className="small" style={{ marginBottom: 8 }}>
                Importa por CSV. Columnas mínimas: <b>homeTeam, awayTeam, kickoffAt</b>. Opcional: <b>lockAt, group, homeLogoUrl, awayLogoUrl</b>.
              </div>
              <div className="small" style={{ marginBottom: 8 }}>
                Puedes subir un archivo <b>.csv</b> o pegar el texto directamente en el cuadro de contenido.
              </div>

              <div className="admin-dashboard-csv-grid">
                <div>
                  <div className="label">Archivo CSV (opcional)</div>
                  <input
                    className="input"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      try {
                        const text = await fileToText(file);
                        setCsvContent(text);
                        setCsvFileName(file.name);
                      } catch (error: any) {
                        setMsg(error?.message ?? 'No se pudo leer el archivo CSV');
                      }
                    }}
                  />
                  {csvFileName && (
                    <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
                      Archivo cargado: <b>{csvFileName}</b>
                    </p>
                  )}
                </div>

                <div>
                  <div className="label">Contenido CSV (editable, puedes pegar aquí)</div>
                  <textarea
                    className="input"
                    style={{ minHeight: 120, fontFamily: 'monospace' }}
                    value={csvContent}
                    onChange={(e) => setCsvContent(e.target.value)}
                    placeholder={'homeTeam,awayTeam,kickoffAt\nMexico,South Africa,2026-06-11T10:00:00-06:00'}
                  />
                </div>
              </div>

              <div className="row-actions" style={{ marginTop: 12 }}>
                <button className="btn primary" disabled={importingCsv} onClick={importMatchesFromCsv}>
                  {importingCsv ? 'Importando...' : 'Importar CSV a esta quiniela'}
                </button>
                <button className="btn" onClick={() => {
                  setCsvContent('');
                  setCsvFileName('');
                }}>
                  Limpiar CSV
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="admin-dashboard-list-meta">
          <label className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={filteredMatchRows.length > 0 && filteredMatchRows.every((row) => selectedMatchIds.includes(row.match.id))}
              onChange={(e) => setSelectedMatchIds(e.target.checked ? filteredMatchRows.map((row) => row.match.id) : [])}
            />
            Seleccionar todos los partidos visibles
          </label>
          <span className="small">
            Mostrando {filteredMatchRows.length} de {matchRows.length} partidos
            {isGroupsView ? ` en ${dashboardBuckets.length} grupos` : ''}
          </span>
        </div>

        {!dashboardBuckets.length ? (
          <div className="card">
            <p className="small" style={{ margin: 0 }}>
              No hay {isGroupsView ? 'grupos' : 'partidos'} que cumplan con los filtros actuales.
            </p>
          </div>
        ) : (
          <div className="admin-dashboard-group-list">
            {dashboardBuckets.map((group) => {
              const isCollapsed = !!collapsedDateGroups[group.id];

              return (
                <div key={group.id} className="card admin-dashboard-date-group">
                  <button type="button" className="admin-dashboard-date-header" onClick={() => toggleDateGroup(group.id)}>
                    <div className="admin-dashboard-date-left">
                      <b>{group.title}</b>
                      <span className="small">{group.rows.length} {group.rows.length === 1 ? 'partido' : 'partidos'}</span>
                    </div>
                    <span className="admin-dashboard-date-toggle">{isCollapsed ? '+' : '-'}</span>
                  </button>

                  {!isCollapsed && (
                    <div className="admin-dashboard-rows">
                      {group.rows.map((row) => {
                        const isExpanded = expandedMatchId === row.match.id;
                        const isMenuOpen = openMatchMenuId === row.match.id;
                        const homeTeam = editHomeTeam[row.match.id] ?? row.match.homeTeam.name;
                        const awayTeam = editAwayTeam[row.match.id] ?? row.match.awayTeam.name;
                        const homeLogo = teamLogoByName.get(homeTeam) || teamLogoByName.get(row.match.homeTeam.name) || '';
                        const awayLogo = teamLogoByName.get(awayTeam) || teamLogoByName.get(row.match.awayTeam.name) || '';
                        const rowTeamNameOptions = Array.from(new Set([
                          row.match.homeTeam.name,
                          row.match.awayTeam.name,
                          ...teamNameOptions,
                        ]));
                        const resultHomeValue = finalHome[row.match.id] ?? (row.match.finalHome === null ? '' : String(row.match.finalHome));
                        const resultAwayValue = finalAway[row.match.id] ?? (row.match.finalAway === null ? '' : String(row.match.finalAway));
                        const resultHomeNum = parseOptionalScore(resultHomeValue);
                        const resultAwayNum = parseOptionalScore(resultAwayValue);
                        const currentResultDraw = resultHomeNum !== null && resultAwayNum !== null && resultHomeNum === resultAwayNum;
                        const isAdminPenaltyEligible = isPenaltyEligibleMatch(row.match.kickoffAt);
                        const currentPenaltySelection = currentResultDraw && isAdminPenaltyEligible
                          ? (finalPenaltyWinnerIsHome[row.match.id] ?? null)
                          : null;
                        const selectedPenaltyTeam = currentPenaltySelection === null
                          ? null
                          : (currentPenaltySelection ? toSpanishTeamName(homeTeam) : toSpanishTeamName(awayTeam));

                        return (
                          <div key={row.match.id} className={`admin-dashboard-row ${isExpanded ? 'expanded' : ''}`}>
                            <div className="admin-dashboard-row-main">
                              <div className="admin-dashboard-cell check">
                                <input
                                  type="checkbox"
                                  checked={selectedMatchIds.includes(row.match.id)}
                                  onChange={() => toggleSelection(setSelectedMatchIds, row.match.id)}
                                />
                              </div>

                              <div className="admin-dashboard-cell badges">
                                <span className="admin-dashboard-badge">PARTIDO {row.order}</span>
                                <span className="admin-dashboard-badge muted">{(row.group || UNGROUPED_LABEL).toUpperCase()}</span>
                              </div>

                              <div className="admin-dashboard-cell teams">
                                <div className="admin-dashboard-team-inline">
                                  {homeLogo && <img src={homeLogo} alt={toSpanishTeamName(homeTeam)} className="team-logo-thumb" />}
                                  <span>{toSpanishTeamName(homeTeam)}</span>
                                </div>
                                <span className="small">vs</span>
                                <div className="admin-dashboard-team-inline">
                                  {awayLogo && <img src={awayLogo} alt={toSpanishTeamName(awayTeam)} className="team-logo-thumb" />}
                                  <span>{toSpanishTeamName(awayTeam)}</span>
                                </div>
                              </div>

                              <div className="admin-dashboard-cell time">
                                <span className="small">Kickoff</span>
                                <b>{formatMatchTime(editKickoffAt[row.match.id] ?? row.match.kickoffAt)}</b>
                              </div>

                              <div className="admin-dashboard-cell time">
                                <span className="small">Cierre</span>
                                <b>{formatMatchTime(editLockAt[row.match.id] ?? row.match.lockAt)}</b>
                              </div>

                              <div className="admin-dashboard-cell score">
                                <div>
                                  <div className="row-actions" style={{ justifyContent: 'center' }}>
                                    <input
                                      className="input admin-dashboard-score-input"
                                      value={resultHomeValue}
                                      onChange={(e) => setFinalHome((current) => ({ ...current, [row.match.id]: e.target.value }))}
                                      inputMode="numeric"
                                    />
                                    <span>-</span>
                                    <input
                                      className="input admin-dashboard-score-input"
                                      value={resultAwayValue}
                                      onChange={(e) => setFinalAway((current) => ({ ...current, [row.match.id]: e.target.value }))}
                                      inputMode="numeric"
                                    />
                                  </div>
                                  {currentResultDraw && isAdminPenaltyEligible && (
                                    <select
                                      className="input qb-penalty-select"
                                      style={{ width: '100%', maxWidth: 220, margin: '8px auto 0', display: 'block', textAlign: 'center' }}
                                      value={
                                        currentPenaltySelection === null
                                          ? ''
                                          : currentPenaltySelection
                                          ? 'home'
                                          : 'away'
                                      }
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        setFinalPenaltyWinnerIsHome((current) => ({
                                          ...current,
                                          [row.match.id]: value === '' ? null : value === 'home',
                                        }));
                                      }}
                                    >
                                      <option value="">Ganador en penales</option>
                                      <option value="home">Gana {toSpanishTeamName(homeTeam)} en penales</option>
                                      <option value="away">Gana {toSpanishTeamName(awayTeam)} en penales</option>
                                    </select>
                                  )}
                                  {!currentResultDraw && (
                                    <div className="small" style={{ marginTop: 8, textAlign: 'center' }}>
                                      Para penales, primero ingresa un empate.
                                    </div>
                                  )}
                                  {selectedPenaltyTeam && (
                                    <div className="small" style={{ marginTop: 8, textAlign: 'center' }}>
                                      Penales: ganó {selectedPenaltyTeam}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="admin-dashboard-cell status">
                                <span className={`admin-dashboard-status ${row.status}`}>{getStatusLabel(row.status)}</span>
                              </div>

                              <div className="admin-dashboard-cell actions">
                                <button className="btn primary admin-dashboard-save-btn" onClick={async () => {
                                  try {
                                    await saveMatchResult(row.match);
                                  } catch (e: any) {
                                    setMsg(e?.message ?? 'No se pudo guardar resultado');
                                  }
                                }}>
                                  Guardar resultado
                                </button>

                                <div className="admin-dashboard-row-menu-wrap">
                                  <button className="btn admin-dashboard-row-menu-btn" onClick={() => {
                                    setOpenMatchMenuId((current) => current === row.match.id ? null : row.match.id);
                                  }}>
                                    ...
                                  </button>

                                  {isMenuOpen && (
                                    <div className="admin-dashboard-row-menu">
                                      <button type="button" onClick={() => openMatchEditor(row)}>Editar partido</button>
                                      <button type="button" className="danger" onClick={async () => {
                                        setOpenMatchMenuId(null);
                                        try {
                                          await removeMatch(row.match);
                                        } catch (e: any) {
                                          setMsg(e?.message ?? 'No se pudo eliminar partido');
                                        }
                                      }}>Eliminar</button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="admin-dashboard-expanded">
                                <div className="admin-dashboard-expanded-grid">
                                  <div>
                                    <div className="small" style={{ marginBottom: 6 }}>Equipo local</div>
                                    <select
                                      className="input"
                                      value={homeTeam}
                                      onChange={(e) => setEditHomeTeam((current) => ({ ...current, [row.match.id]: e.target.value }))}
                                    >
                                      {rowTeamNameOptions.map((name) => <option key={`home-${row.match.id}-${name}`} value={name}>{toSpanishTeamName(name)}</option>)}
                                    </select>
                                  </div>

                                  <div>
                                    <div className="small" style={{ marginBottom: 6 }}>Equipo visitante</div>
                                    <select
                                      className="input"
                                      value={awayTeam}
                                      onChange={(e) => setEditAwayTeam((current) => ({ ...current, [row.match.id]: e.target.value }))}
                                    >
                                      {rowTeamNameOptions.map((name) => <option key={`away-${row.match.id}-${name}`} value={name}>{toSpanishTeamName(name)}</option>)}
                                    </select>
                                  </div>

                                  <div>
                                    <div className="small" style={{ marginBottom: 6 }}>Grupo</div>
                                    <select
                                      className="input"
                                      value={editMatchGroup[row.match.id] ?? (row.match.groupName ?? '')}
                                      onChange={(e) => setEditMatchGroup((current) => ({ ...current, [row.match.id]: e.target.value }))}
                                    >
                                      <option value="">{UNGROUPED_LABEL}</option>
                                      {availableGroupOptions.map((groupOption) => (
                                        <option key={`${row.match.id}-${groupOption}`} value={groupOption}>{groupOption}</option>
                                      ))}
                                    </select>
                                  </div>

                                  <div>
                                    <div className="small" style={{ marginBottom: 6 }}>Kickoff</div>
                                    <input
                                      className="input"
                                      type="datetime-local"
                                      value={editKickoffAt[row.match.id] ?? toDateTimeLocal(row.match.kickoffAt)}
                                      onChange={(e) => handleEditKickoffChange(row.match, e.target.value)}
                                    />
                                  </div>

                                  <div>
                                    <div className="small" style={{ marginBottom: 6 }}>Cierre</div>
                                    <input
                                      className="input"
                                      type="datetime-local"
                                      value={editLockAt[row.match.id] ?? toDateTimeLocal(row.match.lockAt)}
                                      onChange={(e) => handleEditLockChange(row.match, e.target.value)}
                                    />
                                  </div>

                                  <div>
                                    <div className="small" style={{ marginBottom: 6 }}>Estado</div>
                                    <select
                                      className="input"
                                      value={editMatchStatus[row.match.id] ?? row.status}
                                      onChange={(e) => setEditMatchStatus((current) => ({
                                        ...current,
                                        [row.match.id]: e.target.value as MatchStatus,
                                      }))}
                                    >
                                      <option value="pendiente">Pendiente</option>
                                      <option value="con-resultado">Con resultado</option>
                                      <option value="cerrado">Cerrado</option>
                                    </select>
                                  </div>

                                  <div className="admin-dashboard-expanded-notes">
                                    <div className="small" style={{ marginBottom: 6 }}>Notas (opcional)</div>
                                    <textarea
                                      className="input"
                                      value={editMatchNotes[row.match.id] ?? ''}
                                      onChange={(e) => setEditMatchNotes((current) => ({
                                        ...current,
                                        [row.match.id]: e.target.value,
                                      }))}
                                      placeholder="Agregar nota (opcional)"
                                      style={{ minHeight: 92 }}
                                    />
                                  </div>
                                </div>

                                <div className="admin-dashboard-expanded-actions">
                                  <button className="btn" onClick={() => setExpandedMatchId(null)}>Cancelar</button>
                                  <button className="btn admin-dashboard-secondary-btn" onClick={async () => {
                                    try {
                                      await updateMatch(row.match);
                                    } catch (e: any) {
                                      setMsg(e?.message ?? 'No se pudo actualizar partido');
                                    }
                                  }}>Guardar cambios</button>
                                  <button className="btn primary" onClick={async () => {
                                    try {
                                      await saveMatchResult(row.match);
                                    } catch (e: any) {
                                      setMsg(e?.message ?? 'No se pudo guardar resultado');
                                    }
                                  }}>Guardar resultado</button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Admin</h2>
        <p className="small">Cargando...</p>
      </div>
    );
  }

  if (!me || me.role !== 'SUPERADMIN') {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Admin</h2>
        <div className="card">403 - Solo SUPERADMIN.</div>
      </div>
    );
  }

  return (
    <div className={`admin-layout-shell ${mobileDrawerOpen ? 'drawer-open' : ''}`}>
      {mobileDrawerOpen && <button className="admin-layout-backdrop" onClick={() => setMobileDrawerOpen(false)} aria-label="Cerrar menú" />}

      <aside className={`admin-layout-sidebar ${mobileDrawerOpen ? 'open' : ''}`}>
        <div className="admin-layout-brand">
          <div className="admin-layout-brand-main">Quiniela Mundial</div>
          <div className="small">Selecciona quiniela activa</div>
          <select className="input admin-layout-league-select" value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>
            {leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
          </select>
          <div className="small admin-layout-brand-meta">
            {selectedLeague ? (
              <>
                <div><b>{selectedLeague.name}</b></div>
                <div>Código: {selectedLeague.joinCode}</div>
                <div>{selectedLeague._count.matches} partidos</div>
              </>
            ) : (
              <div>Sin quiniela seleccionada</div>
            )}
          </div>
        </div>

        <button
          type="button"
          className={`admin-layout-system-switch ${isSystemWorkspace ? 'active' : ''}`}
          onClick={() => openSystemPanel(systemPanelSection)}
        >
          Panel del sistema
        </button>

        <div className="admin-layout-nav-list">
          {ADMIN_NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`admin-layout-nav-item ${isLeagueWorkspace && activeAdminNav === item.id ? 'active' : ''}`}
              onClick={() => handleAdminNav(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <Link className="admin-layout-home-link" href="/">Volver al inicio</Link>

        <button className="admin-layout-logout" onClick={handleAdminLogout}>Cerrar sesión</button>
      </aside>

      <div className="admin-layout-main">
        <div className="admin-layout-topbar">
          <button className="btn admin-layout-menu-btn" onClick={() => setMobileDrawerOpen((value) => !value)}>
            {mobileDrawerOpen ? 'Cerrar' : 'Menú'}
          </button>
          <div>
            <h1 style={{ margin: 0 }}>
              {isSystemWorkspace
                ? 'Panel del sistema'
                : isGroupsDashboardView
                ? 'Grupos de esta quiniela'
                : showModernMatchesView
                  ? 'Partidos de esta quiniela'
                  : 'Panel Admin'}
            </h1>
            <p className="small" style={{ margin: 0 }}>
              {isSystemWorkspace
                ? 'Gestión global de quinielas y usuarios del sistema.'
                : isGroupsDashboardView
                ? 'Vista por grupos para organizar los partidos de la quiniela.'
                : showModernMatchesView
                  ? 'Administra los partidos, horarios y resultados de la quiniela.'
                  : 'Gestión de quinielas, usuarios, equipos y partidos.'}
            </p>
          </div>
        </div>

        <div className="card admin-layout-content">
          {msg && (
            <div className="card">
              <p className="small" style={{ margin: 0 }}>{msg}</p>
            </div>
          )}

        <div className="card" style={{ display: isSystemWorkspace ? 'block' : 'none' }}>
          <h2 style={{ marginTop: 0 }}>Panel del sistema</h2>
          <p className="small" style={{ marginTop: 0 }}>
            Estas acciones son globales y no dependen de la quiniela activa.
          </p>

          <div className="admin-subtabs">
            <button
              className={`btn admin-subtab-btn ${systemPanelSection === 'sistema' ? 'primary' : ''}`}
              onClick={() => {
                setSystemPanelSection('sistema');
                openSystemPanel('sistema');
              }}
            >
              Sistema global
            </button>
            <button
              className={`btn admin-subtab-btn ${systemPanelSection === 'usuarios' ? 'primary' : ''}`}
              onClick={() => {
                setSystemPanelSection('usuarios');
                openSystemPanel('usuarios');
              }}
            >
              Usuarios sistema
            </button>
            <button
              className={`btn admin-subtab-btn ${systemPanelSection === 'borradas' ? 'primary' : ''}`}
              onClick={() => {
                setSystemPanelSection('borradas');
                openSystemPanel('borradas');
              }}
            >
              Borradas
            </button>
          </div>
        </div>

        <div className="card admin-league-panel-card" style={{ display: isLeagueWorkspace && activeAdminNav === 'panel' && !showModernMatchesView ? 'block' : 'none' }}>
          <h2 style={{ marginTop: 0 }}>Panel de quiniela seleccionada</h2>
          <p className="small" style={{ marginTop: 0 }}>
            La quiniela activa se cambia arriba en el sidebar.
          </p>

          <div className="small admin-active-league-meta">
            <div><b>Nombre:</b> {selectedLeagueName}</div>
            {selectedLeague ? (
              <>
                <div><b>Código:</b> {selectedLeague.joinCode}</div>
                <div><b>Creador:</b> {selectedLeague.createdBy.fullName?.trim() || `@${selectedLeague.createdBy.username}`}</div>
                <div><b>Miembros:</b> {selectedLeague._count.members}</div>
                <div><b>Partidos:</b> {selectedLeague._count.matches}</div>
              </>
            ) : (
              <div>Selecciona una quiniela para empezar.</div>
            )}
          </div>

          <div className="row-actions" style={{ marginTop: 12 }}>
            {leagueId && <Link className="btn admin-equal-btn" href={`/leagues/${leagueId}`}>Abrir quiniela</Link>}
          </div>
        </div>

        {isSystemWorkspace && systemPanelSection === 'sistema' && (
          <>
            <div className="grid cols2">
              <div className="card" style={{ marginTop: 0 }}>
                <h3 style={{ marginTop: 0 }}>Crear quiniela</h3>
                <div className="label">Nombre</div>
                <input className="input" value={newLeagueName} onChange={(e) => setNewLeagueName(e.target.value)} />

                <div className="label">Descripción</div>
                <input className="input" value={newLeagueDescription} onChange={(e) => setNewLeagueDescription(e.target.value)} placeholder="Descripción opcional" />

                <div className="row-actions" style={{ marginTop: 12 }}>
                  <button className="btn primary admin-equal-btn" onClick={async () => {
                    try {
                      await createLeague();
                    } catch (e: any) {
                      setMsg(e?.message ?? 'No se pudo crear quiniela');
                    }
                  }}>Crear quiniela</button>
                </div>
              </div>

              <div className="card" style={{ marginTop: 0 }}>
                <h3 style={{ marginTop: 0 }}>Resumen de quiniela activa</h3>
                {selectedLeague ? (
                  <div className="small">
                    <div><b>Nombre:</b> {selectedLeague.name}</div>
                    <div><b>Descripción:</b> {selectedLeague.description || '-'}</div>
                    <div><b>Pronósticos:</b> {selectedLeague._count.predictions}</div>
                  </div>
                ) : (
                  <p className="small" style={{ margin: 0 }}>No hay quiniela seleccionada.</p>
                )}
              </div>

              <div className="card" style={{ marginTop: 0 }}>
                <h3 style={{ marginTop: 0 }}>Quinielas activas</h3>
                {!leagues.length ? (
                  <p className="small" style={{ margin: 0 }}>No hay quinielas activas.</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Quiniela</th>
                        <th>Miembros</th>
                        <th>Partidos</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leagues.map((league) => (
                        <tr key={league.id}>
                          <td>
                            <b>{league.name}</b>
                            <br />
                            <span className="small">Código: {league.joinCode}</span>
                          </td>
                          <td>{league._count.members}</td>
                          <td>{league._count.matches}</td>
                          <td>
                            <div className="row-actions admin-table-actions">
                              <button
                                className="btn admin-equal-btn"
                                onClick={async () => {
                                  try {
                                    await trashLeague(league);
                                  } catch (e: any) {
                                    setMsg(e?.message ?? 'No se pudo mover a borradas');
                                  }
                                }}
                              >
                                Borrar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

            </div>
          </>
        )}

        {isSystemWorkspace && systemPanelSection === 'usuarios' && renderSystemUsersCard()}

        {isSystemWorkspace && systemPanelSection === 'borradas' && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Quinielas borradas</h3>
            <p className="small" style={{ marginTop: 0 }}>
              Estas quinielas siguen guardadas hasta que las borres definitivamente.
            </p>

            {!deletedLeagues.length ? (
              <p className="small" style={{ margin: 0 }}>No hay quinielas borradas.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Quiniela</th>
                    <th>Borrada</th>
                    <th>Miembros</th>
                    <th>Partidos</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedLeagues.map((league) => (
                    <tr key={league.id}>
                      <td>
                        <b>{league.name}</b>
                        <br />
                        <span className="small">Código: {league.joinCode}</span>
                      </td>
                      <td className="small">{formatDate(league.deletedAt)}</td>
                      <td>{league._count.members}</td>
                      <td>{league._count.matches}</td>
                      <td>
                        <div className="row-actions admin-table-actions">
                          <button
                            className="btn admin-equal-btn"
                            onClick={async () => {
                              try {
                                await restoreLeague(league);
                              } catch (e: any) {
                                setMsg(e?.message ?? 'No se pudo restaurar la quiniela');
                              }
                            }}
                          >
                            Restaurar
                          </button>
                          <button
                            className="btn"
                            onClick={async () => {
                              try {
                                await deleteLeaguePermanently(league);
                              } catch (e: any) {
                                setMsg(e?.message ?? 'No se pudo borrar definitivamente');
                              }
                            }}
                          >
                            Borrar definitivamente
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {showLeagueEditor && quinielaSection === 'miembros' && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Usuarios de la quiniela activa</h3>
            <p className="small" style={{ marginTop: 0 }}>
              Aquí solo se muestran los miembros de la quiniela seleccionada.
            </p>

            {!leagueId ? (
              <p className="small" style={{ margin: 0 }}>Selecciona una quiniela para ver sus miembros.</p>
            ) : !leagueMembers.length ? (
              <p className="small" style={{ margin: 0 }}>Esta quiniela aún no tiene miembros.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Usuario</th><th>Rol</th><th>Ingreso</th><th>Acción</th></tr>
                </thead>
                <tbody>
                  {leagueMembers.map((member) => (
                    <tr key={`${member.user.id}-${member.joinedAt}`}>
                      <td>{member.user.fullName?.trim() || `@${member.user.username}`}</td>
                      <td>{member.role}</td>
                      <td>{formatDate(member.joinedAt)}</td>
                      <td>
                        <div className="row-actions admin-table-actions">
                          <Link className="btn admin-equal-btn" href={`/admin/users/${member.user.id}`}>Ver perfil</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {showLeagueEditor && quinielaSection === 'equipos' && (
          <div className="grid cols2">
            <div className="card" style={{ marginTop: 0 }}>
              <h3 style={{ marginTop: 0 }}>Equipos de esta quiniela</h3>
              <p className="small">Cada quiniela tiene equipos propios. La foto es obligatoria.</p>

              <div className="label">Nombre</div>
              <input className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Ej: Costa Rica" />

              <div>
                <div className="label">Foto (URL o archivo)</div>
                <input className="input" value={teamLogoUrl} onChange={(e) => setTeamLogoUrl(e.target.value)} placeholder="https://..." />
                <input
                  className="input"
                  style={{ marginTop: 8 }}
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const dataUrl = await fileToDataUrl(file);
                      setTeamLogoUrl(dataUrl);
                    } catch (error: any) {
                      setMsg(error?.message ?? 'No se pudo leer la imagen');
                    }
                  }}
                />
              </div>

              {teamLogoUrl && (
                <div style={{ marginTop: 12 }}>
                  <div className="small" style={{ marginBottom: 8 }}>Vista previa</div>
                  <img src={teamLogoUrl} alt="Vista previa" className="team-logo-preview" />
                </div>
              )}

              {!!teamImages.length && (
                <div style={{ marginTop: 12 }}>
                  <div className="row-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="small">Fotos cargadas previamente</div>
                    <button type="button" className="btn" onClick={() => setShowStoredTeamImages((value) => !value)}>
                      {showStoredTeamImages ? 'Ocultar' : `Mostrar (${teamImages.length})`}
                    </button>
                  </div>

                  {showStoredTeamImages && (
                    <div className="image-library" style={{ marginTop: 8 }}>
                      {teamImages.map((image) => (
                        <button
                          key={image}
                          type="button"
                          className={`image-pick ${teamLogoUrl === image ? 'active' : ''}`}
                          onClick={() => setTeamLogoUrl(image)}
                        >
                          <img src={image} alt="Logo sugerido" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <div className="small" style={{ marginBottom: 8 }}>Banderas por país (buscable)</div>
                <input
                  className="input"
                  placeholder="Escribe al menos 2 letras. Ej: Argentina"
                  value={flagSearch}
                  onChange={(e) => setFlagSearch(e.target.value)}
                />
                {normalizeSearchText(flagSearch).length < MIN_FLAG_SEARCH_CHARS ? (
                  <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
                    Escribe al menos {MIN_FLAG_SEARCH_CHARS} letras para buscar banderas.
                  </p>
                ) : filteredFlags.length === 0 ? (
                  <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
                    No se encontraron banderas con ese criterio.
                  </p>
                ) : (
                  <div className="image-library flags-grid" style={{ marginTop: 8 }}>
                    {filteredFlags.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        className={`image-pick image-pick-country ${teamLogoUrl === item.url ? 'active' : ''}`}
                        onClick={() => setTeamLogoUrl(item.url)}
                        title={`Usar bandera de ${item.spanishName}`}
                      >
                        <img src={item.url} alt={item.spanishName} />
                        <span>{item.spanishName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="row-actions" style={{ marginTop: 12 }}>
                <button className="btn primary admin-equal-btn" onClick={async () => {
                  try {
                    await saveTeam();
                  } catch (e: any) {
                    setMsg(e?.message ?? 'No se pudo crear equipo');
                  }
                }}>Crear equipo</button>
              </div>
            </div>

            <div className="card" style={{ marginTop: 0 }}>
              <div className="row-actions" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ marginTop: 0, marginBottom: 0 }}>Listado de equipos</h3>
                {!!teams.length && (
                  <button
                    className="btn"
                    disabled={bulkDeletingTeams || selectedTeamIds.length === 0}
                    onClick={async () => {
                      try {
                        await bulkDeleteTeams();
                      } catch (e: any) {
                        setMsg(e?.message ?? 'No se pudo eliminar equipos masivamente');
                      }
                    }}
                  >
                    {bulkDeletingTeams ? 'Eliminando...' : `Eliminar seleccionados (${selectedTeamIds.length})`}
                  </button>
                )}
              </div>
              <p className="small" style={{ marginTop: 8 }}>
                Si un equipo tiene partidos, primero borra esos partidos en la pestaña Partidos y luego elimina el equipo.
              </p>
              {!teams.length ? (
                <p className="small" style={{ margin: 0 }}>No hay equipos cargados para esta quiniela.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 48 }}>
                        <input
                          type="checkbox"
                          checked={teams.length > 0 && teams.every((team) => selectedTeamIds.includes(team.id))}
                          onChange={(e) => setSelectedTeamIds(e.target.checked ? teams.map((team) => team.id) : [])}
                        />
                      </th>
                      <th>Nombre</th><th>Acciones</th><th>Logo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((team) => {
                      const isEditingThisTeam = teamIdEditing === team.id;

                      return (
                        <Fragment key={team.id}>
                          <tr>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedTeamIds.includes(team.id)}
                                onChange={() => toggleSelection(setSelectedTeamIds, team.id)}
                              />
                            </td>
                            <td>{toSpanishTeamName(team.name)}</td>
                            <td>
                              <div className="row-actions admin-table-actions">
                                <button className="btn admin-equal-btn" onClick={() => {
                                  if (isEditingThisTeam) {
                                    resetTeamEditForm();
                                    return;
                                  }

                                  setTeamIdEditing(team.id);
                                  setFlagSearchEditing('');
                                  setTeamNameEditing(team.name);
                                  setTeamLogoUrlEditing(team.logoUrl || '');
                                }}>{isEditingThisTeam ? 'Cerrar' : 'Editar'}</button>

                                <button className="btn admin-equal-btn" onClick={async () => {
                                  try {
                                    await removeTeam(team);
                                  } catch (e: any) {
                                    setMsg(e?.message ?? 'No se pudo eliminar equipo');
                                  }
                                }}>Eliminar</button>
                              </div>
                            </td>
                            <td>{team.logoUrl ? <img src={team.logoUrl} alt={toSpanishTeamName(team.name)} className="team-logo-thumb" /> : <span className="small">-</span>}</td>
                          </tr>

                          {isEditingThisTeam && (
                            <tr className="admin-team-inline-row">
                              <td colSpan={4}>
                                <div className="admin-team-inline-editor">
                                  <div className="small" style={{ marginBottom: 10 }}>
                                    Editando <b>{toSpanishTeamName(team.name)}</b>
                                  </div>

                                  <div className="admin-team-inline-grid">
                                    <div>
                                      <div className="label">Nombre</div>
                                      <input
                                        className="input"
                                        value={teamNameEditing}
                                        onChange={(e) => setTeamNameEditing(e.target.value)}
                                        placeholder="Ej: Costa Rica"
                                      />
                                    </div>

                                    <div>
                                      <div className="label">Foto (URL o archivo)</div>
                                      <input
                                        className="input"
                                        value={teamLogoUrlEditing}
                                        onChange={(e) => setTeamLogoUrlEditing(e.target.value)}
                                        placeholder="https://..."
                                      />
                                      <input
                                        className="input"
                                        style={{ marginTop: 8 }}
                                        type="file"
                                        accept="image/*"
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file) return;
                                          try {
                                            const dataUrl = await fileToDataUrl(file);
                                            setTeamLogoUrlEditing(dataUrl);
                                          } catch (error: any) {
                                            setMsg(error?.message ?? 'No se pudo leer la imagen');
                                          }
                                        }}
                                      />
                                    </div>
                                  </div>

                                  {teamLogoUrlEditing && (
                                    <div style={{ marginTop: 12 }}>
                                      <div className="small" style={{ marginBottom: 8 }}>Vista previa</div>
                                      <img src={teamLogoUrlEditing} alt="Vista previa de equipo" className="team-logo-preview" />
                                    </div>
                                  )}

                                  <div style={{ marginTop: 12 }}>
                                    <div className="small" style={{ marginBottom: 8 }}>Banderas por país (buscable)</div>
                                    <input
                                      className="input"
                                      placeholder="Escribe al menos 2 letras. Ej: Costa de Marfil"
                                      value={flagSearchEditing}
                                      onChange={(e) => setFlagSearchEditing(e.target.value)}
                                    />
                                    {normalizeSearchText(flagSearchEditing).length < MIN_FLAG_SEARCH_CHARS ? (
                                      <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
                                        Escribe al menos {MIN_FLAG_SEARCH_CHARS} letras para buscar banderas.
                                      </p>
                                    ) : filteredFlagsEditing.length === 0 ? (
                                      <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
                                        No se encontraron banderas con ese criterio.
                                      </p>
                                    ) : (
                                      <div className="image-library flags-grid" style={{ marginTop: 8 }}>
                                        {filteredFlagsEditing.map((item) => (
                                          <button
                                            key={`${team.id}-${item.name}`}
                                            type="button"
                                            className={`image-pick image-pick-country ${teamLogoUrlEditing === item.url ? 'active' : ''}`}
                                            onClick={() => setTeamLogoUrlEditing(item.url)}
                                            title={`Usar bandera de ${item.spanishName}`}
                                          >
                                            <img src={item.url} alt={item.spanishName} />
                                            <span>{item.spanishName}</span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <div className="row-actions" style={{ marginTop: 12 }}>
                                    <button className="btn primary admin-equal-btn" onClick={async () => {
                                      try {
                                        await saveEditingTeam();
                                      } catch (e: any) {
                                        setMsg(e?.message ?? 'No se pudo guardar equipo');
                                      }
                                    }}>Guardar equipo</button>
                                    <button className="btn admin-equal-btn" onClick={resetTeamEditForm}>Cancelar</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {showModernMatchesView && renderMatchesDashboard()}

        {invoicePreview && (
          <div className="admin-proof-modal-backdrop" onClick={() => setInvoicePreview(null)}>
            <div className="card admin-proof-modal" onClick={(e) => e.stopPropagation()}>
              <div className="row-actions" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>Factura de @{invoicePreview.userLabel}</h3>
                <button className="btn" onClick={() => setInvoicePreview(null)}>Cerrar</button>
              </div>

              <div className="admin-proof-modal-body">
                <img
                  src={invoicePreview.src}
                  alt={`Factura de @${invoicePreview.userLabel}`}
                  className="admin-proof-image"
                />
              </div>

              <div className="row-actions" style={{ marginTop: 12 }}>
                <a className="btn" href={invoicePreview.src} download={`factura-${invoicePreview.userLabel}.jpg`}>Descargar</a>
              </div>
            </div>
          </div>
        )}

        {leagueActionModal && (
          <div className="admin-proof-modal-backdrop" onClick={closeLeagueActionModal}>
            <div className="card admin-proof-modal" onClick={(e) => e.stopPropagation()}>
              <div className="row-actions" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>
                  {leagueActionModal.mode === 'trash' ? 'Mover quiniela a borradas' : 'Borrar quiniela definitivamente'}
                </h3>
                <button className="btn" onClick={closeLeagueActionModal} disabled={leagueActionSubmitting}>Cerrar</button>
              </div>

              <p className="small" style={{ marginTop: 12 }}>
                Escribe exactamente el nombre de la quiniela para continuar: <b>{leagueActionModal.league.name}</b>
              </p>

              <div className="label">Nombre de la quiniela</div>
              <input
                className="input"
                value={leagueActionName}
                onChange={(e) => setLeagueActionName(e.target.value)}
                placeholder={leagueActionModal.league.name}
                autoFocus
              />

              <div className="row-actions" style={{ marginTop: 12 }}>
                <button className="btn" onClick={closeLeagueActionModal} disabled={leagueActionSubmitting}>Cancelar</button>
                <button
                  className="btn primary"
                  onClick={async () => {
                    try {
                      await submitLeagueAction();
                    } catch (e: any) {
                      setMsg(e?.message ?? 'No se pudo completar la acción sobre la quiniela');
                    }
                  }}
                  disabled={leagueActionSubmitting || leagueActionName.trim() !== leagueActionModal.league.name.trim()}
                >
                  {leagueActionSubmitting
                    ? 'Procesando...'
                    : leagueActionModal.mode === 'trash'
                      ? 'Mover a borradas'
                      : 'Borrar definitivamente'}
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
