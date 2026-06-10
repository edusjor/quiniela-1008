'use client';

import { useEffect, useState } from 'react';
import Nav from '../../components/Nav';
import Link from 'next/link';
import { useMe } from '../../lib/hooks';

export default function GlobalLeaderboardInfo() {
  const [msg, setMsg] = useState<string | null>(null);
  const { me, loading } = useMe();

  useEffect(() => {
    setMsg('El ranking es por quiniela. Entra a una quiniela y abre su ranking.');
  }, []);

  if (loading) {
    return (
      <>
        <Nav />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Ranking</h2>
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
          <h2 style={{ marginTop: 0 }}>Inicia sesión para ver rankings</h2>
          <p className="small">Las quinielas y sus rankings son solo para usuarios registrados.</p>
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
        <h2 style={{marginTop:0}}>Ranking</h2>
        <div className="card">
          <p className="small">{msg}</p>
          <p className="small">Ir a: <b>Mis quinielas → Abrir → Ver ranking</b></p>
        </div>
      </div>
    </>
  );
}
