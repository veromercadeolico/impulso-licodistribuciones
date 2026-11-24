import Link from "next/link";
import { Icono, type NombreIcono } from "@/components/iconos";
import { Encabezado, Insignia, SelectorPeriodo, Uniforme, Vacio } from "@/components/ui";
import { exigirUsuario } from "@/lib/auth";
import { sql } from "@/lib/db";
import {
  bloqueFinDeSemana,
  esClaveMes,
  esDiaDeFinDeSemana,
  esFecha,
  esFestivo,
  finesDeSemana,
  mesDe,
  mesesCerca,
  nombreBloque,
  viernesDe,
} from "@/lib/calendario";
import { fechaCorta, fechaLarga, horario, hoyBogota, nombrePeriodo } from "@/lib/formato";
import { periodoSeleccionado } from "@/lib/periodos";

type Params = Promise<{ p?: string; dia?: string; canal?: string; vista?: string; f?: string; m?: string }>;

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

function Selector({ nombre, etiqueta, valor, opciones, ocultos }: {
  nombre: string;
  etiqueta: string;
  valor: string;
  opciones: { valor: string; texto: string }[];
  ocultos: Record<string, string | undefined>;
}) {
  return (
    <form action="/calendario" className="flex items-center gap-2 rounded-full border border-linea bg-white py-1.5 pr-1.5 pl-6 shadow-suave transition-shadow hover:shadow-tarjeta">
      {Object.entries(ocultos).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <div>
        <label htmlFor={`sel-${nombre}`} className="block text-xs font-bold">{etiqueta}</label>
        <select id={`sel-${nombre}`} name={nombre} defaultValue={valor} className="-ml-1 cursor-pointer bg-transparent pr-1 text-sm text-suave outline-none">
          {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
      </div>
      <button aria-label={`Ver ${etiqueta.toLowerCase()}`} className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-marca text-white transition hover:bg-marca-fuerte">
        <Icono nombre="buscar" className="size-4" />
      </button>
    </form>
  );
}

type Vista = "finde" | "mes" | "semana";

export default async function CalendarioPage({ searchParams }: { searchParams: Params }) {
  const usuario = await exigirUsuario();
  const sp = await searchParams;
  // Por defecto, fin de semana. Si llega un periodo (p. ej. desde la pestaña de Trade), se muestra esa semana.
  const vista: Vista = sp.vista === "mes" || sp.vista === "semana" || sp.vista === "finde" ? sp.vista : sp.p ? "semana" : "finde";
  const { actual, lista } = await periodoSeleccionado(sp.p);
  const veBorradores = usuario.rol === "trade" || usuario.rol === "admin";
  const hoy = hoyBogota();

  // Rango de fechas según la vista: fin de semana (vie a dom, o a lun festivo), mes (1 al último día) o semana del periodo.
  const fines = finesDeSemana(hoy);
  const bloque = bloqueFinDeSemana(esFecha(sp.f) ? viernesDe(sp.f) : viernesDe(hoy));
  if (!fines.some((b) => b.inicio === bloque.inicio)) fines.push(bloque);
  const meses = mesesCerca(hoy);
  const mes = mesDe(esClaveMes(sp.m) ? sp.m : hoy.slice(0, 7));
  if (!meses.some((m) => m.clave === mes.clave)) meses.push(mes);
  const rango =
    vista === "finde" ? { inicio: bloque.inicio, fin: bloque.fin, nombre: nombreBloque(bloque, fechaCorta) }
    : vista === "mes" ? { inicio: mes.inicio, fin: mes.fin, nombre: `Mes de ${mes.nombre}` }
    : { inicio: actual.fecha_inicio, fin: actual.fecha_fin, nombre: nombrePeriodo(actual.fecha_inicio, actual.fecha_fin) };

  const [turnos, degustacion, canales] = await Promise.all([
    sql`SELECT t.id, t.inicio::text, t.fin::text, t.inicio::date::text AS dia, t.canal, t.uniforme, t.publicado,
        c.nombre AS canal_nombre, c.orden, m.nombre AS marca, p.nombre AS lugar, p.municipio, u.nombre AS impulsadora,
        s.notas, s.obsequios
      FROM turnos t JOIN canales c ON c.codigo = t.canal JOIN marcas m ON m.codigo = t.marca
      JOIN puntos p ON p.id = t.punto_id JOIN usuarios u ON u.id = t.impulsadora_id
      LEFT JOIN solicitudes s ON s.id = t.solicitud_id
      WHERE t.inicio::date BETWEEN ${rango.inicio}::date AND ${rango.fin}::date
        AND NOT t.cancelado AND (t.publicado OR ${veBorradores})
      ORDER BY t.inicio, c.orden, p.nombre`,
    sql`SELECT d.turno_id, d.asignado, d.presentacion, d.marca, d.tipo FROM degustacion d
      JOIN turnos t ON t.id = d.turno_id WHERE t.inicio::date BETWEEN ${rango.inicio}::date AND ${rango.fin}::date`,
    sql`SELECT codigo, nombre FROM canales ORDER BY orden`,
  ]);

  const dias = [...new Set(turnos.map((t) => t.dia as string))];
  const estado = { vista, f: vista === "finde" ? bloque.inicio : undefined, m: vista === "mes" ? mes.clave : undefined, p: vista === "semana" ? actual.id : undefined };
  const url = (cambios: { dia?: string; canal?: string; vista?: Vista }) => {
    const base = "vista" in cambios ? { vista: cambios.vista } : estado;
    const q = new URLSearchParams(Object.entries(base).filter((e): e is [string, string] => !!e[1]));
    const dia = "dia" in cambios || "vista" in cambios ? cambios.dia : sp.dia;
    const canal = "canal" in cambios ? cambios.canal : sp.canal;
    if (dia) q.set("dia", dia);
    if (canal) q.set("canal", canal);
    return `/calendario?${q}`;
  };
  const soloFinde = vista === "mes" && sp.dia === "finde";
  const visibles = turnos.filter(
    (t) => (!sp.dia || (soloFinde ? esDiaDeFinDeSemana(t.dia) : t.dia === sp.dia)) && (!sp.canal || t.canal === sp.canal),
  );
  const diasVisibles = dias.filter((d) => visibles.some((t) => t.dia === d));
  const ocultos = { vista, canal: sp.canal };

  return (
    <>
      <Encabezado titulo="Programación" detalle={`${rango.nombre} · ${visibles.length} ${visibles.length === 1 ? "turno" : "turnos"}`}>
        {vista === "finde" && (
          <Selector
            nombre="f"
            etiqueta="Fin de semana"
            valor={bloque.inicio}
            opciones={fines.sort((a, b) => a.inicio.localeCompare(b.inicio)).map((b) => ({ valor: b.inicio, texto: nombreBloque(b, fechaCorta) }))}
            ocultos={ocultos}
          />
        )}
        {vista === "mes" && (
          <Selector
            nombre="m"
            etiqueta="Mes"
            valor={mes.clave}
            opciones={meses.sort((a, b) => a.clave.localeCompare(b.clave)).map((m) => ({ valor: m.clave, texto: m.nombre }))}
            ocultos={ocultos}
          />
        )}
        {vista === "semana" && <SelectorPeriodo ruta="/calendario" actual={actual} lista={lista} extra={ocultos} />}
      </Encabezado>

      <div role="group" aria-label="Ver por" className="mb-5 inline-flex rounded-full border border-linea bg-white p-1">
        {([["finde", "Fin de semana"], ["mes", "Mes"], ["semana", "Semana"]] as const).map(([v, texto]) => (
          <Link
            key={v}
            href={url({ vista: v, canal: sp.canal })}
            aria-current={vista === v ? "true" : undefined}
            className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
              vista === v ? "bg-tinta text-fondo" : "text-tinta hover:bg-gris"
            }`}
          >
            {texto}
          </Link>
        ))}
      </div>

      <nav aria-label="Canales" className="sin-barra -mx-4 mb-5 flex gap-5 overflow-x-auto px-4 shadow-[inset_0_-1px_0_var(--color-linea)] sm:mx-0 sm:px-0">
        <Categoria href={url({ canal: undefined })} activo={!sp.canal} icono="lista">Todos</Categoria>
        {canales.map((c) => (
          <Categoria key={c.codigo} href={url({ canal: c.codigo })} activo={sp.canal === c.codigo} icono={ICONOS_CANAL[c.codigo] ?? "lista"}>
            {c.nombre}
          </Categoria>
        ))}
      </nav>
      <div className="sin-barra -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <FiltroDia href={url({ dia: undefined })} activo={!sp.dia}>Todos los días</FiltroDia>
        {vista === "mes" && <FiltroDia href={url({ dia: "finde" })} activo={soloFinde}>Solo fines de semana</FiltroDia>}
        {(soloFinde ? dias.filter(esDiaDeFinDeSemana) : dias).map((d) => (
          <FiltroDia key={d} href={url({ dia: d })} activo={sp.dia === d}>
            {fechaCorta(d)}{esFestivo(d) ? " · festivo" : ""}
          </FiltroDia>
        ))}
      </div>

      {diasVisibles.length === 0 && <Vacio>No hay turnos publicados con estos filtros.</Vacio>}
      <div className="space-y-10">
        {diasVisibles.map((dia) => {
          const delDia = visibles.filter((t) => t.dia === dia);
          const canalesDia = [...new Set(delDia.map((t) => t.canal_nombre as string))];
          return (
            <section key={dia}>
              <h2 className="mb-4 text-lg font-semibold">
                {fechaLarga(dia)}
                {esFestivo(dia) && <span className="ml-2 align-middle"><Insignia tono="marca">Festivo</Insignia></span>}
              </h2>
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
