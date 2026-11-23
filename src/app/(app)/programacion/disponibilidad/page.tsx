import { MarcarTodas } from "@/components/MarcarTodas";
import { Avisos, Encabezado, SelectorPeriodo } from "@/components/ui";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fechaCorta } from "@/lib/formato";
import { diasDePeriodo, periodoSeleccionado } from "@/lib/periodos";
import { guardarDisponibilidad } from "../acciones";
import { PestanasProgramacion } from "../pestanas";

type Params = Promise<{ p?: string; ok?: string; error?: string }>;

export default async function DisponibilidadPage({ searchParams }: { searchParams: Params }) {
  await exigirRol("trade");
  const sp = await searchParams;
  const { actual, lista } = await periodoSeleccionado(sp.p);
  const dias = diasDePeriodo(actual);
  const [impulsadoras, marcadas] = await Promise.all([
    sql`SELECT id, nombre, municipio FROM usuarios WHERE rol = 'impulsadora' AND activo ORDER BY municipio NULLS LAST, nombre`,
    sql`SELECT impulsadora_id, fecha::text, franja FROM disponibilidad
      WHERE fecha BETWEEN ${actual.fecha_inicio} AND ${actual.fecha_fin}`,
  ]);
  const activas = new Set(marcadas.map((m) => `${m.impulsadora_id}|${m.fecha}|${m.franja}`));

  return (
    <>
      <Encabezado titulo="Disponibilidad de impulsadoras" detalle="T: tarde, antes de las 6:00 PM. N: noche, desde las 6:00 PM.">
        <SelectorPeriodo ruta="/programacion/disponibilidad" actual={actual} lista={lista} />
      </Encabezado>
      <PestanasProgramacion periodo={actual.id} activa="disponibilidad" />
      <Avisos ok={sp.ok} error={sp.error} />
      <form id="form-disp" action={guardarDisponibilidad}>
        <input type="hidden" name="periodo" value={actual.id} />
        <div className="mb-3 flex flex-wrap justify-between gap-2">
          <MarcarTodas formulario="form-disp" />
          <button className="boton">Guardar disponibilidad</button>
        </div>
        <div className="tarjeta overflow-x-auto p-2.5">
          <table className="tabla">
            <thead>
              <tr>
                <th className="sticky left-0 z-[1] bg-gris" rowSpan={2}>Impulsadora</th>
                {dias.map((d) => <th key={d} colSpan={2} className="text-center">{fechaCorta(d)}</th>)}
              </tr>
              <tr>
                {dias.flatMap((d) => [
                  <th key={`${d}t`} className="text-center">T</th>,
                  <th key={`${d}n`} className="text-center">N</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {impulsadoras.map((i) => (
                <tr key={i.id}>
                  <td className="sticky left-0 z-[1] min-w-44 bg-gris">
                    <span className="font-medium">{i.nombre}</span>
                    <br />
                    <span className="text-xs text-suave">{i.municipio ?? "Sin municipio"}</span>
                  </td>
                  {dias.flatMap((d) =>
                    (["tarde", "noche"] as const).map((f) => {
                      const valor = `${i.id}|${d}|${f}`;
                      return (
                        <td key={valor} className="text-center">
                          <input
                            type="checkbox"
                            name="d"
                            value={valor}
                            defaultChecked={activas.has(valor)}
                            aria-label={`${i.nombre}, ${fechaCorta(d)}, ${f}`}
                            className="size-5 accent-marca"
                          />
                        </td>
                      );
                    }),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </form>
    </>
  );
}
