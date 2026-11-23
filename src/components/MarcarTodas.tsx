"use client";

export function MarcarTodas({ formulario }: { formulario: string }) {
  function marcar(valor: boolean) {
    document
      .querySelectorAll<HTMLInputElement>(`#${formulario} input[type=checkbox]`)
      .forEach((c) => (c.checked = valor));
  }
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => marcar(true)} className="boton-sec">Marcar todas</button>
      <button type="button" onClick={() => marcar(false)} className="boton-sec">Limpiar</button>
    </div>
  );
}
