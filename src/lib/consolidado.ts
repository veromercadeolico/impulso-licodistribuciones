// Consolidado de turnos por persona: horas reales entre entrada y salida; 1 turno = 4 horas.
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
  turnos: number; // minutos reales / 240, con un decimal
};

const aMs = (t: string) => Date.parse(`${t.slice(0, 19).replace(" ", "T")}Z`);
export const minutosEntre = (desde: string, hasta: string) => Math.max(0, Math.round((aMs(hasta) - aMs(desde)) / 60000));

export function consolidar(registros: RegistroTurno[]): FilaConsolidado[] {
  const porPersona = new Map<string, FilaConsolidado>();
  for (const r of registros) {
    const f = porPersona.get(r.personaId) ?? {
      personaId: r.personaId, nombre: r.nombre, subperfil: r.subperfil,
      programados: 0, completos: 0, sinSalida: 0, sinEntrada: 0, minutosReales: 0, minutosProgramados: 0, turnos: 0,
    };
    f.programados++;
    f.minutosProgramados += minutosEntre(r.inicio, r.fin);
    if (!r.entrada) f.sinEntrada++;
    else if (!r.salida) f.sinSalida++;
    else {
      f.completos++;
      f.minutosReales += minutosEntre(r.entrada, r.salida);
    }
    porPersona.set(r.personaId, f);
  }
  return [...porPersona.values()]
    .map((f) => ({ ...f, turnos: Math.round((f.minutosReales / MINUTOS_POR_TURNO) * 10) / 10 }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}
