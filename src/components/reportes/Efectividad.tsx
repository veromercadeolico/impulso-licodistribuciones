import { Insignia, Kpi, Tarjeta, Vacio } from "@/components/ui";
import { sql } from "@/lib/db";
import { duracion, fechaCorta, hora, numero, porcentaje } from "@/lib/formato";
import { aMinutos, META_CUMPLIMIENTO, type EstadoCumplimiento } from "@/lib/reglas";
import { agrupar, turnosDelPeriodo, ventasDelPeriodo } from "@/lib/reportes";

const ESTADOS: { id: EstadoCumplimiento; texto: string; color: string }[] = [
  { id: "cumplido", texto: "Cumplido", color: "#1f7a4d" },
  { id: "tiempo_incompleto", texto: "Tiempo incompleto", color: "#8a5cc2" },
  { id: "cambio_pdv", texto: "Cambio de PDV", color: "#d69600" },
  { id: "falta_ventas", texto: "Falta ventas", color: "#2a64ad" },
  { id: "falta_entrada", texto: "Falta entrada", color: "#7ba4ea" },
  { id: "sin_reportes", texto: "Sin reportes", color: "#a8321e" },
];

export async function Efectividad({ periodoId }: { periodoId: string }) {
  const [turnos, ventas, canales] = await Promise.all([
    turnosDelPeriodo(periodoId),
    ventasDelPeriodo(periodoId),
    sql`SELECT codigo, nombre, meta_semanal FROM canales ORDER BY orden`,
  ]);
  const medidos = turnos.filter((t) => t.terminado);
  const cuenta = (lista: typeof turnos, e: EstadoCumplimiento) => lista.filter((t) => t.estado === e).length;
  const cumplidos = cuenta(medidos, "cumplido");
  const tasa = medidos.length ? cumplidos / medidos.length : 0;
  const aguardiente = ventas.filter((v) => /AMARILLO|CRISTAL/.test(v.marca)).reduce((s, v) => s + v.cantidad, 0);
  const ron = ventas.filter((v) => /RON VIEJO/.test(v.marca)).reduce((s, v) => s + v.cantidad, 0);

  const porDia = agrupar(medidos, (t) => t.dia);
  const maxDia = Math.max(1, ...porDia.map(([, l]) => l.length));
  const porImpulsadora = agrupar(medidos, (t) => t.impulsadora)
    .map(([nombre, l]) => ({ nombre, l, tasa: cuenta(l, "cumplido") / l.length }))
    .sort((a, b) => a.tasa - b.tasa || b.l.length - a.l.length);

  if (!turnos.length) return <Vacio>Este periodo todavía no tiene turnos publicados.</Vacio>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi valor={String(turnos.length)} etiqueta="Turnos programados" />
        <Kpi
          valor={medidos.length ? porcentaje(tasa) : "–"}
          etiqueta={`Turnos cumplidos · meta ${porcentaje(META_CUMPLIMIENTO)}`}
          tono={!medidos.length ? undefined : tasa >= META_CUMPLIMIENTO ? "ok" : "error"}
        />
        <Kpi valor={String(cuenta(medidos, "sin_reportes"))} etiqueta="Turnos sin ningún reporte" />
        <Kpi valor={String(cuenta(medidos, "cambio_pdv"))} etiqueta="Turnos en otro PDV" />
        <Kpi valor={`${numero(aguardiente)} / ${numero(ron)}`} etiqueta="Uds aguardiente / ron" />
      </div>

      <Tarjeta titulo="Cumplimiento de turnos por día">
        {porDia.length === 0 ? (
          <p className="text-sm text-suave">Se mostrará cuando terminen los primeros turnos.</p>
        ) : (
          <>
            <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
              {ESTADOS.map((e) => (
                <li key={e.id} className="flex items-center gap-1.5 text-xs text-suave">
                  <span aria-hidden className="size-2.5 rounded-sm" style={{ background: e.color }} />
                  {e.texto}
                </li>
              ))}
            </ul>
            <ul className="space-y-2.5">
              {porDia.map(([dia, lista]) => (
                <li key={dia} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-2">
                  <span className="text-sm">{fechaCorta(dia).slice(0, -4)}</span>
                  <div className="flex h-5 gap-0.5" style={{ width: `${(lista.length / maxDia) * 100}%` }}>
                    {ESTADOS.map((e) => {
                      const n = cuenta(lista, e.id);
                      return n ? (
                        <span
                          key={e.id}
                          title={`${e.texto}: ${n}`}
                          className="h-full first:rounded-l last:rounded-r"
                          style={{ flexGrow: n, background: e.color }}
                        />
                      ) : null;
                    })}
                  </div>
                  <span className="text-right text-sm tabular-nums">{lista.length}</span>
                </li>
              ))}
            </ul>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-marca">Ver como tabla</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="tabla">
                  <thead>
                    <tr><th>Día</th>{ESTADOS.map((e) => <th key={e.id} className="num">{e.texto}</th>)}</tr>
                  </thead>
                  <tbody>
                    {porDia.map(([dia, lista]) => (
                      <tr key={dia}>
                        <td>{fechaCorta(dia)}</td>
                        {ESTADOS.map((e) => <td key={e.id} className="num">{cuenta(lista, e.id)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </Tarjeta>

      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta titulo="Cumplimiento por impulsadora">
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Impulsadora</th><th className="num">Turnos</th><th className="num">Sin reporte</th>
                  <th className="num">Sin ventas</th><th className="num">Otro PDV</th><th className="num">Tiempo incompleto</th><th className="num">% cumplido</th>
                </tr>
              </thead>
              <tbody>
                {porImpulsadora.map((i) => (
                  <tr key={i.nombre}>
                    <td>{i.nombre}</td>
                    <td className="num">{i.l.length}</td>
                    <td className="num">{cuenta(i.l, "sin_reportes")}</td>
                    <td className="num">{cuenta(i.l, "falta_ventas")}</td>
                    <td className="num">{cuenta(i.l, "cambio_pdv")}</td>
                    <td className="num">{cuenta(i.l, "tiempo_incompleto")}</td>
                    <td className={`num font-semibold ${i.tasa >= META_CUMPLIMIENTO ? "text-ok" : "text-error"}`}>{porcentaje(i.tasa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
        <Tarjeta titulo="Ejecución por canal">
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr><th>Canal</th><th className="num">Total</th><th className="num">Proyectados</th><th className="num">Dif.</th><th className="num">Uds por turno</th></tr>
              </thead>
              <tbody>
                {canales.map((c) => {
                  const lista = turnos.filter((t) => t.canal === c.codigo);
                  const conVenta = lista.filter((t) => t.con_ventas);
                  const uds = conVenta.reduce((s, t) => s + t.unidades, 0);
                  return (
                    <tr key={c.codigo}>
                      <td>{c.nombre}</td>
                      <td className="num">{lista.length}</td>
                      <td className="num">{c.meta_semanal}</td>
                      <td className="num">{lista.length - c.meta_semanal}</td>
                      <td className="num">{conVenta.length ? numero(uds / conVenta.length, 1) : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Control de asistencia">
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Turno</th><th>Impulsadora</th><th>Punto</th><th>Entrada</th><th>Salida</th>
                <th className="num">Trabajado</th><th>Ubicación</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {turnos.map((t) => {
                const estado = ESTADOS.find((e) => e.id === t.estado)!;
                return (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap">{fechaCorta(t.inicio)}, {hora(t.inicio)}</td>
                    <td>{t.impulsadora}</td>
                    <td>{t.lugar}</td>
                    <td className="whitespace-nowrap">
                      {t.entrada_hora ? <a className="text-marca underline" href={`/api/fotos/${t.entrada_foto}`} target="_blank" rel="noreferrer">{hora(t.entrada_hora)}</a> : "–"}
                    </td>
                    <td className="whitespace-nowrap">
                      {t.salida_hora ? <a className="text-marca underline" href={`/api/fotos/${t.salida_foto}`} target="_blank" rel="noreferrer">{hora(t.salida_hora)}</a> : "–"}
                    </td>
                    <td className={`num whitespace-nowrap ${t.estado === "tiempo_incompleto" ? "font-semibold text-error" : ""}`}>
                      {t.entrada_hora && t.salida_hora ? duracion(aMinutos(t.salida_hora) - aMinutos(t.entrada_hora)) : "–"}
                    </td>
                    <td className="whitespace-nowrap">
                      {!t.entrada_hora ? "–" : t.distancia_m === null ? "Punto sin ubicación" : `${numero(t.distancia_m)} m`}
                    </td>
                    <td>
                      {t.terminado ? (
                        <Insignia tono={t.estado === "cumplido" ? "ok" : t.estado === "sin_reportes" ? "error" : "alerta"}>{estado.texto}</Insignia>
                      ) : (
                        <Insignia>{t.iniciado ? "En curso" : "Programado"}</Insignia>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
