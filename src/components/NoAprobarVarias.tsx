"use client";

import { useEffect, useState } from "react";

const FORM = "no-aprobar-varias";

/**
 * Barra para marcar varias solicitudes de la lista y darles "No aprobar" con un solo motivo.
 * Cada solicitud pendiente tiene una casilla (input name="ids" form="no-aprobar-varias").
 */
export function NoAprobarVarias({
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

  function marcarVisibles() {
    document
      .querySelectorAll<HTMLInputElement>(`#${lista} > li:not([hidden]) input[form="${FORM}"]`)
      .forEach((c) => (c.checked = true));
    contar();
  }
  function desmarcar() {
    document.querySelectorAll<HTMLInputElement>(`input[form="${FORM}"]`).forEach((c) => (c.checked = false));
    contar();
  }

  return (
    <form
      id={FORM}
      action={accion}
      onSubmit={(e) => {
        if (!marcadas || !confirm(`¿Marcar ${marcadas === 1 ? "1 solicitud" : `${marcadas} solicitudes`} como no aprobadas?`)) e.preventDefault();
      }}
      className="tarjeta-compacta mb-4"
    >
      <input type="hidden" name="periodo" value={periodo} />
      <p className="text-sm font-semibold">No aprobar varias</p>
      <p className="mt-0.5 text-xs text-suave">
        Tip: en el filtro elige “Sin impulsadora (pendientes)”, toca “Marcar todas las que se ven” y confirma.
      </p>
      <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <label htmlFor="motivo-varias" className="sr-only">Motivo para el vendedor</label>
        <input id="motivo-varias" name="motivo" required maxLength={300} defaultValue="No se aprueba por disponibilidad" className="campo lg:flex-1" />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={marcarVisibles} className="boton-sec">Marcar todas las que se ven</button>
          <button type="button" onClick={desmarcar} className="boton-sec" disabled={!marcadas}>Desmarcar</button>
          <button className="boton-peligro" disabled={!marcadas}>No aprobar ({marcadas})</button>
        </div>
      </div>
    </form>
  );
}
