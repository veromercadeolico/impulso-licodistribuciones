"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fechaCorta, hora as horaTexto, nombrePeriodo, PRESENTACIONES } from "@/lib/formato";
import { notificar } from "@/lib/notificar";
import {
  claveDisponibilidad,
  DURACION_TURNO_MIN,
  evaluarTurno,
  generarPropuesta,
  requiereMotivo,
  sumarMinutos,
  type TurnoHorario,
} from "@/lib/reglas";

const ruta = (p: string, ancla = "") => `/programacion?p=${p}${ancla}`;
// Los avisos de una solicitud se muestran dentro de su tarjeta (s=id) para que se vean junto al formulario.
const volver = (p: string, tipo: "ok" | "error", m: string, ancla = ""): never =>
  redirect(`/programacion?p=${p}&${tipo}=${encodeURIComponent(m)}${ancla.startsWith("#s-") ? `&s=${ancla.slice(3)}` : ""}${ancla}`);

async function disponiblesDe(periodoId: string): Promise<Set<string>> {
  const filas = await sql`SELECT d.impulsadora_id, d.fecha::text, d.franja FROM disponibilidad d
    JOIN periodos p ON d.fecha BETWEEN p.fecha_inicio AND p.fecha_fin WHERE p.id = ${periodoId}`;
  return new Set(filas.map((f) => `${f.impulsadora_id}|${f.fecha}|${f.franja}`));
}

async function recalcularAlertas(periodoId: string) {
  const [turnos, disponibles] = await Promise.all([
    sql`SELECT t.id, t.impulsadora_id, t.inicio::text, t.fin::text, p.municipio, u.municipio AS municipio_imp
      FROM turnos t JOIN puntos p ON p.id = t.punto_id JOIN usuarios u ON u.id = t.impulsadora_id
      WHERE t.periodo_id = ${periodoId} AND NOT t.cancelado`,
    disponiblesDe(periodoId),
  ]);
  const horarios: TurnoHorario[] = turnos.map((t) => ({
    id: t.id,
    impulsadoraId: t.impulsadora_id,
    inicio: t.inicio,
    fin: t.fin,
  }));
  const datos = turnos.map((t) => ({
    id: t.id,
    alertas: evaluarTurno(
      { id: t.id, impulsadoraId: t.impulsadora_id, inicio: t.inicio, fin: t.fin, municipio: t.municipio },
      horarios,
      {
        municipioImpulsadora: t.municipio_imp,
        disponible: disponibles.has(claveDisponibilidad(t.impulsadora_id, t.inicio)),
      },
    ),
  }));
  if (datos.length) {
    await sql`UPDATE turnos t SET alertas = x.alertas
      FROM jsonb_to_recordset(${JSON.stringify(datos)}::jsonb) AS x(id uuid, alertas jsonb) WHERE t.id = x.id`;
  }
}

export async function proponerProgramacion(datos: FormData) {
  await exigirRol("trade");
  const periodoId = String(datos.get("periodo"));

  await sql`DELETE FROM turnos t USING solicitudes s
    WHERE t.solicitud_id = s.id AND t.periodo_id = ${periodoId} AND s.estado = 'pendiente'
      AND NOT t.publicado AND NOT t.ajuste_manual`;

  const [solicitudes, impulsadoras, fijos, disponibles] = await Promise.all([
    sql`SELECT s.id, s.prioridad, s.creado_en::text AS creado, s.fecha::text, s.hora::text, s.canal, s.punto_id, s.marca,
        m.uniforme, p.municipio
      FROM solicitudes s JOIN puntos p ON p.id = s.punto_id JOIN marcas m ON m.codigo = s.marca
      WHERE s.periodo_id = ${periodoId} AND s.estado = 'pendiente'
        AND NOT EXISTS (SELECT 1 FROM turnos t WHERE t.solicitud_id = s.id)`,
    sql`SELECT id, nombre, municipio FROM usuarios WHERE rol = 'impulsadora' AND activo`,
    sql`SELECT impulsadora_id, inicio::text, fin::text FROM turnos WHERE periodo_id = ${periodoId} AND NOT cancelado`,
    disponiblesDe(periodoId),
  ]);

  if (!disponibles.size) volver(periodoId, "error", "Primero marca la disponibilidad de las impulsadoras.");

  const porId = new Map(solicitudes.map((s) => [s.id, s]));
  const { asignaciones, sinCobertura } = generarPropuesta(
    solicitudes.map((s) => {
      const inicio = `${s.fecha} ${s.hora.slice(0, 5)}`;
      return {
        id: s.id,
        prioridad: s.prioridad,
        creadoEn: s.creado,
        municipio: s.municipio,
        inicio,
        fin: sumarMinutos(inicio, DURACION_TURNO_MIN),
      };
    }),
    impulsadoras,
    disponibles,
    fijos.map((f) => ({ impulsadoraId: f.impulsadora_id, inicio: f.inicio, fin: f.fin })),
  );

  const filas = asignaciones.map((a) => {
    const s = porId.get(a.solicitudId)!;
    const inicio = `${s.fecha} ${s.hora.slice(0, 5)}`;
    return {
      solicitud_id: s.id,
      impulsadora_id: a.impulsadoraId,
      canal: s.canal,
      punto_id: s.punto_id,
      marca: s.marca,
      uniforme: s.uniforme,
      inicio,
      fin: sumarMinutos(inicio, DURACION_TURNO_MIN),
    };
  });
  if (filas.length) {
    await sql`INSERT INTO turnos (periodo_id, solicitud_id, impulsadora_id, canal, punto_id, marca, uniforme, inicio, fin)
      SELECT ${periodoId}::uuid, x.solicitud_id, x.impulsadora_id, x.canal, x.punto_id, x.marca, x.uniforme, x.inicio, x.fin
      FROM jsonb_to_recordset(${JSON.stringify(filas)}::jsonb) AS x(solicitud_id uuid, impulsadora_id uuid, canal text,
        punto_id uuid, marca text, uniforme text, inicio timestamp, fin timestamp)`;
  }
  await recalcularAlertas(periodoId);
  revalidatePath("/programacion");
  volver(periodoId, "ok", `Propuesta lista: ${filas.length} asignadas y ${sinCobertura.length} sin cobertura.`);
}

export async function aprobarSolicitud(datos: FormData) {
  const autor = await exigirRol("trade");
  const id = String(datos.get("id"));
  const periodoId = String(datos.get("periodo"));
  const impulsadoraId = String(datos.get("impulsadora") ?? "");
  const horaInicio = String(datos.get("hora_inicio") ?? "");
  const horaFin = String(datos.get("hora_fin") ?? "");
  const motivoExcepcion = String(datos.get("motivo_excepcion") ?? "").trim() || null;
  const motivoCambio = String(datos.get("motivo_cambio") ?? "").trim();
  const ancla = `#s-${id}`;

  if (!impulsadoraId) volver(periodoId, "error", "Asigna una impulsadora antes de aprobar.", ancla);
  const [s] = await sql`SELECT s.*, s.fecha::text AS dia, m.uniforme, p.municipio, p.nombre AS lugar
    FROM solicitudes s JOIN marcas m ON m.codigo = s.marca JOIN puntos p ON p.id = s.punto_id WHERE s.id = ${id}`;
  if (!s) volver(periodoId, "error", "La solicitud ya no existe.");

  const inicio = `${s.dia} ${horaInicio}`;
  const diaFin = horaFin <= horaInicio ? sumarMinutos(`${s.dia} 00:00`, 1440).slice(0, 10) : s.dia;
  const fin = `${diaFin} ${horaFin}`;

  const [previos, otros, [imp], disponibles] = await Promise.all([
    sql`SELECT id, publicado, impulsadora_id, inicio::text, fin::text FROM turnos WHERE solicitud_id = ${id} AND NOT cancelado`,
    sql`SELECT id, impulsadora_id, inicio::text, fin::text FROM turnos
      WHERE periodo_id = ${periodoId} AND NOT cancelado AND impulsadora_id = ${impulsadoraId}
        AND solicitud_id IS DISTINCT FROM ${id}`,
    sql`SELECT nombre, municipio FROM usuarios WHERE id = ${impulsadoraId} AND rol = 'impulsadora'`,
    disponiblesDe(periodoId),
  ]);
  const previo = previos[0];

  const alertas = evaluarTurno(
    { impulsadoraId, inicio, fin, municipio: s.municipio },
    otros.map((o) => ({ id: o.id, impulsadoraId: o.impulsadora_id, inicio: o.inicio, fin: o.fin })),
    { municipioImpulsadora: imp?.municipio ?? null, disponible: disponibles.has(claveDisponibilidad(impulsadoraId, inicio)) },
  );
  if (requiereMotivo(alertas) && !motivoExcepcion) {
    const detalle = alertas.filter((a) => a.requiereMotivo).map((a) => a.mensaje).join(" ");
    volver(periodoId, "error", `${detalle} Escribe el motivo de la excepción para aprobar.`, ancla);
  }
  if (previo?.publicado && !motivoCambio) {
    volver(periodoId, "error", "Este turno ya está publicado: escribe el motivo del cambio.", ancla);
  }

  const [periodo] = await sql`SELECT estado FROM periodos WHERE id = ${periodoId}`;
  const publicado = periodo.estado === "publicado";
  const [turno] = await sql`INSERT INTO turnos (periodo_id, solicitud_id, impulsadora_id, canal, punto_id, marca, uniforme,
      inicio, fin, alertas, motivo_excepcion, ajuste_manual, publicado)
    VALUES (${periodoId}, ${id}, ${impulsadoraId}, ${s.canal}, ${s.punto_id}, ${s.marca}, ${s.uniforme}, ${inicio}, ${fin},
      ${JSON.stringify(alertas)}::jsonb, ${motivoExcepcion}, true, ${publicado})
    ON CONFLICT (solicitud_id) DO UPDATE SET impulsadora_id = EXCLUDED.impulsadora_id, inicio = EXCLUDED.inicio,
      fin = EXCLUDED.fin, alertas = EXCLUDED.alertas, motivo_excepcion = EXCLUDED.motivo_excepcion,
      ajuste_manual = true, cancelado = false, publicado = turnos.publicado OR EXCLUDED.publicado
    RETURNING id`;
  await sql`UPDATE solicitudes SET estado = 'aprobada', motivo_rechazo = NULL WHERE id = ${id}`;
  await recalcularAlertas(periodoId);

  if (publicado) {
    const descripcion = `${s.lugar}, ${fechaCorta(inicio)} de ${horaTexto(inicio)} a ${horaTexto(fin)}`;
    if (previo?.publicado) {
      await sql`INSERT INTO cambios_turno (turno_id, autor_id, motivo, detalle)
        VALUES (${turno.id}, ${autor.id}, ${motivoCambio}, ${`Ahora: ${imp.nombre}, ${descripcion}`})`;
    }
    await notificar([s.vendedor_id, impulsadoraId, previo?.impulsadora_id], {
      titulo: previo?.publicado ? "Cambio en la programación" : "Turno aprobado",
      cuerpo: `${descripcion} con ${imp.nombre}.${motivoCambio ? ` Motivo: ${motivoCambio}` : ""}`,
      enlace: "/calendario",
      correo: true,
    });
  }
  revalidatePath("/programacion");
  volver(periodoId, "ok", "Solicitud aprobada.", ancla);
}

export async function rechazarSolicitud(datos: FormData) {
  const autor = await exigirRol("trade");
  const id = String(datos.get("id"));
  const periodoId = String(datos.get("periodo"));
  const motivo = String(datos.get("motivo") ?? "").trim();
  if (!motivo) volver(periodoId, "error", "Escribe el motivo para no aprobar la solicitud.", `#s-${id}`);

  const [s] = await sql`SELECT s.vendedor_id, s.fecha::text, p.nombre AS lugar, pe.estado AS periodo_estado,
      t.id AS turno_id, t.publicado, t.impulsadora_id
    FROM solicitudes s JOIN puntos p ON p.id = s.punto_id JOIN periodos pe ON pe.id = s.periodo_id
    LEFT JOIN turnos t ON t.solicitud_id = s.id AND NOT t.cancelado WHERE s.id = ${id}`;

  if (s.turno_id && s.publicado) {
    await sql.transaction([
      sql`UPDATE turnos SET cancelado = true WHERE id = ${s.turno_id}`,
      sql`INSERT INTO cambios_turno (turno_id, autor_id, motivo, detalle)
        VALUES (${s.turno_id}, ${autor.id}, ${motivo}, 'Turno cancelado')`,
    ]);
  } else if (s.turno_id) {
    await sql`DELETE FROM turnos WHERE id = ${s.turno_id}`;
  }
  await sql`UPDATE solicitudes SET estado = 'rechazada', motivo_rechazo = ${motivo} WHERE id = ${id}`;
  await recalcularAlertas(periodoId);

  if (s.periodo_estado === "publicado") {
    await notificar([s.vendedor_id, s.publicado ? s.impulsadora_id : null], {
      titulo: "Solicitud no aprobada",
      cuerpo: `${s.lugar}, ${fechaCorta(s.fecha)}. Motivo: ${motivo}`,
      enlace: "/solicitudes",
      correo: true,
    });
  }
  revalidatePath("/programacion");
  volver(periodoId, "ok", "Solicitud marcada como no aprobada.", `#s-${id}`);
}

export async function aprobarSinAlertas(datos: FormData) {
  await exigirRol("trade");
  const periodoId = String(datos.get("periodo"));
  const filas = await sql`UPDATE solicitudes s SET estado = 'aprobada'
    FROM turnos t WHERE t.solicitud_id = s.id AND s.periodo_id = ${periodoId} AND s.estado = 'pendiente'
      AND NOT t.cancelado AND NOT t.alertas @> '[{"requiereMotivo": true}]'::jsonb RETURNING s.id`;
  revalidatePath("/programacion");
  volver(periodoId, "ok", `${filas.length} solicitudes aprobadas.`);
}

export async function publicarProgramacion(datos: FormData) {
  await exigirRol("trade");
  const periodoId = String(datos.get("periodo"));
  await recalcularAlertas(periodoId);

  const [{ pendientes, sin_motivo }] = await sql`SELECT
    (SELECT count(*)::int FROM solicitudes WHERE periodo_id = ${periodoId} AND estado = 'pendiente') AS pendientes,
    (SELECT count(*)::int FROM turnos WHERE periodo_id = ${periodoId} AND NOT cancelado AND motivo_excepcion IS NULL
       AND alertas @> '[{"requiereMotivo": true}]'::jsonb) AS sin_motivo`;
  if (pendientes > 0) volver(periodoId, "error", `Faltan ${pendientes} solicitudes por aprobar o rechazar.`);
  if (sin_motivo > 0) volver(periodoId, "error", `Hay ${sin_motivo} turnos con alertas sin motivo de excepción.`);

  const nuevos = await sql`UPDATE turnos SET publicado = true
    WHERE periodo_id = ${periodoId} AND NOT cancelado AND NOT publicado RETURNING impulsadora_id`;
  const [p] = await sql`UPDATE periodos SET estado = 'publicado', publicado_en = now() WHERE id = ${periodoId}
    RETURNING fecha_inicio::text, fecha_fin::text`;
  const vendedores = await sql`SELECT DISTINCT vendedor_id FROM solicitudes WHERE periodo_id = ${periodoId}`;
  const nombre = nombrePeriodo(p.fecha_inicio, p.fecha_fin);

  await notificar(vendedores.map((v) => v.vendedor_id), {
    titulo: `Programación publicada: ${nombre}`,
    cuerpo: "Ya puedes ver qué solicitudes se aprobaron y cuáles no.",
    enlace: `/solicitudes?p=${periodoId}`,
    correo: true,
  });
  await notificar(nuevos.map((t) => t.impulsadora_id), {
    titulo: `Tus turnos del ${nombre}`,
    cuerpo: "Ya está publicada tu programación. Revisa punto, horario y uniforme.",
    enlace: "/turnos",
    correo: true,
  });
  revalidatePath("/programacion");
  volver(periodoId, "ok", "Programación publicada. Vendedores e impulsadoras ya fueron avisados.");
}

export async function actualizarLimite(datos: FormData) {
  await exigirRol("trade");
  const periodoId = String(datos.get("periodo"));
  const limite = String(datos.get("limite") ?? "").replace("T", " ");
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(limite)) volver(periodoId, "error", "La fecha límite no es válida.");
  await sql`UPDATE periodos SET limite_solicitudes = ${limite} WHERE id = ${periodoId}`;
  revalidatePath("/programacion");
  redirect(`${ruta(periodoId)}&ok=${encodeURIComponent("Fecha límite actualizada.")}`);
}

export async function guardarDisponibilidad(datos: FormData) {
  await exigirRol("trade");
  const periodoId = String(datos.get("periodo"));
  const filas = datos.getAll("d").map((v) => {
    const [impulsadora_id, fecha, franja] = String(v).split("|");
    return { impulsadora_id, fecha, franja };
  });
  await sql.transaction([
    sql`DELETE FROM disponibilidad d USING periodos p
      WHERE p.id = ${periodoId} AND d.fecha BETWEEN p.fecha_inicio AND p.fecha_fin`,
    sql`INSERT INTO disponibilidad (impulsadora_id, fecha, franja)
      SELECT x.impulsadora_id, x.fecha, x.franja
      FROM jsonb_to_recordset(${JSON.stringify(filas)}::jsonb) AS x(impulsadora_id uuid, fecha date, franja text)`,
  ]);
  await recalcularAlertas(periodoId);
  revalidatePath("/programacion");
  redirect(`/programacion/disponibilidad?p=${periodoId}&ok=${encodeURIComponent("Disponibilidad guardada.")}`);
}

const aDegustacion = (p: string, tipo: "ok" | "error", m: string): never =>
  redirect(`/programacion/degustacion?p=${p}&${tipo}=${encodeURIComponent(m)}`);

export async function asignarDegustacion(datos: FormData) {
  await exigirRol("trade");
  const periodoId = String(datos.get("periodo"));
  const turnoId = String(datos.get("turno"));
  const marca = String(datos.get("marca"));
  const presentacion = String(datos.get("presentacion"));
  const tipo = datos.get("tipo") === "obsequio" ? "obsequio" : "degustacion";
  const cantidad = Number(datos.get("cantidad"));
  if (!PRESENTACIONES.includes(presentacion) || !Number.isInteger(cantidad) || cantidad <= 0) {
    aDegustacion(periodoId, "error", "Indica una presentación y una cantidad válidas.");
  }
  await sql`INSERT INTO degustacion (turno_id, marca, presentacion, asignado, tipo)
    VALUES (${turnoId}, ${marca}, ${presentacion}, ${cantidad}, ${tipo})
    ON CONFLICT (turno_id, marca, presentacion) DO UPDATE SET asignado = EXCLUDED.asignado, tipo = EXCLUDED.tipo`;
  revalidatePath("/programacion/degustacion");
  aDegustacion(periodoId, "ok", tipo === "obsequio" ? "Obsequio asignado." : "Degustación asignada.");
}

export async function quitarDegustacion(datos: FormData) {
  await exigirRol("trade");
  await sql`DELETE FROM degustacion WHERE id = ${String(datos.get("id"))} AND usado IS NULL`;
  revalidatePath("/programacion/degustacion");
  aDegustacion(String(datos.get("periodo")), "ok", "Degustación retirada.");
}

export async function guardarOficina(datos: FormData) {
  await exigirRol("trade");
  const periodoId = String(datos.get("periodo"));
  const filas = [...datos.entries()]
    .filter(([k]) => k.startsWith("of|"))
    .map(([k, v]) => {
      const [, marca, presentacion] = k.split("|");
      return { marca, presentacion, cantidad: Math.max(0, Math.trunc(Number(v)) || 0) };
    });
  if (filas.length) {
    await sql`INSERT INTO inventario_oficina (periodo_id, marca, presentacion, cantidad)
      SELECT ${periodoId}::uuid, x.marca, x.presentacion, x.cantidad
      FROM jsonb_to_recordset(${JSON.stringify(filas)}::jsonb) AS x(marca text, presentacion text, cantidad int)
      ON CONFLICT (periodo_id, marca, presentacion) DO UPDATE SET cantidad = EXCLUDED.cantidad`;
  }
  revalidatePath("/programacion/degustacion");
  aDegustacion(periodoId, "ok", "Inventario de oficina guardado.");
}
