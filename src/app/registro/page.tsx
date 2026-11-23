import { sql } from "@/lib/db";
import { MUNICIPIOS } from "@/lib/formato";
import { registrarVendedor } from "./acciones";

type Params = Promise<{ c?: string; error?: string }>;

export default async function RegistroPage({ searchParams }: { searchParams: Params }) {
  const { c, error } = await searchParams;
  const valido = Boolean(process.env.REGISTRO_CODIGO) && c === process.env.REGISTRO_CODIGO;
  const canales = valido ? await sql`SELECT codigo, nombre FROM canales ORDER BY orden` : [];

  return (
    <main className="patron-noche flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[480px] bg-fondo p-2.5 shadow-tarjeta">
        <div className="border border-arena px-6 py-8 sm:px-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/sello.svg" alt="Lico Distribuciones, tradición y excelencia" className="mx-auto size-32" />
          <h1 className="titulo mt-5 text-center text-xl">Registro de vendedores</h1>
          {!valido ? (
            <p className="mt-4 text-center text-sm text-suave">
              Este enlace de registro no es válido. Pídele a Trade Marketing el enlace actualizado.
            </p>
          ) : (
            <>
              <p className="mt-2 text-center text-sm text-suave">Con tu cédula entrarás a la app para enviar tus solicitudes de impulso.</p>
              <form action={registrarVendedor} className="mt-6 space-y-4">
                <input type="hidden" name="c" value={c} />
                <div>
                  <label htmlFor="nombre" className="etiqueta">Nombre completo</label>
                  <input id="nombre" name="nombre" className="campo" autoComplete="name" maxLength={80} required />
                </div>
                <div>
                  <label htmlFor="cedula" className="etiqueta">Cédula</label>
                  <input id="cedula" name="cedula" className="campo" inputMode="numeric" pattern="[0-9.\s]{5,15}" required />
                </div>
                <div>
                  <label htmlFor="canal" className="etiqueta">Canal</label>
                  <select id="canal" name="canal" defaultValue="" className="campo" required>
                    <option value="" disabled>Selecciona tu canal</option>
                    {canales.map((x) => <option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="municipio" className="etiqueta">Municipio</label>
                  <select id="municipio" name="municipio" defaultValue="ARMENIA" className="campo" required>
                    {MUNICIPIOS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="correo" className="etiqueta">Correo (opcional)</label>
                  <input id="correo" name="correo" type="email" className="campo" autoComplete="email" maxLength={120} />
                  <p className="mt-1 text-xs text-suave">Para avisarte cuando aprueben o no tus solicitudes.</p>
                </div>
                {error && (
                  <p role="alert" className="rounded-xl bg-error-claro px-4 py-3 text-sm font-medium text-error">{error}</p>
                )}
                <button className="boton w-full">Registrarme</button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
