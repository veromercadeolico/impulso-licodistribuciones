"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ahoraBogota, duracion, fechaCorta, horario } from "@/lib/formato";
import { escapar, notificar } from "@/lib/notificar";
import { aMinutos, distanciaMetros, RADIO_PUNTO_M, tiempoIncompleto } from "@/lib/reglas";

const MAX_FOTO_BASE64 = 2_000_000;
const ANTICIPO_ENTRADA_MIN = 60;

async function turnoPropio(turnoId: string, impulsadoraId: string) {
  const [t] = await sql`SELECT t.*, t.inicio::text AS inicio_txt, t.fin::text AS fin_txt, p.nombre AS lugar, p.lat, p.lng
    FROM turnos t JOIN puntos p ON p.id = t.punto_id
    WHERE t.id = ${turnoId} AND t.impulsadora_id = ${impulsadoraId} AND t.publicado AND NOT t.cancelado`;
  return t;
}

export async function registrarAsistencia(entrada: {
  turnoId: string;
  tipo: "entrada" | "salida";
  fotoBase64: string;
  lat: number;
  lng: number;
}): Promise<{ error?: string }> {
  const usuario = await exigirRol("impulsadora");
  const { turnoId, tipo, fotoBase64, lat, lng } = entrada;
  if (tipo !== "entrada" && tipo !== "salida") return { error: "Registro no válido." };
  if (!fotoBase64 || fotoBase64.length > MAX_FOTO_BASE64) return { error: "La foto no es válida o es muy pesada." };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: "No se recibió tu ubicación." };

  const turno = await turnoPropio(turnoId, usuario.id);
  if (!turno) return { error: "Este turno no está asignado a ti." };

  const previos = await sql`SELECT tipo FROM asistencias WHERE turno_id = ${turnoId}`;
  const tipos = previos.map((p) => p.tipo);
  if (tipos.includes(tipo)) return { error: `La ${tipo} ya fue registrada.` };

  // En el ambiente de demostración se puede probar el registro a cualquier hora.
  if (tipo === "entrada" && process.env.MODO_DEMO !== "1") {
    const ahora = aMinutos(ahoraBogota());
    if (ahora < aMinutos(turno.inicio_txt) - ANTICIPO_ENTRADA_MIN) return { error: "Podrás registrar tu entrada desde una hora antes del turno." };
    if (ahora > aMinutos(turno.fin_txt)) return { error: "El turno ya terminó. Comunícate con Trade Marketing." };
  }
  if (tipo === "salida" && !tipos.includes("entrada")) {
    return { error: "Primero debes registrar tu entrada." };
  }

  const distancia = turno.lat != null && turno.lng != null ? distanciaMetros(lat, lng, turno.lat, turno.lng) : null;
  const fueraDeRango = distancia !== null && distancia > RADIO_PUNTO_M;
  const fotoId = randomUUID();
  await sql.transaction([
    sql`INSERT INTO fotos (id, contenido, mime) VALUES (${fotoId}, decode(${fotoBase64}, 'base64'), 'image/jpeg')`,
    sql`INSERT INTO asistencias (turno_id, tipo, foto_id, lat, lng, distancia_m, fuera_de_rango)
      VALUES (${turnoId}, ${tipo}, ${fotoId}, ${lat}, ${lng}, ${distancia}, ${fueraDeRango})`,
  ]);

  if (fueraDeRango) {
    const trade = await sql`SELECT id FROM usuarios WHERE rol = 'trade' AND activo`;
    await notificar(trade.map((u) => u.id), {
      titulo: "Registro lejos del punto programado",
      cuerpo: `${usuario.nombre} registró su ${tipo} a ${distancia} m de ${turno.lugar}.`,
      enlace: "/reportes",
    });
  }
  if (tipo === "salida") {
    const [marcas] = await sql`SELECT
      (SELECT registrado_en::text FROM asistencias WHERE turno_id = ${turnoId} AND tipo = 'entrada') AS entrada,
      (SELECT registrado_en::text FROM asistencias WHERE turno_id = ${turnoId} AND tipo = 'salida') AS salida`;
    const trabajado = aMinutos(marcas.salida) - aMinutos(marcas.entrada);
    const programado = aMinutos(turno.fin_txt) - aMinutos(turno.inicio_txt);
    if (tiempoIncompleto(trabajado, programado)) {
      const trade = await sql`SELECT id FROM usuarios WHERE rol = 'trade' AND activo`;
      await notificar(trade.map((u) => u.id), {
        titulo: "Turno con tiempo incompleto",
        cuerpo: `${usuario.nombre} trabajó ${duracion(trabajado)} de ${duracion(programado)} en ${turno.lugar}.`,
        enlace: "/reportes",
      });
    }
  }
  revalidatePath(`/turnos/${turnoId}`);
  return {};
}

export async function enviarReporteVentas(datos: FormData) {
  const usuario = await exigirRol("impulsadora");
  const turnoId = String(datos.get("turno"));
  const destino = `/turnos/${turnoId}`;
  const error = (m: string): never => redirect(`${destino}?error=${encodeURIComponent(m)}`);

  const turno = await turnoPropio(turnoId, usuario.id);
  if (!turno) error("Este turno no está asignado a ti.");

  const [{ salida, reporte }] = await sql`SELECT
    EXISTS (SELECT 1 FROM asistencias WHERE turno_id = ${turnoId} AND tipo = 'salida') AS salida,
    EXISTS (SELECT 1 FROM reportes_venta WHERE turno_id = ${turnoId}) AS reporte`;
  if (!salida) error("Registra tu salida antes de enviar las ventas.");
  if (reporte) error("El reporte de ventas de este turno ya fue enviado.");

  const items = [...datos.entries()]
    .filter(([k]) => k.startsWith("p_"))
    .map(([k, v]) => ({ item: Number(k.slice(2)), cantidad: Number(v) }))
    .filter((x) => x.cantidad !== 0);
  if (items.some((x) => !Number.isInteger(x.cantidad) || x.cantidad < 0)) error("Las cantidades deben ser números enteros.");

  const degustacion = await sql`SELECT id, asignado, marca, presentacion FROM degustacion WHERE turno_id = ${turnoId}`;
  const usos = degustacion.map((d) => ({
    id: d.id,
    usado: Number(datos.get(`u_${d.id}`)),
    sobrante: Number(datos.get(`s_${d.id}`)),
    asignado: d.asignado,
    etiqueta: `${d.presentacion} ${d.marca}`,
  }));
  for (const u of usos) {
    if (!Number.isInteger(u.usado) || !Number.isInteger(u.sobrante) || u.usado < 0 || u.sobrante < 0 || u.usado + u.sobrante !== u.asignado) {
      error(`En ${u.etiqueta}, lo usado más lo sobrante debe sumar ${u.asignado}.`);
    }
  }

  const observaciones = String(datos.get("observaciones") ?? "").trim() || null;
  const reporteId = randomUUID();
  await sql.transaction([
    sql`INSERT INTO reportes_venta (id, turno_id, observaciones) VALUES (${reporteId}, ${turnoId}, ${observaciones})`,
    sql`INSERT INTO reporte_items (reporte_id, producto_item, cantidad)
      SELECT ${reporteId}::uuid, x.item, x.cantidad
      FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS x(item int, cantidad int)`,
    sql`UPDATE degustacion d SET usado = x.usado, sobrante = x.sobrante
      FROM jsonb_to_recordset(${JSON.stringify(usos)}::jsonb) AS x(id uuid, usado int, sobrante int) WHERE d.id = x.id`,
  ]);

  const [detalle, destinatarios] = await Promise.all([
    sql`SELECT p.descripcion, i.cantidad FROM reporte_items i JOIN productos p ON p.item = i.producto_item
      WHERE i.reporte_id = ${reporteId} ORDER BY p.descripcion`,
    sql`SELECT id FROM usuarios WHERE activo AND (rol = 'trade' OR (rol = 'lider_canal' AND (canal IS NULL OR canal = ${turno.canal}))
        OR id = (SELECT vendedor_id FROM solicitudes WHERE id = ${turno.solicitud_id}))`,
  ]);
  const total = detalle.reduce((s, d) => s + d.cantidad, 0);
  const filasHtml = detalle.map((d) => `<tr><td>${escapar(d.descripcion)}</td><td align="right">${d.cantidad}</td></tr>`).join("");
  await notificar(destinatarios.map((d) => d.id), {
    titulo: `Ventas ${turno.lugar}: ${total} unidades`,
    cuerpo: `${usuario.nombre} reportó ${total} unidades el ${fechaCorta(turno.inicio_txt)}, turno de ${horario(turno.inicio_txt, turno.fin_txt)}.`,
    enlace: "/reportes",
    correo: true,
    detalleHtml: detalle.length
      ? `<table cellpadding="4"><tr><th align="left">Producto</th><th>Unidades</th></tr>${filasHtml}</table>`
      : "",
  });

  revalidatePath(destino);
  redirect(`${destino}?ok=${encodeURIComponent("Reporte de ventas enviado.")}`);
}
