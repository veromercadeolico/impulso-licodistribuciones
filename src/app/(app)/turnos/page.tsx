import Link from "next/link";
import { Encabezado, EtiquetaPortada, Portada, Vacio } from "@/components/ui";
import { Icono } from "@/components/iconos";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { RegistroArea } from "@/components/RegistroArea";
import { minutosEntre } from "@/lib/consolidado";
import { ahoraBogota, AREAS_TURNO, duracion, fechaCorta, fechaLarga, hora, horario, sumarDias } from "@/lib/formato";
import { DIAS_ALERTA_REPORTE } from "@/lib/reglas";

function Paso({ hecho, texto }: { hecho: boolean; texto: string }) {
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${hecho ? "text-ok" : "text-suave"}`}>
      {hecho ? <Icono nombre="check" className="size-3.5" /> : <span aria-hidden className="size-1.5 rounded-full bg-borde" />}
      {texto}
    </span>
  );
}

export default async function TurnosPage() {
  const usuario = await exigirRol("impulsadora");
  const turnos = await sql`SELECT t.id, t.inicio::text, t.fin::text, t.uniforme, t.servicio, m.nombre AS marca, p.nombre AS lugar, p.municipio,
      EXISTS (SELECT 1 FROM asistencias a WHERE a.turno_id = t.id AND a.tipo = 'entrada') AS entrada,
      EXISTS (SELECT 1 FROM asistencias a WHERE a.turno_id = t.id AND a.tipo = 'salida') AS salida,
      EXISTS (SELECT 1 FROM reportes_venta r WHERE r.turno_id = t.id) AS ventas
    FROM turnos t JOIN puntos p ON p.id = t.punto_id JOIN marcas m ON m.codigo = t.marca
    WHERE t.impulsadora_id = ${usuario.id} AND t.publicado AND NOT t.cancelado
    ORDER BY t.inicio DESC LIMIT 40`;
  // Turnos en Bodega, Oficina o Mercadeo: no se programan; la persona registra entrada y salida.
  const turnosArea = await sql`SELECT id, area, entrada_en::text AS entrada, salida_en::text AS salida
    FROM turnos_area WHERE impulsadora_id = ${usuario.id} ORDER BY entrada_en DESC LIMIT 20`;
  const abierto = turnosArea.find((a) => !a.salida);
  const cerrados = turnosArea.filter((a) => a.salida);
  const ahora = ahoraBogota();
  const proximos = turnos.filter((t) => !t.ventas && t.fin.slice(0, 10) >= ahora.slice(0, 10)).reverse();
  const anteriores = turnos.filter((t) => !proximos.includes(t));
  const desde = sumarDias(ahora, -DIAS_ALERTA_REPORTE);
  // El bartender no envía reporte de ventas: sus turnos no generan alerta.
  const sinReporte = turnos.filter((t) => t.servicio !== "bartender" && !t.ventas && t.fin.slice(0, 16) <= ahora && t.fin.slice(0, 10) >= desde).reverse();
  // Turno de impulso programado para hoy (no bartender) que aún no tiene reporte: el botón Impulso lleva a él.
  const impulsoHoy = [...turnos].reverse().find((t) => t.servicio !== "bartender" && !t.ventas && t.inicio.slice(0, 10) === ahora.slice(0, 10));

  const Ficha = ({ t }: { t: (typeof turnos)[number] }) => (
    <li>
      <Link href={`/turnos/${t.id}`} className="group block">
        <Portada uniforme={t.uniforme} marca={t.marca} className="aspect-[4/3] transition-transform duration-300 group-hover:scale-[1.015]">
          <EtiquetaPortada>{fechaLarga(t.inicio)}</EtiquetaPortada>
        </Portada>
        <h3 className="mt-3 truncate font-semibold">{t.lugar}</h3>
        <p className="text-sm text-suave">{t.municipio} · {horario(t.inicio, t.fin)}</p>
        {t.servicio === "bartender" ? (
          <p className="mt-2 text-xs font-semibold text-marca-fuerte">Bartender · no requiere registro ni reporte</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <Paso hecho={t.entrada} texto="Entrada" />
            <Paso hecho={t.salida} texto="Salida" />
            <Paso hecho={t.ventas} texto="Ventas" />
          </div>
        )}
      </Link>
    </li>
  );
  const rejilla = "grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <>
      <Encabezado titulo={`Hola, ${usuario.nombre.split(" ")[0]}`} detalle="Estos son tus turnos de impulso." />
      {sinReporte.length > 0 && (
        <div role="alert" className="mb-8 rounded-xl border border-error bg-error-claro px-4 py-3 text-error">
          <p className="flex items-center gap-2 font-semibold">
            <Icono nombre="campana" className="size-5 shrink-0" />
            {sinReporte.length === 1 ? "Tienes 1 reporte de ventas sin enviar" : `Tienes ${sinReporte.length} reportes de ventas sin enviar`}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {sinReporte.map((t) => (
              <li key={t.id}>
                <Link href={`/turnos/${t.id}`} className="font-semibold underline underline-offset-2">
                  {t.lugar} · {fechaLarga(t.inicio)}
                </Link>
                {!t.salida && " · primero registra tu salida"}
              </li>
            ))}
          </ul>
        </div>
      )}
      <section className="mb-10 tarjeta">
        {abierto ? (
          <>
            <p className="text-xs font-bold tracking-wide text-suave uppercase">Turno en curso</p>
            <h2 className="titulo mt-1 text-lg">{AREAS_TURNO[abierto.area]}</h2>
            <p className="mb-3 text-sm text-suave">
              Entrada registrada a las <strong className="text-tinta">{hora(abierto.entrada)}</strong> del {fechaCorta(abierto.entrada)}. Al terminar, registra tu salida.
            </p>
            <RegistroArea tipo="salida" turnoAreaId={abierto.id} />
          </>
        ) : (
          <details>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span>
                <span className="block font-semibold">¿Dónde trabajas hoy?</span>
                <span className="block text-sm text-suave">Impulso, Bodega, Oficina o Mercadeo. Los turnos de Bodega, Oficina y Mercadeo se registran aquí, sin reporte de ventas.</span>
              </span>
              <span className="boton-sec shrink-0">Registrar</span>
            </summary>
            <div className="mt-4 border-t border-linea pt-4">
              <RegistroArea tipo="entrada" turnoImpulsoHoy={impulsoHoy ? { id: impulsoHoy.id, lugar: impulsoHoy.lugar, horario: horario(impulsoHoy.inicio, impulsoHoy.fin) } : null} />
            </div>
          </details>
        )}
      </section>

      <h2 className="mb-4 titulo text-lg">Próximos turnos</h2>
      {proximos.length === 0 && <Vacio>No tienes turnos pendientes.</Vacio>}
      <ul className={rejilla}>{proximos.map((t) => <Ficha key={t.id} t={t} />)}</ul>
      {anteriores.length > 0 && (
        <>
          <h2 className="mt-12 mb-4 titulo text-lg">Turnos anteriores</h2>
          <ul className={rejilla}>{anteriores.map((t) => <Ficha key={t.id} t={t} />)}</ul>
        </>
      )}
      {cerrados.length > 0 && (
        <>
          <h2 className="mt-12 mb-4 titulo text-lg">Turnos en Bodega, Oficina y Mercadeo</h2>
          <ul className="divide-y divide-linea rounded-lg border border-linea bg-white">
            {cerrados.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span><strong>{AREAS_TURNO[a.area]}</strong> · {fechaLarga(a.entrada)}</span>
                <span className="text-suave">{hora(a.entrada)} a {hora(a.salida)} · {duracion(minutosEntre(a.entrada, a.salida))}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
