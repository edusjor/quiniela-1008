'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';
import { useMe } from '../../lib/hooks';

function toInputDate(value: string | null | undefined) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export default function ProfilePage() {
  const { me, loading, refresh } = useMe();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [instagramUsername, setInstagramUsername] = useState('');
  const [birthDate, setBirthDate] = useState('');

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgType, setMsgType] = useState<'success' | 'error'>('error');

  useEffect(() => {
    if (!me) return;
    setEmail(me.email || '');
    setUsername(me.username || '');
    setFullName(me.fullName || '');
    setNationalId(me.nationalId || '');
    setInstagramUsername(me.instagramUsername || '');
    setBirthDate(toInputDate(me.birthDate));
  }, [me]);

  if (loading) {
    return (
      <>
        <Nav />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Mi perfil</h2>
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
          <h2 style={{ marginTop: 0 }}>Inicia sesion para ver tu perfil</h2>
          <p className="small">Tu perfil solo esta disponible para usuarios autenticados.</p>
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
      <div className="card profile-shell" style={{ maxWidth: 980, margin: '0 auto' }}>
        <h2 style={{ marginTop: 0, marginBottom: 6 }}>Mi perfil</h2>
        <p className="small" style={{ marginTop: 0 }}>Aqui puedes revisar y actualizar tus datos de cuenta.</p>

        {msg && <div className={`card register-msg profile-msg ${msgType === 'success' ? 'register-msg-success' : ''}`}>{msg}</div>}

        <div className="profile-grid">
          <div className="card profile-panel">
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Datos personales</h3>

            <div className="label">Correo electronico</div>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

            <div className="label">Usuario</div>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
            />

            <div className="label">Nombre completo</div>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />

            <div className="label">Cedula</div>
            <input className="input" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />

            <div className="label">Usuario de Instagram</div>
            <input
              className="input"
              value={instagramUsername}
              onChange={(e) => setInstagramUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
            />

            <div className="label">Fecha de nacimiento</div>
            <input className="input" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
        </div>

        <div className="row-actions" style={{ marginTop: 14 }}>
          <button
            className="btn primary"
            disabled={saving}
            onClick={async () => {
              if (saving) return;

              setMsg(null);
              setSaving(true);
              try {
                const response = await apiFetch<{ user: any }>('/auth/me', {
                  method: 'PATCH',
                  body: JSON.stringify({
                    email,
                    username,
                    fullName,
                    nationalId,
                    instagramUsername,
                    birthDate,
                  }),
                });

                setEmail(response.user.email || '');
                setUsername(response.user.username || '');
                setFullName(response.user.fullName || '');
                setNationalId(response.user.nationalId || '');
                setInstagramUsername(response.user.instagramUsername || '');
                setBirthDate(toInputDate(response.user.birthDate));
                await refresh();
                setMsgType('success');
                setMsg('Perfil actualizado correctamente.');
              } catch (error: any) {
                setMsgType('error');
                setMsg(error?.message ?? 'No se pudo actualizar tu perfil');
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <Link className="btn" href="/leagues">Volver a mis quinielas</Link>
        </div>
      </div>
    </>
  );
}
