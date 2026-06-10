'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '../lib/auth';
import { useMe } from '../lib/hooks';

export default function Nav() {
  const { me, loading } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const showMenu = !loading && Boolean(me);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="nav">
      <div className="brand">
        <span className="brand-main">1008</span>
        <span className="badge">Quiniela</span>
      </div>

      <button
        type="button"
        className="btn nav-toggle"
        aria-controls="main-nav-links"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((prev) => !prev)}
      >
        {mobileOpen ? 'Cerrar' : 'Menú'}
      </button>

      <div id="main-nav-links" className={`links ${mobileOpen ? 'open' : ''}`}>
        <Link className="btn" href="/mundial-2026">Mundial 2026</Link>
        <Link className="btn" href="/premios">Premios</Link>
        <Link className="btn" href="/reglamento">Reglamento</Link>
        {showMenu && <Link className="btn" href="/">Inicio</Link>}
        {showMenu && <Link className="btn" href="/leagues">Mis quinielas</Link>}
        {showMenu && <Link className="btn" href="/profile">Mi perfil</Link>}
        {!loading && me?.role === 'SUPERADMIN' && <Link className="btn green" href="/admin">Admin</Link>}
        {!loading && me ? (
          <>
            <span className="pill">{me.fullName?.trim() || `@${me.username}`} <span className="badge">{me.role}</span></span>
            <button
              className="btn"
              onClick={() => {
                setMobileOpen(false);
                logout();
                router.push('/login');
              }}
            >
              Salir
            </button>
          </>
        ) : (
          <>
            <Link className="btn primary" href="/login">Entrar</Link>
            <Link className="btn" href="/register">Crear cuenta</Link>
          </>
        )}
      </div>
    </div>
  );
}
