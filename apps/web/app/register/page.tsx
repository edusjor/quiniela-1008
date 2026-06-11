'use client';

import { useState } from 'react';
import Link from 'next/link';
import Nav from '../../components/Nav';
import ReglamentoContent from '../../components/ReglamentoContent';
import { register } from '../../lib/auth';
import { useRouter } from 'next/navigation';

const appUsernameRegex = /^@?[A-Za-z0-9._]+$/;

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [birthDate, setBirthDate] = useState('');
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
          <div className="card register-panel register-rules-panel">
            <div className="register-rules-box">
              <ReglamentoContent compact />
            </div>
            <div className="small" style={{ marginTop: 6, color: 'var(--muted)' }}>
              <Link href="/reglamento">Ver reglamento completo</Link>
            </div>
          </div>

          <div className="card register-panel register-form-panel">
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

            <div className="register-important-note small">
              <b>Importante:</b> esta quiniela será solo para la participación de los miembros colaboradores de 1008.
            </div>

            <label className="register-accept-row">
              <input
                type="checkbox"
                checked={acceptedRules}
                onChange={(e) => setAcceptedRules(e.target.checked)}
              />
              <span>Confirmo que leí y acepto el reglamento.</span>
            </label>

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

                    if (!cleanUsername) throw new Error('Debes escribir un nombre de usuario');
                    if (!appUsernameRegex.test(cleanUsername)) {
                      throw new Error('El nombre de usuario no es válido');
                    }
                    if (cleanUsername.replace(/^@+/, '').length < 3) {
                      throw new Error('El nombre de usuario debe tener al menos 3 caracteres');
                    }
                    if (!acceptedRules) throw new Error('Debes leer y aceptar el reglamento para crear tu cuenta');

                    await register({
                      email,
                      username: cleanUsername.replace(/^@+/, '').toLowerCase(),
                      fullName,
                      nationalId,
                      birthDate,
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
