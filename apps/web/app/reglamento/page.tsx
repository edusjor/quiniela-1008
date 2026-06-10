import Nav from '../../components/Nav';
import ReglamentoContent from '../../components/ReglamentoContent';

export default function ReglamentoPage() {
  return (
    <>
      <Nav />
      <div className="card reglamento-shell">
        <h1 style={{ marginTop: 0 }}>Reglamento - Quiniela 1008 del Mundial</h1>
        <p className="small" style={{ marginTop: 0 }}>
          Lee estas reglas antes de registrarte. La participación implica aceptación total del reglamento.
        </p>
        <ReglamentoContent />
      </div>
    </>
  );
}
