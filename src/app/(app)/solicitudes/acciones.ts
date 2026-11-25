"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ahoraBogota, hoyBogota, MUNICIPIOS, PRESENTACIONES, SERVICIOS } from "@/lib/formato";
import { enlaceComentario } from "@/lib/comentarios";
import { escapar, notificar } from "@/lib/notificar";
import { asegurarPeriodo } from "@/lib/periodos";
import { esConsumoTarde, horaSegunCanal } from "@/lib/reglas";

const error = (m: string): never => redirect(`/solicitudes/nueva?error=${encodeURIComponent(m)}`);

export async function crearSolicitud(datos: FormData) {
  const usuario = await exigirRol("vendedor", "trade");
  const texto = (k: string, max: number) => String(datos.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const canal = texto("canal", 20);
  const fecha = texto("fecha", 10);
  const horaPedida = texto("hora", 5);
  // Consumo en la noche siempre es de 9:00 PM a 1:00 AM.
  const hora = horaSegunCanal(canal, horaPedida);
  const marcas = [...new Set(datos.getAll("marca").map(String))];
  const lugar = texto("lugar", 120);
  const direccion = texto("direccion", 160) || null;
  const municipio = texto("municipio", 40);
  const notas = String(datos.get("notas") ?? "").trim().slice(0, 500) || null;
  const obsequios = String(datos.get("obsequios") ?? "").trim().slice(0, 300) || null;
  const prioridad = Number(datos.get("prioridad")) || null;
  const servicio = String(datos.get("servicio") ?? "impulso");
  // Degustación que pide el vendedor (opcional): cantidad y presentación, de la marca de cada solicitud.
  const degCantidad = Number(datos.get("deg_cantidad")) || 0;
  const degPresentacion = texto("deg_presentacion", 20);
  if ((degCantidad && !degPresentacion) || (!degCantidad && degPresentacion)) error("Para la degustación indica la cantidad y la presentación, o deja las dos vacías.");
  if (degCantidad && (degCantidad < 1 || degCantidad > 20 || !Number.isInteger(degCantidad))) error("La cantidad de degustación debe estar entre 1 y 20.");
  if (degPresentacion && !PRESENTACIONES.includes(degPresentacion)) error("La presentación de la degustación no es válida.");
  const degustacionPedida = degCantidad ? JSON.stringify({ presentacion: degPresentacion, cantidad: degCantidad }) : null;
  if (!SERVICIOS[servicio]) error("Elige el tipo de servicio: Impulso o Bartender.");

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
  // Trade Marketing arma la programación: sus solicitudes nunca son extemporáneas.
  const esTrade = usuario.rol === "trade";
  const extemporanea = !esTrade && `${ahoraBogota()}:00` > periodo.limite_solicitudes.slice(0, 19);
  // Una solicitud por impulsadora: cada marca se repite tantas veces como impulsadoras pidieron (1 a 6).
  // El grupo las mantiene unidas.
  const unidades = marcas.flatMap((m) => Array<string>(Math.min(6, Math.max(1, Math.trunc(Number(datos.get(`cant_${m}`))) || 1))).fill(m));
  const grupo = unidades.length > 1 ? randomUUID() : null;

  await sql.transaction(
    unidades.map(
      (marca) => sql`INSERT INTO solicitudes (periodo_id, vendedor_id, canal, fecha, hora, marca, punto_id, notas, obsequios, prioridad, extemporanea, grupo, servicio, degustacion_pedida)
        VALUES (${periodo.id}, ${usuario.id}, ${canal}, ${fecha}, ${hora}, ${marca}, ${punto.id}, ${notas}, ${obsequios}, ${prioridad}, ${extemporanea}, ${grupo}, ${servicio}, ${degustacionPedida}::jsonb)`,
    ),
  );

  if (esConsumoTarde(canal, hora) && !esTrade) {
    // Consumo en la tarde es poco común: Trade Marketing lo confirma antes de aprobar.
    const trade = await sql`SELECT id FROM usuarios WHERE rol = 'trade' AND activo`;
    await notificar(trade.map((u) => u.id), {
      titulo: "Solicitud de Consumo en la tarde",
      cuerpo: `${usuario.nombre} pidió Consumo en la tarde: ${lugar} (${municipio}), ${fecha} a las ${hora}. Confírmala antes de aprobarla.`,
      enlace: `/programacion?p=${periodo.id}`,
    });
  }
  revalidatePath("/solicitudes");
  const cuantas = unidades.length > 1 ? `Se enviaron ${unidades.length} solicitudes, una por impulsadora` : "Solicitud enviada";
  if (esTrade) {
    // Trade va sumando solicitudes y las ve consolidadas en Programación.
    const msg = unidades.length > 1 ? `Se agregaron ${unidades.length} solicitudes a la programación, una por impulsadora.` : "Solicitud agregada a la programación.";
    if (datos.get("despues") === "otra") redirect(`/solicitudes/nueva?ok=${encodeURIComponent(msg)}`);
    redirect(`/programacion?p=${periodo.id}&ok=${encodeURIComponent(msg)}`);
  }
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

/** La Gerencia comercial deja un comentario sobre una solicitud; le llega a Trade Marketing como aviso y correo. */
export async function comentarSolicitud(datos: FormData) {
  const usuario = await exigirRol("director");
  const id = String(datos.get("id") ?? "");
  const texto = String(datos.get("comentario") ?? "").trim().slice(0, 500);
  const [s] = await sql`SELECT s.periodo_id, s.fecha::text, p.nombre AS lugar, v.nombre AS vendedor
    FROM solicitudes s JOIN puntos p ON p.id = s.punto_id JOIN usuarios v ON v.id = s.vendedor_id WHERE s.id = ${id}`;
  const volver = (tipo: "ok" | "error", m: string): never =>
    redirect(`/solicitudes?${s ? `p=${s.periodo_id}&` : ""}${tipo}=${encodeURIComponent(m)}#c-${id}`);
  if (!s) volver("error", "La solicitud ya no existe.");
  if (texto.length < 3) volver("error", "Escribe el comentario para Trade Marketing.");
  const trade = await sql`SELECT id FROM usuarios WHERE rol = 'trade' AND activo`;
  await notificar(trade.map((t) => t.id), {
    titulo: `Comentario de ${usuario.nombre}: ${s.lugar}`,
    cuerpo: `${usuario.nombre}: ${texto}`,
    enlace: enlaceComentario(s.periodo_id, id),
    correo: true,
    detalleHtml: `<p>Solicitud de ${escapar(s.vendedor)} para ${escapar(s.lugar)}, ${escapar(s.fecha)}.</p>`,
  });
  revalidatePath("/solicitudes");
  revalidatePath("/programacion");
  volver("ok", "Comentario enviado a Trade Marketing.");
}
