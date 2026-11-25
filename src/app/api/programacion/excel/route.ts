import { usuarioActual } from "@/lib/auth";
import { sql } from "@/lib/db";
import {
  crearExcelProgramacion,
  type CanalExcel,
  type DegustacionExcel,
  type DisponibilidadExcel,
  type SolicitudExcel,
  type TurnoExcel,
} from "@/lib/excelProgramacion";
import { nombrePeriodo } from "@/lib/formato";

export async function GET(req: Request) {
  const usuario = await usuarioActual();
  if (usuario?.rol !== "trade" && usuario?.rol !== "admin" && usuario?.rol !== "supervisor") return new Response("No autorizado", { status: 403 });
  const periodoId = new URL(req.url).searchParams.get("p") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(periodoId)) return new Response("Periodo no válido", { status: 400 });
  // Con ?dia=AAAA-MM-DD sale solo ese día e incluye la propuesta aún sin aprobar, para revisarla antes de enviar.
  const diaTexto = new URL(req.url).searchParams.get("dia");
  if (diaTexto !== null && !/^\d{4}-\d{2}-\d{2}$/.test(diaTexto)) return new Response("Día no válido", { status: 400 });
  const dia = diaTexto;
  const borrador = dia !== null;

  const [periodo] = await sql`SELECT fecha_inicio::text, fecha_fin::text FROM periodos WHERE id = ${periodoId}`;
  if (!periodo) return new Response("Periodo no encontrado", { status: 404 });

  const [turnos, degustacion, solicitudes, impulsadoras, canales, oficina, disponibilidad] = await Promise.all([
    sql`SELECT t.id, t.inicio::date::text AS dia, t.inicio::text, t.fin::text, t.canal, c.nombre AS canal_nombre, c.orden,
        p.municipio, p.nombre AS lugar, p.direccion, t.marca, m.nombre AS marca_nombre, t.uniforme, u.nombre AS impulsadora,
        CASE WHEN t.servicio = 'bartender' THEN concat_ws('. ', 'BARTENDER', s.notas) ELSE s.notas END AS notas, s.obsequios, v.nombre AS vendedor, t.publicado, s.hora::text AS hora_solicitada
      FROM turnos t JOIN canales c ON c.codigo = t.canal JOIN puntos p ON p.id = t.punto_id
      JOIN marcas m ON m.codigo = t.marca JOIN usuarios u ON u.id = t.impulsadora_id
      LEFT JOIN solicitudes s ON s.id = t.solicitud_id LEFT JOIN usuarios v ON v.id = s.vendedor_id
      WHERE t.periodo_id = ${periodoId} AND NOT t.cancelado AND (s.id IS NULL OR s.estado = 'aprobada' OR (${borrador} AND s.estado = 'pendiente'))
        AND (${dia}::date IS NULL OR t.inicio::date = ${dia}::date)`,
    sql`SELECT d.turno_id, d.marca, d.presentacion, d.asignado, d.tipo FROM degustacion d
      JOIN turnos t ON t.id = d.turno_id LEFT JOIN solicitudes s ON s.id = t.solicitud_id
      WHERE t.periodo_id = ${periodoId} AND NOT t.cancelado AND (s.id IS NULL OR s.estado = 'aprobada' OR (${borrador} AND s.estado = 'pendiente'))
        AND (${dia}::date IS NULL OR t.inicio::date = ${dia}::date)`,
    sql`SELECT s.fecha::text, s.hora::text, c.nombre AS canal, p.municipio, p.nombre AS lugar, p.direccion, m.nombre AS marca,
        m.uniforme, s.prioridad, s.estado, u.nombre AS impulsadora, s.motivo_rechazo AS motivo, CASE WHEN s.servicio = 'bartender' THEN concat_ws('. ', 'BARTENDER', s.notas) ELSE s.notas END AS notas, s.obsequios,
        v.nombre AS vendedor, to_char(s.creado_en AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI') AS recibida
      FROM solicitudes s JOIN canales c ON c.codigo = s.canal JOIN puntos p ON p.id = s.punto_id
      JOIN marcas m ON m.codigo = s.marca JOIN usuarios v ON v.id = s.vendedor_id
      LEFT JOIN turnos t ON t.solicitud_id = s.id AND NOT t.cancelado LEFT JOIN usuarios u ON u.id = t.impulsadora_id
      WHERE s.periodo_id = ${periodoId} AND (${dia}::date IS NULL OR s.fecha = ${dia}::date) ORDER BY s.fecha, c.orden, s.hora, p.nombre`,
    sql`SELECT nombre, municipio FROM usuarios WHERE rol = 'impulsadora' AND activo AND nombre NOT ILIKE 'Impulsadora Demo%'
      ORDER BY municipio NULLS LAST, nombre`,
    sql`SELECT c.codigo, c.meta_semanal, count(t.id)::int AS turnos FROM canales c
      LEFT JOIN turnos t ON t.canal = c.codigo AND t.periodo_id = ${periodoId} AND NOT t.cancelado
        AND EXISTS (SELECT 1 FROM solicitudes s WHERE s.id = t.solicitud_id AND s.estado = 'aprobada')
      GROUP BY c.codigo ORDER BY c.orden`,
    sql`SELECT marca, presentacion, cantidad FROM inventario_oficina WHERE periodo_id = ${periodoId}`,
    sql`SELECT u.nombre, d.fecha::text, d.franja FROM disponibilidad d JOIN usuarios u ON u.id = d.impulsadora_id
      JOIN periodos p ON d.fecha BETWEEN p.fecha_inicio AND p.fecha_fin WHERE p.id = ${periodoId}`,
  ]);

  const contenido = await crearExcelProgramacion({
    turnos: turnos as TurnoExcel[],
    degustacion: degustacion as DegustacionExcel[],
    solicitudes: solicitudes as SolicitudExcel[],
    impulsadoras: impulsadoras as { nombre: string; municipio: string | null }[],
    canales: canales as CanalExcel[],
    disponibilidad: disponibilidad as DisponibilidadExcel[],
    oficina: new Map(oficina.map((o) => [`${o.marca}|${o.presentacion}`, o.cantidad])),
    soloDia: dia,
  });
  const nombre = dia
    ? `revision-programacion-${dia}.xlsx`
    : `programacion-impulso-${nombrePeriodo(periodo.fecha_inicio, periodo.fecha_fin).replace(/\s+/g, "-")}.xlsx`;
  return new Response(contenido as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
