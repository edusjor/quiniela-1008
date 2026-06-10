'use client';

import { useEffect, useState } from 'react';
import Nav from '../../../../components/Nav';
import { apiFetch } from '../../../../lib/api';
import Link from 'next/link';
import { useMe } from '../../../../lib/hooks';

export default function LeaderboardPage({ params }: { params: { id: string } }) {
  const leagueId = params.id;
  const [rows, setRows] = useState<{ userId: string; username: string; totalPoints: number }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const { me, loading } = useMe();
  const isSuperadmin = me?.role === 'SUPERADMIN';

  useEffect(() => {
    if (!me) return;
    apiFetch<{leaderboard:any[]}>(`/leagues/${leagueId}/leaderboard`)
      .then(r => setRows(r.leaderboard))
      .catch(e => setMsg(e.message));
  }, [leagueId, me?.id]);

  if (loading) {
    return (
      <>
        <Nav />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Ranking de la quiniela</h2>
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
          <h2 style={{ marginTop: 0 }}>Inicia sesión para ver el ranking</h2>
          <p className="small">La información de quinielas solo se muestra a usuarios con cuenta.</p>
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
        <div className="row-actions" style={{justifyContent:'space-between'}}>
          <h2 style={{margin:0}}>Ranking de la quiniela</h2>
          <Link className="btn" href={`/leagues/${leagueId}`}>Volver</Link>
        </div>
        {msg && <div className="card">{msg}</div>}
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Usuario</th>
                <th>Puntos</th>
                {isSuperadmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.userId}>
                  <td>{idx+1}</td>
                  <td>{r.username}</td>
                  <td><b>{r.totalPoints}</b></td>
                  {isSuperadmin && (
                    <td>
                      <Link className="btn" href={`/admin/users/${r.userId}`}>Ver usuario</Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
