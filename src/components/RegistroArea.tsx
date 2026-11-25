"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarTurnoArea } from "@/app/(app)/turnos/acciones";
import { comprimir, intentarUbicar } from "./RegistroAsistencia";

// Impulso va primero. Los turnos de impulso siempre salen de la programación: al elegirlo no se registra aquí,
// se lleva a la persona a su turno programado de hoy o se le avisa que no tiene.
const AREAS = [
  { valor: "impulso", texto: "Impulso" },
  { valor: "bodega", texto: "Bodega" },
  { valor: "oficina", texto: "Oficina" },
  { valor: "mercadeo", texto: "Mercadeo" },
];

export type TurnoImpulsoHoy = { id: string; lugar: string; horario: string } | null;

/** Entrada (eligiendo el área) o salida de un turno en Bodega, Oficina o Mercadeo, con foto y ubicación. */
export function RegistroArea({
  tipo,
  turnoAreaId,
  turnoImpulsoHoy = null,
}: {
  tipo: "entrada" | "salida";
  turnoAreaId?: string;
  turnoImpulsoHoy?: TurnoImpulsoHoy;
}) {
  const router = useRouter();
  const entradaFoto = useRef<HTMLInputElement>(null);
  const [area, setArea] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [enviando, iniciar] = useTransition();

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setMensaje("");
    try {
      setFoto(await comprimir(archivo));
    } catch {
      setMensaje("No se pudo leer la foto. Tómala de nuevo.");
    }
  }

  function enviar() {
    if (!foto) return;
    if (tipo === "entrada" && (!area || area === "impulso")) return setMensaje("Elige el área donde vas a trabajar: Bodega, Oficina o Mercadeo.");
    iniciar(async () => {
      setMensaje("Obteniendo tu ubicación…");
      const ubicacion = await intentarUbicar();
      setMensaje("Enviando…");
      const r = await registrarTurnoArea({
        tipo,
        area: area ?? undefined,
        turnoAreaId,
        fotoBase64: foto.split(",")[1],
        lat: ubicacion?.lat ?? null,
        lng: ubicacion?.lng ?? null,
      });
      if (r.error) return setMensaje(r.error);
      setMensaje("");
      setFoto(null);
      setArea(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {tipo === "entrada" && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">¿Dónde vas a trabajar hoy?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {AREAS.map((a) => (
              <label
                key={a.valor}
                className={`flex min-h-12 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold ${
                  area === a.valor ? "border-tinta bg-tinta text-fondo" : "border-borde bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="area"
                  value={a.valor}
                  checked={area === a.valor}
                  onChange={() => { setArea(a.valor); setMensaje(""); }}
                  className="sr-only"
                />
                {a.texto}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {tipo === "entrada" && area === "impulso" ? (
        turnoImpulsoHoy ? (
          <div className="rounded-lg bg-ok-claro px-3.5 py-3 text-sm text-ok">
            <p>Tienes un turno de impulso programado hoy: <strong>{turnoImpulsoHoy.lugar}</strong>, {turnoImpulsoHoy.horario}.</p>
            <Link href={`/turnos/${turnoImpulsoHoy.id}`} className="boton mt-3 w-full">Ir a mi turno de impulso</Link>
          </div>
        ) : (
          <p role="status" className="rounded-lg bg-alerta-claro px-3.5 py-3 text-sm text-alerta">
            <strong>No tienes turnos de impulso programados para hoy.</strong> Los turnos de impulso salen de la programación que publica Trade Marketing.
          </p>
        )
      ) : (
        <>
          <input ref={entradaFoto} type="file" accept="image/*" capture="user" onChange={elegir} className="sr-only" aria-label={`Foto de ${tipo}`} />
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt={`Vista previa de la foto de ${tipo}`} className="max-h-64 w-full rounded-lg object-contain" />
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => entradaFoto.current?.click()} className={foto ? "boton-sec" : "boton"}>
              {foto ? "Tomar otra foto" : `Tomar foto de ${tipo}`}
            </button>
            {foto && (
              <button type="button" onClick={enviar} disabled={enviando} className="boton">
                {enviando ? "Registrando…" : `Registrar ${tipo}`}
              </button>
            )}
          </div>
        </>
      )}
      <p aria-live="polite" className="text-sm text-error empty:hidden">{mensaje}</p>
    </div>
  );
}
