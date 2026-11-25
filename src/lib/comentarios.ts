import { sql } from "./db";

// Comentarios de la Gerencia comercial sobre solicitudes. Se guardan como avisos a Trade Marketing
// (sin cambios en la base de datos): el enlace del aviso lleva "&comentario=<id de la solicitud>".

export const enlaceComentario = (periodoId: string, solicitudId: string) =>
  `/programacion?p=${periodoId}&comentario=${solicitudId}#s-${solicitudId}`;

export type Comentario = { cuerpo: string; fecha: string };

/** Comentarios de una semana agrupados por solicitud (sin repetir el mismo aviso enviado a varias personas). */
export async function comentariosDeSemana(periodoId: string): Promise<Map<string, Comentario[]>> {
  const filas = await sql`SELECT DISTINCT ON (enlace, cuerpo, date_trunc('second', creado_en)) enlace, cuerpo,
      (creado_en AT TIME ZONE 'America/Bogota')::text AS fecha
    FROM notificaciones WHERE enlace LIKE ${`/programacion?p=${periodoId}&comentario=%`}
    ORDER BY enlace, cuerpo, date_trunc('second', creado_en), creado_en`;
  const mapa = new Map<string, Comentario[]>();
  for (const f of filas) {
    const id = /comentario=([0-9a-f-]{36})/.exec(f.enlace)?.[1];
    if (!id) continue;
    mapa.set(id, [...(mapa.get(id) ?? []), { cuerpo: f.cuerpo, fecha: f.fecha }].sort((a, b) => a.fecha.localeCompare(b.fecha)));
  }
  return mapa;
}
