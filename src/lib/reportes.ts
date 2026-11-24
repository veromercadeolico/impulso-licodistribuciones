import { sql } from "./db";
import { ahoraBogota } from "./formato";
import { aMinutos, clasificarTurno, type EstadoCumplimiento } from "./reglas";

export type TurnoReporte = {
  id: string;
  inicio: string;
  fin: string;
  dia: string;
  canal: string;
  canal_nombre: string;
  lugar: string;
  municipio: string;
  impulsadora: string;
  entrada_hora: string | null;
  salida_hora: string | null;
  entrada_foto: string | null;
  salida_foto: string | null;
  distancia_m: number | null;
  fuera_de_rango: boolean;
  con_ventas: boolean;
  unidades: number;
  estado: EstadoCumplimiento;
  iniciado: boolean;
  terminado: boolean;
};

export async function turnosDelPeriodo(periodoId: string, canal?: string | null): Promise<TurnoReporte[]> {
  const filas = await sql`SELECT t.id, t.inicio::text, t.fin::text, t.inicio::date::text AS dia, t.canal,
      c.nombre AS canal_nombre, p.nombre AS lugar, p.municipio, u.nombre AS impulsadora,
      e.registrado_en::text AS entrada_hora, s.registrado_en::text AS salida_hora,
      e.foto_id AS entrada_foto, s.foto_id AS salida_foto, e.distancia_m,
      COALESCE(e.fuera_de_rango, false) AS fuera_de_rango,
      r.id IS NOT NULL AS con_ventas,
      COALESCE((SELECT sum(i.cantidad) FROM reporte_items i WHERE i.reporte_id = r.id), 0)::int AS unidades
    FROM turnos t
    JOIN canales c ON c.codigo = t.canal JOIN puntos p ON p.id = t.punto_id JOIN usuarios u ON u.id = t.impulsadora_id
    LEFT JOIN asistencias e ON e.turno_id = t.id AND e.tipo = 'entrada'
    LEFT JOIN asistencias s ON s.turno_id = t.id AND s.tipo = 'salida'
    LEFT JOIN reportes_venta r ON r.turno_id = t.id
    WHERE t.periodo_id = ${periodoId} AND t.publicado AND NOT t.cancelado AND t.servicio <> 'bartender'
      AND (${canal ?? null}::text IS NULL OR t.canal = ${canal ?? null})
    ORDER BY t.inicio, p.nombre`;
  const ahora = ahoraBogota();
  return filas.map((f) => ({
    ...(f as TurnoReporte),
    iniciado: f.inicio.slice(0, 16) <= ahora,
    terminado: f.con_ventas || f.fin.slice(0, 16) <= ahora,
    estado: clasificarTurno({
      entrada: !!f.entrada_hora,
      ventas: f.con_ventas,
      fueraDeRango: f.fuera_de_rango,
      minutosTrabajados: f.entrada_hora && f.salida_hora ? aMinutos(f.salida_hora) - aMinutos(f.entrada_hora) : null,
      minutosProgramados: aMinutos(f.fin) - aMinutos(f.inicio),
    }),
  }));
}

export type VentaDetalle = {
  turno_id: string;
  dia: string;
  canal: string;
  lugar: string;
  municipio: string;
  impulsadora: string;
  item: number;
  referencia: string;
  descripcion: string;
  marca: string;
  ml: number;
  unidades_caja: number;
  cantidad: number;
};

export async function ventasDelPeriodo(periodoId: string, canal?: string | null): Promise<VentaDetalle[]> {
  return (await sql`SELECT t.id AS turno_id, t.inicio::date::text AS dia, t.canal, p.nombre AS lugar, p.municipio,
      u.nombre AS impulsadora, pr.item, pr.referencia, pr.descripcion, pr.marca, pr.ml, pr.unidades_caja, i.cantidad
    FROM reporte_items i
    JOIN reportes_venta r ON r.id = i.reporte_id JOIN turnos t ON t.id = r.turno_id
    JOIN puntos p ON p.id = t.punto_id JOIN usuarios u ON u.id = t.impulsadora_id
    JOIN productos pr ON pr.item = i.producto_item
    WHERE t.periodo_id = ${periodoId} AND NOT t.cancelado
      AND (${canal ?? null}::text IS NULL OR t.canal = ${canal ?? null})
    ORDER BY t.inicio, p.nombre`) as VentaDetalle[];
}

export function agrupar<T>(filas: T[], clave: (f: T) => string): [string, T[]][] {
  const mapa = new Map<string, T[]>();
  for (const f of filas) {
    const k = clave(f);
    mapa.set(k, [...(mapa.get(k) ?? []), f]);
  }
  return [...mapa.entries()];
}
