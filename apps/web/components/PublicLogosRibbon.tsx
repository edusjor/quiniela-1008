'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';

export type PublicLogo = {
  src: string;
  alt: string;
};

type PublicLogosRibbonProps = {
  logos: PublicLogo[];
};

export default function PublicLogosRibbon({ logos }: PublicLogosRibbonProps) {
  const pathname = usePathname();

  const normalizedLogos = useMemo(() => {
    if (logos.length <= 1) return [...logos, ...logos, ...logos];
    if (logos.length === 2) return [...logos, ...logos, ...logos];
    return logos;
  }, [logos]);

  if (pathname.startsWith('/admin')) return null;
  if (normalizedLogos.length === 0) return null;

  return (
    <div className="public-logos-ribbon" role="region" aria-label="Logos aliados">
      <div className="public-logos-ribbon-inner">
        <div className="public-logos-track">
          {[0, 1].map((copyIndex) => (
            <div
              key={copyIndex}
              className="public-logos-row"
              aria-hidden={copyIndex === 1 ? true : undefined}
            >
              {normalizedLogos.map((logo, logoIndex) => (
                <div className="public-logo-card" key={`${copyIndex}-${logo.src}-${logoIndex}`}>
                  <img
                    src={logo.src}
                    alt={logo.alt}
                    loading={copyIndex === 0 && logoIndex < 3 ? 'eager' : 'lazy'}
                    decoding="async"
                    draggable={false}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}