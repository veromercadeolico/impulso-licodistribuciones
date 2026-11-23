"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ahoraBogota, hoyBogota, MUNICIPIOS } from "@/lib/formato";
import { asegurarPeriodo } from "@/lib/periodos";

const error = (m: string): never => redirect(`/solicitudes/nueva?error=${encodeURIComponent(m)}`);

export async function crearSolicitud(datos: FormData) {
  const usuario = await exigirRol("vendedor", "trade");
  const texto = (k: string, max: number) => String(datos.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const canal = texto("canal", 20);
  const fecha = texto("fecha", 10);
  const hora = texto("hora", 5);
  const marcas = [...new Set(datos.getAll("marca").map(String))];
  const lugar = texto("lugar", 120);
  const direccion = texto("direccion", 160) || null;
  const municipio = texto("municipio", 40);
  const notas = String(datos.get("notas") ?? "").trim().slice(0, 500) || null;
  const obsequios = String(datos.get("obsequios") ?? "").trim().slice(0, 300) || null;
  const prioridad = Number(datos.get("prioridad")) || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) error("Indica la fecha y la hora de la activación.");
  if (fecha < hoyBogota()) error("La fecha de la activación ya pasó.");
  if (marcas.length === 0) error("Selecciona al menos una marca para activar.");
  if (lugar.length < 2) error("Indica el lugar o establecimiento.");
  if (!MUNICIPIOS.includes(municipio)) error("Selecciona el municipio.");
  if (prioridad !== null && ![1, 2, 3].includes(prioridad)) error("La relevancia no es válida.");

  const validas = await sql`SELECT codigo FROM marcas WHERE codigo = ANY(${marcas})`;
  if (validas.length !== marcas.length) error("Alguna de las marcas no es válida.");

  const [punto] = await sql`INSERT INTO puntos (nombre, municipio, direccion)
    VALUES (${lugar}, ${municipio}, ${direccion})
    ON CONFLICT (lower(nombre), lower(municipio)) DO UPDATE SET direccion = COALESCE(EXCLUDED.direccion, puntos.direccion)
    RETURNING id`;
  const periodo = await asegurarPeriodo(fecha);
  const extemporanea = `${ahoraBogota()}:00` > periodo.limite_solicitudes.slice(0, 19);
  // Cada marca es una solicitud propia (una impulsadora por uniforme); el grupo las mantiene unidas.
  const grupo = marcas.length > 1 ? randomUUID() : null;

  await sql.transaction(
    marcas.map(
      (marca) => sql`INSERT INTO solicitudes (periodo_id, vendedor_id, canal, fecha, hora, marca, punto_id, notas, obsequios, prioridad, extemporanea, grupo)
        VALUES (${periodo.id}, ${usuario.id}, ${canal}, ${fecha}, ${hora}, ${marca}, ${punto.id}, ${notas}, ${obsequios}, ${prioridad}, ${extemporanea}, ${grupo})`,
    ),
  );

  revalidatePath("/solicitudes");
  const cuantas = marcas.length > 1 ? `Se enviaron ${marcas.length} solicitudes, una por marca` : "Solicitud enviada";
  const aviso = extemporanea
    ? `${cuantas} fuera de la fecha límite. Trade Marketing decidirá si alcanza a incluirla.`
    : `${cuantas} a Trade Marketing.`;
  redirect(`/solicitudes?p=${periodo.id}&ok=${encodeURIComponent(aviso)}`);
}

export async function retirarSolicitud(datos: FormData) {
  const usuario = await exigirRol("vendedor", "trade");
  const id = String(datos.get("id"));
  await sql.transaction([
    sql`DELETE FROM turnos t USING solicitudes s WHERE t.solicitud_id = s.id AND s.id = ${id}
      AND s.vendedor_id = ${usuario.id} AND s.estado = 'pendiente' AND NOT t.publicado`,
    sql`DELETE FROM solicitudes s WHERE s.id = ${id} AND s.vendedor_id = ${usuario.id} AND s.estado = 'pendiente'
      AND NOT EXISTS (SELECT 1 FROM turnos t WHERE t.solicitud_id = s.id AND t.publicado)`,
  ]);
  revalidatePath("/solicitudes");
  redirect(`/solicitudes?ok=${encodeURIComponent("Solicitud retirada.")}`);
}
