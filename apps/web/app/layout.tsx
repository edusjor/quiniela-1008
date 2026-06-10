import './globals.css';
import type { Metadata } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import PublicLogosRibbon, { type PublicLogo } from '../components/PublicLogosRibbon';

export const metadata: Metadata = {
  title: 'Quiniela 1008 2026',
  description: 'Calendario Mundial 2026 y quinielas oficiales de 1008',
};

function logoAltFromFileName(fileName: string) {
  const base = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return base ? `Logo ${base}` : 'Logo aliado';
}

function readPublicLogos(): PublicLogo[] {
  const candidateDirs = [
    path.join(process.cwd(), 'public', 'logos'),
    path.join(process.cwd(), 'apps', 'web', 'public', 'logos'),
  ];
  const logosDir = candidateDirs.find((dir) => fs.existsSync(dir));
  if (!logosDir) return [];

  try {
    return fs
      .readdirSync(logosDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /\.(png|jpe?g|webp|svg|gif)$/i.test(name))
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      .map((name) => ({
        src: `/logos/${encodeURIComponent(name)}`,
        alt: logoAltFromFileName(name),
      }));
  } catch {
    return [];
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const publicLogos = readPublicLogos();

  return (
    <html lang="es">
      <body className="app-body">
        <div className="top-strip" aria-hidden="true">
          <div className="top-strip-inner">
            <span className="logo-badge">QUINIELA 1008</span>
          </div>
        </div>
        <PublicLogosRibbon logos={publicLogos} />
        <div className="container">{children}</div>
        <footer className="site-support-note" role="contentinfo">
          <div className="site-support-note-inner">
            <span>Si tienes dudas o problemas con la quiniela:</span>{' '}
            <a href="mailto:soporte@1008.com">soporte@1008.com</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
