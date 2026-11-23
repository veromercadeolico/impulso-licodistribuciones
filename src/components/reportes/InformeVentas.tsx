import { Kpi, Tarjeta, Vacio } from "@/components/ui";
import { fechaLarga, numero } from "@/lib/formato";
import { cajas } from "@/lib/reglas";
import { agrupar, ventasDelPeriodo } from "@/lib/reportes";

export async function InformeVentas({ periodoId }: { periodoId: string }) {
  const ventas = await ventasDelPeriodo(periodoId);
  if (!ventas.length) return <Vacio>Todavía no hay ventas reportadas en este periodo.</Vacio>;

  const referencias = agrupar(ventas, (v) => String(v.item))
    .map(([, l]) => l[0])
    .sort((a, b) => a.marca.localeCompare(b.marca) || a.ml - b.ml);
  const totalUds = ventas.reduce((s, v) => s + v.cantidad, 0);
  const totalCajas = ventas.reduce((s, v) => s + cajas(v.cantidad, v.unidades_caja), 0);
  const puntos = new Set(ventas.map((v) => v.turno_id)).size;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Kpi valor={numero(totalUds)} etiqueta="Unidades" />
        <Kpi valor={numero(totalCajas, 2)} etiqueta="Cajas" />
        <Kpi valor={String(puntos)} etiqueta="Turnos con venta" />
      </div>
      {agrupar(ventas, (v) => v.dia).map(([dia, delDia]) => {
        const filas = agrupar(delDia, (v) => v.turno_id);
        const suma = (l: typeof ventas, item: number) => l.filter((v) => v.item === item).reduce((s, v) => s + v.cantidad, 0);
        return (
          <Tarjeta key={dia} titulo={`${fechaLarga(dia)} · ${filas.length} ${filas.length === 1 ? "punto" : "puntos"}`}>
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Establecimiento</th>
                    {referencias.map((r) => <th key={r.item} className="num" title={r.descripcion}>{r.referencia}</th>)}
                    <th className="num">TOT</th><th className="num">CAJ</th><th>Pers. asignada</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(([id, l]) => (
                    <tr key={id}>
                      <td className="whitespace-nowrap">{l[0].lugar}</td>
                      {referencias.map((r) => <td key={r.item} className="num">{suma(l, r.item) || ""}</td>)}
                      <td className="num font-semibold">{l.reduce((s, v) => s + v.cantidad, 0)}</td>
                      <td className="num">{numero(l.reduce((s, v) => s + cajas(v.cantidad, v.unidades_caja), 0), 2)}</td>
                      <td className="whitespace-nowrap">{l[0].impulsadora}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td>Total</td>
                    {referencias.map((r) => <td key={r.item} className="num">{suma(delDia, r.item) || ""}</td>)}
                    <td className="num">{delDia.reduce((s, v) => s + v.cantidad, 0)}</td>
                    <td className="num">{numero(delDia.reduce((s, v) => s + cajas(v.cantidad, v.unidades_caja), 0), 2)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </Tarjeta>
        );
      })}
    </div>
  );
}
