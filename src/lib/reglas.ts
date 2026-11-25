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

/** Máximo de turnos que la propuesta asigna por canal, por día y por jornada (tarde o noche). */
export const MAX_TURNOS_CANAL_JORNADA = 3;
/** Turnos mínimos que la propuesta busca darle a cada impulsadora en la semana. */
export const MINIMO_TURNOS_IMPULSADORA = 3;

export type SolicitudPropuesta = SolicitudOrden & {
  id: string;
  municipio: string;
  inicio: string;
  fin: string;
  canal?: string;
};
export type ImpulsadoraPropuesta = { id: string; nombre: string; municipio: string | null };
/** Horario final del turno: puede quedar corrido media hora respecto a la solicitud (corridoMin = 30 o -30). */
export type Asignacion = { solicitudId: string; impulsadoraId: string; alertas: Alerta[]; inicio: string; fin: string; corridoMin: number };
/**
 * Municipios o sectores donde no se asigna impulso en una semana, por fecha de inicio de la semana (jueves).
 * Las solicitudes de esos lugares quedan sin impulsadora para que Trade las marque "No aprobar".
 */
export const SIN_IMPULSO_POR_SEMANA: Record<string, string[]> = {
  "2026-11-26": ["CIRCASIA", "CALARCA", "BARCELONA"],
};
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
/** Si la solicitud es de un municipio o sector bloqueado esa semana (busca en municipio, lugar y dirección). */
export function sinImpulsoEstaSemana(inicioSemana: string, textos: (string | null | undefined)[]): boolean {
  const bloqueados = SIN_IMPULSO_POR_SEMANA[inicioSemana] ?? [];
  const todo = sinTildes(textos.filter(Boolean).join(" "));
  return bloqueados.some((b) => todo.includes(b));
}

/**
 * Quién puede cubrir turnos fuera de su municipio. Las de Armenia pueden ir a cualquier municipio.
 * Las que viven en otro municipio solo cubren el suyo, salvo estas excepciones (por id de usuario).
 */
export const PUEDEN_SALIR: Record<string, { municipio: string; soloDia: boolean }[]> = {
  "00e683f6-c1ed-4a0f-b452-65397b9c836b": [{ municipio: "ARMENIA", soloDia: true }], // Danna Alejandra Salazar Florez (Montenegro)
  "eba122eb-cf51-4e48-a501-d264b2957c78": [{ municipio: "ARMENIA", soloDia: true }], // Ana Sofía Tavera Sánchez (La Tebaida)
};
export const MUNICIPIO_BASE = "ARMENIA";

/** Si la impulsadora puede cubrir un turno en ese municipio y hora ("de día" = turno que empieza antes de las 6 PM). */
export function puedeCubrir(imp: { id: string; municipio: string | null }, municipio: string, inicio: string): boolean {
  if (!imp.municipio || imp.municipio === MUNICIPIO_BASE || imp.municipio === municipio) return true;
  return (PUEDEN_SALIR[imp.id] ?? []).some((e) => e.municipio === municipio && (!e.soloDia || franjaDe(inicio) === "tarde"));
}

/**
 * Degustación que la propuesta pone a cada turno según el canal, siempre de la marca del turno.
 * Sale de lo más común en las programaciones anteriores; Trade la puede cambiar a mano por turno.
 */
export const DEGUSTACION_POR_CANAL: Record<string, { presentacion: string; cantidad: number }> = {
  SUPERMERCADOS: { presentacion: "Media", cantidad: 1 },
  TAT: { presentacion: "Botella", cantidad: 1 },
  CONSUMO: { presentacion: "Botella", cantidad: 2 },
  MAYORISTAS: { presentacion: "Media", cantidad: 1 },
  EVENTOS: { presentacion: "Botella", cantidad: 3 },
  FIESTAS: { presentacion: "Botella", cantidad: 3 },
};

/** Consumo en la noche (desde las 6 PM) siempre empieza a las 9:00 PM y dura 4 horas, hasta la 1:00 AM. */
export const HORA_CONSUMO_NOCHE = "21:00";
export function horaSegunCanal(canal: string, hora: string): string {
  return canal === "CONSUMO" && /^\d{2}:\d{2}$/.test(hora) && hora >= "18:00" ? HORA_CONSUMO_NOCHE : hora;
}
/** Consumo en la tarde (antes de las 6 PM) es poco común: Trade Marketing debe confirmarla antes de aprobar. */
export const esConsumoTarde = (canal: string, hora: string) => canal === "CONSUMO" && hora.slice(0, 5) < "18:00";
const esConsumoNoche = (s: { canal?: string; inicio: string }) => s.canal === "CONSUMO" && franjaDe(s.inicio) === "noche";

/** Cuánto se puede correr un turno para cubrirlo cuando nadie tiene la hora y media libre. */
export const CORRIMIENTOS_MIN = [0, 30, -30];

const claveCanalJornada = (canal: string, inicio: string) => `${canal}|${inicio.slice(0, 10)}|${franjaDe(inicio)}`;

/**
 * Arma el borrador: atiende las solicitudes en orden de relevancia y elige, entre las disponibles
 * que respetan el descanso, primero a quien vive en el municipio y luego a quien lleva menos turnos.
 * Reparto por rondas para cubrir lo más posible sin dejar canales por fuera: primero cada canal recibe hasta
 * 3 turnos por día y jornada (las primeras solicitudes en orden). Si sobran impulsadoras, se reparten otra vez
 * de a 3 por canal (hasta 6, luego 9, …) hasta que no quede nadie disponible. Entre las candidatas van primero
 * las que viven en el municipio del punto; luego las que tienen menos de 3 turnos en la semana (para que cada
 * impulsadora quede con mínimo 3) y luego las que llevan menos turnos.
 */
export function generarPropuesta(
  solicitudes: SolicitudPropuesta[],
  impulsadoras: ImpulsadoraPropuesta[],
  disponibles: Set<string>,
  turnosFijos: (TurnoHorario & { canal?: string })[] = [],
): { asignaciones: Asignacion[]; sinCobertura: string[] } {
  const ocupados = [...turnosFijos];
  const asignaciones: Asignacion[] = [];
  const sinCobertura: string[] = [];
  const porCanalJornada = new Map<string, number>();
  for (const t of turnosFijos) {
    if (t.canal) porCanalJornada.set(claveCanalJornada(t.canal, t.inicio), (porCanalJornada.get(claveCanalJornada(t.canal, t.inicio)) ?? 0) + 1);
  }

  const pendientes = ordenarSolicitudes(solicitudes);
  const asignadas = new Set<string>();
  // Primero todo a la hora pedida. Lo que no se cubra por falta de descanso se intenta corriendo el turno
  // media hora (más tarde y, si no, más temprano), siempre respetando la hora y media entre turnos.
  for (const corrimiento of CORRIMIENTOS_MIN) {
    for (let limite = MAX_TURNOS_CANAL_JORNADA; limite <= MAX_TURNOS_CANAL_JORNADA * (solicitudes.length + 1); limite += MAX_TURNOS_CANAL_JORNADA) {
      let quedan = false;
      for (const original of pendientes) {
        if (asignadas.has(original.id)) continue;
        // Consumo en la noche tiene hora fija (9:00 PM): no se corre.
        if (corrimiento && esConsumoNoche(original)) continue;
        const clave = original.canal ? claveCanalJornada(original.canal, original.inicio) : null;
        if (clave && (porCanalJornada.get(clave) ?? 0) >= limite) {
          quedan = true;
          continue;
        }
        const solicitud = corrimiento
          ? { ...original, inicio: sumarMinutos(original.inicio, corrimiento), fin: sumarMinutos(original.fin, corrimiento) }
          : original;
        const elegida = elegirImpulsadora(solicitud);
        if (!elegida) continue;
        asignadas.add(original.id);
        ocupados.push({ impulsadoraId: elegida.imp.id, inicio: solicitud.inicio, fin: solicitud.fin });
        if (clave) porCanalJornada.set(clave, (porCanalJornada.get(clave) ?? 0) + 1);
        asignaciones.push({
          solicitudId: original.id,
          impulsadoraId: elegida.imp.id,
          alertas: elegida.alertas,
          inicio: solicitud.inicio,
          fin: solicitud.fin,
          corridoMin: corrimiento,
        });
      }
      if (!quedan) break;
    }
  }
  for (const s of pendientes) if (!asignadas.has(s.id)) sinCobertura.push(s.id);
  return { asignaciones, sinCobertura };

  function elegirImpulsadora(solicitud: SolicitudPropuesta) {
    const candidatas = impulsadoras
      .filter((imp) => disponibles.has(claveDisponibilidad(imp.id, solicitud.inicio)) && puedeCubrir(imp, solicitud.municipio, solicitud.inicio))
      .map((imp) => {
        const propios = ocupados.filter((t) => t.impulsadoraId === imp.id);
        const turno = { ...solicitud, id: undefined, impulsadoraId: imp.id };
        const alertas = evaluarTurno(turno, propios, { municipioImpulsadora: imp.municipio, disponible: true });
        return { imp, alertas, carga: propios.length };
      })
      .filter((c) => !c.alertas.some((a) => a.codigo === "CRUCE" || a.codigo === "DESCANSO"))
      .sort((a, b) => {
        const minimoA = a.carga < MINIMO_TURNOS_IMPULSADORA ? 0 : 1;
        const minimoB = b.carga < MINIMO_TURNOS_IMPULSADORA ? 0 : 1;
        const localA = a.imp.municipio === solicitud.municipio ? 0 : 1;
        const localB = b.imp.municipio === solicitud.municipio ? 0 : 1;
        return localA - localB || minimoA - minimoB || a.carga - b.carga || a.imp.nombre.localeCompare(b.imp.nombre);
      });

    return candidatas[0];
  }
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
