import Link from "next/link";
import { Icono } from "@/components/iconos";
import { FiltroSolicitudes } from "@/components/FiltroSolicitudes";
import { NoAprobarVarias } from "@/components/NoAprobarVarias";
import { Avisos, Encabezado, Insignia, Kpi, SelectorPeriodo, Tarjeta, Uniforme, Vacio } from "@/components/ui";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fechaCorta, hora, PRESENTACIONES, PRIORIDADES, sumarDias } from "@/lib/formato";
import { periodoSeleccionado } from "@/lib/periodos";
import { DIAS_ALERTA_REPORTE, duracionTurno, esConsumoTarde, franjaDe, ordenarSolicitudes, sumarMinutos, type Alerta } from "@/lib/reglas";
import { DETALLE_APROBADO_TURNO, pasosPermitidos, puedeEditar, puedePublicar, type EstadoFlujo } from "@/lib/flujo";
import { comentariosDeSemana } from "@/lib/comentarios";
import { estadoSemana } from "@/lib/flujoSemana";
import {
  actualizarLimite,
  aprobarSinAlertas,
  aprobarSolicitud,
  aprobarTurnoRevision,
  asignarDegustacion,
  avanzarFlujo,
  proponerProgramacion,
  publicarProgramacion,
  quitarDegustacion,
  rechazarSolicitud,
  rechazarVarias,
} from "./acciones";
import { PestanasProgramacion } from "./pestanas";

type Params = Promise<{ p?: string; ok?: string; error?: string; s?: string }>;

/** Para Supervisión, el formulario de cambios queda oculto detrás del botón "Modificar". */
function ModoEdicion({ supervision, abierto, children }: { supervision: boolean; abierto: boolean; children: React.ReactNode }) {
  if (!supervision) return <>{children}</>;
  return (
    <details open={abierto} className="mt-2">
      <summary className="boton-sec cursor-pointer list-none">Modificar</summary>
      <p className="mt-2 text-xs text-suave">Cambia lugar, día, horario, impulsadora o degustación. Al guardar, el turno queda aprobado por ti.</p>
      {children}
    </details>
  );
}

const ESTILO_FLUJO: Record<EstadoFlujo, string> = {
  preparacion: "border-linea bg-panel",
  en_revision: "border-alerta bg-alerta-claro text-alerta",
  aprobada: "border-ok bg-ok-claro text-ok",
  devuelta: "border-error bg-error-claro text-error",
};
const TITULO_FLUJO: Record<EstadoFlujo, (sup: string) => string> = {
  preparacion: (sup) => `En preparación por Trade Marketing. Al terminar de asignar, se envía a ${sup} para su revisión.`,
  en_revision: (sup) => `En revisión de ${sup}. Mientras tanto, Trade Marketing solo puede mirar.`,
  aprobada: () => "Aprobada por Supervisión. Ya se puede descargar el Excel y publicar.",
  devuelta: () => "Devuelta a Trade Marketing para corregir. Cuando termines, envíala de nuevo.",
};

export default async function ProgramacionPage({ searchParams }: { searchParams: Params }) {
  const usuario = await exigirRol("trade", "supervisor");
  const sp = await searchParams;
  const { actual, lista } = await periodoSeleccionado(sp.p);
  // Trade asigna y envía; Supervisión revisa, modifica, aprueba o devuelve. Solo uno edita a la vez.
  const esTrade = usuario.rol !== "supervisor";
  const flujo = await estadoSemana(actual.id);
  const soloLectura = !puedeEditar(usuario.rol, flujo.estado, flujo.publicada);
  const pasos = pasosPermitidos(usuario.rol, flujo.estado, flujo.publicada);
  const supervision = await sql`SELECT nombre FROM usuarios WHERE rol = 'supervisor' AND activo ORDER BY nombre`;
  const nombresSupervision = supervision.map((s) => String(s.nombre).split(" ")[0]).join(" y ") || "Supervisión";

  const [solicitudes, impulsadoras, disponibilidad, canales] = await Promise.all([
    sql`SELECT s.id, s.fecha::text, s.hora::text, s.notas, s.obsequios, s.grupo, s.canal AS canal_codigo, p.direccion, s.prioridad, s.extemporanea, s.estado, s.motivo_rechazo, s.servicio, s.degustacion_pedida,
        s.creado_en::text AS creado_orden, (s.creado_en AT TIME ZONE 'America/Bogota')::text AS creado,
        c.nombre AS canal, m.nombre AS marca, m.uniforme, p.nombre AS lugar, p.municipio, v.nombre AS vendedor,
        t.id AS turno_id, t.impulsadora_id, t.inicio::text, t.fin::text, t.alertas, t.motivo_excepcion, t.publicado, s.marca AS marca_codigo
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
    WHERE t.publicado AND NOT t.cancelado AND t.servicio <> 'bartender'
      AND t.fin <= (now() AT TIME ZONE 'America/Bogota')
      AND t.fin >= (now() AT TIME ZONE 'America/Bogota')::date - ${DIAS_ALERTA_REPORTE}::int
      AND NOT EXISTS (SELECT 1 FROM reportes_venta r WHERE r.turno_id = t.id)
    ORDER BY t.inicio DESC`;
  const esSupervision = usuario.rol === "supervisor";
  const [degustacion, marcas, puntos, aprobaciones] = await Promise.all([
    sql`SELECT d.id, d.turno_id, d.marca, d.presentacion, d.tipo, d.asignado, d.usado FROM degustacion d
      JOIN turnos t ON t.id = d.turno_id WHERE t.periodo_id = ${actual.id} AND NOT t.cancelado ORDER BY d.marca, d.presentacion`,
    sql`SELECT codigo, nombre FROM marcas ORDER BY nombre`,
    sql`SELECT DISTINCT nombre FROM puntos ORDER BY nombre`,
    // Turnos aprobados por Supervisión después del último envío a revisión.
    sql`SELECT DISTINCT ct.turno_id FROM cambios_turno ct JOIN turnos t ON t.id = ct.turno_id
      WHERE t.periodo_id = ${actual.id} AND ct.detalle = ${DETALLE_APROBADO_TURNO}
        AND ${flujo.enviadaEn}::timestamptz IS NOT NULL AND ct.creado_en > ${flujo.enviadaEn}::timestamptz`,
  ]);
  const aprobados = new Set(aprobaciones.map((a) => a.turno_id as string));
  const comentarios = await comentariosDeSemana(actual.id);

  const disponibles =new Set(disponibilidad.map((d) => `${d.impulsadora_id}|${d.fecha}|${d.franja}`));
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
        {usuario.rol === "trade" && (
          <Link href="/solicitudes/nueva" className="boton">
            <Icono nombre="mas" className="size-4" /> Nueva solicitud
          </Link>
        )}
      </Encabezado>
      <PestanasProgramacion periodo={actual.id} activa="solicitudes" soloLectura={!esTrade} />
      <Avisos ok={sp.ok} error={sp.s ? undefined : sp.error} />
      {!flujo.publicada && (
        <section className={`mb-5 rounded-xl border px-4 py-4 ${ESTILO_FLUJO[flujo.estado]}`}>
          <p className="text-xs font-bold tracking-wide uppercase">Revisión de Supervisión</p>
          <p className="mt-1 font-semibold">{TITULO_FLUJO[flujo.estado](nombresSupervision)}</p>
          {flujo.estado === "en_revision" && (
            <p className="mt-1 text-sm">
              <strong>{orden.filter((s) => s.turno_id && aprobados.has(s.turno_id)).length}</strong> de{" "}
              <strong>{orden.filter((s) => s.turno_id).length}</strong> turnos aprobados por {nombresSupervision}.
            </p>
          )}
          {flujo.cuerpo && flujo.fecha && (
            <p className="mt-1 text-sm">
              {flujo.cuerpo} <span className="text-xs opacity-80">({fechaCorta(flujo.fecha)}, {hora(flujo.fecha)})</span>
            </p>
          )}
          {pasos.length > 0 && (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
              {pasos.includes("enviada") && (
                <form action={avanzarFlujo}>
                  <input type="hidden" name="periodo" value={actual.id} />
                  <input type="hidden" name="paso" value="enviada" />
                  <button className="boton w-full sm:w-auto">Terminar y enviar a {nombresSupervision}</button>
                </form>
              )}
              {pasos.includes("aprobada") && (
                <form action={avanzarFlujo} className="flex flex-col gap-2">
                  <input type="hidden" name="periodo" value={actual.id} />
                  <input type="hidden" name="paso" value="aprobada" />
                  <label htmlFor="com-aprobar" className="sr-only">Comentario opcional</label>
                  <input id="com-aprobar" name="comentario" maxLength={500} placeholder="Comentario (opcional)" className="campo" />
                  <button className="boton">Aprobar programación</button>
                </form>
              )}
              {pasos.includes("devuelta") && (
                <form action={avanzarFlujo} className="flex flex-col gap-2">
                  <input type="hidden" name="periodo" value={actual.id} />
                  <input type="hidden" name="paso" value="devuelta" />
                  <label htmlFor="com-devolver" className="sr-only">Comentario para Trade Marketing</label>
                  <input id="com-devolver" name="comentario" required maxLength={500} placeholder="Qué debe corregir Trade Marketing" className="campo" />
                  <button className="boton-peligro">Devolver a Trade Marketing</button>
                </form>
              )}
              {pasos.includes("retomada") && (
                <form action={avanzarFlujo}>
                  <input type="hidden" name="periodo" value={actual.id} />
                  <input type="hidden" name="paso" value="retomada" />
                  <button className="boton-sec w-full sm:w-auto">Retomar para hacer cambios</button>
                </form>
              )}
            </div>
          )}
        </section>
      )}
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
            <details className="rounded-lg border border-linea bg-white px-3 py-2">
              <summary className="cursor-pointer text-sm font-semibold">Excel por día para revisar</summary>
              <p className="mt-1 text-xs text-suave">
                Incluye la propuesta aunque todavía no esté aprobada, y una hoja REVISION con el descanso entre turnos de cada impulsadora.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {Array.from({ length: 7 }, (_, i) => sumarDias(actual.fecha_inicio, i)).map((d) => (
                  <a key={d} href={`/api/programacion/excel?p=${actual.id}&dia=${d}`} className="boton-sec text-sm">
                    {fechaCorta(d)}
                  </a>
                ))}
              </div>
            </details>
            {esTrade && !soloLectura && (
              <>
            <form action={proponerProgramacion}>
              <input type="hidden" name="periodo" value={actual.id} />
              <button className="boton-sec w-full">Generar propuesta</button>
            </form>
            <form action={aprobarSinAlertas}>
              <input type="hidden" name="periodo" value={actual.id} />
              <button className="boton-sec w-full">Aprobar asignadas sin alertas</button>
            </form>
              </>
            )}
            {esTrade && (puedePublicar(flujo.estado, flujo.publicada) ? (
              <form action={publicarProgramacion}>
                <input type="hidden" name="periodo" value={actual.id} />
                <button className="boton w-full">{publicado ? "Publicar cambios" : "Publicar programación"}</button>
              </form>
            ) : (
              <p className="rounded-lg bg-gris px-3 py-2 text-xs text-suave">
                Podrás publicar cuando Supervisión apruebe la programación.
              </p>
            ))}
          </div>
          {esTrade && (
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
      {orden.length > 0 && esTrade && !esSupervision && !soloLectura && (
        <NoAprobarVarias accion={rechazarVarias} periodo={actual.id} lista="lista-solicitudes" />
      )}
      <datalist id="lista-puntos-prog">
        {puntos.map((p) => <option key={p.nombre} value={p.nombre} />)}
      </datalist>
      <ol id="lista-solicitudes" className="space-y-3">
        {orden.map((s, i) => {
          const alertas: Alerta[] = s.alertas ?? [];
          const inicioBase = `${s.fecha} ${s.hora.slice(0, 5)}`;
          const inicio = s.inicio ?? inicioBase;
          const fin = s.fin ?? sumarMinutos(inicioBase, duracionTurno(s.canal_codigo, inicioBase));
          const clave = (id: string) => `${id}|${s.fecha}|${franjaDe(inicio)}`;
          const opciones = [...impulsadoras].sort((a, b) => {
            const pa = (disponibles.has(clave(a.id)) ? 0 : 2) + (a.municipio === s.municipio ? 0 : 1);
            const pb = (disponibles.has(clave(b.id)) ? 0 : 2) + (b.municipio === s.municipio ? 0 : 1);
            return pa - pb || a.nombre.localeCompare(b.nombre);
          });
          const rechazo = s.estado !== "rechazada" && (
            <details className="mt-2">
              <summary className={esSupervision ? "boton-peligro cursor-pointer list-none" : "cursor-pointer py-1 text-sm font-semibold text-error"}>
                {esSupervision ? "No aprobar" : "No aprobar esta solicitud"}
              </summary>
              <form action={rechazarSolicitud} className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="periodo" value={actual.id} />
                <label htmlFor={`rec-${s.id}`} className="sr-only">Motivo</label>
                <input id={`rec-${s.id}`} name="motivo" required maxLength={300} placeholder="Motivo para el vendedor" className="campo" />
                <button className="boton-peligro shrink-0">Confirmar</button>
              </form>
            </details>
          );
          const items = degustacion.filter((d) => d.turno_id === s.turno_id);
          const editorDegustacion = esSupervision && s.turno_id && (
            <div className="mt-4 rounded-lg border border-linea p-3">
              <p className="text-sm font-semibold">Degustación y obsequios</p>
              {items.length === 0 && <p className="mt-1 text-xs text-suave">Sin degustación ni obsequios asignados.</p>}
              <ul className="mt-2 flex flex-wrap gap-2">
                {items.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 rounded-full bg-gris px-3 py-1.5 text-sm">
                    {d.asignado} {d.presentacion} {d.marca}
                    {d.tipo === "obsequio" && <span className="text-xs font-semibold text-marca-fuerte">obsequio</span>}
                    {d.usado === null && (
                      <form action={quitarDegustacion}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="periodo" value={actual.id} />
                        <input type="hidden" name="desde" value="programacion" />
                        <input type="hidden" name="solicitud" value={s.id} />
                        <button aria-label={`Quitar ${d.presentacion} ${d.marca}`} className="cursor-pointer px-1 font-bold text-error">×</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              <form action={asignarDegustacion} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[9rem_1fr_1fr_6rem_auto]">
                <input type="hidden" name="periodo" value={actual.id} />
                <input type="hidden" name="turno" value={s.turno_id} />
                <input type="hidden" name="desde" value="programacion" />
                <input type="hidden" name="solicitud" value={s.id} />
                <select name="tipo" aria-label="Uso" className="campo">
                  <option value="degustacion">Degustación</option>
                  <option value="obsequio">Obsequio</option>
                </select>
                <select name="marca" defaultValue={s.marca_codigo} aria-label="Marca" className="campo">
                  {marcas.map((m) => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
                </select>
                <select name="presentacion" aria-label="Presentación" className="campo">
                  {PRESENTACIONES.map((p) => <option key={p}>{p}</option>)}
                </select>
                <input name="cantidad" type="number" min={1} required aria-label="Cantidad" placeholder="Cant." className="campo" />
                <button className="boton-sec">Asignar</button>
              </form>
            </div>
          );
          return (
            <li
              key={s.id}
              id={`s-${s.id}`}
              className="scroll-mt-28 tarjeta"
              data-canal={s.canal_codigo}
              data-estado={s.estado}
              data-sinimp={s.estado === "pendiente" && !s.turno_id ? "1" : "0"}
              data-dia={s.fecha}
              data-texto={[s.lugar, s.vendedor, s.municipio, s.canal, s.marca, s.notas, s.obsequios, s.direccion].filter(Boolean).join(" ")}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-suave">
                    {esTrade && !esSupervision && !soloLectura && s.estado === "pendiente" && (
                      <input type="checkbox" name="ids" value={s.id} form="no-aprobar-varias" aria-label={`Marcar ${s.lugar} para no aprobar`} className="mr-2 size-4 align-middle accent-marca" />
                    )}
                    #{i + 1} · {s.canal} · {s.vendedor}</p>
                  <h3 className="font-semibold">{s.lugar}</h3>
                  <p className="text-sm text-suave">
                    {s.municipio} · {fechaCorta(s.fecha)}, {hora(s.hora)} · {s.marca}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Uniforme codigo={s.uniforme} />
                  {s.servicio === "bartender" && <Insignia tono="marca">Bartender</Insignia>}
                  {s.grupo && <Insignia>Varias marcas</Insignia>}
                  {s.prioridad ? <Insignia tono="marca">Relevancia {PRIORIDADES[s.prioridad]}</Insignia> : <Insignia>Por llegada</Insignia>}
                  {s.extemporanea && <Insignia tono="alerta">Extemporánea</Insignia>}
                  {s.estado === "pendiente" && esConsumoTarde(s.canal_codigo, s.hora) && <Insignia tono="alerta">Consumo en la tarde · confirmar</Insignia>}
                  {s.estado === "aprobada" && <Insignia tono="ok">Aprobada</Insignia>}
                  {s.estado === "rechazada" && <Insignia tono="error">No aprobada</Insignia>}
                  {s.estado === "pendiente" && <Insignia>Pendiente</Insignia>}
                </div>
              </div>
              {s.direccion && <p className="mt-1 text-sm text-suave">Dirección: {s.direccion}</p>}
              {s.notas && (
                <p className="mt-2 text-sm"><span className="font-semibold">Adicionales:</span> {s.notas}</p>
              )}
              {s.degustacion_pedida && (
                <p className="mt-1 text-sm"><span className="font-semibold">Degustación que pide:</span> {s.degustacion_pedida.cantidad} {String(s.degustacion_pedida.presentacion).toLowerCase()}{s.degustacion_pedida.cantidad > 1 ? "s" : ""} de {s.marca}</p>
              )}
              {s.obsequios && (
                <p className="mt-1 text-sm"><span className="font-semibold">Producto para regalar:</span> {s.obsequios}</p>
              )}
              <p className="mt-1 text-xs text-suave">Recibida el {fechaCorta(s.creado)} a las {hora(s.creado)}</p>
              {(comentarios.get(s.id) ?? []).map((c, n) => (
                <p key={n} className="mt-2 rounded-lg bg-gris px-3 py-1.5 text-sm"><span className="font-semibold">Comentario:</span> {c.cuerpo} <span className="text-xs text-suave">({fechaCorta(c.fecha)}, {hora(c.fecha)})</span></p>
              ))}

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
              {esSupervision && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-linea pt-3">
                  {s.turno_id && (aprobados.has(s.turno_id) ? (
                    <Insignia tono="ok">Aprobado por {nombresSupervision}</Insignia>
                  ) : (
                    <form action={aprobarTurnoRevision}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="periodo" value={actual.id} />
                      <button className="boton">Aprobar</button>
                    </form>
                  ))}
                  {!s.turno_id && s.estado !== "rechazada" && <span className="text-sm text-suave">Sin impulsadora asignada: usa Modificar para asignarla.</span>}
                </div>
              )}
              {esSupervision && rechazo}
              <ModoEdicion supervision={esSupervision} abierto={sp.s === s.id}>
              <form action={aprobarSolicitud} className="mt-3 grid gap-3 border-t border-linea pt-3 sm:grid-cols-3 lg:grid-cols-[1fr_10rem_8rem_8rem]">
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="periodo" value={actual.id} />
                <div className="sm:col-span-3 lg:col-span-4">
                  <label htmlFor={`lug-${s.id}`} className="etiqueta">Lugar (en {s.municipio})</label>
                  <input id={`lug-${s.id}`} name="lugar" list="lista-puntos-prog" defaultValue={s.lugar} maxLength={120} required className="campo" />
                  <p className="mt-1 text-xs text-suave">Para cambiar el lugar escribe el nuevo y toca {s.estado === "aprobada" ? "Guardar cambios" : "Aprobar"}. El motivo es opcional.</p>
                </div>
                <div className="sm:col-span-3 lg:col-span-1">
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
                  <label htmlFor={`dia-${s.id}`} className="etiqueta">Fecha</label>
                  <input
                    id={`dia-${s.id}`}
                    name="fecha"
                    type="date"
                    required
                    min={actual.fecha_inicio}
                    max={actual.fecha_fin}
                    defaultValue={inicio.slice(0, 10)}
                    className="campo"
                  />
                </div>
                <div>
                  <label htmlFor={`ini-${s.id}`} className="etiqueta">Inicio</label>
                  <input id={`ini-${s.id}`} name="hora_inicio" type="time" required defaultValue={inicio.slice(11, 16)} className="campo" />
                </div>
                <div>
                  <label htmlFor={`fin-${s.id}`} className="etiqueta">Fin</label>
                  <input id={`fin-${s.id}`} name="hora_fin" type="time" required defaultValue={fin.slice(11, 16)} className="campo" />
                </div>
                <div className="sm:col-span-3 lg:col-span-4">
                  <label htmlFor={`mot-${s.id}`} className="etiqueta">Motivo de la excepción (si hay alertas)</label>
                  <input id={`mot-${s.id}`} name="motivo_excepcion" autoFocus={sp.s === s.id && !!sp.error} defaultValue={s.motivo_excepcion ?? ""} maxLength={300} className="campo" />
                </div>
                <div className="sm:col-span-3 lg:col-span-4">
                  <label htmlFor={`cam-${s.id}`} className="etiqueta">
                    {s.publicado ? "Motivo del cambio (turno ya publicado, lo verá el vendedor)" : "Motivo del cambio (si cambias el día o el lugar, lo verá el vendedor)"}
                  </label>
                  <input id={`cam-${s.id}`} name="motivo_cambio" maxLength={300} className="campo" />
                </div>
                {s.estado === "pendiente" && esConsumoTarde(s.canal_codigo, s.hora) && (
                  <label className="sm:col-span-3 lg:col-span-4 flex items-start gap-2 rounded-lg bg-alerta-claro px-3 py-2 text-sm text-alerta">
                    <input type="checkbox" name="confirma_consumo_tarde" value="si" required={!esSupervision} disabled={esSupervision} className="mt-0.5 size-4" />
                    <span>{esSupervision ? "Es Consumo en la tarde: debe confirmarla Trade Marketing." : "Confirmo que esta solicitud de Consumo en la tarde va (no es de 9:00 PM)."}</span>
                  </label>
                )}
                <div className="sm:col-span-3 lg:col-span-4">
                  <button className="boton w-full sm:w-auto">{s.estado === "aprobada" ? "Guardar cambios" : "Aprobar"}</button>
                </div>
              </form>
              {editorDegustacion}
              </ModoEdicion>
              {!esSupervision && rechazo}
              </>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
