import { sql } from "./db";
import { hoyBogota, sumarDias } from "./formato";
import { periodoDeFecha } from "./reglas";

export type Periodo = {
  id: string;
  fecha_inicio: string;
  fecha_fin: string;
  limite_solicitudes: string;
  estado: "abierto" | "publicado";
};

export async function asegurarPeriodo(fecha: string): Promise<Periodo> {
  const { inicio, fin, limite } = periodoDeFecha(fecha);
  await sql`INSERT INTO periodos (fecha_inicio, fecha_fin, limite_solicitudes)
    VALUES (${inicio}, ${fin}, ${limite}) ON CONFLICT (fecha_inicio) DO NOTHING`;
  const filas = await sql`SELECT * FROM periodos WHERE fecha_inicio = ${inicio}`;
  return filas[0] as Periodo;
}

/** Desde el martes se trabaja el periodo que empieza el jueves siguiente. */
export async function periodoSeleccionado(id?: string): Promise<{ actual: Periodo; lista: Periodo[] }> {
  const vigente = await asegurarPeriodo(sumarDias(hoyBogota(), 2));
  const lista = (await sql`SELECT * FROM periodos ORDER BY fecha_inicio DESC LIMIT 16`) as Periodo[];
  const actual = (id && lista.find((p) => p.id === id)) || vigente;
  return { actual, lista };
}

export function diasDePeriodo(p: Periodo): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(p.fecha_inicio, i));
}
