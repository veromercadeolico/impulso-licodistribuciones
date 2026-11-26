"use client";

import { useFormStatus } from "react-dom";

/** Botón de envío que se bloquea mientras el formulario se está enviando, para evitar envíos repetidos. */
export function BotonEnviar({
  children,
  className = "boton",
  name,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button name={name} value={value} disabled={pending} aria-disabled={pending} className={className}>
      {pending ? "Enviando…" : children}
    </button>
  );
}
