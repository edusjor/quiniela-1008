'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Nav from '../../../components/Nav';
import { apiFetch } from '../../../lib/api';
import { useMe } from '../../../lib/hooks';
import { flagCatalog, normalizeSearchText, toSpanishTeamName } from '../../../lib/teamNames';

type MatchItem = {
  id: string;
  kickoffAt: string;
  lockAt: string;
  finalHome: number | null;
  finalAway: number | null;
  homeTeam: { name: string; logoUrl?: string | null };
  awayTeam: { name: string; logoUrl?: string | null };
  myPrediction: { predHome: number; predAway: number; points: number | null } | null;
};

type LeagueTeam = {
  id: string;
  name: string;
  logoUrl: string | null;
};

type CsvImportResponse = {
  summary: {
    rowsReceived: number;
    createdTeams: number;
    updatedTeams: number;
    createdMatches: number;
    updatedMatches: number;
    unchangedMatches: number;
    errorRows: number;
  };
  errors: Array<{
    row: number;
    message: string;
  }>;
};

type BulkPredictionResponse = {
  summary: {
    requested: number;
    processed: number;
    saved: number;
    failed: number;
  };
  saved: Array<{
    matchId: string;
    predHome: number;
    predAway: number;
    points: number | null;
  }>;
  failed: Array<{
    matchId: string;
    error: string;
    code: string;
  }>;
};

type PredictionSaveErrorMap = Record<string, string>;

const COSTA_RICA_TIMEZONE = 'America/Costa_Rica';

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

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString('es-CR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: COSTA_RICA_TIMEZONE,
  });
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: COSTA_RICA_TIMEZONE,
  });
}

export default function LeaguePage({ params }: { params: { id: string } }) {
  const leagueId = params.id;
  const { me, loading } = useMe();

  const [league, setLeague] = useState<any>(null);
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [predHome, setPredHome] = useState<Record<string, string>>({});
  const [predAway, setPredAway] = useState<Record<string, string>>({});
  const [savedPredHome, setSavedPredHome] = useState<Record<string, string>>({});
  const [savedPredAway, setSavedPredAway] = useState<Record<string, string>>({});
  const [predictionSaveErrors, setPredictionSaveErrors] = useState<PredictionSaveErrorMap>({});
  const [savingPredictions, setSavingPredictions] = useState(false);
  const [savingPredictionIds, setSavingPredictionIds] = useState<Record<string, true>>({});
  const [resultHome, setResultHome] = useState<Record<string, string>>({});
  const [resultAway, setResultAway] = useState<Record<string, string>>({});

  const [leagueTeams, setLeagueTeams] = useState<LeagueTeam[]>([]);
  const [teamImages, setTeamImages] = useState<string[]>([]);
  const [flagSearch, setFlagSearch] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamLogoUrl, setTeamLogoUrl] = useState('');

  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [kickoffAt, setKickoffAt] = useState('');
  const [matchesTab, setMatchesTab] = useState<'all' | 'without-prediction' | 'predicted' | 'closed'>('all');
  const [csvContent, setCsvContent] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);

  async function load() {
    const r = await apiFetch<{ league: any; matches: MatchItem[]; canManage: boolean }>(`/leagues/${leagueId}/matches`);
    setLeague(r.league);
    setMatches(r.matches);
    setCanManage(r.canManage);

    const ph: Record<string, string> = {};
    const pa: Record<string, string> = {};
    const rh: Record<string, string> = {};
    const ra: Record<string, string> = {};

    r.matches.forEach((m) => {
      if (m.myPrediction) {
        ph[m.id] = String(m.myPrediction.predHome);
        pa[m.id] = String(m.myPrediction.predAway);
      }
      if (m.finalHome !== null && m.finalAway !== null) {
        rh[m.id] = String(m.finalHome);
        ra[m.id] = String(m.finalAway);
      }
    });

    setPredHome(ph);
    setPredAway(pa);
    setSavedPredHome(ph);
    setSavedPredAway(pa);
    setPredictionSaveErrors({});
    setResultHome(rh);
    setResultAway(ra);
  }

  async function loadLeagueTeams() {
    const r = await apiFetch<{ teams: LeagueTeam[] }>(`/leagues/${leagueId}/teams`);
    setLeagueTeams(r.teams);
  }

  async function loadTeamImages() {
    const r = await apiFetch<{ images: string[] }>(`/leagues/${leagueId}/team-images`);
    setTeamImages(r.images);
  }

  async function importMatchesFromCsv() {
    if (importingCsv) return;

    setMsg(null);
    setImportingCsv(true);

    try {
      const content = csvContent.trim();
      if (!content) throw new Error('Debes cargar o pegar el contenido CSV');

      const response = await apiFetch<CsvImportResponse>(`/leagues/${leagueId}/matches/import-csv`, {
        method: 'POST',
        body: JSON.stringify({ csvContent: content }),
      });

      await Promise.all([load(), loadLeagueTeams()]);

      const previewErrors = response.errors
        .slice(0, 3)
        .map((item) => `fila ${item.row}: ${item.message}`)
        .join(' | ');

      let message =
        `Importación lista: ${response.summary.createdMatches} partidos nuevos, ` +
        `${response.summary.updatedMatches} actualizados, ` +
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

  const filteredFlags = useMemo(() => {
    const query = normalizeSearchText(flagSearch);
    if (!query) return flagCatalog;
    return flagCatalog.filter((item) => normalizeSearchText(`${item.name} ${item.spanishName}`).includes(query));
  }, [flagSearch]);

  const now = Date.now();
  const openMatches = matches.filter((m) => new Date(m.lockAt).getTime() > now);
  const closedMatches = matches.filter((m) => new Date(m.lockAt).getTime() <= now);
  const openMatchesWithoutPrediction = openMatches.filter((m) => {
    const savedHome = (savedPredHome[m.id] ?? '').trim();
    const savedAway = (savedPredAway[m.id] ?? '').trim();
    return savedHome === '' || savedAway === '';
  });
  const openMatchesWithPrediction = openMatches.filter((m) => {
    const savedHome = (savedPredHome[m.id] ?? '').trim();
    const savedAway = (savedPredAway[m.id] ?? '').trim();
    return savedHome !== '' && savedAway !== '';
  });
  const visibleMatches =
    matchesTab === 'all'
      ? matches
      : matchesTab === 'without-prediction'
      ? openMatchesWithoutPrediction
      : matchesTab === 'predicted'
        ? openMatchesWithPrediction
        : closedMatches;
  const matchById = useMemo(() => new Map(matches.map((match) => [match.id, match])), [matches]);
  const msgIsSuccess =
    msg === 'Pronósticos guardados correctamente.'
    || msg?.startsWith('Se guardaron ')
    || msg === 'Resultado final guardado correctamente.';

  const pendingPredictionIds = useMemo(() => {
    return matches
      .filter((m) => {
        const currentHome = (predHome[m.id] ?? '').trim();
        const currentAway = (predAway[m.id] ?? '').trim();
        const savedHome = (savedPredHome[m.id] ?? '').trim();
        const savedAway = (savedPredAway[m.id] ?? '').trim();
        return currentHome !== savedHome || currentAway !== savedAway;
      })
      .map((m) => m.id);
  }, [matches, predHome, predAway, savedPredHome, savedPredAway]);

  const pendingPredictionSet = useMemo(() => new Set(pendingPredictionIds), [pendingPredictionIds]);

  function clearPredictionErrors(matchIds?: string[]) {
    if (!matchIds || matchIds.length === 0) {
      setPredictionSaveErrors({});
      return;
    }

    setPredictionSaveErrors((prev) => {
      const next = { ...prev };
      matchIds.forEach((id) => {
        delete next[id];
      });
      return next;
    });
  }

  function discardPendingPredictions() {
    setPredHome(savedPredHome);
    setPredAway(savedPredAway);
    clearPredictionErrors();
    setMsg('Cambios descartados.');
  }

  async function saveAllPendingPredictions() {
    if (savingPredictions) return;
    if (pendingPredictionIds.length === 0) return;

    setMsg(null);
    setSavingPredictions(true);

    const localFailed: Array<{ matchId: string; error: string; code: string }> = [];
    const payload: Array<{ matchId: string; predHome: number; predAway: number }> = [];

    for (const matchId of pendingPredictionIds) {
      const match = matchById.get(matchId);
      if (!match) {
        localFailed.push({ matchId, error: 'Partido no encontrado', code: 'MATCH_NOT_FOUND' });
        continue;
      }

      const locked = new Date(match.lockAt) <= new Date();
      if (locked) {
        localFailed.push({ matchId, error: 'El partido ya cerró', code: 'PREDICTION_LOCKED' });
        continue;
      }

      try {
        const predHomeValue = parseScoreInput(predHome[matchId] ?? '', 'Pronóstico local');
        const predAwayValue = parseScoreInput(predAway[matchId] ?? '', 'Pronóstico visitante');
        payload.push({
          matchId,
          predHome: predHomeValue,
          predAway: predAwayValue,
        });
      } catch (error: any) {
        localFailed.push({
          matchId,
          error: error?.message ?? 'Pronóstico inválido',
          code: 'INVALID_SCORE',
        });
      }
    }

    setSavingPredictionIds(payload.reduce<Record<string, true>>((acc, item) => {
      acc[item.matchId] = true;
      return acc;
    }, {}));

    let backendSaved: BulkPredictionResponse['saved'] = [];
    let backendFailed: BulkPredictionResponse['failed'] = [];

    try {
      if (payload.length > 0) {
        const response = await apiFetch<BulkPredictionResponse>(`/leagues/${leagueId}/predictions/bulk`, {
          method: 'POST',
          body: JSON.stringify({ predictions: payload }),
        });
        backendSaved = response.saved;
        backendFailed = response.failed;
      }

      if (backendSaved.length > 0) {
        const savedMap = new Map(backendSaved.map((item) => [item.matchId, item]));

        setSavedPredHome((prev) => {
          const next = { ...prev };
          backendSaved.forEach((item) => {
            next[item.matchId] = String(item.predHome);
          });
          return next;
        });

        setSavedPredAway((prev) => {
          const next = { ...prev };
          backendSaved.forEach((item) => {
            next[item.matchId] = String(item.predAway);
          });
          return next;
        });

        setMatches((prev) => prev.map((match) => {
          const saved = savedMap.get(match.id);
          if (!saved) return match;
          return {
            ...match,
            myPrediction: {
              predHome: saved.predHome,
              predAway: saved.predAway,
              points: saved.points,
            },
          };
        }));
      }

      const allFailed = [...localFailed, ...backendFailed];
      const nextErrors = allFailed.reduce<PredictionSaveErrorMap>((acc, item) => {
        if (item.code === 'PREDICTION_LOCKED') {
          acc[item.matchId] = 'No se guardó: partido cerrado';
        } else {
          acc[item.matchId] = item.error;
        }
        return acc;
      }, {});
      setPredictionSaveErrors(nextErrors);

      const savedCount = backendSaved.length;
      const failedCount = allFailed.length;
      const closedCount = allFailed.filter((item) => item.code === 'PREDICTION_LOCKED').length;

      if (savedCount > 0 && failedCount === 0) {
        setMsg('Pronósticos guardados correctamente.');
      } else if (savedCount > 0) {
        if (closedCount > 0) {
          setMsg(`Se guardaron ${savedCount} pronósticos. ${failedCount} no se pudieron guardar porque algunos partidos ya cerraron o tienen errores.`);
        } else {
          setMsg(`Se guardaron ${savedCount} pronósticos. ${failedCount} no se pudieron guardar.`);
        }
      } else if (failedCount > 0) {
        if (closedCount > 0) {
          setMsg('No se pudieron guardar los pronósticos pendientes porque algunos partidos ya cerraron o tienen datos inválidos.');
        } else {
          setMsg('No se pudieron guardar los pronósticos pendientes. Revisa los errores marcados.');
        }
      }
    } catch (error: any) {
      setMsg(error?.message ?? 'No se pudieron guardar los pronósticos');
    } finally {
      setSavingPredictionIds({});
      setSavingPredictions(false);
    }
  }

  useEffect(() => {
    if (pendingPredictionIds.length === 0) return;

    const warningMessage = 'Tienes pronósticos sin guardar. ¿Seguro que quieres salir?';

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warningMessage;
      return warningMessage;
    };

    const handleLinkNavigation = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === '_blank') return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      const nextUrl = new URL(anchor.href, window.location.href);
      const sameDocument = nextUrl.href === window.location.href;
      if (sameDocument) return;

      const shouldLeave = window.confirm(warningMessage);
      if (!shouldLeave) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleLinkNavigation, true);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleLinkNavigation, true);
    };
  }, [pendingPredictionIds.length]);

  useEffect(() => {
    if (!me) return;
    load().catch((e) => setMsg(e.message));
  }, [leagueId, me?.id]);

  useEffect(() => {
    if (!me) return;
    if (!canManage) return;
    Promise.all([loadLeagueTeams(), loadTeamImages()]).catch((e: any) => {
      setMsg(e?.message ?? 'No se pudieron cargar equipos o imágenes');
    });
  }, [canManage, leagueId, me?.id]);

  if (loading) {
    return (
      <>
        <Nav />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Quiniela</h2>
          <p className="small">Cargando...</p>
        </div>
      </>
    );
  }

  if (!me) {
    return (
      <>
        <Nav />
        <div className="card" style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2 style={{ marginTop: 0 }}>Inicia sesión para ver esta quiniela</h2>
          <p className="small">El calendario es público, pero las quinielas son solo para usuarios registrados.</p>
          <div className="row-actions" style={{ marginTop: 12 }}>
            <Link className="btn primary" href="/login">Entrar</Link>
            <Link className="btn" href="/register">Crear cuenta</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />
      <div className="card">
        <section className="qb-hero">
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 6 }}>{league?.name || 'Quiniela'}</h2>
            {league?.description && <div className="small">{league.description}</div>}
            <div className="small">Código para entrar: <b>{league?.joinCode}</b></div>
          </div>
          <div className="row-actions">
            <Link className="btn" href={`/leagues/${leagueId}/leaderboard`}>Ver ranking</Link>
            <Link className="btn" href="/leagues">Volver</Link>
          </div>
        </section>

        {msg && <div className={`qb-alert ${msgIsSuccess ? 'qb-alert-success' : ''}`}>{msg}</div>}

        {canManage && me?.role === 'SUPERADMIN' && (
          <section className="card qb-admin-panel">
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Gestión centralizada</h3>
            <p className="small" style={{ marginTop: 0 }}>
              Para evitar duplicidad, la gestión de equipos, partidos y usuarios se unificó en el panel Admin global.
            </p>
            <div className="row-actions" style={{ marginTop: 10 }}>
              <Link className="btn primary" href="/admin">Abrir Admin global</Link>
            </div>
          </section>
        )}

        {canManage && me?.role !== 'SUPERADMIN' && (
          <details className="card qb-admin-panel">
            <summary>Panel admin: equipos y partidos</summary>

            <div className="card" style={{ marginTop: 10, padding: 12 }}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>1) Agregar equipos</h3>
              <p className="small" style={{ marginTop: 0 }}>Primero crea los equipos de esta quiniela y asígnales bandera/logo.</p>

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
                  <div className="small" style={{ marginBottom: 8 }}>Banderas/logos guardados</div>
                  <div className="image-library">
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
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <div className="small" style={{ marginBottom: 8 }}>Banderas por país (buscable)</div>
                <input
                  className="input"
                  placeholder="Buscar país, ej: Argentina o Alemania"
                  value={flagSearch}
                  onChange={(e) => setFlagSearch(e.target.value)}
                />
                <div className="image-library" style={{ marginTop: 8 }}>
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
              </div>

              <div style={{ marginTop: 12 }} className="row-actions">
                <button
                  className="btn primary"
                  onClick={async () => {
                    setMsg(null);
                    try {
                      if (!teamName.trim()) throw new Error('Nombre de equipo obligatorio');
                      if (!teamLogoUrl.trim()) throw new Error('Debes seleccionar una bandera/logo');

                      await apiFetch(`/leagues/${leagueId}/teams`, {
                        method: 'POST',
                        body: JSON.stringify({
                          name: teamName,
                          logoUrl: teamLogoUrl,
                        }),
                      });

                      setTeamName('');
                      setTeamLogoUrl('');
                      await Promise.all([loadLeagueTeams(), loadTeamImages()]);
                      setMsg('Equipo agregado a la quiniela.');
                    } catch (e: any) {
                      setMsg(e.message);
                    }
                  }}
                >
                  Agregar equipo
                </button>
              </div>
            </div>

            <div className="card" style={{ marginTop: 10, padding: 12 }}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Lista de equipos de esta quiniela</h3>
              {!leagueTeams.length ? (
                <p className="small" style={{ margin: 0 }}>Todavía no hay equipos. Agrega al menos 2 para crear partidos.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Equipo</th><th>Bandera/logo</th></tr>
                  </thead>
                  <tbody>
                    {leagueTeams.map((team) => (
                      <tr key={team.id}>
                        <td>{toSpanishTeamName(team.name)}</td>
                        <td>{team.logoUrl ? <img src={team.logoUrl} alt={toSpanishTeamName(team.name)} className="team-logo-thumb" /> : <span className="small">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card" style={{ marginTop: 10, padding: 12 }}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>2) Crear partido</h3>
              <p className="small" style={{ marginTop: 0 }}>Selecciona equipo 1 y equipo 2 de la lista que acabas de guardar.</p>

              <div className="grid cols2">
                <div>
                  <div className="label">Equipo local</div>
                  <select className="input" value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}>
                    <option value="">Selecciona equipo</option>
                    {leagueTeams.map((team) => <option key={team.id} value={team.id}>{toSpanishTeamName(team.name)}</option>)}
                  </select>
                </div>
                <div>
                  <div className="label">Equipo visitante</div>
                  <select className="input" value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
                    <option value="">Selecciona equipo</option>
                    {leagueTeams.map((team) => <option key={team.id} value={team.id}>{toSpanishTeamName(team.name)}</option>)}
                  </select>
                </div>
                <div>
                  <div className="label">Fecha y kickoff</div>
                  <input className="input" type="datetime-local" value={kickoffAt} onChange={(e) => setKickoffAt(e.target.value)} />
                </div>
              </div>

              <div style={{ marginTop: 12 }} className="row-actions">
                <button
                  className="btn primary"
                  onClick={async () => {
                    setMsg(null);
                    try {
                      if (!homeTeamId || !awayTeamId || !kickoffAt) throw new Error('Completa el partido');
                      if (homeTeamId === awayTeamId) throw new Error('Los equipos deben ser distintos');

                      const home = leagueTeams.find((team) => team.id === homeTeamId);
                      const away = leagueTeams.find((team) => team.id === awayTeamId);
                      if (!home || !away) throw new Error('Selecciona equipos válidos');

                      await apiFetch(`/leagues/${leagueId}/matches`, {
                        method: 'POST',
                        body: JSON.stringify({
                          homeTeam: home.name,
                          awayTeam: away.name,
                          kickoffAt: new Date(kickoffAt).toISOString(),
                        }),
                      });

                      setHomeTeamId('');
                      setAwayTeamId('');
                      setKickoffAt('');
                      await load();
                      setMsg('Partido agregado.');
                    } catch (e: any) {
                      setMsg(e.message);
                    }
                  }}
                >
                  Agregar partido
                </button>
              </div>
            </div>

            <div className="card" style={{ marginTop: 10, padding: 12 }}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>3) Importar partidos por CSV</h3>
              <p className="small" style={{ marginTop: 0 }}>
                Puedes cargar muchos partidos de una vez con columnas <b>homeTeam, awayTeam, kickoffAt</b>.
                Opcionalmente puedes incluir <b>lockAt, homeLogoUrl, awayLogoUrl</b>.
                La quiniela muestra horarios en hora de Costa Rica.
              </p>

              <p className="small" style={{ marginTop: 0 }}>
                Recomendado: usar fechas con zona, por ejemplo <b>2026-06-11T10:00:00-06:00</b>.
                Si no envías zona horaria, se asumirá hora de Costa Rica.
              </p>

              <div className="row-actions" style={{ marginBottom: 8 }}>
                <a className="btn" href="/templates/quiniela_mundial_2026_grupos.csv" download>
                  Descargar CSV base fase de grupos
                </a>
              </div>

              <div className="label">Archivo CSV</div>
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

              <div className="label">Contenido CSV (editable)</div>
              <textarea
                className="input"
                style={{ minHeight: 200, fontFamily: 'monospace' }}
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder={'homeTeam,awayTeam,kickoffAt\nMexico,South Africa,2026-06-11T10:00:00-06:00'}
              />

              <div className="row-actions" style={{ marginTop: 12 }}>
                <button className="btn primary" disabled={importingCsv} onClick={importMatchesFromCsv}>
                  {importingCsv ? 'Importando...' : 'Importar CSV a esta quiniela'}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setCsvContent('');
                    setCsvFileName('');
                  }}
                >
                  Limpiar
                </button>
              </div>
            </div>
          </details>
        )}

        <section className="card qb-matches-panel">
          <div className="row-actions" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>Mis partidos</h3>
            <div className="row-actions">
              <button className={`btn ${matchesTab === 'all' ? 'primary' : ''}`} onClick={() => setMatchesTab('all')}>
                Todos ({matches.length})
              </button>
              <button className={`btn ${matchesTab === 'without-prediction' ? 'primary' : ''}`} onClick={() => setMatchesTab('without-prediction')}>
                Sin pronosticar ({openMatchesWithoutPrediction.length})
              </button>
              <button className={`btn ${matchesTab === 'predicted' ? 'primary' : ''}`} onClick={() => setMatchesTab('predicted')}>
                Pronosticados ({openMatchesWithPrediction.length})
              </button>
              <button className={`btn ${matchesTab === 'closed' ? 'primary' : ''}`} onClick={() => setMatchesTab('closed')}>
                Cerrados ({closedMatches.length})
              </button>
            </div>
          </div>
          <p className="small">
            Los pronósticos se cierran al iniciar cada partido. Revisa la <span className="qb-closed-tab-highlight">Pestaña Cerrados</span> para ver resultados.
          </p>

          {matches.length === 0 ? (
            <p className="small">Esta quiniela todavía no tiene partidos.</p>
          ) : visibleMatches.length === 0 ? (
            <p className="small">
              {matchesTab === 'all'
                ? 'No hay partidos abiertos para pronosticar en este momento.'
                : matchesTab === 'without-prediction'
                ? 'No hay partidos abiertos sin pronosticar en este momento.'
                : matchesTab === 'predicted'
                  ? 'Todavía no tienes partidos abiertos pronosticados.'
                  : 'Todavía no hay partidos cerrados.'}
            </p>
          ) : (
            <div className="qb-match-list">
              {visibleMatches.map((m) => {
                const locked = new Date(m.lockAt) <= new Date();

                const currentPredHome = (predHome[m.id] ?? '').trim();
                const currentPredAway = (predAway[m.id] ?? '').trim();
                const savedPredHomeValue = (savedPredHome[m.id] ?? '').trim();
                const savedPredAwayValue = (savedPredAway[m.id] ?? '').trim();
                const predictionSaved =
                  savedPredHomeValue !== ''
                  && savedPredAwayValue !== ''
                  && currentPredHome === savedPredHomeValue
                  && currentPredAway === savedPredAwayValue;
                const predictionDirty = pendingPredictionSet.has(m.id);
                const hasSavedPrediction = savedPredHomeValue !== '' && savedPredAwayValue !== '';
                const predictionStatusLabel = locked
                  ? 'Cerrado'
                  : predictionDirty
                    ? 'Pendiente de guardar'
                    : hasSavedPrediction
                      ? 'Guardado'
                      : 'Sin pronóstico';
                const predictionStatusClass = locked
                  ? 'closed'
                  : predictionDirty
                    ? 'pending'
                    : hasSavedPrediction
                      ? 'saved'
                      : 'empty';
                const predictionError = predictionSaveErrors[m.id];

                const currentResultHome = (resultHome[m.id] ?? '').trim();
                const currentResultAway = (resultAway[m.id] ?? '').trim();
                const savedResultHome = m.finalHome === null ? '' : String(m.finalHome);
                const savedResultAway = m.finalAway === null ? '' : String(m.finalAway);
                const resultSaved = m.finalHome !== null && m.finalAway !== null && currentResultHome === savedResultHome && currentResultAway === savedResultAway;
                const resultDirty = currentResultHome !== savedResultHome || currentResultAway !== savedResultAway;

                return (
                  <article key={m.id} className="qb-match-row">
                    <div className="qb-teams">
                      <div className="qb-team">
                        {m.homeTeam.logoUrl ? (
                          <img
                            src={m.homeTeam.logoUrl}
                            alt={toSpanishTeamName(m.homeTeam.name)}
                            className="team-logo-thumb"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                        <span className="qb-team-name">{toSpanishTeamName(m.homeTeam.name)}</span>
                      </div>
                      <span className="qb-vs">vs</span>
                      <div className="qb-team">
                        {m.awayTeam.logoUrl ? (
                          <img
                            src={m.awayTeam.logoUrl}
                            alt={toSpanishTeamName(m.awayTeam.name)}
                            className="team-logo-thumb"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                        <span className="qb-team-name">{toSpanishTeamName(m.awayTeam.name)}</span>
                      </div>
                    </div>

                    <div className="qb-meta">
                      <div><span className="small">Fecha y hora</span><b>{dateLabel(m.kickoffAt)} {timeLabel(m.kickoffAt)}</b></div>
                    </div>

                    <div className="qb-block">
                      <div className="qb-block-head">
                        <div className="small">Pronóstico</div>
                        <span className={`qb-badge ${predictionStatusClass}`}>{predictionStatusLabel}</span>
                      </div>
                      <div className="row-actions qb-prediction-inputs">
                        <input
                          className={`input ${predictionSaved ? 'input-saved' : ''} ${predictionDirty ? 'input-dirty' : ''}`}
                          style={{ width: 72 }}
                          disabled={locked || savingPredictions || !!savingPredictionIds[m.id]}
                          value={predHome[m.id] ?? ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPredHome((s) => ({ ...s, [m.id]: value }));
                            clearPredictionErrors([m.id]);
                          }}
                        />
                        <input
                          className={`input ${predictionSaved ? 'input-saved' : ''} ${predictionDirty ? 'input-dirty' : ''}`}
                          style={{ width: 72 }}
                          disabled={locked || savingPredictions || !!savingPredictionIds[m.id]}
                          value={predAway[m.id] ?? ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPredAway((s) => ({ ...s, [m.id]: value }));
                            clearPredictionErrors([m.id]);
                          }}
                        />
                      </div>
                      {predictionError && <div className="small qb-inline-error">{predictionError}</div>}
                    </div>

                    <div className="qb-block">
                      <div className="small">Resultado final</div>
                      {canManage ? (
                        <div className="qb-result-editor">
                          <div className="row-actions">
                            <input
                              className={`input ${resultSaved ? 'input-saved' : ''} ${resultDirty ? 'input-dirty' : ''}`}
                              style={{ width: 72 }}
                              value={resultHome[m.id] ?? ''}
                              onChange={(e) => setResultHome((s) => ({ ...s, [m.id]: e.target.value }))}
                            />
                            <input
                              className={`input ${resultSaved ? 'input-saved' : ''} ${resultDirty ? 'input-dirty' : ''}`}
                              style={{ width: 72 }}
                              value={resultAway[m.id] ?? ''}
                              onChange={(e) => setResultAway((s) => ({ ...s, [m.id]: e.target.value }))}
                            />
                          </div>
                          <div className="row-actions qb-save-row" style={{ marginTop: 8 }}>
                            <button
                              className="btn green"
                              onClick={async () => {
                                setMsg(null);
                                try {
                                  const fh = parseScoreInput(resultHome[m.id] ?? '', 'Resultado local');
                                  const fa = parseScoreInput(resultAway[m.id] ?? '', 'Resultado visitante');
                                  await apiFetch(`/leagues/${leagueId}/matches/${m.id}/result`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ finalHome: fh, finalAway: fa }),
                                  });
                                  await load();
                                  setMsg('Resultado final guardado correctamente.');
                                } catch (e: any) {
                                  setMsg(e.message);
                                }
                              }}
                            >
                              Guardar resultado
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="qb-result-pill">{m.finalHome === null ? '-' : `${m.finalHome} - ${m.finalAway}`}</div>
                      )}
                    </div>

                    <div className="qb-side">
                      <div className="small">Puntos</div>
                      <b>{m.myPrediction?.points ?? '-'}</b>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {pendingPredictionIds.length > 0 && (
            <div className="qb-pending-bar" role="status" aria-live="polite">
              <div className="qb-pending-copy">
                Tienes {pendingPredictionIds.length} pronóstico{pendingPredictionIds.length === 1 ? '' : 's'} pendiente{pendingPredictionIds.length === 1 ? '' : 's'} de guardar
              </div>
              <div className="qb-pending-actions">
                <button
                  className="btn pending-discard"
                  type="button"
                  disabled={savingPredictions}
                  onClick={discardPendingPredictions}
                >
                  Descartar cambios
                </button>
                <button
                  className="btn pending-save"
                  type="button"
                  disabled={savingPredictions}
                  onClick={saveAllPendingPredictions}
                >
                  {savingPredictions ? 'Guardando...' : 'Guardar todos'}
                </button>
              </div>
            </div>
          )}

          {pendingPredictionIds.length > 0 && <div className="qb-pending-spacer" aria-hidden="true" />}

          <p className="small">Los puntos aparecen cuando el dueño de la quiniela carga resultados finales.</p>
        </section>
      </div>
    </>
  );
}
