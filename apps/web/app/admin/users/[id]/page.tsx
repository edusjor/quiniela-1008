'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Nav from '../../../../components/Nav';
import { apiFetch } from '../../../../lib/api';
import { useMe } from '../../../../lib/hooks';

type UserLeagueMembership = {
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
  league: {
    id: string;
    name: string;
    joinCode: string;
  };
};

type CreatedLeague = {
  id: string;
  name: string;
  joinCode: string;
  createdAt: string;
};

type AdminUserDetail = {
  id: string;
  email: string;
  username: string;
  fullName: string | null;
  nationalId: string | null;
  instagramUsername: string | null;
  birthDate: string | null;
  followsInstagram: boolean;
  purchaseProofImage: string | null;
  hasPurchaseProof: boolean;
  role: 'USER' | 'SUPERADMIN';
  createdAt: string;
  _count: {
    leagues: number;
    createdLeagues: number;
    predictions: number;
  };
  leagues: UserLeagueMembership[];
  createdLeagues: CreatedLeague[];
};

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const datePart = date.toLocaleDateString('es-CR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return `${datePart} ${timePart}`;
}

export default function AdminUserProfilePage({ params }: { params: { id: string } }) {
  const userId = params.id;
  const { me, loading } = useMe();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!me || me.role !== 'SUPERADMIN') return;
    apiFetch<{ user: AdminUserDetail }>(`/admin/users/${userId}`)
      .then((r) => setUser(r.user))
      .catch((e) => setMsg(e.message));
  }, [me?.id, me?.role, userId]);

  if (loading) {
    return (
      <>
        <Nav />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Perfil de usuario</h2>
          <p className="small">Cargando...</p>
        </div>
      </>
    );
  }

  if (!me || me.role !== 'SUPERADMIN') {
    return (
      <>
        <Nav />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Perfil de usuario</h2>
          <div className="card">403 - Solo SUPERADMIN.</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />
      <div className="card">
        <div className="row-actions" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Perfil de usuario</h2>
          <div className="row-actions">
            <Link className="btn" href="/admin">Volver al admin</Link>
          </div>
        </div>

        {msg && <div className="card">{msg}</div>}

        {!user ? (
          <p className="small">Cargando usuario...</p>
        ) : (
          <>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Datos personales</h3>
              <div className="grid cols2">
                <div><b>Usuario:</b> {user.username}</div>
                <div><b>Correo:</b> {user.email}</div>
                <div><b>Nombre completo:</b> {user.fullName?.trim() || '-'}</div>
                <div><b>Cédula:</b> {user.nationalId || '-'}</div>
                <div><b>Instagram:</b> {user.instagramUsername ? `@${user.instagramUsername}` : '-'}</div>
                <div><b>Fecha de nacimiento:</b> {formatDate(user.birthDate)}</div>
                <div><b>Sigue Instagram:</b> {user.followsInstagram ? 'Sí' : 'No'}</div>
                <div><b>Rol:</b> {user.role}</div>
                <div><b>Registro:</b> {formatDate(user.createdAt)}</div>
              </div>

              <div className="row-actions" style={{ marginTop: 12 }}>
                {user.purchaseProofImage ? (
                  <button className="btn" onClick={() => setInvoicePreview(user.purchaseProofImage)}>Ver factura</button>
                ) : (
                  <span className="small">Sin factura adjunta</span>
                )}
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Resumen</h3>
              <div className="grid cols3">
                <div><b>Quinielas unidas:</b> {user._count.leagues}</div>
                <div><b>Quinielas creadas:</b> {user._count.createdLeagues}</div>
                <div><b>Pronósticos:</b> {user._count.predictions}</div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Quinielas donde participa</h3>
              {!user.leagues.length ? (
                <p className="small" style={{ margin: 0 }}>Este usuario no participa en quinielas.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Quiniela</th><th>Código</th><th>Rol</th><th>Se unió</th><th></th></tr>
                  </thead>
                  <tbody>
                    {user.leagues.map((membership) => (
                      <tr key={`${membership.league.id}-${membership.joinedAt}`}>
                        <td>{membership.league.name}</td>
                        <td>{membership.league.joinCode}</td>
                        <td>{membership.role}</td>
                        <td>{formatDate(membership.joinedAt)}</td>
                        <td><Link className="btn" href={`/leagues/${membership.league.id}`}>Abrir</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Quinielas creadas</h3>
              {!user.createdLeagues.length ? (
                <p className="small" style={{ margin: 0 }}>Este usuario no ha creado quinielas.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Quiniela</th><th>Código</th><th>Creada</th><th></th></tr>
                  </thead>
                  <tbody>
                    {user.createdLeagues.map((league) => (
                      <tr key={league.id}>
                        <td>{league.name}</td>
                        <td>{league.joinCode}</td>
                        <td>{formatDate(league.createdAt)}</td>
                        <td><Link className="btn" href={`/leagues/${league.id}`}>Abrir</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {invoicePreview && (
          <div className="admin-proof-modal-backdrop" onClick={() => setInvoicePreview(null)}>
            <div className="card admin-proof-modal" onClick={(e) => e.stopPropagation()}>
              <div className="row-actions" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>Factura de @{user?.username}</h3>
                <button className="btn" onClick={() => setInvoicePreview(null)}>Cerrar</button>
              </div>

              <div className="admin-proof-modal-body">
                <img src={invoicePreview} alt={`Factura de @${user?.username || 'usuario'}`} className="admin-proof-image" />
              </div>

              <div className="row-actions" style={{ marginTop: 12 }}>
                <a className="btn" href={invoicePreview} download={`factura-${user?.username || 'usuario'}.jpg`}>Descargar</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
