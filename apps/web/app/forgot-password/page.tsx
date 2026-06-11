'use client';

import { useState } from 'react';
import Link from 'next/link';
import Nav from '../../components/Nav';
import { requestPasswordReset } from '../../lib/auth';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <>
      <Nav />
      <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
        <h2 style={{ marginTop: 0 }}>Recuperar contraseña</h2>
        <p className="small" style={{ marginTop: 0 }}>
          Escribe tu correo o cédula y te enviaremos un enlace al correo registrado.
        </p>

        {msg && <div className="card" style={{ marginTop: 10 }}>{msg}</div>}

        <div className="label">Correo o cédula</div>
        <input
          className="input"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="tu@correo.com o 1-1234-5678"
          autoComplete="off"
        />

        <div className="row-actions" style={{ marginTop: 12 }}>
          <button
            className="btn primary"
            disabled={sending}
            onClick={async () => {
              setMsg(null);
              setSending(true);
              try {
                const response = await requestPasswordReset(identifier);
                setMsg(response.message || 'Si los datos existen, te enviamos instrucciones.');
              } catch (error: any) {
                setMsg(error?.message ?? 'No se pudo procesar la solicitud');
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? 'Enviando...' : 'Enviar enlace'}
          </button>
          <Link className="btn" href="/login">Volver a entrar</Link>
        </div>
      </div>
    </>
  );
}
