import Link from "next/link";
import { Avisos, Encabezado, Tarjeta, Uniforme } from "@/components/ui";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { hoyBogota, MUNICIPIOS, SERVICIOS } from "@/lib/formato";
import { crearSolicitud } from "../acciones";

const COLOR_UNIFORME: Record<string, string> = { AA: "amarillo", ESE: "azul", RVC: "rojo" };

export default async function NuevaSolicitudPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const usuario = await exigirRol("vendedor", "trade");
  const { error, ok } = await searchParams;
  const esTrade = usuario.rol === "trade";
  const [canales, marcas, puntos] = await Promise.all([
    sql`SELECT codigo, nombre FROM canales ORDER BY orden`,
    sql`SELECT codigo, nombre, uniforme FROM marcas
      ORDER BY array_position(ARRAY['AA','ESE','RVC','CARTA_ORO','JUAN_CRUZ','CHEERS'], codigo), nombre`,
    sql`SELECT DISTINCT nombre FROM puntos ORDER BY nombre`,
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <Encabezado titulo="Nueva solicitud" detalle="Impulso o bartender. La fecha y hora de envío se guardan automáticamente." />
      <Avisos ok={ok} error={error} />
      <Tarjeta>
        <form action={crearSolicitud} className="space-y-5">
          <fieldset>
            <legend className="etiqueta">Tipo de servicio</legend>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(SERVICIOS).map(([valor, texto]) => (
                <label
                  key={valor}
                  className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-linea bg-white px-3 text-sm font-semibold has-[:checked]:border-tinta has-[:checked]:bg-tinta has-[:checked]:text-fondo"
                >
                  <input type="radio" name="servicio" value={valor} defaultChecked={valor === "impulso"} className="sr-only" />
                  {texto}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-suave">El bartender no registra entrada, salida ni reporte de ventas.</p>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="fecha" className="etiqueta">Fecha de la activación</label>
              <input id="fecha" name="fecha" type="date" min={hoyBogota()} className="campo" required />
            </div>
            <div>
              <label htmlFor="hora" className="etiqueta">Hora de inicio</label>
              <input id="hora" name="hora" type="time" className="campo" required />
            </div>
          </div>
          <div>
            <label htmlFor="canal" className="etiqueta">Canal</label>
            <select id="canal" name="canal" defaultValue={usuario.canal ?? ""} className="campo" required>
              <option value="" disabled>Selecciona</option>
              {canales.map((c) => (
                <option key={c.codigo} value={c.codigo}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend className="etiqueta">Marcas a activar</legend>
            <p className="mb-2 text-xs text-suave">Puedes elegir varias. Se programa una impulsadora por cada marca.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {marcas.map((m) => (
                <label key={m.codigo} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-linea bg-white px-3 py-2 text-sm has-[:checked]:border-tinta has-[:checked]:bg-gris">
                  <input type="checkbox" name="marca" value={m.codigo} className="size-5 accent-marca" />
                  <span className="min-w-0 flex-1">{m.nombre}</span>
                  <Uniforme codigo={m.uniforme} />
                  <span className="sr-only">uniforme {COLOR_UNIFORME[m.uniforme]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="lugar" className="etiqueta">Lugar o establecimiento</label>
            <input id="lugar" name="lugar" list="lista-puntos" className="campo" maxLength={120} required />
            <datalist id="lista-puntos">
              {puntos.map((p) => <option key={p.nombre} value={p.nombre} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor="direccion" className="etiqueta">Dirección (opcional)</label>
            <input id="direccion" name="direccion" className="campo" maxLength={160} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="municipio" className="etiqueta">Municipio</label>
              <select id="municipio" name="municipio" defaultValue={usuario.municipio ?? ""} className="campo" required>
                <option value="" disabled>Selecciona</option>
                {MUNICIPIOS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="prioridad" className="etiqueta">Relevancia</label>
              <select id="prioridad" name="prioridad" defaultValue="" className="campo">
                <option value="">Sin definir (por orden de llegada)</option>
                <option value="1">Alta</option>
                <option value="2">Media</option>
                <option value="3">Baja</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="obsequios" className="etiqueta">Producto para regalar (opcional)</label>
            <input id="obsequios" name="obsequios" className="campo" maxLength={300} placeholder="Ejemplo: 6 cuartos de ron, 20 shots de Amarillo" />
            <p className="mt-1 text-xs text-suave">Obsequios por compra. No cuentan como degustación.</p>
          </div>
          <div>
            <label htmlFor="notas" className="etiqueta">Adicionales</label>
            <textarea id="notas" name="notas" rows={3} maxLength={500} className="campo" />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link href={esTrade ? "/programacion" : "/solicitudes"} className="boton-sec">Cancelar</Link>
            {esTrade ? (
              <>
                <button name="despues" value="otra" className="boton-sec">Enviar y crear otra</button>
                <button name="despues" value="programacion" className="boton">Enviar y ver programación</button>
              </>
            ) : (
              <button className="boton">Enviar solicitud</button>
            )}
          </div>
        </form>
      </Tarjeta>
    </div>
  );
}
