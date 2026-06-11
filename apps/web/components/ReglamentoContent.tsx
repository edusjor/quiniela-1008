type ReglamentoContentProps = {
  compact?: boolean;
};

export default function ReglamentoContent({ compact = false }: ReglamentoContentProps) {
  return (
    <div className="rules-layout">
      <div className="rules-important">
        <b>Importante:</b> esta quiniela será solo para la participación de los miembros colaboradores de 1008.
      </div>

      {!compact && (
        <div className="rules-note">
          <b>Reglamento oficial de participación.</b> Inscribirte y jugar implica aceptar todas estas condiciones.
        </div>
      )}

      <section className="rules-section">
        <h3 style={{ marginTop: 0 }}>1. Premios</h3>
        <ul className="rules-list small" style={{ marginBottom: 8 }}>
          <li>Primer lugar: Un fin de Semana en el Hotel Hilton Puntarenas para dos personas. </li>
        </ul>
        <p className="small" style={{ marginBottom: 0 }}>
          Las condiciones de entrega, fechas y restricciones serán comunicadas por la organización.
        </p>
      </section>

      <section className="rules-section">
        <h3 style={{ marginTop: 0 }}>2. Sistema de puntuación</h3>
        <p className="small" style={{ marginTop: 0 }}>Los puntos se asignarán de la siguiente manera:</p>
        <ul className="rules-list small">
          <li>Marcador exacto acertado: 3 puntos.</li>
          <li>Ganador del partido acertado: 1 punto.</li>
          <li>Si el partido termina empatado y se acierta el empate sin marcar el resultado exacto: 1 punto.</li>
        </ul>

        <div className="rules-example-grid">
          <div className="rules-example">
            <div className="small"><b>Ejemplo 1</b></div>
            <div className="small">Predicción: Argentina 2 - 1 Brasil</div>
            <div className="small">Resultado final: Argentina 2 - 1 Brasil</div>
            <div className="small"><b>= 3 puntos</b></div>
          </div>

          <div className="rules-example">
            <div className="small"><b>Ejemplo 2</b></div>
            <div className="small">Predicción: Argentina 3 - 1 Brasil</div>
            <div className="small">Resultado final: Argentina 2 - 0 Brasil</div>
            <div className="small"><b>= 1 punto (acertó el ganador)</b></div>
          </div>

          <div className="rules-example">
            <div className="small"><b>Ejemplo 3</b></div>
            <div className="small">Predicción: Argentina 1 - 1 Brasil</div>
            <div className="small">Resultado final: Argentina 2 - 1 Brasil</div>
            <div className="small"><b>= 0 puntos</b></div>
          </div>

          <div className="rules-example">
            <div className="small"><b>Ejemplo 4</b></div>
            <div className="small">Predicción: Argentina 3 - 3 Brasil</div>
            <div className="small">Resultado final: Argentina 1 - 1 Brasil</div>
            <div className="small"><b>= 1 punto (acertó el empate)</b></div>
          </div>
        </div>

        <p className="small" style={{ marginBottom: 0 }}>
          Una vez iniciado cada partido, los pronósticos enviados no podrán modificarse.
        </p>
      </section>

      <section className="rules-section">
        <h3 style={{ marginTop: 0 }}>3. Reglas de desempate</h3>
        <p className="small" style={{ marginTop: 0 }}>
          En caso de empate en cualquier posición ganadora, se aplicarán los siguientes criterios en orden:
        </p>
        <ol className="rules-list small" style={{ paddingLeft: 20 }}>
          <li>Participante que haya acertado el Campeón y Subcampeón del Mundial.</li>
          <li>Predicción más cercana a la cantidad total de goles anotados durante todo el Mundial.</li>
          <li>Si el empate continúa, el premio correspondiente será dividido entre los participantes empatados.</li>
        </ol>
      </section>

      <section className="rules-section">
        <h3 style={{ marginTop: 0 }}>4. Participación y validez</h3>
        <ul className="rules-list small">
          <li>Solo se permitirá una participación por persona, validado por el número de cédula.</li>
          <li>Los participantes deberán ingresar información real y verificable.</li>
          <li>Participaciones duplicadas, información falsa o intentos de manipulación podrán resultar en descalificación inmediata.</li>
        </ul>
      </section>

      <section className="rules-section">
        <h3 style={{ marginTop: 0 }}>5. Condiciones generales</h3>
        <ul className="rules-list small" style={{ marginBottom: 8 }}>
          <li>La participación en la quiniela implica la aceptación total de este reglamento.</li>
          <li>1008 se reserva el derecho de descalificar participantes que incumplan las reglas o afecten el desarrollo normal de la dinámica.</li>
          <li>Cualquier situación no contemplada en este reglamento será resuelta por la organización.</li>
        </ul>
        <p className="small" style={{ marginBottom: 0 }}>
          Demuestra quién sabe realmente de fútbol y compite por el gran premio.
        </p>
      </section>
    </div>
  );
}
