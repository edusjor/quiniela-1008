"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Nav from '../../components/Nav';
import { flagCodeByTeam, toSpanishTeamName } from '../../lib/teamNames';

type Group = {
  id: string;
  teams: [string, string, string, string];
};

type Fixture = {
  date: string;
  home: string;
  away: string;
  stadium: string;
  city: string;
};

type CalendarView = 'day' | 'group';

type FixtureWithMeta = Fixture & {
  groupId: string;
  kickoffEt: string;
  kickoffCrDayKey: string;
  kickoffCrDayLabel: string;
  kickoffCrShortDateLabel: string;
  kickoffCrTimeLabel: string;
  kickoffUtcTimestamp: number;
};

type DayBucket = {
  dayKey: string;
  dayLabel: string;
  fixtures: FixtureWithMeta[];
  firstKickoffTimestamp: number;
};

const COSTA_RICA_TIMEZONE = 'America/Costa_Rica';
const FIFA_EASTERN_TO_UTC_OFFSET_HOURS = 4;
const MONTH_INDEX: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

const kickoffEasternByGroup: Record<string, string[]> = {
  A: ['15:00', '22:00', '12:00', '21:00', '21:00', '21:00'],
  B: ['15:00', '15:00', '15:00', '18:00', '15:00', '15:00'],
  C: ['18:00', '21:00', '18:00', '21:00', '18:00', '18:00'],
  D: ['21:00', '00:00', '15:00', '00:00', '22:00', '22:00'],
  E: ['13:00', '19:00', '16:00', '22:00', '16:00', '16:00'],
  F: ['16:00', '22:00', '13:00', '00:00', '19:00', '19:00'],
  G: ['15:00', '21:00', '15:00', '21:00', '23:00', '23:00'],
  H: ['12:00', '18:00', '12:00', '18:00', '20:00', '20:00'],
  I: ['15:00', '18:00', '17:00', '20:00', '15:00', '15:00'],
  J: ['21:00', '00:00', '13:00', '23:00', '22:00', '22:00'],
  K: ['13:00', '22:00', '13:00', '22:00', '19:30', '19:30'],
  L: ['16:00', '19:00', '16:00', '19:00', '17:00', '17:00'],
};

function toCostaRicaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: COSTA_RICA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('No se pudo formatear fecha de Costa Rica');
  }

  return `${year}-${month}-${day}`;
}

function capitalizeText(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toCostaRicaKickoff(dateEt: string, timeEt: string) {
  const [dayRaw, monthRaw, yearRaw] = dateEt.trim().split(/\s+/);
  const [hourRaw, minuteRaw] = timeEt.trim().split(':');

  const day = Number(dayRaw);
  const year = Number(yearRaw);
  const month = MONTH_INDEX[monthRaw];
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (!Number.isInteger(day) || !Number.isInteger(year) || month === undefined || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error(`Formato inválido de fecha/hora FIFA: ${dateEt} ${timeEt}`);
  }

  // FIFA publica estos horarios en hora del Este (UTC-4 en junio).
  const kickoffUtc = new Date(Date.UTC(year, month, day, hour + FIFA_EASTERN_TO_UTC_OFFSET_HOURS, minute));

  return {
    dayKey: toCostaRicaDateKey(kickoffUtc),
    dayLabel: capitalizeText(kickoffUtc.toLocaleDateString('es-CR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: COSTA_RICA_TIMEZONE,
    })),
    shortDateLabel: kickoffUtc.toLocaleDateString('es-CR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: COSTA_RICA_TIMEZONE,
    }),
    timeLabel: kickoffUtc.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: COSTA_RICA_TIMEZONE,
    }),
    utcTimestamp: kickoffUtc.getTime(),
  };
}

function TeamName({ team }: { team: string }) {
  const code = flagCodeByTeam[team];
  const src = code ? `https://flagcdn.com/w40/${code}.png` : '';

  return (
    <span className="wc-team-chip">
      <span className="wc-flag" aria-hidden="true">
        {src ? <img className="wc-flag-img" src={src} alt="" loading="lazy" /> : <span>?</span>}
      </span>
      <span>{toSpanishTeamName(team)}</span>
    </span>
  );
}

const groups: Group[] = [
  { id: 'A', teams: ['Mexico', 'South Africa', 'South Korea', 'Czech Republic'] },
  { id: 'B', teams: ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'] },
  { id: 'C', teams: ['Brazil', 'Morocco', 'Haiti', 'Scotland'] },
  { id: 'D', teams: ['United States', 'Paraguay', 'Australia', 'Turkey'] },
  { id: 'E', teams: ['Germany', 'Curacao', "Ivory Coast", 'Ecuador'] },
  { id: 'F', teams: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'] },
  { id: 'G', teams: ['Belgium', 'Egypt', 'Iran', 'New Zealand'] },
  { id: 'H', teams: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'] },
  { id: 'I', teams: ['France', 'Senegal', 'Iraq', 'Norway'] },
  { id: 'J', teams: ['Argentina', 'Algeria', 'Austria', 'Jordan'] },
  { id: 'K', teams: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'] },
  { id: 'L', teams: ['England', 'Croatia', 'Ghana', 'Panama'] },
];

const fixturesByGroup: Record<string, Fixture[]> = {
  A: [
    { date: '11 Jun 2026', home: 'Mexico', away: 'South Africa', stadium: 'Estadio Azteca', city: 'Mexico City' },
    { date: '11 Jun 2026', home: 'South Korea', away: 'Czech Republic', stadium: 'Estadio Akron', city: 'Zapopan' },
    { date: '18 Jun 2026', home: 'Czech Republic', away: 'South Africa', stadium: 'Mercedes-Benz Stadium', city: 'Atlanta' },
    { date: '18 Jun 2026', home: 'Mexico', away: 'South Korea', stadium: 'Estadio Akron', city: 'Zapopan' },
    { date: '24 Jun 2026', home: 'Czech Republic', away: 'Mexico', stadium: 'Estadio Azteca', city: 'Mexico City' },
    { date: '24 Jun 2026', home: 'South Africa', away: 'South Korea', stadium: 'Estadio BBVA', city: 'Guadalupe' },
  ],
  B: [
    { date: '12 Jun 2026', home: 'Canada', away: 'Bosnia and Herzegovina', stadium: 'BMO Field', city: 'Toronto' },
    { date: '13 Jun 2026', home: 'Qatar', away: 'Switzerland', stadium: "Levi's Stadium", city: 'Santa Clara' },
    { date: '18 Jun 2026', home: 'Switzerland', away: 'Bosnia and Herzegovina', stadium: 'SoFi Stadium', city: 'Inglewood' },
    { date: '18 Jun 2026', home: 'Canada', away: 'Qatar', stadium: 'BC Place', city: 'Vancouver' },
    { date: '24 Jun 2026', home: 'Switzerland', away: 'Canada', stadium: 'BC Place', city: 'Vancouver' },
    { date: '24 Jun 2026', home: 'Bosnia and Herzegovina', away: 'Qatar', stadium: 'Lumen Field', city: 'Seattle' },
  ],
  C: [
    { date: '13 Jun 2026', home: 'Brazil', away: 'Morocco', stadium: 'MetLife Stadium', city: 'East Rutherford' },
    { date: '13 Jun 2026', home: 'Haiti', away: 'Scotland', stadium: 'Gillette Stadium', city: 'Foxborough' },
    { date: '19 Jun 2026', home: 'Scotland', away: 'Morocco', stadium: 'Gillette Stadium', city: 'Foxborough' },
    { date: '19 Jun 2026', home: 'Brazil', away: 'Haiti', stadium: 'Lincoln Financial Field', city: 'Philadelphia' },
    { date: '24 Jun 2026', home: 'Scotland', away: 'Brazil', stadium: 'Hard Rock Stadium', city: 'Miami Gardens' },
    { date: '24 Jun 2026', home: 'Morocco', away: 'Haiti', stadium: 'Mercedes-Benz Stadium', city: 'Atlanta' },
  ],
  D: [
    { date: '12 Jun 2026', home: 'United States', away: 'Paraguay', stadium: 'SoFi Stadium', city: 'Inglewood' },
    { date: '13 Jun 2026', home: 'Australia', away: 'Turkey', stadium: 'BC Place', city: 'Vancouver' },
    { date: '19 Jun 2026', home: 'United States', away: 'Australia', stadium: 'Lumen Field', city: 'Seattle' },
    { date: '19 Jun 2026', home: 'Turkey', away: 'Paraguay', stadium: "Levi's Stadium", city: 'Santa Clara' },
    { date: '25 Jun 2026', home: 'Turkey', away: 'United States', stadium: 'SoFi Stadium', city: 'Inglewood' },
    { date: '25 Jun 2026', home: 'Paraguay', away: 'Australia', stadium: "Levi's Stadium", city: 'Santa Clara' },
  ],
  E: [
    { date: '14 Jun 2026', home: 'Germany', away: 'Curacao', stadium: 'NRG Stadium', city: 'Houston' },
    { date: '14 Jun 2026', home: 'Ivory Coast', away: 'Ecuador', stadium: 'Lincoln Financial Field', city: 'Philadelphia' },
    { date: '20 Jun 2026', home: 'Germany', away: 'Ivory Coast', stadium: 'BMO Field', city: 'Toronto' },
    { date: '20 Jun 2026', home: 'Ecuador', away: 'Curacao', stadium: 'Arrowhead Stadium', city: 'Kansas City' },
    { date: '25 Jun 2026', home: 'Curacao', away: 'Ivory Coast', stadium: 'Lincoln Financial Field', city: 'Philadelphia' },
    { date: '25 Jun 2026', home: 'Ecuador', away: 'Germany', stadium: 'MetLife Stadium', city: 'East Rutherford' },
  ],
  F: [
    { date: '14 Jun 2026', home: 'Netherlands', away: 'Japan', stadium: 'AT&T Stadium', city: 'Arlington' },
    { date: '14 Jun 2026', home: 'Sweden', away: 'Tunisia', stadium: 'Estadio BBVA', city: 'Guadalupe' },
    { date: '20 Jun 2026', home: 'Netherlands', away: 'Sweden', stadium: 'NRG Stadium', city: 'Houston' },
    { date: '20 Jun 2026', home: 'Tunisia', away: 'Japan', stadium: 'Estadio BBVA', city: 'Guadalupe' },
    { date: '25 Jun 2026', home: 'Japan', away: 'Sweden', stadium: 'AT&T Stadium', city: 'Arlington' },
    { date: '25 Jun 2026', home: 'Tunisia', away: 'Netherlands', stadium: 'Arrowhead Stadium', city: 'Kansas City' },
  ],
  G: [
    { date: '15 Jun 2026', home: 'Belgium', away: 'Egypt', stadium: 'Lumen Field', city: 'Seattle' },
    { date: '15 Jun 2026', home: 'Iran', away: 'New Zealand', stadium: 'SoFi Stadium', city: 'Inglewood' },
    { date: '21 Jun 2026', home: 'Belgium', away: 'Iran', stadium: 'SoFi Stadium', city: 'Inglewood' },
    { date: '21 Jun 2026', home: 'New Zealand', away: 'Egypt', stadium: 'BC Place', city: 'Vancouver' },
    { date: '26 Jun 2026', home: 'Egypt', away: 'Iran', stadium: 'Lumen Field', city: 'Seattle' },
    { date: '26 Jun 2026', home: 'New Zealand', away: 'Belgium', stadium: 'BC Place', city: 'Vancouver' },
  ],
  H: [
    { date: '15 Jun 2026', home: 'Spain', away: 'Cape Verde', stadium: 'Mercedes-Benz Stadium', city: 'Atlanta' },
    { date: '15 Jun 2026', home: 'Saudi Arabia', away: 'Uruguay', stadium: 'Hard Rock Stadium', city: 'Miami Gardens' },
    { date: '21 Jun 2026', home: 'Spain', away: 'Saudi Arabia', stadium: 'Mercedes-Benz Stadium', city: 'Atlanta' },
    { date: '21 Jun 2026', home: 'Uruguay', away: 'Cape Verde', stadium: 'Hard Rock Stadium', city: 'Miami Gardens' },
    { date: '26 Jun 2026', home: 'Cape Verde', away: 'Saudi Arabia', stadium: 'NRG Stadium', city: 'Houston' },
    { date: '26 Jun 2026', home: 'Uruguay', away: 'Spain', stadium: 'Estadio Akron', city: 'Zapopan' },
  ],
  I: [
    { date: '16 Jun 2026', home: 'France', away: 'Senegal', stadium: 'MetLife Stadium', city: 'East Rutherford' },
    { date: '16 Jun 2026', home: 'Iraq', away: 'Norway', stadium: 'Gillette Stadium', city: 'Foxborough' },
    { date: '22 Jun 2026', home: 'France', away: 'Iraq', stadium: 'Lincoln Financial Field', city: 'Philadelphia' },
    { date: '22 Jun 2026', home: 'Norway', away: 'Senegal', stadium: 'MetLife Stadium', city: 'East Rutherford' },
    { date: '26 Jun 2026', home: 'Norway', away: 'France', stadium: 'Gillette Stadium', city: 'Foxborough' },
    { date: '26 Jun 2026', home: 'Senegal', away: 'Iraq', stadium: 'BMO Field', city: 'Toronto' },
  ],
  J: [
    { date: '16 Jun 2026', home: 'Argentina', away: 'Algeria', stadium: 'Arrowhead Stadium', city: 'Kansas City' },
    { date: '16 Jun 2026', home: 'Austria', away: 'Jordan', stadium: "Levi's Stadium", city: 'Santa Clara' },
    { date: '22 Jun 2026', home: 'Argentina', away: 'Austria', stadium: 'AT&T Stadium', city: 'Arlington' },
    { date: '22 Jun 2026', home: 'Jordan', away: 'Algeria', stadium: "Levi's Stadium", city: 'Santa Clara' },
    { date: '27 Jun 2026', home: 'Algeria', away: 'Austria', stadium: 'Arrowhead Stadium', city: 'Kansas City' },
    { date: '27 Jun 2026', home: 'Jordan', away: 'Argentina', stadium: 'AT&T Stadium', city: 'Arlington' },
  ],
  K: [
    { date: '17 Jun 2026', home: 'Portugal', away: 'DR Congo', stadium: 'NRG Stadium', city: 'Houston' },
    { date: '17 Jun 2026', home: 'Uzbekistan', away: 'Colombia', stadium: 'Estadio Azteca', city: 'Mexico City' },
    { date: '23 Jun 2026', home: 'Portugal', away: 'Uzbekistan', stadium: 'NRG Stadium', city: 'Houston' },
    { date: '23 Jun 2026', home: 'Colombia', away: 'DR Congo', stadium: 'Estadio Akron', city: 'Zapopan' },
    { date: '27 Jun 2026', home: 'Colombia', away: 'Portugal', stadium: 'Hard Rock Stadium', city: 'Miami Gardens' },
    { date: '27 Jun 2026', home: 'DR Congo', away: 'Uzbekistan', stadium: 'Mercedes-Benz Stadium', city: 'Atlanta' },
  ],
  L: [
    { date: '17 Jun 2026', home: 'England', away: 'Croatia', stadium: 'AT&T Stadium', city: 'Arlington' },
    { date: '17 Jun 2026', home: 'Ghana', away: 'Panama', stadium: 'BMO Field', city: 'Toronto' },
    { date: '23 Jun 2026', home: 'England', away: 'Ghana', stadium: 'Gillette Stadium', city: 'Foxborough' },
    { date: '23 Jun 2026', home: 'Panama', away: 'Croatia', stadium: 'BMO Field', city: 'Toronto' },
    { date: '27 Jun 2026', home: 'Panama', away: 'England', stadium: 'MetLife Stadium', city: 'East Rutherford' },
    { date: '27 Jun 2026', home: 'Croatia', away: 'Ghana', stadium: 'Lincoln Financial Field', city: 'Philadelphia' },
  ],
};

export default function Mundial2026Page() {
  const [calendarView, setCalendarView] = useState<CalendarView>('day');

  const fixturesWithMeta = useMemo<FixtureWithMeta[]>(() => {
    return groups
      .flatMap((group) => {
        const fixtures = fixturesByGroup[group.id] || [];
        const kickoffEtList = kickoffEasternByGroup[group.id] || [];

        return fixtures.map((fixture, index) => {
          const kickoffEt = kickoffEtList[index] || '15:00';
          const kickoffCr = toCostaRicaKickoff(fixture.date, kickoffEt);

          return {
            ...fixture,
            groupId: group.id,
            kickoffEt,
            kickoffCrDayKey: kickoffCr.dayKey,
            kickoffCrDayLabel: kickoffCr.dayLabel,
            kickoffCrShortDateLabel: kickoffCr.shortDateLabel,
            kickoffCrTimeLabel: kickoffCr.timeLabel,
            kickoffUtcTimestamp: kickoffCr.utcTimestamp,
          };
        });
      })
      .sort((a, b) => a.kickoffUtcTimestamp - b.kickoffUtcTimestamp);
  }, []);

  const fixturesByDay = useMemo<DayBucket[]>(() => {
    const buckets = new Map<string, DayBucket>();

    fixturesWithMeta.forEach((fixture) => {
      const existing = buckets.get(fixture.kickoffCrDayKey);
      if (!existing) {
        buckets.set(fixture.kickoffCrDayKey, {
          dayKey: fixture.kickoffCrDayKey,
          dayLabel: fixture.kickoffCrDayLabel,
          fixtures: [fixture],
          firstKickoffTimestamp: fixture.kickoffUtcTimestamp,
        });
        return;
      }

      existing.fixtures.push(fixture);
      if (fixture.kickoffUtcTimestamp < existing.firstKickoffTimestamp) {
        existing.firstKickoffTimestamp = fixture.kickoffUtcTimestamp;
      }
    });

    return Array.from(buckets.values())
      .map((bucket) => ({
        ...bucket,
        fixtures: bucket.fixtures.sort((a, b) => a.kickoffUtcTimestamp - b.kickoffUtcTimestamp),
      }))
      .sort((a, b) => a.firstKickoffTimestamp - b.firstKickoffTimestamp);
  }, [fixturesWithMeta]);

  return (
    <>
      <Nav />

      <section className="card wc-hero">
        <p className="wc-kicker">Público y compartible</p>
        <h1 style={{ marginTop: 8, marginBottom: 10 }}>Calendario Mundial FIFA 2026</h1>
        <p className="small" style={{ maxWidth: 880 }}>
          Incluye grupos oficiales A-L, selecciones participantes y calendario de fase de grupos para vivir el torneo como se debe.
        </p>
        <div className="wc-join-cta">
          <p className="small wc-join-copy">
            Sumate a la quiniela y participá por premios con tus pronósticos.
          </p>
          <div className="wc-join-actions">
            <Link className="btn primary wc-solid-cta" href="/register">Crear cuenta y participar</Link>
          </div>
        </div>
        <div className="wc-pill-row">
          <span className="wc-pill">Fase de grupos: 11 - 27 Jun</span>
          <span className="wc-pill">Dieciseisavos (32): 28 Jun - 3 Jul</span>
          <span className="wc-pill">Octavos: 4 - 7 Jul</span>
          <span className="wc-pill">Cuartos: 9 - 11 Jul</span>
          <span className="wc-pill">Semifinales: 14 - 15 Jul</span>
          <span className="wc-pill">Tercer puesto: 18 Jul</span>
          <span className="wc-pill">Final: 19 Jul (MetLife Stadium)</span>
        </div>
      </section>

      <section className="card">
        <div className="row-actions" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Grupos oficiales</h2>
          <span className="small">12 grupos de 4 equipos</span>
        </div>

        <div className="wc-groups-grid">
          {groups.map((group) => (
            <article key={group.id} className="wc-group-card">
              <div className="wc-group-head">
                <span className="wc-group-badge">Grupo {group.id}</span>
              </div>
              <ul className="wc-team-list">
                {group.teams.map((team) => (
                  <li key={`${group.id}-${team}`}>
                    <TeamName team={team} />
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="row-actions" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Calendario fase de grupos</h2>
          <div className="wc-calendar-switch">
            <button
              className={`btn ${calendarView === 'day' ? 'primary' : ''}`}
              type="button"
              onClick={() => setCalendarView('day')}
            >
              Por día
            </button>
            <button
              className={`btn ${calendarView === 'group' ? 'primary' : ''}`}
              type="button"
              onClick={() => setCalendarView('group')}
            >
              Por grupo
            </button>
          </div>
        </div>
        <p className="small wc-fixture-note">
          Horarios oficiales FIFA en hora del Este (ET) convertidos a hora de Costa Rica (UTC-6). Ejemplo: 3:00 PM ET = 1:00 PM CR.
        </p>

        {calendarView === 'day' ? (
          <div className="wc-day-groups">
            {fixturesByDay.map((bucket) => (
              <article key={`day-${bucket.dayKey}`} className="wc-fixture-group">
                <h3 style={{ marginTop: 0 }}>{bucket.dayLabel}</h3>
                <div className="wc-fixtures-list">
                  {bucket.fixtures.map((match, index) => (
                    <div key={`${bucket.dayKey}-${match.groupId}-${index}`} className="wc-fixture-item">
                      <div className="wc-fixture-date">{match.kickoffCrTimeLabel} CR · Grupo {match.groupId}</div>
                      <div className="wc-fixture-match">
                        <strong><TeamName team={match.home} /></strong>
                        <span className="small">vs</span>
                        <strong><TeamName team={match.away} /></strong>
                      </div>
                      <div className="small">{match.stadium} - {match.city}</div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="wc-fixtures-wrap">
            {groups.map((group) => (
              <article key={`fx-${group.id}`} className="wc-fixture-group">
                <h3 style={{ marginTop: 0 }}>Grupo {group.id}</h3>
                <div className="wc-fixtures-list">
                  {fixturesByGroup[group.id].map((match, index) => {
                    const kickoffEt = kickoffEasternByGroup[group.id]?.[index] || '15:00';
                    const kickoffCR = toCostaRicaKickoff(match.date, kickoffEt);

                    return (
                      <div key={`${group.id}-${index}`} className="wc-fixture-item">
                        <div className="wc-fixture-date">{kickoffCR.shortDateLabel} · {kickoffCR.timeLabel} CR</div>
                        <div className="wc-fixture-match">
                          <strong><TeamName team={match.home} /></strong>
                          <span className="small">vs</span>
                          <strong><TeamName team={match.away} /></strong>
                        </div>
                        <div className="small">{match.stadium} - {match.city}</div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ borderStyle: 'dashed' }}>
        <p className="small" style={{ margin: 0 }}>
          Fuente de datos: FIFA (equipos/grupos/fixtures) y consolidación de calendario oficial del torneo.
          Esta sección es pública para compartir por enlace directo.
        </p>
      </section>
    </>
  );
}
