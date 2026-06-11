'use client';

import { useState } from 'react';
import Link from 'next/link';
import Nav from '../../components/Nav';
import ReglamentoContent from '../../components/ReglamentoContent';
import { register } from '../../lib/auth';
import { useRouter } from 'next/navigation';

const INSTAGRAM_URL = 'https://www.instagram.com/1008/';
const instagramHandleRegex = /^@?[A-Za-z0-9._]+$/;
const appUsernameRegex = /^@?[A-Za-z0-9._]+$/;

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [instagramUsername, setInstagramUsername] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [followsInstagram, setFollowsInstagram] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgType, setMsgType] = useState<'success' | 'error'>('error');
  const router = useRouter();

  return (
    <>
      <Nav />
      <div className="card register-shell">
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Crear cuenta para quinielas</h2>
        <p className="small register-subcopy">
          Solo los usuarios registrados pueden participar en quinielas. El calendario Mundial 2026 es público.
          El correo electrónico, usuario y número de cédula deben ser únicos.
        </p>

        {msg && <div className={`card register-msg ${msgType === 'success' ? 'register-msg-success' : ''}`}>{msg}</div>}

        <div className="register-layout">
          <div className="card register-panel">
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>Requisitos para habilitar tu participación</h3>
            <p className="small" style={{ marginTop: 0, marginBottom: 0 }}>
              Completa estos requisitos antes de crear tu cuenta.
            </p>

            <div className="register-step-list">
              <div className="register-step">
                <div className="register-step-title">Seguí a 1008 en Instagram</div>
                <div className="register-step-content">
                  <a
                    className="btn primary"
                    href={INSTAGRAM_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir Instagram y seguir
                  </a>
                </div>
              </div>

              <div className="register-step">
                <div className="register-step-title">Escribí tu usuario de Instagram</div>
                <div className="register-step-content">
                  <input
                    className="input"
                    value={instagramUsername}
                    onChange={(e) => setInstagramUsername(e.target.value)}
                    placeholder="@usuario"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
              </div>

              <div className="register-step">
                <div className="register-step-title">Confirma</div>
                <div className="register-step-content">
                  <label className="small register-confirm-row">
                    <input
                      type="checkbox"
                      checked={followsInstagram}
                      onChange={(e) => setFollowsInstagram(e.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    Confirmo que ya sigo a @1008. Entiendo que si no sigo la cuenta, mi participación puede ser anulada.
                  </label>
                </div>
              </div>

              <div className="register-step">
                <div className="register-step-title">Lee y acepta el reglamento oficial</div>
                <div className="register-step-content">
                  <p className="small" style={{ marginTop: 0, marginBottom: 8 }}>
                    Debes leer el reglamento completo antes de crear tu cuenta.
                  </p>
                  <div className="register-rules-box">
                    <ReglamentoContent compact />
                  </div>
                  <label className="small register-confirm-row register-rules-check">
                    <input
                      type="checkbox"
                      checked={acceptedRules}
                      onChange={(e) => setAcceptedRules(e.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    Confirmo que leí y acepto el reglamento de la quiniela.
                  </label>
                  <div className="small" style={{ marginTop: 8 }}>
                    También puedes verlo en una página dedicada: <Link href="/reglamento">Ver reglamento completo</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card register-panel">
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>Datos de tu cuenta</h3>
            <p className="small" style={{ marginTop: 0 }}>
              Este formulario crea tu acceso para entrar a quinielas privadas.
            </p>

            <div className="register-account-grid">
              <div>
                <div className="label">Correo electrónico</div>
                <input
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="label">Usuario único</div>
                <input
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ej: juan.perez"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                />
              </div>

              <div>
                <div className="label">Número de cédula</div>
                <input
                  className="input"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  placeholder="Ej: 1-1234-5678"
                />
              </div>

              <div>
                <div className="label">Nombre completo</div>
                <input
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej: María Fernanda Rojas"
                  autoComplete="name"
                />
              </div>

              <div>
                <div className="label">Fecha de nacimiento</div>
                <input
                  className="input"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  type="date"
                />
              </div>
            </div>

            <div className="register-account-full">
              <div className="label">Contraseña</div>
              <input
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
            </div>

            <div className="row-actions register-actions">
              <button
                className="btn primary"
                disabled={saving}
                onClick={async () => {
                  if (saving) return;
                  setMsgType('error');
                  setMsg(null);
                  setSaving(true);
                  try {
                    const cleanUsername = username.trim();
                    const cleanInstagramUsername = instagramUsername.trim();

                    if (!cleanUsername) throw new Error('Debes escribir un nombre de usuario');
                    if (!appUsernameRegex.test(cleanUsername)) {
                      throw new Error('El nombre de usuario no es válido');
                    }
                    if (cleanUsername.replace(/^@+/, '').length < 3) {
                      throw new Error('El nombre de usuario debe tener al menos 3 caracteres');
                    }
                    if (!cleanInstagramUsername) throw new Error('Debes escribir tu usuario de Instagram');
                    if (!instagramHandleRegex.test(cleanInstagramUsername)) {
                      throw new Error('El usuario de Instagram no es válido');
                    }
                    if (!followsInstagram) throw new Error('Debes confirmar que sigues el Instagram de 1008');
                    if (!acceptedRules) throw new Error('Debes leer y aceptar el reglamento para crear tu cuenta');

                    await register({
                      email,
                      username: cleanUsername.replace(/^@+/, '').toLowerCase(),
                      fullName,
                      nationalId,
                      instagramUsername: cleanInstagramUsername,
                      birthDate,
                      followsInstagram,
                      acceptedRules,
                      password,
                    });
                    router.push('/login');
                  } catch (e: any) {
                    setMsgType('error');
                    setMsg(e.message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? 'Creando...' : 'Crear cuenta'}
              </button>
              <Link className="btn" href="/login">¿Ya tienes una cuenta? Entrar</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
