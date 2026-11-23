import Link from "next/link";
import { Icono, type NombreIcono } from "@/components/iconos";
import { Encabezado, Insignia, SelectorPeriodo, Uniforme, Vacio } from "@/components/ui";
import { exigirUsuario } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fechaCorta, fechaLarga, horario, nombrePeriodo } from "@/lib/formato";
import { periodoSeleccionado } from "@/lib/periodos";

type Params = Promise<{ p?: string; dia?: string; canal?: string }>;

const ICONOS_CANAL: Record<string, NombreIcono> = {
  SUPERMERCADOS: "carrito",
  TAT: "tienda",
  CONSUMO: "copa",
  MAYORISTAS: "camion",
  EVENTOS: "estrella",
  FIESTAS: "bandera",
};

function Categoria({ href, activo, icono, children }: { href: string; activo: boolean; icono: NombreIcono; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? "true" : undefined}
      className={`flex min-w-20 shrink-0 flex-col items-center gap-1.5 border-b-2 px-1 pt-1 pb-3 text-xs font-semibold whitespace-nowrap transition-colors ${
        activo ? "border-marca text-tinta" : "border-transparent text-suave hover:border-borde hover:text-tinta"
      }`}
    >
      <Icono nombre={icono} className="size-6" />
      {children}
    </Link>
  );
}

function FiltroDia({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? "true" : undefined}
      className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors ${
        activo ? "border-tinta bg-tinta text-fondo" : "border-arena bg-transparent text-tinta hover:border-tinta"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function CalendarioPage({ searchParams }: { searchParams: Params }) {
  const usuario = await exigirUsuario();
  const sp = await searchParams;
  const { actual, lista } = await periodoSeleccionado(sp.p);
  const veBorradores = usuario.rol === "trade" || usuario.rol === "admin";

  const [turnos, degustacion, canales] = await Promise.all([
    sql`SELECT t.id, t.inicio::text, t.fin::text, t.inicio::date::text AS dia, t.canal, t.uniforme, t.publicado,
        c.nombre AS canal_nombre, c.orden, m.nombre AS marca, p.nombre AS lugar, p.municipio, u.nombre AS impulsadora,
        s.notas, s.obsequios
      FROM turnos t JOIN canales c ON c.codigo = t.canal JOIN marcas m ON m.codigo = t.marca
      JOIN puntos p ON p.id = t.punto_id JOIN usuarios u ON u.id = t.impulsadora_id
      LEFT JOIN solicitudes s ON s.id = t.solicitud_id
      WHERE t.periodo_id = ${actual.id} AND NOT t.cancelado AND (t.publicado OR ${veBorradores})
      ORDER BY t.inicio, c.orden, p.nombre`,
    sql`SELECT d.turno_id, d.asignado, d.presentacion, d.marca, d.tipo FROM degustacion d
      JOIN turnos t ON t.id = d.turno_id WHERE t.periodo_id = ${actual.id}`,
    sql`SELECT codigo, nombre FROM canales ORDER BY orden`,
  ]);

  const dias = [...new Set(turnos.map((t) => t.dia as string))];
  const url = (cambios: { dia?: string; canal?: string }) => {
    const q = new URLSearchParams({ p: actual.id });
    const dia = "dia" in cambios ? cambios.dia : sp.dia;
    const canal = "canal" in cambios ? cambios.canal : sp.canal;
    if (dia) q.set("dia", dia);
    if (canal) q.set("canal", canal);
    return `/calendario?${q}`;
  };
  const visibles = turnos.filter((t) => (!sp.dia || t.dia === sp.dia) && (!sp.canal || t.canal === sp.canal));
  const diasVisibles = dias.filter((d) => visibles.some((t) => t.dia === d));

  return (
    <>
      <Encabezado titulo="Programación" detalle={`${nombrePeriodo(actual.fecha_inicio, actual.fecha_fin)} · ${visibles.length} ${visibles.length === 1 ? "turno" : "turnos"}`}>
        <SelectorPeriodo ruta="/calendario" actual={actual} lista={lista} />
      </Encabezado>

      <nav aria-label="Canales" className="sin-barra -mx-4 mb-5 flex gap-5 overflow-x-auto px-4 shadow-[inset_0_-1px_0_var(--color-linea)] sm:mx-0 sm:px-0">
        <Categoria href={url({ canal: undefined })} activo={!sp.canal} icono="lista">Todos</Categoria>
        {canales.map((c) => (
          <Categoria key={c.codigo} href={url({ canal: c.codigo })} activo={sp.canal === c.codigo} icono={ICONOS_CANAL[c.codigo] ?? "lista"}>
            {c.nombre}
          </Categoria>
        ))}
      </nav>
      <div className="sin-barra -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <FiltroDia href={url({ dia: undefined })} activo={!sp.dia}>Fin de semana</FiltroDia>
        {dias.map((d) => <FiltroDia key={d} href={url({ dia: d })} activo={sp.dia === d}>{fechaCorta(d)}</FiltroDia>)}
      </div>

      {diasVisibles.length === 0 && <Vacio>No hay turnos publicados con estos filtros.</Vacio>}
      <div className="space-y-10">
        {diasVisibles.map((dia) => {
          const delDia = visibles.filter((t) => t.dia === dia);
          const canalesDia = [...new Set(delDia.map((t) => t.canal_nombre as string))];
          return (
            <section key={dia}>
              <h2 className="mb-4 text-lg font-semibold">{fechaLarga(dia)}</h2>
              <div className="grid gap-5 lg:grid-cols-2">
                {canalesDia.map((canal) => (
                  <div key={canal} className="tarjeta min-w-0">
                    <h3 className="mb-3 font-semibold">{canal}</h3>
                    <ul className="divide-y divide-linea">
                      {delDia.filter((t) => t.canal_nombre === canal).map((t) => {
                        const deg = degustacion.filter((d) => d.turno_id === t.id);
                        return (
                          <li key={t.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                            <div className="min-w-0">
                              <p className="font-medium">{t.lugar}</p>
                              <p className="text-sm text-suave">{t.municipio} · {horario(t.inicio, t.fin)}</p>
                              <p className="text-sm text-suave">{t.impulsadora}</p>
                              {deg.length > 0 && (
                                <p className="mt-0.5 text-xs text-suave">
                                  Degustación y obsequios: {deg.map((d) => `${d.asignado} ${d.presentacion} ${d.marca}${d.tipo === "obsequio" ? " (obsequio)" : ""}`).join(", ")}
                                </p>
                              )}
                              {t.obsequios && <p className="mt-0.5 text-xs text-suave">Producto para regalar: {t.obsequios}</p>}
                              {t.notas && <p className="mt-0.5 text-xs text-suave">Adicionales: {t.notas}</p>}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {!t.publicado && <Insignia tono="alerta">Borrador</Insignia>}
                              <Uniforme codigo={t.uniforme} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
