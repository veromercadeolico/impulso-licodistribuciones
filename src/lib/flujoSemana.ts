import { sql } from "./db";
import { estadoDeAviso, pasoDeEnlace, prefijoFlujo } from "./flujo";

/** Estado del flujo de revisión de una semana, leído del último aviso del flujo. */
export async function estadoSemana(periodoId: string) {
  const [periodo] = await sql`SELECT estado FROM periodos WHERE id = ${periodoId}`;
  const [ultimo] = await sql`SELECT enlace, cuerpo, (creado_en AT TIME ZONE 'America/Bogota')::text AS fecha
    FROM notificaciones WHERE enlace LIKE ${`${prefijoFlujo(periodoId)}%`} ORDER BY creado_en DESC LIMIT 1`;
  // Momento del último envío a revisión: las aprobaciones por turno solo cuentan si son posteriores.
  const [envio] = await sql`SELECT max(creado_en)::text AS en FROM notificaciones WHERE enlace = ${`${prefijoFlujo(periodoId)}enviada`}`;
  return {
    enviadaEn: (envio?.en as string | null) ?? null,
    publicada: periodo?.estado === "publicado",
    estado: estadoDeAviso(ultimo?.enlace),
    paso: pasoDeEnlace(ultimo?.enlace),
    cuerpo: (ultimo?.cuerpo as string | undefined) ?? null,
    fecha: (ultimo?.fecha as string | undefined) ?? null,
  };
}
