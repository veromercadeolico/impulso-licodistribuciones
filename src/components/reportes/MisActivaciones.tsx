import { Insignia, Kpi, Tarjeta, Vacio } from "@/components/ui";
import { sql } from "@/lib/db";
import { fechaCorta, hora, numero } from "@/lib/formato";

export async function MisActivaciones({ periodoId, vendedorId, publicado }: { periodoId: string; vendedorId: string; publicado: boolean }) {
  const filas = await sql`SELECT s.id, s.fecha::text, s.hora::text, s.estado, s.motivo_rechazo, p.nombre AS lugar, p.municipio,
      u.nombre AS impulsadora, r.id IS NOT NULL AS reportado,
      COALESCE((SELECT sum(i.cantidad) FROM reporte_items i WHERE i.reporte_id = r.id), 0)::int AS unidades
    FROM solicitudes s JOIN puntos p ON p.id = s.punto_id
    LEFT JOIN turnos t ON t.solicitud_id = s.id AND t.publicado AND NOT t.cancelado
    LEFT JOIN usuarios u ON u.id = t.impulsadora_id
    LEFT JOIN reportes_venta r ON r.turno_id = t.id
    WHERE s.vendedor_id = ${vendedorId} AND s.periodo_id = ${periodoId}
    ORDER BY s.fecha, s.hora`;
  if (!filas.length) return <Vacio>No tienes solicitudes en este periodo.</Vacio>;

  const aprobadas = filas.filter((f) => f.estado === "aprobada").length;
  const rechazadas = filas.filter((f) => f.estado === "rechazada").length;
  const unidades = filas.reduce((s, f) => s + f.unidades, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Kpi valor={publicado ? String(aprobadas) : "–"} etiqueta="Aprobadas" />
        <Kpi valor={publicado ? String(rechazadas) : "–"} etiqueta="No aprobadas" />
        <Kpi valor={numero(unidades)} etiqueta="Unidades vendidas" />
      </div>
      <Tarjeta titulo="Ventas en mis puntos">
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr><th>Fecha</th><th>Punto</th><th>Decisión</th><th>Impulsadora</th><th className="num">Unidades</th></tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td className="whitespace-nowrap">{fechaCorta(f.fecha)}, {hora(f.hora)}</td>
                  <td>{f.lugar}<br /><span className="text-xs text-suave">{f.municipio}</span></td>
                  <td>
                    {!publicado || f.estado === "pendiente" ? <Insignia>En revisión</Insignia>
                      : f.estado === "aprobada" ? <Insignia tono="ok">Aprobada</Insignia>
                      : <Insignia tono="error">No aprobada</Insignia>}
                  </td>
                  <td>{f.impulsadora ?? "–"}</td>
                  <td className="num">{f.reportado ? f.unidades : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
