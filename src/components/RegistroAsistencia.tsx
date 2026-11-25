"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarAsistencia } from "@/app/(app)/turnos/acciones";

const LADO_MAXIMO = 1280;

export async function comprimir(archivo: File): Promise<string> {
  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext("2d")!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  return lienzo.toDataURL("image/jpeg", 0.72);
}

const pedirUbicacion = (opciones: PositionOptions) =>
  new Promise<GeolocationPosition>((ok, mal) => navigator.geolocation.getCurrentPosition(ok, mal, opciones));

export type Ubicacion = { lat: number; lng: number } | null;

/**
 * Intenta tomar la ubicación (primero la precisa y luego la aproximada). La ubicación ya no es obligatoria:
 * si el celular no la entrega o no da permiso, devuelve null y el registro se hace igual, sin ubicación.
 */
export async function intentarUbicar(): Promise<Ubicacion> {
  if (!("geolocation" in navigator)) return null;
  const intentos: PositionOptions[] = [
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
  ];
  for (const opciones of intentos) {
    try {
      const p = await pedirUbicacion(opciones);
      return { lat: p.coords.latitude, lng: p.coords.longitude };
    } catch (e) {
      if ((e as GeolocationPositionError).code === 1) return null; // Permiso negado: no tiene caso reintentar.
    }
  }
  return null;
}

export function RegistroAsistencia({ turnoId, tipo }: { turnoId: string; tipo: "entrada" | "salida" }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [enviando, iniciar] = useTransition();
  const nombre = tipo === "entrada" ? "entrada" : "salida";

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
    iniciar(async () => {
      setMensaje("Obteniendo tu ubicación…");
      const ubicacion = await intentarUbicar();
      setMensaje("Enviando…");
      const r = await registrarAsistencia({
        turnoId,
        tipo,
        fotoBase64: foto.split(",")[1],
        lat: ubicacion?.lat ?? null,
        lng: ubicacion?.lng ?? null,
      });
      if (r.error) return setMensaje(r.error);
      setMensaje("");
      setFoto(null);
      router.refresh();
    });
  }

  return (
    <div>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="user"
        onChange={elegir}
        className="sr-only"
        aria-label={`Foto de ${nombre}`}
      />
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt={`Vista previa de la foto de ${nombre}`} className="mb-3 max-h-64 w-full rounded-lg object-contain" />
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => entrada.current?.click()} className={foto ? "boton-sec" : "boton"}>
          {foto ? "Tomar otra foto" : `Tomar foto de ${nombre}`}
        </button>
        {foto && (
          <button type="button" onClick={enviar} disabled={enviando} className="boton">
            {enviando ? "Registrando…" : `Registrar ${nombre}`}
          </button>
        )}
      </div>
      <p aria-live="polite" className="mt-2 text-sm text-error empty:hidden">{mensaje}</p>
    </div>
  );
}
