import { Kpi, Tarjeta, Vacio } from "@/components/ui";
import { sql } from "@/lib/db";
import { nombrePeriodo, numero } from "@/lib/formato";
import { cajas, unidadesReducidas } from "@/lib/reglas";
import { agrupar, turnosDelPeriodo, ventasDelPeriodo, type VentaDetalle } from "@/lib/reportes";

function Ranking({ titulo, etiqueta, ventas, clave }: {
  titulo: string;
  etiqueta: string;
  ventas: VentaDetalle[];
  clave: (v: VentaDetalle) => string;
}) {
  const filas = agrupar(ventas, clave)
    .map(([nombre, l]) => ({
      nombre,
      uds: l.reduce((s, v) => s + v.cantidad, 0),
      red: l.reduce((s, v) => s + unidadesReducidas(v.cantidad, v.ml), 0),
    }))
    .sort((a, b) => b.red - a.red);
  return (
    <Tarjeta titulo={titulo}>
      <div className="overflow-x-auto">
        <table className="tabla">
          <thead><tr><th>{etiqueta}</th><th className="num">Unidades</th><th className="num">Uds reducidas</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.nombre}>
                <td>{f.nombre}</td>
                <td className="num">{numero(f.uds)}</td>
                <td className="num">{numero(f.red, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}

export async function DesempenoCanal({ periodoId, canal }: { periodoId: string; canal: string | null }) {
  const [ventas, turnos, tendencia] = await Promise.all([
    ventasDelPeriodo(periodoId, canal),
    turnosDelPeriodo(periodoId, canal),
    sql`SELECT pe.fecha_inicio::text, pe.fecha_fin::text,
        COALESCE(sum(i.cantidad), 0)::int AS uds, COALESCE(sum(i.cantidad * pr.ml / 750.0), 0)::float AS red
      FROM periodos pe
      LEFT JOIN turnos t ON t.periodo_id = pe.id AND NOT t.cancelado AND (${canal}::text IS NULL OR t.canal = ${canal})
      LEFT JOIN reportes_venta r ON r.turno_id = t.id
      LEFT JOIN reporte_items i ON i.reporte_id = r.id
      LEFT JOIN productos pr ON pr.item = i.producto_item
      WHERE pe.fecha_inicio <= (SELECT fecha_inicio FROM periodos WHERE id = ${periodoId})
      GROUP BY pe.id ORDER BY pe.fecha_inicio DESC LIMIT 8`,
  ]);
  const uds = ventas.reduce((s, v) => s + v.cantidad, 0);
  const red = ventas.reduce((s, v) => s + unidadesReducidas(v.cantidad, v.ml), 0);
  const cj = ventas.reduce((s, v) => s + cajas(v.cantidad, v.unidades_caja), 0);
  const conVenta = turnos.filter((t) => t.con_ventas).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi valor={numero(uds)} etiqueta="Unidades vendidas" />
        <Kpi valor={numero(red, 1)} etiqueta="Unidades reducidas (750 ml)" />
        <Kpi valor={numero(cj, 1)} etiqueta="Cajas" />
        <Kpi valor={conVenta ? numero(uds / conVenta, 1) : "–"} etiqueta={`Uds por turno · ${conVenta} de ${turnos.length} turnos`} />
      </div>
      <Tarjeta titulo="Evolución semanal">
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead><tr><th>Semana</th><th className="num">Unidades</th><th className="num">Uds reducidas</th></tr></thead>
            <tbody>
              {tendencia.map((t) => (
                <tr key={t.fecha_inicio}>
                  <td>{nombrePeriodo(t.fecha_inicio, t.fecha_fin)}</td>
                  <td className="num">{numero(t.uds)}</td>
                  <td className="num">{numero(t.red, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
      {ventas.length === 0 ? (
        <Vacio>Todavía no hay ventas reportadas en este periodo.</Vacio>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Ranking titulo="Por marca" etiqueta="Marca" ventas={ventas} clave={(v) => v.marca} />
          <Ranking titulo="Por punto" etiqueta="Punto" ventas={ventas} clave={(v) => v.lugar} />
          <Ranking titulo="Por municipio" etiqueta="Municipio" ventas={ventas} clave={(v) => v.municipio} />
          <Ranking titulo="Por impulsadora" etiqueta="Impulsadora" ventas={ventas} clave={(v) => v.impulsadora} />
        </div>
      )}
    </div>
  );
}
