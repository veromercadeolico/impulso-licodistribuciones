// Obsequios, anchetas y auxilio de alimentación para el Excel de Programación.
// Sin dependencias para poder probarlo con node --test.

/** Cada ancheta lleva 2 cuartos de Esencial (regla de Trade Marketing). */
export const CUARTOS_POR_ANCHETA = 2;
/** Valores del auxilio de alimentación (pesos). */
export const AUXILIO_COMIDA = 18000;
export const AUXILIO_HIDRATACION = 10000;
/** Un turno continuo de esta duración o más (eventos largos) lleva almuerzo, comida e hidratación. */
export const TURNO_LARGO_MIN = 600;

export type Obsequios = { anchetas: number; cuartos: number; cocteles: number; shots: number };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function sumar(texto: string, patrones: RegExp[]): number {
  let total = 0;
  for (const p of patrones) for (const m of texto.matchAll(p)) total += Number(m[1]);
  return total;
}

/**
 * Lee lo que el vendedor escribió en Adicionales y Obsequios: "10 anchetas", "Anchetas 3", "12 cuartos",
 * "6 cuartos de esencial", "Cocteles: 4", "6 shot esencial". Los cuartos de obsequio siempre son de Esencial.
 */
export function extraerObsequios(texto: string | null | undefined): Obsequios {
  const t = sinTildes(texto ?? "");
  return {
    anchetas: sumar(t, [/(\d+)\s*anchetas?\b/g, /\banchetas?\s*:?\s*(\d+)/g]),
    cuartos: sumar(t, [/(\d+)\s*cuartos?\b/g]),
    cocteles: sumar(t, [/(\d+)\s*cocteles?\b/g, /\bcocteles?\s*:?\s*(\d+)/g]),
    shots: sumar(t, [/(\d+)\s*shots?\b/g]),
  };
}

export type TurnoConTexto = {
  id: string;
  /** Marca del turno: los cócteles son de esa marca. */
  marca: string;
  /** Solicitudes enviadas juntas comparten grupo: sus obsequios se cargan una sola vez. */
  grupo: string;
  texto: string;
  /** El grupo ya tiene obsequios cargados (por la app o a mano por Trade). */
  yaTiene: boolean;
};
export type ObsequioTurno = { turno_id: string; marca: string; presentacion: string; asignado: number };

/**
 * Obsequios que la app carga en cada turno a partir de lo que escribió el vendedor, para que la impulsadora
 * reporte en su turno cuánto entregó y cuánto sobró: cuartos y shots de Esencial, y cócteles de la marca del turno.
 * Se cargan en el primer turno de cada grupo (los turnos deben venir ordenados por hora).
 */
export function obsequiosParaTurnos(turnos: TurnoConTexto[]): ObsequioTurno[] {
  const vistos = new Set<string>();
  const salida: ObsequioTurno[] = [];
  for (const t of turnos) {
    if (vistos.has(t.grupo)) continue;
    vistos.add(t.grupo);
    if (t.yaTiene) continue;
    const o = extraerObsequios(t.texto);
    if (o.cuartos) salida.push({ turno_id: t.id, marca: "ESE", presentacion: "Cuarto", asignado: o.cuartos });
    if (o.shots) salida.push({ turno_id: t.id, marca: "ESE", presentacion: "Shot", asignado: o.shots });
    if (o.cocteles) salida.push({ turno_id: t.id, marca: t.marca, presentacion: "Coctel", asignado: o.cocteles });
  }
  return salida;
}

export type TurnoAuxilio ={ impulsadora: string; inicio: string; fin: string; lugar: string };
export type Auxilio = {
  impulsadora: string;
  dia: string;
  turnos: TurnoAuxilio[];
  almuerzo: number;
  comida: number;
  hidratacion: number;
  motivo: string;
};

const minutos = (f: string) => Math.round(Date.parse(`${f.slice(0, 16).replace(" ", "T")}:00Z`) / 60000);

/**
 * Auxilio de alimentación:
 * - Dos turnos seguidos con menos de `descansoMin` entre uno y otro, cuando entre los dos suman más de un turno
 *   (`duracionTurnoMin`): $18.000. Es almuerzo si el primer turno termina antes de las 3 PM; si no, comida.
 *   Un turno partido (por ejemplo, 2 h + 2 h) no suma más de un turno y no lleva auxilio.
 * - Un turno continuo de 10 horas o más (eventos): almuerzo, comida e hidratación.
 */
export function auxiliosAlimentacion(turnos: TurnoAuxilio[], descansoMin = 90, duracionTurnoMin = 240): Auxilio[] {
  const porPersona = new Map<string, TurnoAuxilio[]>();
  for (const t of turnos) porPersona.set(t.impulsadora, [...(porPersona.get(t.impulsadora) ?? []), t]);
  const salida: Auxilio[] = [];
  for (const [impulsadora, propios] of porPersona) {
    propios.sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
    propios.forEach((t, i) => {
      const dur = minutos(t.fin) - minutos(t.inicio);
      if (dur >= TURNO_LARGO_MIN) {
        salida.push({
          impulsadora, dia: t.inicio.slice(0, 10), turnos: [t], almuerzo: AUXILIO_COMIDA, comida: AUXILIO_COMIDA, hidratacion: AUXILIO_HIDRATACION,
          motivo: `Turno continuo de ${Math.round(dur / 60)} horas: almuerzo, comida e hidratación`,
        });
      }
      if (i === 0) return;
      const previo = propios[i - 1];
      const descanso = minutos(t.inicio) - minutos(previo.fin);
      const juntos = dur + (minutos(previo.fin) - minutos(previo.inicio));
      if (descanso < descansoMin && juntos > duracionTurnoMin) {
        const almuerzo = Number(previo.fin.slice(11, 13)) < 15;
        salida.push({
          impulsadora, dia: previo.inicio.slice(0, 10), turnos: [previo, t],
          almuerzo: almuerzo ? AUXILIO_COMIDA : 0, comida: almuerzo ? 0 : AUXILIO_COMIDA, hidratacion: 0,
          motivo: descanso <= 0 ? "Sin descanso entre turnos" : `Solo ${Math.floor(descanso / 60) ? `${Math.floor(descanso / 60)} h ` : ""}${descanso % 60 ? `${descanso % 60} min ` : ""}de descanso entre turnos (menos de 1 h 30)`.replace("  ", " "),
        });
      }
    });
  }
  return salida.sort((a, b) => a.dia.localeCompare(b.dia) || a.impulsadora.localeCompare(b.impulsadora));
}
