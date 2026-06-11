import Nav from '../../components/Nav';

const prizes = [
  {
    reward: '1 fin de semana en Hotel Hilton',
    detail: 'Premio para el ganador de la quiniela.',
  },
];

export default function PremiosPage() {
  return (
    <>
      <Nav />

      <section className="card landing-hero">
        <p className="wc-kicker">Premiación oficial</p>
        <h1 style={{ marginTop: 8, marginBottom: 10 }}>Premio oficial de la quiniela</h1>
        <p className="small" style={{ maxWidth: 880 }}>
          Premio oficial confirmado para esta edición.
        </p>
      </section>

      <section className="grid cols3" style={{ marginTop: 14 }}>
        {prizes.map((prize) => (
          <article key={prize.reward} className="module-card">
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>{prize.reward}</h2>
            <p className="small" style={{ marginBottom: 0 }}>{prize.detail}</p>
          </article>
        ))}
      </section>

      <section className="card" style={{ borderStyle: 'dashed' }}>
        <p className="small" style={{ margin: 0 }}>
          Nota: aplican términos y condiciones de entrega del premio al ganador.
        </p>
      </section>
    </>
  );
}
