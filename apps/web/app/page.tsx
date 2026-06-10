"use client";

import Link from 'next/link';
import Nav from '../components/Nav';
import { useMe } from '../lib/hooks';

export default function Page() {
  const { me, loading } = useMe();

  if (loading) {
    return (
      <>
        <Nav />
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Quiniela 1008</h1>
          <p className="small">Cargando...</p>
        </div>
      </>
    );
  }

  if (!me) {
    return (
      <>
        <Nav />
        <div className="card" style={{ maxWidth: 860, margin: '0 auto' }}>
          <h1 style={{ marginTop: 0 }}>Quiniela 1008</h1>
          <p className="small">
            Enfocada en dos cosas: calendario del Mundial 2026 (público) y quinielas (solo usuarios registrados).
          </p>
          <div className="grid cols2 module-grid">
            <div className="module-card">
              <h3>Mundial 2026</h3>
              <p className="small">Consulta grupos y calendario oficial sin necesidad de iniciar sesión.</p>
              <div className="row-actions" style={{ marginTop: 12 }}>
                <Link className="btn" href="/mundial-2026">Ver calendario</Link>
              </div>
            </div>
            <div className="module-card">
              <h3>Quinielas</h3>
              <p className="small">Regístrate para unirte a quinielas, cargar pronósticos y competir en ranking.</p>
              <div className="row-actions" style={{ marginTop: 12 }}>
                <Link className="btn primary" href="/register">Crear cuenta</Link>
              </div>
            </div>
            <div className="module-card">
              <h3>Premios</h3>
              <p className="small">Revisa los premios finales del ranking oficial de quiniela.</p>
              <div className="row-actions" style={{ marginTop: 12 }}>
                <Link className="btn" href="/premios">Ver premios</Link>
              </div>
            </div>
            <div className="module-card">
              <h3>Reglamento oficial</h3>
              <p className="small">Lee requisitos, puntajes, desempates y condiciones para participar.</p>
              <div className="row-actions" style={{ marginTop: 12 }}>
                <Link className="btn" href="/reglamento">Leer reglamento</Link>
              </div>
            </div>
          </div>
          <div className="landing-auth-cta">
            <p className="small landing-auth-copy">
              Para participar en quinielas, inicia sesión o crea tu cuenta.
            </p>
            <div className="landing-auth-actions">
              <Link className="btn primary" href="/login" style={{ textAlign: 'center', padding: '14px 18px' }}>
                Entrar
              </Link>
              <Link className="btn" href="/register" style={{ textAlign: 'center', padding: '14px 18px' }}>
                Crear cuenta
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Panel Principal</h1>
        <p className="small">
          Elige tu siguiente paso: unirte a quinielas, revisar calendario o consultar premios finales.
        </p>

        <div className="grid cols2 module-grid">
          <div className="module-card">
            <h3>Quiniela</h3>
            <p className="small">Mira quinielas disponibles, únete por código y revisa en cuáles ya participas.</p>
            <div className="row-actions" style={{ marginTop: 12 }}>
              <Link className="btn primary" href="/leagues">Ir a quiniela</Link>
            </div>
          </div>

          <div className="module-card">
            <h3>Calendario Mundialista</h3>
            <p className="small">Revisa grupos oficiales, fechas y cruces del Mundial 2026.</p>
            <div className="row-actions" style={{ marginTop: 12 }}>
              <Link className="btn" href="/mundial-2026">Abrir calendario</Link>
            </div>
          </div>

          <div className="module-card">
            <h3>Premios</h3>
            <p className="small">Consulta qué ganarán los primeros lugares al cierre del Mundial.</p>
            <div className="row-actions" style={{ marginTop: 12 }}>
              <Link className="btn" href="/premios">Ver premios</Link>
            </div>
          </div>

          <div className="module-card">
            <h3>Reglamento oficial</h3>
            <p className="small">Consulta reglas de participación, sistema de puntos y desempates.</p>
            <div className="row-actions" style={{ marginTop: 12 }}>
              <Link className="btn" href="/reglamento">Leer reglamento</Link>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>Tu cuenta</h3>
          <p className="small"><b>Nombre:</b> {me.fullName?.trim() || `@${me.username}`}</p>
          <p className="small"><b>Correo:</b> {me.email}</p>
          {me.nationalId && <p className="small"><b>Cédula:</b> {me.nationalId}</p>}
          <p className="small"><b>Rol:</b> {me.role}</p>
          <div className="row-actions" style={{ marginTop: 12 }}>
            <Link className="btn" href="/profile">Editar perfil</Link>
          </div>
          {me.role === 'SUPERADMIN' && (
            <div className="row-actions" style={{ marginTop: 12 }}>
              <Link className="btn green" href="/admin">Abrir admin</Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
