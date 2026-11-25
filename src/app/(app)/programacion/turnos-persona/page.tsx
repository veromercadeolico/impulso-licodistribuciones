import Link from "next/link";
import { Icono } from "@/components/iconos";
import { Encabezado, Insignia, Tarjeta, Vacio } from "@/components/ui";
import { exigirRol } from "@/lib/auth";
import { bloqueFinDeSemana, esClaveMes, esFecha, finesDeSemana, mesDe, mesesCerca, nombreBloque, viernesDe } from "@/lib/calendario";
import { consolidar, type FilaConsolidado } from "@/lib/consolidado";
import { duracionTurno } from "@/lib/reglas";
import { sql } from "@/lib/db";
import { duracion, fechaCorta, hoyBogota, numero, SUBPERFILES } from "@/lib/formato";
import { periodoSeleccionado } from "@/lib/periodos";
import { PestanasProgramacion } from "../pestanas";

type Params = Promise<{ vista?: string; f?: string; m?: string }>;

function Selector({ nombre, etiqueta, valor, opciones, vista }: {
  nombre: string; etiqueta: string; valor: string; opciones: { valor: string; texto: string }[]; vista: string;
}) {
  return (
    <form action="/programacion/turnos-persona" className="flex items-center gap-2 rounded-full border border-linea bg-white py-1.5 pr-1.5 pl-6 shadow-suave">
      <input type="hidden" name="vista" value={vista} />
      <div>
        <label htmlFor={`sel-${nombre}`} className="block text-xs font-bold">{etiqueta}</label>
        <select id={`sel-${nombre}`} name={nombre} defaultValue={valor} className="-ml-1 cursor-pointer bg-transparent pr-1 text-sm text-suave outline-none">
          {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
      </div>
      <button aria-label={`Ver ${etiqueta.toLowerCase()}`} className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-marca text-white">
        <Icono nombre="buscar" className="size-4" />
      </button>
    </form>
  );
}

function Tabla({ filas }: { filas: FilaConsolidado[] }) {
  const suma = (k: keyof FilaConsolidado) => filas.reduce((s, f) => s + (f[k] as number), 0);
  const minutos = suma("minutosReales");
  return (
    <div className="overflow-x-auto">
      <table className="tabla">
        <thead>
          <tr>
            <th>Persona</th><th className="num">Turnos</th><th className="num">Completos</th>
            <th className="num">Horas reales</th><th className="num">Turnos (4 h)</th><th>Por revisar</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.personaId}>
              <td>{f.nombre}</td>
              <td className="num">{f.programados}</td>
              <td className="num">{f.completos}</td>
              <td className="num">{duracion(f.minutosReales)}</td>
              <td className="num font-semibold">{numero(f.turnos, 1)}</td>
              <td>
                <span className="flex flex-wrap gap-1">
                  {f.sinSalida > 0 && <Insignia tono="alerta">{f.sinSalida} sin salida</Insignia>}
                  {f.sinEntrada > 0 && <Insignia tono="error">{f.sinEntrada} sin entrada</Insignia>}
                </span>
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td>Total</td>
            <td className="num">{suma("programados")}</td>
            <td className="num">{suma("completos")}</td>
            <td className="num">{duracion(minutos)}</td>
            <td className="num">{numero(Math.round(suma("turnos") * 10) / 10, 1)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default async function TurnosPorPersonaPage({ searchParams }: { searchParams: Params }) {
  const usuario = await exigirRol("trade", "supervisor");
  const sp = await searchParams;
  const vista = sp.vista === "mes" ? "mes" : "finde";
  const hoy = hoyBogota();
  const { actual } = await periodoSeleccionado();

  // Por defecto, el último fin de semana que ya empezó (viernes a domingo, o a lunes festivo).
  const fines = finesDeSemana(hoy, 8, 1);
  const bloque = bloqueFinDeSemana(esFecha(sp.f) ? viernesDe(sp.f) : (hoy >= viernesDe(hoy) ? viernesDe(hoy) : fines[7].inicio));
  if (!fines.some((b) => b.inicio === bloque.inicio)) fines.push(bloque);
  const meses = mesesCerca(hoy, 5, 0);
  const mes = mesDe(esClaveMes(sp.m) ? sp.m : hoy.slice(0, 7));
  if (!meses.some((m) => m.clave === mes.clave)) meses.push(mes);
  const rango = vista === "mes" ? { inicio: mes.inicio, fin: mes.fin, nombre: `Mes de ${mes.nombre}` }
    : { inicio: bloque.inicio, fin: bloque.fin, nombre: `Fin de semana ${nombreBloque(bloque, fechaCorta)}` };

  const registros = await sql`SELECT u.id AS persona_id, u.nombre, u.subperfil, t.servicio, t.canal,
      to_char(t.inicio, 'YYYY-MM-DD HH24:MI') AS inicio, to_char(t.fin, 'YYYY-MM-DD HH24:MI') AS fin,
      (SELECT registrado_en::text FROM asistencias a WHERE a.turno_id = t.id AND a.tipo = 'entrada') AS entrada,
      (SELECT registrado_en::text FROM asistencias a WHERE a.turno_id = t.id AND a.tipo = 'salida') AS salida
    FROM turnos t JOIN usuarios u ON u.id = t.impulsadora_id
    WHERE t.publicado AND NOT t.cancelado AND t.inicio::date BETWEEN ${rango.inicio}::date AND ${rango.fin}::date`;
  // Turnos en Bodega, Oficina o Mercadeo: no se programan; cuentan por entrada y salida registradas.
  const registrosArea = await sql`SELECT u.id AS persona_id, u.nombre, u.subperfil, a.area,
      to_char(a.entrada_en, 'YYYY-MM-DD HH24:MI') AS inicio, a.entrada_en::text AS entrada, a.salida_en::text AS salida
    FROM turnos_area a JOIN usuarios u ON u.id = a.impulsadora_id
    WHERE a.entrada_en::date BETWEEN ${rango.inicio}::date AND ${rango.fin}::date`;
  const todos = [
    // El bartender no registra entrada ni salida: cuenta con las horas programadas del turno.
    ...registros.map((r) => r.servicio === "bartender"
      ? { area: "bartender", personaId: r.persona_id, nombre: r.nombre, subperfil: r.subperfil, inicio: r.inicio, fin: r.fin, entrada: r.inicio, salida: r.fin, minutosTurno: duracionTurno(r.canal, r.inicio) }
      : { area: "impulso", personaId: r.persona_id, nombre: r.nombre, subperfil: r.subperfil, inicio: r.inicio, fin: r.fin, entrada: r.entrada, salida: r.salida, minutosTurno: duracionTurno(r.canal, r.inicio) }),
    ...registrosArea.map((r) => ({ area: r.area as string, personaId: r.persona_id, nombre: r.nombre, subperfil: r.subperfil, inicio: r.inicio, fin: r.inicio, entrada: r.entrada, salida: r.salida })),
  ];
  const filas = consolidar(todos);
  // Un grupo por área donde se hizo el turno; al final, el total de cada persona sumando todas las áreas.
  const grupos = [...Object.entries(SUBPERFILES), ["bartender", "Bartender (horas programadas)"]]
    .map(([clave, nombre]) => ({ nombre, filas: consolidar(todos.filter((r) => r.area === clave)) }))
    .filter((g) => g.filas.length > 0);

  return (
    <>
      <Encabezado titulo="Turnos por persona" detalle={`${rango.nombre} · 1 turno = 4 horas reales entre entrada y salida (Consumo en la noche: 3 h 30)`}>
        {vista === "finde" ? (
          <Selector nombre="f" etiqueta="Fin de semana" valor={bloque.inicio} vista="finde"
            opciones={fines.sort((a, b) => b.inicio.localeCompare(a.inicio)).map((b) => ({ valor: b.inicio, texto: nombreBloque(b, fechaCorta) }))} />
        ) : (
          <Selector nombre="m" etiqueta="Mes" valor={mes.clave} vista="mes"
            opciones={meses.sort((a, b) => b.clave.localeCompare(a.clave)).map((m) => ({ valor: m.clave, texto: m.nombre }))} />
        )}
      </Encabezado>
      <PestanasProgramacion periodo={actual.id} activa="consolidado" soloLectura={usuario.rol === "supervisor"} />

      <div role="group" aria-label="Ver por" className="mb-5 inline-flex rounded-full border border-linea bg-white p-1">
        {([["finde", "Fin de semana"], ["mes", "Mes"]] as const).map(([v, texto]) => (
          <Link key={v} href={`/programacion/turnos-persona?vista=${v}`} aria-current={vista === v ? "true" : undefined}
            className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${vista === v ? "bg-tinta text-fondo" : "text-tinta hover:bg-gris"}`}>
            {texto}
          </Link>
        ))}
      </div>

      {filas.length === 0 && <Vacio>No hay turnos registrados en estas fechas.</Vacio>}
      <div className="space-y-5">
        {grupos.map((g) => (
          <Tarjeta key={g.nombre} titulo={`${g.nombre} · ${g.filas.length} ${g.filas.length === 1 ? "persona" : "personas"}`}>
            <Tabla filas={g.filas} />
          </Tarjeta>
        ))}
        {grupos.length > 1 && (
          <Tarjeta titulo="Total por persona (todas las áreas)">
            <Tabla filas={filas} />
          </Tarjeta>
        )}
      </div>
      {filas.some((f) => f.sinSalida || f.sinEntrada) && (
        <p className="mt-4 text-sm text-suave">
          Los turnos sin salida o sin entrada no suman horas: revísalos con la persona antes de liquidar la nómina.
        </p>
      )}
    </>
  );
}
