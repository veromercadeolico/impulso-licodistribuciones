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

/** Si la app se abrió dentro de WhatsApp, Instagram o Facebook, esos navegadores a veces no entregan la ubicación. */
const enNavegadorDeApp = () => /WhatsApp|FBAN|FBAV|Instagram/i.test(navigator.userAgent);

/**
 * Pide la ubicación: primero la precisa (GPS) y, si no responde a tiempo, la aproximada.
 * Si falla, el error trae un mensaje claro con qué hacer.
 */
export async function ubicar(): Promise<GeolocationPosition> {
  if (!("geolocation" in navigator)) {
    throw new Error("Este navegador no permite usar la ubicación. Abre el link en Chrome (Android) o Safari (iPhone).");
  }
  try {
    return await pedirUbicacion({ enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  } catch (e) {
    const err = e as GeolocationPositionError;
    if (err.code !== err.PERMISSION_DENIED) {
      try {
        // Dentro de locales el GPS preciso a veces no responde: se intenta con la ubicación aproximada.
        return await pedirUbicacion({ enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 });
      } catch {
        throw new Error(
          "No pudimos obtener tu ubicación. Revisa que la ubicación del celular esté encendida, acércate a una puerta o ventana e intenta de nuevo." +
            (enNavegadorDeApp() ? " Si abriste el link desde WhatsApp, ábrelo en Chrome o Safari." : ""),
        );
      }
    }
    throw new Error(
      "El navegador no tiene permiso para usar tu ubicación. Toca el candado o el ícono junto a la dirección de la página → Permisos → Ubicación → Permitir, y vuelve a intentarlo." +
        (enNavegadorDeApp() ? " Si abriste el link desde WhatsApp, ábrelo en Chrome o Safari." : ""),
    );
  }
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
      let posicion: GeolocationPosition;
      try {
        posicion = await ubicar();
      } catch (e) {
        setMensaje(e instanceof Error ? e.message : "Activa la ubicación del celular y permite el acceso para registrar tu " + nombre + ".");
        return;
      }
      setMensaje("Enviando…");
      const r = await registrarAsistencia({
        turnoId,
        tipo,
        fotoBase64: foto.split(",")[1],
        lat: posicion.coords.latitude,
        lng: posicion.coords.longitude,
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
