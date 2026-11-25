"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fechaCorta, hora as horaTexto, nombrePeriodo, PRESENTACIONES } from "@/lib/formato";
import { DETALLE_APROBADO_TURNO, enlaceFlujo, pasosPermitidos, puedeEditar, puedePublicar, type Paso } from "@/lib/flujo";
import { estadoSemana } from "@/lib/flujoSemana";
import { notificar } from "@/lib/notificar";
import {
  claveDisponibilidad,
  DEGUSTACION_POR_CANAL,
  DURACION_TURNO_MIN,
  esConsumoTarde,
  evaluarTurno,
  generarPropuesta,
  requiereMotivo,
  sinImpulsoEstaSemana,
  sumarMinutos,
  type TurnoHorario,
} from "@/lib/reglas";

const ruta = (p: string, ancla = "") => `/programacion?p=${p}${ancla}`;

/** Exige que el usuario pueda asignar, aprobar o rechazar solicitudes en el paso actual de la semana. */
async function exigirEdicion(periodoId: string) {
  const usuario = await exigirRol("trade", "supervisor");
  const { estado, publicada } = await estadoSemana(periodoId);
  if (!puedeEditar(usuario.rol, estado, publicada)) {
    volver(periodoId, "error", estado === "en_revision"
      ? "La programación está en revisión de Supervisión. Espera su respuesta o retómala."
      : "La programación ya fue aprobada por Supervisión. Si necesitas cambios, retómala.");
  }
  return usuario;
}
// Los avisos de una solicitud se muestran dentro de su tarjeta (s=id) para que se vean junto al formulario.
const volver = (p: string, tipo: "ok" | "error", m: string, ancla = ""): never =>
  redirect(`/programacion?p=${p}&${tipo}=${encodeURIComponent(m)}${ancla.startsWith("#s-") ? `&s=${ancla.slice(3)}` : ""}${ancla}`);

async function disponiblesDe(periodoId: string): Promise<Set<string>> {
  const filas = await sql`SELECT d.impulsadora_id, d.fecha::text, d.franja FROM disponibilidad d
    JOIN periodos p ON d.fecha BETWEEN p.fecha_inicio AND p.fecha_fin WHERE p.id = ${periodoId}`;
  return new Set(filas.map((f) => `${f.impulsadora_id}|${f.fecha}|${f.franja}`));
}

/**
 * Pone degustación a los turnos de la semana que todavía no tienen ninguna: la que pidió el vendedor en la
 * solicitud y, si no pidió, la de la tabla por canal. Siempre de la marca del turno.
 */
async function asignarDegustacionBase(periodoId: string) {
  const tabla = Object.entries(DEGUSTACION_POR_CANAL).map(([canal, d]) => ({ canal, ...d }));
  await sql`INSERT INTO degustacion (turno_id, marca, presentacion, asignado, tipo)
    SELECT t.id, t.marca, COALESCE(s.degustacion_pedida->>'presentacion', x.presentacion),
      COALESCE((s.degustacion_pedida->>'cantidad')::int, x.cantidad), 'degustacion'
    FROM turnos t LEFT JOIN solicitudes s ON s.id = t.solicitud_id
    LEFT JOIN jsonb_to_recordset(${JSON.stringify(tabla)}::jsonb) AS x(canal text, presentacion text, cantidad int) ON x.canal = t.canal
    WHERE t.periodo_id = ${periodoId} AND NOT t.cancelado AND NOT EXISTS (SELECT 1 FROM degustacion d WHERE d.turno_id = t.id)
      AND COALESCE(s.degustacion_pedida->>'presentacion', x.presentacion) IS NOT NULL
    ON CONFLICT (turno_id, marca, presentacion) DO NOTHING`;
}

/**
 * Eventos de la propuesta (aún sin publicar) asignados a una impulsadora que vive en otro municipio, por ejemplo
 * alguien de Armenia para un evento en Montenegro. Avisa a Trade Marketing para que lo revise antes de aprobar.
 */
async function avisarEventosFuera(periodoId: string): Promise<number> {
  const eventos = await sql`SELECT t.inicio::text, p.nombre AS lugar, p.municipio, u.nombre AS impulsadora, u.municipio AS vive
    FROM turnos t JOIN puntos p ON p.id = t.punto_id JOIN usuarios u ON u.id = t.impulsadora_id
    WHERE t.periodo_id = ${periodoId} AND t.canal = 'EVENTOS' AND NOT t.cancelado AND NOT t.publicado
      AND u.municipio IS NOT NULL AND u.municipio <> p.municipio
    ORDER BY t.inicio`;
  if (!eventos.length) return 0;
  const trade = await sql`SELECT id FROM usuarios WHERE rol = 'trade' AND activo`;
  const lista = eventos
    .map((e) => `${fechaCorta(e.inicio)} ${horaTexto(e.inicio)}, ${e.lugar} (${e.municipio}): ${e.impulsadora}, vive en ${e.vive}`)
    .join(". ");
  await notificar(trade.map((u) => u.id), {
    titulo: eventos.length === 1 ? "Evento con impulsadora de otro municipio" : `${eventos.length} eventos con impulsadora de otro municipio`,
    cuerpo: `Revisa antes de aprobar. ${lista}.`,
    enlace: `/programacion?p=${periodoId}`,
  });
  return eventos.length;
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
  await exigirEdicion(periodoId);

  await sql`DELETE FROM turnos t USING solicitudes s
    WHERE t.solicitud_id = s.id AND t.periodo_id = ${periodoId} AND s.estado = 'pendiente'
      AND NOT t.publicado AND NOT t.ajuste_manual`;

  const [[semana], todasPendientes, impulsadoras, fijos, disponibles] = await Promise.all([
    sql`SELECT fecha_inicio::text FROM periodos WHERE id = ${periodoId}`,
    sql`SELECT s.id, s.prioridad, s.creado_en::text AS creado, s.fecha::text, s.hora::text, s.canal, s.punto_id, s.marca,
        s.servicio, m.uniforme, p.municipio, p.nombre AS lugar, p.direccion
      FROM solicitudes s JOIN puntos p ON p.id = s.punto_id JOIN marcas m ON m.codigo = s.marca
      WHERE s.periodo_id = ${periodoId} AND s.estado = 'pendiente'
        AND NOT EXISTS (SELECT 1 FROM turnos t WHERE t.solicitud_id = s.id)`,
    sql`SELECT id, nombre, municipio FROM usuarios WHERE rol = 'impulsadora' AND activo`,
    sql`SELECT impulsadora_id, inicio::text, fin::text, canal FROM turnos WHERE periodo_id = ${periodoId} AND NOT cancelado`,
    disponiblesDe(periodoId),
  ]);

  if (!disponibles.size) volver(periodoId, "error", "Primero marca la disponibilidad de las impulsadoras.");

  // Municipios o sectores sin impulso esta semana: sus solicitudes quedan sin impulsadora.
  const solicitudes = todasPendientes.filter((s) => !sinImpulsoEstaSemana(semana.fecha_inicio, [s.municipio, s.lugar, s.direccion]));
  const porId = new Map(solicitudes.map((s) => [s.id, s]));
  const { asignaciones, sinCobertura } = generarPropuesta(
    solicitudes.map((s) => {
      const inicio = `${s.fecha} ${s.hora.slice(0, 5)}`;
      return {
        id: s.id,
        prioridad: s.prioridad,
        creadoEn: s.creado,
        municipio: s.municipio,
        canal: s.canal,
        inicio,
        fin: sumarMinutos(inicio, DURACION_TURNO_MIN),
      };
    }),
    impulsadoras,
    disponibles,
    fijos.map((f) => ({ impulsadoraId: f.impulsadora_id, inicio: f.inicio, fin: f.fin, canal: f.canal })),
  );

  const filas = asignaciones.map((a) => {
    const s = porId.get(a.solicitudId)!;
    // El horario puede quedar corrido media hora para respetar el descanso de la impulsadora.
    return {
      solicitud_id: s.id,
      impulsadora_id: a.impulsadoraId,
      canal: s.canal,
      punto_id: s.punto_id,
      marca: s.marca,
      uniforme: s.uniforme,
      servicio: s.servicio,
      inicio: a.inicio,
      fin: a.fin,
    };
  });
  if (filas.length) {
    await sql`INSERT INTO turnos (periodo_id, solicitud_id, impulsadora_id, canal, punto_id, marca, uniforme, servicio, inicio, fin)
      SELECT ${periodoId}::uuid, x.solicitud_id, x.impulsadora_id, x.canal, x.punto_id, x.marca, x.uniforme, x.servicio, x.inicio, x.fin
      FROM jsonb_to_recordset(${JSON.stringify(filas)}::jsonb) AS x(solicitud_id uuid, impulsadora_id uuid, canal text,
        punto_id uuid, marca text, uniforme text, servicio text, inicio timestamp, fin timestamp)`;
  }
  await asignarDegustacionBase(periodoId);
  await recalcularAlertas(periodoId);
  const eventosFuera = await avisarEventosFuera(periodoId);
  const corridos = asignaciones.filter((a) => a.corridoMin !== 0).length;
  revalidatePath("/programacion");
  volver(
    periodoId,
    "ok",
    `Propuesta lista: ${filas.length} asignadas y ${sinCobertura.length} sin cobertura.` +
      (todasPendientes.length > solicitudes.length ? ` ${todasPendientes.length - solicitudes.length} quedaron sin impulso por ser de municipios bloqueados esta semana.` : "") +
      (eventosFuera ? ` Revisa ${eventosFuera === 1 ? "1 evento asignado" : `${eventosFuera} eventos asignados`} a impulsadoras de otro municipio (te llegó el aviso).` : "") +
      (corridos ? ` ${corridos === 1 ? "1 turno quedó corrido" : `${corridos} turnos quedaron corridos`} media hora para respetar el descanso (míralos en el Excel por día).` : ""),
  );
}

export async function aprobarSolicitud(datos: FormData) {
  const id = String(datos.get("id"));
  const periodoId = String(datos.get("periodo"));
  const autor = await exigirEdicion(periodoId);
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

  if (s.estado === "pendiente" && esConsumoTarde(s.canal, horaInicio) && datos.get("confirma_consumo_tarde") !== "si") {
    volver(periodoId, "error", autor.rol === "supervisor"
      ? "Es una solicitud de Consumo en la tarde: Trade Marketing debe confirmarla antes de aprobarla."
      : "Es una solicitud de Consumo en la tarde: marca la confirmación para aprobarla.", ancla);
  }
  const [periodo] = await sql`SELECT estado, fecha_inicio::text, fecha_fin::text FROM periodos WHERE id = ${periodoId}`;
  const fecha = String(datos.get("fecha") ?? "") || s.dia;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < periodo.fecha_inicio || fecha > periodo.fecha_fin) {
    volver(periodoId, "error", "La fecha debe estar dentro de la semana de este periodo.", ancla);
  }

  const inicio = `${fecha} ${horaInicio}`;
  const diaFin = horaFin <= horaInicio ? sumarMinutos(`${fecha} 00:00`, 1440).slice(0, 10) : fecha;
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
  // Se compara con el día que ya tenía el turno (o el que pidió el vendedor si aún no hay turno).
  const diaAnterior: string = previo ? previo.inicio.slice(0, 10) : s.dia;
  const diaMovido = fecha !== diaAnterior;
  if (diaMovido && !motivoCambio) {
    volver(periodoId, "error", `Este turno estaba para el ${fechaCorta(diaAnterior)}: escribe el motivo del cambio de día.`, ancla);
  }
  // Cambio de lugar (en el mismo municipio): el vendedor ve el motivo.
  const lugarNuevo = String(datos.get("lugar") ?? "").trim().slice(0, 120);
  const lugarCambiado = !!lugarNuevo && lugarNuevo.toLowerCase() !== String(s.lugar).toLowerCase();
  if (lugarCambiado && !motivoCambio) {
    volver(periodoId, "error", `El vendedor pidió ${s.lugar}: escribe el motivo del cambio de lugar.`, ancla);
  }

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

  const publicado = periodo.estado === "publicado";
  let puntoId: string = s.punto_id;
  let lugar: string = s.lugar;
  if (lugarCambiado) {
    const [punto] = await sql`INSERT INTO puntos (nombre, municipio) VALUES (${lugarNuevo}, ${s.municipio})
      ON CONFLICT (lower(nombre), lower(municipio)) DO UPDATE SET nombre = puntos.nombre RETURNING id, nombre`;
    puntoId = punto.id;
    lugar = punto.nombre;
  }
  const [turno] = await sql`INSERT INTO turnos (periodo_id, solicitud_id, impulsadora_id, canal, punto_id, marca, uniforme, servicio,
      inicio, fin, alertas, motivo_excepcion, ajuste_manual, publicado)
    VALUES (${periodoId}, ${id}, ${impulsadoraId}, ${s.canal}, ${puntoId}, ${s.marca}, ${s.uniforme}, ${s.servicio ?? "impulso"}, ${inicio}, ${fin},
      ${JSON.stringify(alertas)}::jsonb, ${motivoExcepcion}, true, ${publicado})
    ON CONFLICT (solicitud_id) DO UPDATE SET impulsadora_id = EXCLUDED.impulsadora_id, inicio = EXCLUDED.inicio,
      fin = EXCLUDED.fin, punto_id = EXCLUDED.punto_id, servicio = EXCLUDED.servicio, alertas = EXCLUDED.alertas, motivo_excepcion = EXCLUDED.motivo_excepcion,
      ajuste_manual = true, cancelado = false, publicado = turnos.publicado OR EXCLUDED.publicado
    RETURNING id`;
  await sql`UPDATE solicitudes SET estado = 'aprobada', motivo_rechazo = NULL, punto_id = ${puntoId} WHERE id = ${id}`;
  await recalcularAlertas(periodoId);

  const descripcion = `${lugar}, ${fechaCorta(inicio)} de ${horaTexto(inicio)} a ${horaTexto(fin)}`;
  // El cambio queda registrado con su motivo para que el vendedor lo vea en su solicitud.
  if ((previo?.publicado || diaMovido || lugarCambiado) && motivoCambio) {
    const reemplazo = previo && previo.impulsadora_id !== impulsadoraId
      ? (await sql`SELECT nombre FROM usuarios WHERE id = ${previo.impulsadora_id}`)[0]?.nombre
      : null;
    const detalle = [
      diaMovido ? `Movido del ${fechaCorta(diaAnterior)} al ${fechaCorta(fecha)}.` : "",
      lugarCambiado ? `Cambio de lugar: ${s.lugar} → ${lugar}.` : "",
      reemplazo ? `${imp.nombre} reemplaza a ${reemplazo}.` : "",
      `Ahora: ${imp.nombre}, ${descripcion}`,
    ].filter(Boolean).join(" ");
    await sql`INSERT INTO cambios_turno (turno_id, autor_id, motivo, detalle)
      VALUES (${turno.id}, ${autor.id}, ${motivoCambio}, ${detalle})`;
  }
  // Si Supervisión modifica y guarda un turno durante su revisión, ese turno queda aprobado por ella.
  if (autor.rol === "supervisor") await registrarAprobacionTurno(turno.id, autor.id);

  if (publicado) {
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

async function registrarAprobacionTurno(turnoId: string, autorId: string) {
  await sql`INSERT INTO cambios_turno (turno_id, autor_id, motivo, detalle)
    VALUES (${turnoId}, ${autorId}, 'Revisión de Supervisión', ${DETALLE_APROBADO_TURNO})`;
}

/** Supervisión aprueba un turno tal como está durante su revisión. */
export async function aprobarTurnoRevision(datos: FormData) {
  const periodoId = String(datos.get("periodo"));
  const solicitudId = String(datos.get("id"));
  const autor = await exigirEdicion(periodoId);
  if (autor.rol !== "supervisor" && autor.rol !== "admin") volver(periodoId, "error", "Solo Supervisión aprueba turnos en la revisión.");
  const [t] = await sql`SELECT id FROM turnos WHERE solicitud_id = ${solicitudId} AND periodo_id = ${periodoId} AND NOT cancelado`;
  if (!t) volver(periodoId, "error", "Esta solicitud no tiene turno asignado. Usa Modificar para asignarlo.", `#s-${solicitudId}`);
  await registrarAprobacionTurno(t.id, autor.id);
  revalidatePath("/programacion");
  volver(periodoId, "ok", "Turno aprobado.", `#s-${solicitudId}`);
}

export async function rechazarSolicitud(datos: FormData) {
  const id = String(datos.get("id"));
  const periodoId = String(datos.get("periodo"));
  const autor = await exigirEdicion(periodoId);
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
  await exigirEdicion(periodoId);
  const filas = await sql`UPDATE solicitudes s SET estado = 'aprobada'
    FROM turnos t WHERE t.solicitud_id = s.id AND s.periodo_id = ${periodoId} AND s.estado = 'pendiente'
      AND NOT t.cancelado AND NOT t.alertas @> '[{"requiereMotivo": true}]'::jsonb
      AND NOT (s.canal = 'CONSUMO' AND s.hora < '18:00') RETURNING s.id`;
  // Consumo en la tarde se confirma una por una.
  const [{ n: tarde }] = await sql`SELECT count(*)::int AS n FROM solicitudes s JOIN turnos t ON t.solicitud_id = s.id AND NOT t.cancelado
    WHERE s.periodo_id = ${periodoId} AND s.estado = 'pendiente' AND s.canal = 'CONSUMO' AND s.hora < '18:00'`;
  revalidatePath("/programacion");
  volver(periodoId, "ok", `${filas.length} solicitudes aprobadas.` +
    (tarde ? ` ${tarde === 1 ? "Queda 1 solicitud" : `Quedan ${tarde} solicitudes`} de Consumo en la tarde para que la confirmes una por una.` : ""));
}

export async function publicarProgramacion(datos: FormData) {
  await exigirRol("trade");
  const periodoId = String(datos.get("periodo"));
  const flujo = await estadoSemana(periodoId);
  if (!puedePublicar(flujo.estado, flujo.publicada)) {
    volver(periodoId, "error", "Primero Supervisión debe aprobar la programación.");
  }
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

/** Avanza el flujo de revisión: Trade envía o retoma; Supervisión aprueba o devuelve con comentario. */
export async function avanzarFlujo(datos: FormData) {
  const usuario = await exigirRol("trade", "supervisor");
  const periodoId = String(datos.get("periodo"));
  const paso = String(datos.get("paso")) as Paso;
  const comentario = String(datos.get("comentario") ?? "").trim().slice(0, 500);

  const flujo = await estadoSemana(periodoId);
  if (!pasosPermitidos(usuario.rol, flujo.estado, flujo.publicada).includes(paso)) {
    volver(periodoId, "error", "Esta acción no está disponible en el paso actual de la programación.");
  }
  if (paso === "devuelta" && !comentario) volver(periodoId, "error", "Escribe el comentario para Verónica antes de devolver.");

  if (paso === "enviada") {
    await recalcularAlertas(periodoId);
    const [{ pendientes, sin_motivo }] = await sql`SELECT
      (SELECT count(*)::int FROM solicitudes WHERE periodo_id = ${periodoId} AND estado = 'pendiente') AS pendientes,
      (SELECT count(*)::int FROM turnos WHERE periodo_id = ${periodoId} AND NOT cancelado AND motivo_excepcion IS NULL
         AND alertas @> '[{"requiereMotivo": true}]'::jsonb) AS sin_motivo`;
    if (pendientes > 0) volver(periodoId, "error", `Faltan ${pendientes} solicitudes por aprobar o rechazar antes de enviar.`);
    if (sin_motivo > 0) volver(periodoId, "error", `Hay ${sin_motivo} turnos con alertas sin motivo de excepción.`);
  }

  const [p] = await sql`SELECT fecha_inicio::text, fecha_fin::text FROM periodos WHERE id = ${periodoId}`;
  const nombre = nombrePeriodo(p.fecha_inicio, p.fecha_fin);
  const paraSupervision = paso === "enviada" || paso === "retomada";
  const destinatarios = await sql`SELECT id FROM usuarios WHERE activo AND rol = ${paraSupervision ? "supervisor" : "trade"}`;
  if (!destinatarios.length) {
    volver(periodoId, "error", paraSupervision ? "No hay ningún usuario de Supervisión activo para revisar." : "No hay ningún usuario de Trade Marketing activo.");
  }

  const textos: Record<Paso, { titulo: string; cuerpo: string; ok: string }> = {
    enviada: {
      titulo: `Programación para revisar: ${nombre}`,
      cuerpo: `${usuario.nombre} terminó la programación del ${nombre} y te la envió para revisar y aprobar.`,
      ok: "Programación enviada a Supervisión para su revisión.",
    },
    aprobada: {
      titulo: `Programación aprobada: ${nombre}`,
      cuerpo: `${usuario.nombre} aprobó la programación del ${nombre}. Ya puedes descargar el Excel y publicarla.${comentario ? ` Comentario: ${comentario}` : ""}`,
      ok: "Programación aprobada. Trade Marketing ya fue avisado.",
    },
    devuelta: {
      titulo: `Programación devuelta: ${nombre}`,
      cuerpo: `${usuario.nombre} devolvió la programación del ${nombre} con este comentario: ${comentario}`,
      ok: "Programación devuelta a Trade Marketing con tu comentario.",
    },
    retomada: {
      titulo: `Programación retomada: ${nombre}`,
      cuerpo: `${usuario.nombre} retomó la programación del ${nombre} para hacer cambios. Te la enviará de nuevo para revisar.`,
      ok: "Retomaste la programación. Cuando termines, envíala de nuevo a Supervisión.",
    },
  };
  const t = textos[paso];
  await notificar(destinatarios.map((d) => d.id), { titulo: t.titulo, cuerpo: t.cuerpo, enlace: enlaceFlujo(periodoId, paso), correo: true });
  revalidatePath("/programacion");
  volver(periodoId, "ok", t.ok);
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

/** Trade asigna degustación siempre; Supervisión solo durante su revisión. Al venir de Programación, vuelve a la solicitud. */
async function exigirDegustacion(datos: FormData) {
  const usuario = await exigirRol("trade", "supervisor");
  const periodoId = String(datos.get("periodo"));
  if (usuario.rol === "supervisor") {
    const { estado, publicada } = await estadoSemana(periodoId);
    if (publicada || estado !== "en_revision") volver(periodoId, "error", "Solo puedes cambiar la degustación mientras la programación está en tu revisión.");
  }
  const solicitud = String(datos.get("solicitud") ?? "");
  return (tipo: "ok" | "error", m: string): never =>
    datos.get("desde") === "programacion" ? volver(periodoId, tipo, m, `#s-${solicitud}`) : aDegustacion(periodoId, tipo, m);
}

export async function asignarDegustacion(datos: FormData) {
  const responder = await exigirDegustacion(datos);
  const periodoId = String(datos.get("periodo"));
  const turnoId = String(datos.get("turno"));
  const marca = String(datos.get("marca"));
  const presentacion = String(datos.get("presentacion"));
  const tipo = datos.get("tipo") === "obsequio" ? "obsequio" : "degustacion";
  const cantidad = Number(datos.get("cantidad"));
  if (!PRESENTACIONES.includes(presentacion) || !Number.isInteger(cantidad) || cantidad <= 0) {
    responder("error", "Indica una presentación y una cantidad válidas.");
  }
  const [turno] = await sql`SELECT id FROM turnos WHERE id = ${turnoId} AND periodo_id = ${periodoId}`;
  if (!turno) responder("error", "El turno no pertenece a esta semana.");
  await sql`INSERT INTO degustacion (turno_id, marca, presentacion, asignado, tipo)
    VALUES (${turnoId}, ${marca}, ${presentacion}, ${cantidad}, ${tipo})
    ON CONFLICT (turno_id, marca, presentacion) DO UPDATE SET asignado = EXCLUDED.asignado, tipo = EXCLUDED.tipo`;
  revalidatePath("/programacion/degustacion");
  revalidatePath("/programacion");
  responder("ok", tipo === "obsequio" ? "Obsequio asignado." : "Degustación asignada.");
}

export async function quitarDegustacion(datos: FormData) {
  const responder = await exigirDegustacion(datos);
  const periodoId = String(datos.get("periodo"));
  await sql`DELETE FROM degustacion d USING turnos t
    WHERE d.id = ${String(datos.get("id"))} AND d.usado IS NULL AND t.id = d.turno_id AND t.periodo_id = ${periodoId}`;
  revalidatePath("/programacion/degustacion");
  revalidatePath("/programacion");
  responder("ok", "Degustación retirada.");
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
