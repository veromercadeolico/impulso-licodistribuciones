"use client";

import { useState } from "react";

export function BotonCopiar({ texto, etiqueta = "Copiar enlace" }: { texto: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      window.prompt("Copia el enlace:", texto);
    }
  }
  return (
    <button type="button" onClick={copiar} className="boton-sec shrink-0">
      <span aria-live="polite">{copiado ? "Copiado" : etiqueta}</span>
    </button>
  );
}
