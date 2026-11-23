import { Avisos, Encabezado, SelectorPeriodo, Tarjeta, Uniforme, Vacio } from "@/components/ui";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fechaCorta, horario, PRESENTACIONES } from "@/lib/formato";
import { periodoSeleccionado } from "@/lib/periodos";
import { asignarDegustacion, guardarOficina, quitarDegustacion } from "../acciones";
import { PestanasProgramacion } from "../pestanas";

type Params = Promise<{ p?: string; ok?: string; error?: string }>;

export default async function DegustacionPage({ searchParams }: { searchParams: Params }) {
  await exigirRol("trade");
  const sp = await searchParams;
  const { actual, lista } = await periodoSeleccionado(sp.p);
  const [turnos, asignada, consolidado, marcas] = await Promise.all([
    sql`SELECT t.id, t.inicio::text, t.fin::text, t.marca, t.uniforme, p.nombre AS lugar, u.nombre AS impulsadora, s.obsequios
      FROM turnos t JOIN puntos p ON p.id = t.punto_id JOIN usuarios u ON u.id = t.impulsadora_id
      LEFT JOIN solicitudes s ON s.id = t.solicitud_id
      WHERE t.periodo_id = ${actual.id} AND NOT t.cancelado ORDER BY t.inicio, p.nombre`,
    sql`SELECT d.id, d.turno_id, d.marca, d.presentacion, d.tipo, d.asignado, d.usado, d.sobrante
      FROM degustacion d JOIN turnos t ON t.id = d.turno_id
      WHERE t.periodo_id = ${actual.id} AND NOT t.cancelado ORDER BY d.marca, d.presentacion`,
    sql`SELECT x.marca, x.presentacion, string_agg(DISTINCT x.tipo, ',') AS tipos, sum(x.asignado)::int AS asignado, sum(x.usado)::int AS usado,
        sum(x.sobrante)::int AS sobrante, COALESCE(max(o.cantidad), 0)::int AS oficina
      FROM (SELECT d.* FROM degustacion d JOIN turnos t ON t.id = d.turno_id
            WHERE t.periodo_id = ${actual.id} AND NOT t.cancelado) x
      LEFT JOIN inventario_oficina o ON o.periodo_id = ${actual.id} AND o.marca = x.marca AND o.presentacion = x.presentacion
      GROUP BY x.marca, x.presentacion ORDER BY x.marca, x.presentacion`,
    sql`SELECT codigo, nombre FROM marcas ORDER BY nombre`,
  ]);

  return (
    <>
      <Encabezado titulo="Degustación y obsequios" detalle="Asigna por turno y consulta cuánto debes solicitar.">
        <SelectorPeriodo ruta="/programacion/degustacion" actual={actual} lista={lista} />
      </Encabezado>
      <PestanasProgramacion periodo={actual.id} activa="degustacion" />
      <Avisos ok={sp.ok} error={sp.error} />

      <Tarjeta titulo="Consolidado a solicitar" className="mb-5">
        {consolidado.length === 0 ? (
          <p className="text-sm text-suave">Aparecerá cuando asignes degustación u obsequios a los turnos.</p>
        ) : (
          <form action={guardarOficina}>
            <input type="hidden" name="periodo" value={actual.id} />
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Marca</th><th>Presentación</th><th>Uso</th><th className="num">Asignado</th><th className="num">En oficina</th>
                    <th className="num">A solicitar</th><th className="num">Usado</th><th className="num">Sobrante</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidado.map((c) => (
                    <tr key={`${c.marca}${c.presentacion}`}>
                      <td>{c.marca}</td>
                      <td>{c.presentacion}</td>
                      <td>{String(c.tipos).split(",").map((t) => (t === "obsequio" ? "Obsequio" : "Degustación")).join(" y ")}</td>
                      <td className="num">{c.asignado}</td>
                      <td className="num">
                        <input
                          name={`of|${c.marca}|${c.presentacion}`}
                          type="number"
                          min={0}
                          defaultValue={c.oficina}
                          aria-label={`En oficina, ${c.marca} ${c.presentacion}`}
                          className="campo ml-auto w-20 py-1 text-right"
                        />
                      </td>
                      <td className="num font-bold">{Math.max(0, c.asignado - c.oficina)}</td>
                      <td className="num">{c.usado ?? "–"}</td>
                      <td className="num">{c.sobrante ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="boton-sec mt-3">Guardar inventario de oficina</button>
          </form>
        )}
      </Tarjeta>

      <h2 className="titulo mb-4 text-base">Asignación por turno</h2>
      {turnos.length === 0 && <Vacio>Primero genera la programación del periodo.</Vacio>}
      <ul className="space-y-3">
        {turnos.map((t) => (
          <li key={t.id} className="tarjeta">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold">{t.lugar}</h3>
                <p className="text-sm text-suave">{fechaCorta(t.inicio)}, {horario(t.inicio, t.fin)} · {t.impulsadora}</p>
                {t.obsequios && <p className="mt-1 text-sm">Pedido del vendedor para regalar: {t.obsequios}</p>}
              </div>
              <Uniforme codigo={t.uniforme} />
            </div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {asignada.filter((d) => d.turno_id === t.id).map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-full bg-gris px-3 py-1.5 text-sm">
                  {d.asignado} {d.presentacion} {d.marca}
                  {d.tipo === "obsequio" && <span className="text-xs font-semibold text-marca-fuerte">obsequio</span>}
                  {d.usado === null && (
                    <form action={quitarDegustacion}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="periodo" value={actual.id} />
                      <button aria-label={`Quitar ${d.presentacion} ${d.marca}`} className="cursor-pointer px-1 font-bold text-error">×</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            <form action={asignarDegustacion} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[9rem_1fr_1fr_6rem_auto]">
              <input type="hidden" name="periodo" value={actual.id} />
              <input type="hidden" name="turno" value={t.id} />
              <select name="tipo" aria-label="Uso" className="campo">
                <option value="degustacion">Degustación</option>
                <option value="obsequio">Obsequio</option>
              </select>
              <select name="marca" defaultValue={t.marca} aria-label="Marca" className="campo">
                {marcas.map((m) => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
              </select>
              <select name="presentacion" aria-label="Presentación" className="campo">
                {PRESENTACIONES.map((p) => <option key={p}>{p}</option>)}
              </select>
              <input name="cantidad" type="number" min={1} required aria-label="Cantidad" placeholder="Cant." className="campo" />
              <button className="boton-sec">Asignar</button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
