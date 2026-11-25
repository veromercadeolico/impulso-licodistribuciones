// Consolidado de turnos por persona: horas reales entre entrada y salida; 1 turno = 4 horas
// (o la duración programada del turno, por ejemplo 3 h 30 en Consumo en la noche).
// Funciones puras, sin base de datos.

export const MINUTOS_POR_TURNO = 240;

export type RegistroTurno = {
  personaId: string;
  nombre: string;
  subperfil: string | null;
  inicio: string; // programado, "AAAA-MM-DD HH:MM"
  fin: string;
  entrada: string | null; // registrado, "AAAA-MM-DD HH:MM:SS"
  salida: string | null;
  /** Minutos que vale un turno completo; si falta, 4 horas. Consumo en la noche: 210 (3 h 30 = 1 turno). */
  minutosTurno?: number;
};

export type FilaConsolidado = {
  personaId: string;
  nombre: string;
  subperfil: string | null;
  programados: number;
  completos: number;
  sinSalida: number;
  sinEntrada: number;
  minutosReales: number;
  minutosProgramados: number;
  turnos: number; // por cada turno: minutos reales / minutos del turno (240 o 210), con un decimal
};

const aMs = (t: string) => Date.parse(`${t.slice(0, 19).replace(" ", "T")}Z`);
export const minutosEntre = (desde: string, hasta: string) => Math.max(0, Math.round((aMs(hasta) - aMs(desde)) / 60000));

export function consolidar(registros: RegistroTurno[]): FilaConsolidado[] {
  const porPersona = new Map<string, FilaConsolidado>();
  const turnosExactos = new Map<string, number>();
  for (const r of registros) {
    const f = porPersona.get(r.personaId) ?? {
      personaId: r.personaId, nombre: r.nombre, subperfil: r.subperfil,
      programados: 0, completos: 0, sinSalida: 0, sinEntrada: 0, minutosReales: 0, minutosProgramados: 0, turnos: 0,
    };
    const exactos = turnosExactos.get(r.personaId) ?? 0;
    f.programados++;
    f.minutosProgramados += minutosEntre(r.inicio, r.fin);
    if (!r.entrada) f.sinEntrada++;
    else if (!r.salida) f.sinSalida++;
    else {
      f.completos++;
      const reales = minutosEntre(r.entrada, r.salida);
      f.minutosReales += reales;
      turnosExactos.set(r.personaId, exactos + reales / (r.minutosTurno || MINUTOS_POR_TURNO));
    }
    porPersona.set(r.personaId, f);
  }
  return [...porPersona.values()]
    .map((f) => ({ ...f, turnos: Math.round((turnosExactos.get(f.personaId) ?? 0) * 10) / 10 }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}
