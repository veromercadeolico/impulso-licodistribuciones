"use client";

import { useEffect, useState } from "react";

const FORM = "aprobar-varios";

/** Barra de Supervisión para aprobar varios turnos a la vez: los marcados o todos los que no tienen alertas. */
export function AprobarVarios({
  accion,
  periodo,
  lista,
}: {
  accion: (datos: FormData) => void | Promise<void>;
  periodo: string;
  lista: string;
}) {
  const [marcadas, setMarcadas] = useState(0);
  const contar = () => setMarcadas(document.querySelectorAll(`input[form="${FORM}"]:checked`).length);
  useEffect(() => {
    contar();
    document.addEventListener("change", contar);
    return () => document.removeEventListener("change", contar);
  }, []);
  const marcar = (valor: boolean) => {
    const sel = valor ? `#${lista} > li:not([hidden]) input[form="${FORM}"]` : `input[form="${FORM}"]`;
    document.querySelectorAll<HTMLInputElement>(sel).forEach((c) => (c.checked = valor));
    contar();
  };

  return (
    <div className="tarjeta-compacta mb-4">
      <p className="text-sm font-semibold">Aprobar varios turnos</p>
      <p className="mt-0.5 text-xs text-suave">
        Marca los turnos (o usa el filtro y “Marcar todos los que se ven”) y apruébalos juntos. También puedes aprobar de una vez todos los que no tienen alertas.
      </p>
      <form id={FORM} action={accion} className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => { if (!marcadas || !confirm(`¿Aprobar ${marcadas === 1 ? "1 turno" : `${marcadas} turnos`}?`)) e.preventDefault(); }}>
        <input type="hidden" name="periodo" value={periodo} />
        <button type="button" onClick={() => marcar(true)} className="boton-sec">Marcar todos los que se ven</button>
        <button type="button" onClick={() => marcar(false)} className="boton-sec" disabled={!marcadas}>Desmarcar</button>
        <button className="boton" disabled={!marcadas}>Aprobar marcados ({marcadas})</button>
      </form>
      <form action={accion} className="mt-2" onSubmit={(e) => { if (!confirm("¿Aprobar todos los turnos que no tienen alertas?")) e.preventDefault(); }}>
        <input type="hidden" name="periodo" value={periodo} />
        <input type="hidden" name="modo" value="sin_alertas" />
        <button className="boton-sec">Aprobar todos los turnos sin alertas</button>
      </form>
    </div>
  );
}
