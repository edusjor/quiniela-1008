import Nav from '../../components/Nav';

const prizes = [
  {
    place: '1er Lugar',
    reward: 'Pendiente',
    detail: 'Premio pendiente por anunciar.',
  },
  {
    place: '2do Lugar',
    reward: 'Pendiente',
    detail: 'Premio pendiente por anunciar.',
  },
  {
    place: '3er Lugar',
    reward: 'Pendiente',
    detail: 'Premio pendiente por anunciar.',
  },
  {
    place: '4to Lugar',
    reward: 'Pendiente',
    detail: 'Premio pendiente por anunciar.',
  },
  {
    place: '5to Lugar',
    reward: 'Pendiente',
    detail: 'Premio pendiente por anunciar.',
  },
];

export default function PremiosPage() {
  return (
    <>
      <Nav />

      <section className="card landing-hero">
        <p className="wc-kicker">Premiación oficial</p>
        <h1 style={{ marginTop: 8, marginBottom: 10 }}>Premios del ranking de quiniela</h1>
        <p className="small" style={{ maxWidth: 880 }}>
          La premiación oficial está pendiente de anuncio. Vuelve pronto para ver el detalle final.
        </p>
      </section>

      <section className="grid cols3" style={{ marginTop: 14 }}>
        {prizes.map((prize) => (
          <article key={prize.place} className="module-card">
            <p className="small" style={{ marginTop: 0 }}>{prize.place}</p>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>{prize.reward}</h2>
            <p className="small" style={{ marginBottom: 0 }}>{prize.detail}</p>
          </article>
        ))}
      </section>

      <section className="card" style={{ borderStyle: 'dashed' }}>
        <p className="small" style={{ margin: 0 }}>
          Nota: los premios y condiciones de entrega están pendientes por confirmar.
        </p>
      </section>
    </>
  );
}
