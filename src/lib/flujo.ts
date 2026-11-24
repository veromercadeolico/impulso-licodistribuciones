// Flujo de revisión de la programación entre Trade Marketing y Supervisión.
// El paso de cada semana se guarda en los avisos (notificaciones): su enlace lleva "&flujo=<paso>".
// No requiere columnas nuevas en la base de datos. Funciones puras, sin base de datos.

export type Paso = "enviada" | "aprobada" | "devuelta" | "retomada";
export type EstadoFlujo = "preparacion" | "en_revision" | "aprobada" | "devuelta";

const ESTADO_DE_PASO: Record<Paso, EstadoFlujo> = {
  enviada: "en_revision",
  aprobada: "aprobada",
  devuelta: "devuelta",
  retomada: "preparacion",
};

/** Detalle con el que se registra en cambios_turno que Supervisión aprobó un turno (no es un cambio para el vendedor). */
export const DETALLE_APROBADO_TURNO = "Aprobado por Supervisión";

export const enlaceFlujo =(periodoId: string, paso: Paso) => `/programacion?p=${periodoId}&flujo=${paso}`;

/** Prefijo para buscar en la base los avisos del flujo de una semana. */
export const prefijoFlujo = (periodoId: string) => `/programacion?p=${periodoId}&flujo=`;

export function pasoDeEnlace(enlace: string | null | undefined): Paso | null {
  const m = /[?&]flujo=(enviada|aprobada|devuelta|retomada)(?:&|$)/.exec(enlace ?? "");
  return (m?.[1] as Paso) ?? null;
}

/** Estado de la semana según el último aviso del flujo (o "preparacion" si no hay ninguno). */
export function estadoDeAviso(enlace: string | null | undefined): EstadoFlujo {
  const paso = pasoDeEnlace(enlace);
  return paso ? ESTADO_DE_PASO[paso] : "preparacion";
}

type Rol = string;

/** Quién puede asignar, aprobar o rechazar solicitudes de la semana. */
export function puedeEditar(rol: Rol, estado: EstadoFlujo, publicada: boolean): boolean {
  if (rol === "admin") return true;
  if (publicada) return rol === "trade"; // Después de publicar, Trade maneja los cambios como antes.
  if (rol === "trade") return estado === "preparacion" || estado === "devuelta";
  if (rol === "supervisor") return estado === "en_revision";
  return false;
}

/** Trade solo puede publicar por primera vez cuando Supervisión aprobó. */
export const puedePublicar = (estado: EstadoFlujo, publicada: boolean) => publicada || estado === "aprobada";

/** Qué paso puede dar cada rol desde el estado actual. */
export function pasosPermitidos(rol: Rol, estado: EstadoFlujo, publicada: boolean): Paso[] {
  if (publicada) return [];
  const trade = rol === "trade" || rol === "admin";
  const supervisor = rol === "supervisor" || rol === "admin";
  const pasos: Paso[] = [];
  if (trade && (estado === "preparacion" || estado === "devuelta")) pasos.push("enviada");
  if (supervisor && estado === "en_revision") pasos.push("aprobada", "devuelta");
  if (trade && (estado === "aprobada" || estado === "en_revision")) pasos.push("retomada");
  return pasos;
}
