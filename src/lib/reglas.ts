// Reglas de negocio puras (sin base de datos) para programar turnos y medir su cumplimiento.

export const DURACION_TURNO_MIN = 240;
export const DESCANSO_MINIMO_MIN = 90;
export const RADIO_PUNTO_M = 30;
export const META_CUMPLIMIENTO = 0.8;
/** Parte del turno programado que debe trabajarse para que cuente como cumplido. */
export const PORCENTAJE_TIEMPO_MINIMO = 0.8;
/** Días hacia atrás en los que un turno terminado sin reporte de ventas genera alerta. */
export const DIAS_ALERTA_REPORTE = 7;

export type Franja = "tarde" | "noche";
export type CodigoAlerta = "DURACION" | "DESCANSO" | "CRUCE" | "NO_DISPONIBLE" | "DESPLAZAMIENTO";
export type Alerta = { codigo: CodigoAlerta; mensaje: string; requiereMotivo: boolean };

export type TurnoHorario = { id?: string; impulsadoraId: string; inicio: string; fin: string };

/** Convierte "YYYY-MM-DD HH:mm[:ss]" en minutos absolutos, sin depender de la zona del servidor. */
export function aMinutos(fechaHora: string): number {
  return Math.round(Date.parse(`${fechaHora.slice(0, 16).replace(" ", "T")}:00Z`) / 60000);
}

function desdeMinutos(minutos: number): string {
  return new Date(minutos * 60000).toISOString().slice(0, 16).replace("T", " ");
}

export function sumarMinutos(fechaHora: string, minutos: number): string {
  return desdeMinutos(aMinutos(fechaHora) + minutos);
}

export function franjaDe(fechaHora: string): Franja {
  return Number(fechaHora.slice(11, 13)) < 18 ? "tarde" : "noche";
}

export function claveDisponibilidad(impulsadoraId: string, fechaHora: string): string {
  return `${impulsadoraId}|${fechaHora.slice(0, 10)}|${franjaDe(fechaHora)}`;
}

function texto(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function evaluarTurno(
  turno: TurnoHorario & { municipio: string },
  otros: TurnoHorario[],
  contexto: { municipioImpulsadora: string | null; disponible: boolean },
): Alerta[] {
  const alertas: Alerta[] = [];
  const inicio = aMinutos(turno.inicio);
  const fin = aMinutos(turno.fin);
  const duracion = fin - inicio;

  if (duracion !== DURACION_TURNO_MIN) {
    alertas.push({
      codigo: "DURACION",
      mensaje: `El turno dura ${texto(duracion)} y debe durar 4 h.`,
      requiereMotivo: true,
    });
  }
  if (!contexto.disponible) {
    alertas.push({
      codigo: "NO_DISPONIBLE",
      mensaje: "La impulsadora no está marcada como disponible en esta franja.",
      requiereMotivo: false,
    });
  }

  for (const otro of otros) {
    if (otro.impulsadoraId !== turno.impulsadoraId || (turno.id && otro.id === turno.id)) continue;
    const otroInicio = aMinutos(otro.inicio);
    const otroFin = aMinutos(otro.fin);
    if (inicio < otroFin && otroInicio < fin) {
      alertas.push({ codigo: "CRUCE", mensaje: "Se cruza con otro turno de la misma impulsadora.", requiereMotivo: true });
      continue;
    }
    const descanso = inicio >= otroFin ? inicio - otroFin : otroInicio - fin;
    if (descanso < DESCANSO_MINIMO_MIN) {
      alertas.push({
        codigo: "DESCANSO",
        mensaje: `Solo hay ${texto(descanso)} con otro turno; el mínimo es 1 h 30 min.`,
        requiereMotivo: true,
      });
    }
  }

  if (contexto.municipioImpulsadora && contexto.municipioImpulsadora !== turno.municipio) {
    alertas.push({
      codigo: "DESPLAZAMIENTO",
      mensaje: `Vive en ${contexto.municipioImpulsadora} y debe desplazarse a ${turno.municipio}.`,
      requiereMotivo: false,
    });
  }
  return alertas;
}

export function requiereMotivo(alertas: Alerta[]): boolean {
  return alertas.some((a) => a.requiereMotivo);
}

export type SolicitudOrden = { prioridad: number | null; creadoEn: string };

/**
 * Las solicitudes sin relevancia conservan su puesto de llegada. Las demás ocupan los puestos
 * restantes de mayor a menor relevancia (1 es la más alta) y, en empate, gana la que llegó primero.
 */
export function ordenarSolicitudes<T extends SolicitudOrden>(lista: T[]): T[] {
  const llegada = [...lista].sort((a, b) => (a.creadoEn < b.creadoEn ? -1 : a.creadoEn > b.creadoEn ? 1 : 0));
  const conRelevancia = llegada.filter((s) => s.prioridad != null).sort((a, b) => a.prioridad! - b.prioridad!);
  let siguiente = 0;
  return llegada.map((s) => (s.prioridad == null ? s : conRelevancia[siguiente++]));
}

export type SolicitudPropuesta = SolicitudOrden & {
  id: string;
  municipio: string;
  inicio: string;
  fin: string;
};
export type ImpulsadoraPropuesta = { id: string; nombre: string; municipio: string | null };
export type Asignacion = { solicitudId: string; impulsadoraId: string; alertas: Alerta[] };

/**
 * Arma el borrador: atiende las solicitudes en orden de relevancia y elige, entre las disponibles
 * que respetan el descanso, primero a quien vive en el municipio y luego a quien lleva menos turnos.
 */
export function generarPropuesta(
  solicitudes: SolicitudPropuesta[],
  impulsadoras: ImpulsadoraPropuesta[],
  disponibles: Set<string>,
  turnosFijos: TurnoHorario[] = [],
): { asignaciones: Asignacion[]; sinCobertura: string[] } {
  const ocupados = [...turnosFijos];
  const asignaciones: Asignacion[] = [];
  const sinCobertura: string[] = [];

  for (const solicitud of ordenarSolicitudes(solicitudes)) {
    const candidatas = impulsadoras
      .filter((imp) => disponibles.has(claveDisponibilidad(imp.id, solicitud.inicio)))
      .map((imp) => {
        const propios = ocupados.filter((t) => t.impulsadoraId === imp.id);
        const turno = { ...solicitud, id: undefined, impulsadoraId: imp.id };
        const alertas = evaluarTurno(turno, propios, { municipioImpulsadora: imp.municipio, disponible: true });
        return { imp, alertas, carga: propios.length };
      })
      .filter((c) => !c.alertas.some((a) => a.codigo === "CRUCE" || a.codigo === "DESCANSO"))
      .sort((a, b) => {
        const localA = a.imp.municipio === solicitud.municipio ? 0 : 1;
        const localB = b.imp.municipio === solicitud.municipio ? 0 : 1;
        return localA - localB || a.carga - b.carga || a.imp.nombre.localeCompare(b.imp.nombre);
      });

    const elegida = candidatas[0];
    if (!elegida) {
      sinCobertura.push(solicitud.id);
      continue;
    }
    ocupados.push({ impulsadoraId: elegida.imp.id, inicio: solicitud.inicio, fin: solicitud.fin });
    asignaciones.push({ solicitudId: solicitud.id, impulsadoraId: elegida.imp.id, alertas: elegida.alertas });
  }
  return { asignaciones, sinCobertura };
}

export type EstadoCumplimiento =
  | "cumplido"
  | "tiempo_incompleto"
  | "cambio_pdv"
  | "falta_ventas"
  | "falta_entrada"
  | "sin_reportes";

export function tiempoIncompleto(minutosTrabajados: number, minutosProgramados: number): boolean {
  return minutosTrabajados < minutosProgramados * PORCENTAJE_TIEMPO_MINIMO;
}

/** Turno cumplido = entrada y ventas reportadas en el punto programado, con el tiempo mínimo trabajado. */
export function clasificarTurno(t: {
  entrada: boolean;
  ventas: boolean;
  fueraDeRango: boolean;
  minutosTrabajados?: number | null;
  minutosProgramados?: number;
}): EstadoCumplimiento {
  if (!t.entrada && !t.ventas) return "sin_reportes";
  if (!t.entrada) return "falta_entrada";
  if (!t.ventas) return "falta_ventas";
  if (t.fueraDeRango) return "cambio_pdv";
  if (t.minutosTrabajados != null && t.minutosProgramados && tiempoIncompleto(t.minutosTrabajados, t.minutosProgramados)) {
    return "tiempo_incompleto";
  }
  return "cumplido";
}

export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Unidades reducidas: equivalentes a botellas de 750 ml, como en la relación de ventas. */
export function unidadesReducidas(cantidad: number, ml: number): number {
  return (cantidad * ml) / 750;
}

export function cajas(cantidad: number, unidadesPorCaja: number): number {
  return cantidad / unidadesPorCaja;
}

/** El periodo va de jueves a miércoles; las solicitudes cierran el miércoles anterior a las 12:00 PM. */
export function periodoDeFecha(fecha: string): { inicio: string; fin: string; limite: string } {
  const base = Date.parse(`${fecha}T00:00:00Z`);
  const dia = new Date(base).getUTCDay();
  const desdeJueves = (dia - 4 + 7) % 7;
  const inicio = base - desdeJueves * 86400000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return {
    inicio: iso(inicio),
    fin: iso(inicio + 6 * 86400000),
    limite: `${iso(inicio - 86400000)} 12:00:00`,
  };
}
