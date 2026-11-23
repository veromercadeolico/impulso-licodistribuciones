import { FiltroSolicitudes } from "@/components/FiltroSolicitudes";
import { Avisos, Encabezado, Insignia, Kpi, SelectorPeriodo, Tarjeta, Uniforme, Vacio } from "@/components/ui";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fechaCorta, hora, PRIORIDADES } from "@/lib/formato";
import { periodoSeleccionado } from "@/lib/periodos";
import { DIAS_ALERTA_REPORTE, franjaDe, ordenarSolicitudes, sumarMinutos, type Alerta } from "@/lib/reglas";
import {
  actualizarLimite,
  aprobarSinAlertas,
  aprobarSolicitud,
  proponerProgramacion,
  publicarProgramacion,
  rechazarSolicitud,
} from "./acciones";
import { PestanasProgramacion } from "./pestanas";

type Params = Promise<{ p?: string; ok?: string; error?: string; s?: string }>;

export default async function ProgramacionPage({ searchParams }: { searchParams: Params }) {
  const usuario = await exigirRol("trade", "supervisor");
  // Supervisión ve todo pero no puede aprobar, asignar ni publicar.
  const soloLectura = usuario.rol === "supervisor";
  const sp = await searchParams;
  const { actual, lista } = await periodoSeleccionado(sp.p);

  const [solicitudes, impulsadoras, disponibilidad, canales] = await Promise.all([
    sql`SELECT s.id, s.fecha::text, s.hora::text, s.notas, s.obsequios, s.grupo, s.canal AS canal_codigo, p.direccion, s.prioridad, s.extemporanea, s.estado, s.motivo_rechazo,
        s.creado_en::text AS creado_orden, (s.creado_en AT TIME ZONE 'America/Bogota')::text AS creado,
        c.nombre AS canal, m.nombre AS marca, m.uniforme, p.nombre AS lugar, p.municipio, v.nombre AS vendedor,
        t.id AS turno_id, t.impulsadora_id, t.inicio::text, t.fin::text, t.alertas, t.motivo_excepcion, t.publicado
      FROM solicitudes s
      JOIN canales c ON c.codigo = s.canal JOIN marcas m ON m.codigo = s.marca
      JOIN puntos p ON p.id = s.punto_id JOIN usuarios v ON v.id = s.vendedor_id
      LEFT JOIN turnos t ON t.solicitud_id = s.id AND NOT t.cancelado
      WHERE s.periodo_id = ${actual.id}`,
    sql`SELECT id, nombre, municipio, cedula IS NOT NULL AS con_cedula FROM usuarios
      WHERE rol = 'impulsadora' AND activo ORDER BY nombre`,
    sql`SELECT d.impulsadora_id, d.fecha::text, d.franja FROM disponibilidad d
      WHERE d.fecha BETWEEN ${actual.fecha_inicio} AND ${actual.fecha_fin}`,
    sql`SELECT c.codigo, c.nombre, c.meta_semanal,
        (SELECT count(*)::int FROM turnos t WHERE t.canal = c.codigo AND t.periodo_id = ${actual.id} AND NOT t.cancelado) AS turnos
      FROM canales c ORDER BY c.orden`,
  ]);
  const sinReporte = await sql`SELECT t.id, t.inicio::text, i.nombre AS impulsadora, p.nombre AS lugar,
      EXISTS (SELECT 1 FROM asistencias a WHERE a.turno_id = t.id AND a.tipo = 'salida') AS salida
    FROM turnos t JOIN usuarios i ON i.id = t.impulsadora_id JOIN puntos p ON p.id = t.punto_id
    WHERE t.publicado AND NOT t.cancelado
      AND t.fin <= (now() AT TIME ZONE 'America/Bogota')
      AND t.fin >= (now() AT TIME ZONE 'America/Bogota')::date - ${DIAS_ALERTA_REPORTE}::int
      AND NOT EXISTS (SELECT 1 FROM reportes_venta r WHERE r.turno_id = t.id)
    ORDER BY t.inicio DESC`;

  const disponibles = new Set(disponibilidad.map((d) => `${d.impulsadora_id}|${d.fecha}|${d.franja}`));
  const orden = ordenarSolicitudes(
    solicitudes.map((s) => ({ ...s, prioridad: s.prioridad as number | null, creadoEn: s.creado_orden as string })),
  );
  const pendientes = solicitudes.filter((s) => s.estado === "pendiente").length;
  const asignadas = solicitudes.filter((s) => s.turno_id).length;
  const conDisponibilidad = new Set(disponibilidad.map((d) => d.impulsadora_id)).size;
  const sinCedula = impulsadoras.filter((i) => !i.con_cedula).length;
  const publicado = actual.estado === "publicado";

  return (
    <>
      <Encabezado titulo="Programación de impulso" detalle={publicado ? "Periodo publicado" : "Periodo en preparación"}>
        <SelectorPeriodo ruta="/programacion" actual={actual} lista={lista} />
      </Encabezado>
      <PestanasProgramacion periodo={actual.id} activa="solicitudes" soloLectura={soloLectura} />
      <Avisos ok={sp.ok} error={sp.s ? undefined : sp.error} />
      {sinReporte.length > 0 && (
        <details className="mb-4 rounded-lg bg-error-claro px-3 py-2 text-sm text-error">
          <summary className="cursor-pointer font-semibold">
            {sinReporte.length === 1 ? "1 turno terminado sin reporte de ventas" : `${sinReporte.length} turnos terminados sin reporte de ventas`}
            {` en los últimos ${DIAS_ALERTA_REPORTE} días. Ver cuáles`}
          </summary>
          <ul className="mt-2 space-y-1">
            {sinReporte.map((t) => (
              <li key={t.id}>
                {t.impulsadora} · {t.lugar} · {fechaCorta(t.inicio)}, {hora(t.inicio)}
                {!t.salida && " · sin salida registrada"}
              </li>
            ))}
          </ul>
        </details>
      )}
      {sinCedula > 0 && (
        <p className="mb-4 rounded-lg bg-alerta-claro px-3 py-2 text-sm text-alerta">
          {sinCedula} impulsadoras aún no tienen cédula registrada y no podrán entrar a la app.
        </p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi valor={String(solicitudes.length)} etiqueta="Solicitudes recibidas" />
        <Kpi valor={String(pendientes)} etiqueta="Por decidir" />
        <Kpi valor={String(asignadas)} etiqueta="Con impulsadora asignada" />
        <Kpi valor={String(conDisponibilidad)} etiqueta="Impulsadoras disponibles" />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Tarjeta titulo="Turnos por canal">
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr><th>Canal</th><th className="num">Programados</th><th className="num">Proyectados</th><th className="num">Diferencia</th></tr>
              </thead>
              <tbody>
                {canales.map((c) => (
                  <tr key={c.codigo}>
                    <td>{c.nombre}</td>
                    <td className="num">{c.turnos}</td>
                    <td className="num">{c.meta_semanal}</td>
                    <td className={`num font-semibold ${c.turnos - c.meta_semanal < 0 ? "text-error" : "text-ok"}`}>
                      {c.turnos - c.meta_semanal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
        <Tarjeta titulo="Acciones">
          <div className="space-y-2">
            <a href={`/api/programacion/excel?p=${actual.id}`} className="boton-sec w-full">
              Descargar Excel
            </a>
            {!soloLectura && (
              <>
            <form action={proponerProgramacion}>
              <input type="hidden" name="periodo" value={actual.id} />
              <button className="boton-sec w-full">Generar propuesta</button>
            </form>
            <form action={aprobarSinAlertas}>
              <input type="hidden" name="periodo" value={actual.id} />
              <button className="boton-sec w-full">Aprobar asignadas sin alertas</button>
            </form>
            <form action={publicarProgramacion}>
              <input type="hidden" name="periodo" value={actual.id} />
              <button className="boton w-full">{publicado ? "Publicar cambios" : "Publicar programación"}</button>
            </form>
              </>
            )}
          </div>
          {!soloLectura && (
          <form action={actualizarLimite} className="mt-4 border-t border-linea pt-3">
            <input type="hidden" name="periodo" value={actual.id} />
            <label htmlFor="limite" className="etiqueta">Límite de solicitudes</label>
            <div className="flex flex-col gap-2">
              <input id="limite" name="limite" type="datetime-local" className="campo" defaultValue={actual.limite_solicitudes.slice(0, 16).replace(" ", "T")} />
              <button className="boton-sec">Guardar</button>
            </div>
          </form>
          )}
        </Tarjeta>
      </div>

      <h2 className="titulo mb-4 text-base">Solicitudes por orden de relevancia</h2>
      {orden.length === 0 && <Vacio>Todavía no hay solicitudes para este periodo.</Vacio>}
      {orden.length > 0 && (
        <FiltroSolicitudes
          lista="lista-solicitudes"
          clave={actual.id}
          canales={canales.map((c) => ({ valor: c.codigo, texto: c.nombre }))}
          dias={[...new Set(orden.map((s) => s.fecha as string))].sort().map((d) => ({ valor: d, texto: fechaCorta(d) }))}
        />
      )}
      <ol id="lista-solicitudes" className="space-y-3">
        {orden.map((s, i) => {
          const alertas: Alerta[] = s.alertas ?? [];
          const inicioBase = `${s.fecha} ${s.hora.slice(0, 5)}`;
          const inicio = s.inicio ?? inicioBase;
          const fin = s.fin ?? sumarMinutos(inicioBase, 240);
          const clave = (id: string) => `${id}|${s.fecha}|${franjaDe(inicio)}`;
          const opciones = [...impulsadoras].sort((a, b) => {
            const pa = (disponibles.has(clave(a.id)) ? 0 : 2) + (a.municipio === s.municipio ? 0 : 1);
            const pb = (disponibles.has(clave(b.id)) ? 0 : 2) + (b.municipio === s.municipio ? 0 : 1);
            return pa - pb || a.nombre.localeCompare(b.nombre);
          });
          return (
            <li
              key={s.id}
              id={`s-${s.id}`}
              className="scroll-mt-28 tarjeta"
              data-canal={s.canal_codigo}
              data-estado={s.estado}
              data-dia={s.fecha}
              data-texto={[s.lugar, s.vendedor, s.municipio, s.canal, s.marca, s.notas, s.obsequios, s.direccion].filter(Boolean).join(" ")}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-suave">#{i + 1} · {s.canal} · {s.vendedor}</p>
                  <h3 className="font-semibold">{s.lugar}</h3>
                  <p className="text-sm text-suave">
                    {s.municipio} · {fechaCorta(s.fecha)}, {hora(s.hora)} · {s.marca}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Uniforme codigo={s.uniforme} />
                  {s.grupo && <Insignia>Varias marcas</Insignia>}
                  {s.prioridad ? <Insignia tono="marca">Relevancia {PRIORIDADES[s.prioridad]}</Insignia> : <Insignia>Por llegada</Insignia>}
                  {s.extemporanea && <Insignia tono="alerta">Extemporánea</Insignia>}
                  {s.estado === "aprobada" && <Insignia tono="ok">Aprobada</Insignia>}
                  {s.estado === "rechazada" && <Insignia tono="error">No aprobada</Insignia>}
                  {s.estado === "pendiente" && <Insignia>Pendiente</Insignia>}
                </div>
              </div>
              {s.direccion && <p className="mt-1 text-sm text-suave">Dirección: {s.direccion}</p>}
              {s.notas && (
                <p className="mt-2 text-sm"><span className="font-semibold">Adicionales:</span> {s.notas}</p>
              )}
              {s.obsequios && (
                <p className="mt-1 text-sm"><span className="font-semibold">Producto para regalar:</span> {s.obsequios}</p>
              )}
              <p className="mt-1 text-xs text-suave">Recibida el {fechaCorta(s.creado)} a las {hora(s.creado)}</p>

              {alertas.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {alertas.map((a, n) => (
                    <li key={n} className={`rounded-lg px-3 py-1.5 text-sm ${a.requiereMotivo ? "bg-error-claro text-error" : "bg-alerta-claro text-alerta"}`}>
                      {a.mensaje}
                    </li>
                  ))}
                </ul>
              )}
              {s.estado === "rechazada" && s.motivo_rechazo && (
                <p className="mt-3 rounded-lg bg-error-claro px-3 py-1.5 text-sm text-error">Motivo: {s.motivo_rechazo}</p>
              )}

              {sp.s === s.id && sp.error && (
                <p role="alert" className="mt-3 rounded-lg bg-error-claro px-3 py-2.5 text-sm font-semibold text-error">{sp.error}</p>
              )}
              {soloLectura ? (
                <p className="mt-3 border-t border-linea pt-3 text-sm">
                  {s.impulsadora_id ? (
                    <>
                      Impulsadora: <strong>{impulsadoras.find((o) => o.id === s.impulsadora_id)?.nombre}</strong> · {hora(inicio)} a {hora(fin)}
                      {s.motivo_excepcion && <span className="block text-suave">Motivo de la excepción: {s.motivo_excepcion}</span>}
                    </>
                  ) : (
                    <span className="text-suave">Sin impulsadora asignada</span>
                  )}
                </p>
              ) : (
              <>
              <form action={aprobarSolicitud} className="mt-3 grid gap-3 border-t border-linea pt-3 sm:grid-cols-[1fr_8rem_8rem]">
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="periodo" value={actual.id} />
                <div>
                  <label htmlFor={`imp-${s.id}`} className="etiqueta">Impulsadora</label>
                  <select id={`imp-${s.id}`} name="impulsadora" defaultValue={s.impulsadora_id ?? ""} className="campo">
                    <option value="">Sin asignar</option>
                    {opciones.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nombre} · {o.municipio ?? "sin municipio"}{disponibles.has(clave(o.id)) ? "" : " · no disponible"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`ini-${s.id}`} className="etiqueta">Inicio</label>
                  <input id={`ini-${s.id}`} name="hora_inicio" type="time" required defaultValue={inicio.slice(11, 16)} className="campo" />
                </div>
                <div>
                  <label htmlFor={`fin-${s.id}`} className="etiqueta">Fin</label>
                  <input id={`fin-${s.id}`} name="hora_fin" type="time" required defaultValue={fin.slice(11, 16)} className="campo" />
                </div>
                <div className="sm:col-span-3">
                  <label htmlFor={`mot-${s.id}`} className="etiqueta">Motivo de la excepción (si hay alertas)</label>
                  <input id={`mot-${s.id}`} name="motivo_excepcion" autoFocus={sp.s === s.id && !!sp.error} defaultValue={s.motivo_excepcion ?? ""} maxLength={300} className="campo" />
                </div>
                {s.publicado && (
                  <div className="sm:col-span-3">
                    <label htmlFor={`cam-${s.id}`} className="etiqueta">Motivo del cambio (turno ya publicado)</label>
                    <input id={`cam-${s.id}`} name="motivo_cambio" maxLength={300} className="campo" />
                  </div>
                )}
                <div className="sm:col-span-3">
                  <button className="boton w-full sm:w-auto">{s.estado === "aprobada" ? "Guardar cambios" : "Aprobar"}</button>
                </div>
              </form>
              {s.estado !== "rechazada" && (
                <details className="mt-2">
                  <summary className="cursor-pointer py-1 text-sm font-semibold text-error">No aprobar esta solicitud</summary>
                  <form action={rechazarSolicitud} className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="periodo" value={actual.id} />
                    <label htmlFor={`rec-${s.id}`} className="sr-only">Motivo</label>
                    <input id={`rec-${s.id}`} name="motivo" required maxLength={300} placeholder="Motivo para el vendedor" className="campo" />
                    <button className="boton-peligro shrink-0">Confirmar</button>
                  </form>
                </details>
              )}
              </>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
