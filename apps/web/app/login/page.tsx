'use client';

import { useState } from 'react';
import Link from 'next/link';
import Nav from '../../components/Nav';
import { login } from '../../lib/auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string|null>(null);
  const router = useRouter();

  return (
    <>
      <Nav />
      <div className="card">
        <h2 style={{marginTop:0}}>Entrar</h2>
        {msg && <div className="card">{msg}</div>}

        <div className="label">Correo o cédula</div>
        <input className="input" value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="tu@gmail.com o 1-1234-5678" />

        <div className="label">Contraseña</div>
        <input className="input" value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="••••••" />

        <div style={{ marginTop: 8 }}>
          <Link href="/forgot-password" className="small">¿Olvidaste tu contraseña?</Link>
        </div>

        <div style={{marginTop:12}} className="row-actions">
          <button className="btn primary" onClick={async ()=>{
            setMsg(null);
            try{
              await login(identifier, password);
              router.push('/leagues');
            }catch(e:any){
              setMsg(e.message);
            }
          }}>Entrar</button>
        </div>
      </div>
    </>
  );
}
