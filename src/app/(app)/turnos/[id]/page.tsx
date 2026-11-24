import Link from "next/link";
import { notFound } from "next/navigation";
import { FormularioVentas } from "@/components/FormularioVentas";
import { Icono } from "@/components/iconos";
import { RegistroAsistencia } from "@/components/RegistroAsistencia";
import { Avisos, Portada, Uniforme } from "@/components/ui";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { duracion, fechaCorta, fechaLarga, hora } from "@/lib/formato";
import { aMinutos, tiempoIncompleto } from "@/lib/reglas";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

function Paso({ numero, titulo, hecho, children }: { numero: number; titulo: string; hecho: boolean; children: React.ReactNode }) {
  return (
    <section className="flex gap-4 border-b border-linea py-7 last:border-b-0">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          hecho ? "bg-ok text-white" : "border border-tinta text-tinta"
        }`}
      >
        {hecho ? <Icono nombre="check" className="size-4" /> : numero}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="titulo mb-3 pt-1.5 text-base">{titulo}</h2>
        {children}
      </div>
    </section>
  );
}

function Dato({ etiqueta, children, className = "" }: { etiqueta: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`p-3 ${className}`}>
      <p className="text-[11px] font-bold tracking-wide uppercase">{etiqueta}</p>
      <div className="mt-0.5 text-sm text-suave">{children}</div>
    </div>
  );
}

export default async function TurnoPage({ params, searchParams }: Props) {
  const usuario = await exigirRol("impulsadora");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const [t] = await sql`SELECT t.id, t.inicio::text, t.fin::text, t.uniforme, t.marca AS marca_codigo, m.nombre AS marca, p.nombre AS lugar, p.municipio,
      s.notas FROM turnos t JOIN puntos p ON p.id = t.punto_id JOIN marcas m ON m.codigo = t.marca
      LEFT JOIN solicitudes s ON s.id = t.solicitud_id
    WHERE t.id = ${id} AND t.impulsadora_id = ${usuario.id} AND t.publicado AND NOT t.cancelado`;
  if (!t) notFound();

  const [asistencias, [reporte], degustacion, productos] = await Promise.all([
    sql`SELECT tipo, registrado_en::text AS hora, distancia_m, fuera_de_rango FROM asistencias WHERE turno_id = ${id}`,
    sql`SELECT r.enviado_en::text AS enviado, COALESCE(sum(i.cantidad), 0)::int AS total FROM reportes_venta r
      LEFT JOIN reporte_items i ON i.reporte_id = r.id WHERE r.turno_id = ${id} GROUP BY r.id`,
    sql`SELECT id, marca, presentacion, asignado, tipo FROM degustacion WHERE turno_id = ${id} ORDER BY marca, presentacion`,
    sql`SELECT item, descripcion, marca, ean FROM productos WHERE activo ORDER BY marca, ml, descripcion`,
  ]);
  const entrada = asistencias.find((a) => a.tipo === "entrada");
  const salida = asistencias.find((a) => a.tipo === "salida");
  const trabajado = entrada && salida ? aMinutos(salida.hora) - aMinutos(entrada.hora) : null;
  const programado = aMinutos(t.fin) - aMinutos(t.inicio);

  const Hecho = ({ a, nombre }: { a: (typeof asistencias)[number]; nombre: string }) => (
    <p className="text-sm text-suave">
      {nombre} registrada a las <strong className="text-tinta">{hora(a.hora)}</strong> del {fechaCorta(a.hora)}.
      {a.fuera_de_rango && <span className="mt-1 block text-error">Registrada a {a.distancia_m} m del punto programado.</span>}
    </p>
  );

  return (
    <div>
      <Link href="/turnos" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold underline underline-offset-2">
        <Icono nombre="flecha" className="size-4" /> Mis turnos
      </Link>
      <h1 className="titulo text-2xl leading-snug sm:text-[28px]">{t.lugar}</h1>
      <p className="mt-1 mb-5 text-base text-suave">{t.municipio} · {fechaLarga(t.inicio)}</p>
      <Avisos ok={sp.ok} error={sp.error} />
      <Portada uniforme={t.uniforme} marca={t.marca} className="aspect-[16/9] sm:aspect-[3/1]" />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
        <div className="order-2 min-w-0 lg:order-1">
          <Paso numero={1} titulo="Registra tu entrada" hecho={!!entrada}>
            {entrada ? <Hecho a={entrada} nombre="Entrada" /> : <RegistroAsistencia turnoId={t.id} tipo="entrada" />}
          </Paso>
          <Paso numero={2} titulo="Registra tu salida" hecho={!!salida}>
            {salida ? (
              <>
                <Hecho a={salida} nombre="Salida" />
                {trabajado !== null && <p className="mt-1 text-sm text-suave">Tiempo trabajado: <strong className="text-tinta">{duracion(trabajado)}</strong></p>}
                {trabajado !== null && tiempoIncompleto(trabajado, programado) && (
                  <p className="mt-2 rounded-xl bg-alerta-claro px-3.5 py-2.5 text-sm text-alerta">
                    Trabajaste menos del tiempo mínimo de este turno de {duracion(programado)}. Trade Marketing ya fue avisado.
                  </p>
                )}
              </>
            ) : entrada ? (
              <RegistroAsistencia turnoId={t.id} tipo="salida" />
            ) : (
              <p className="text-sm text-suave">Disponible después de registrar tu entrada.</p>
            )}
          </Paso>
          <Paso numero={3} titulo="Envía tu reporte de ventas" hecho={!!reporte}>
            {reporte ? (
              <p className="text-sm text-suave">
                Enviado el {fechaCorta(reporte.enviado)} a las <strong className="text-tinta">{hora(reporte.enviado)}</strong> con <strong className="text-tinta">{reporte.total}</strong> unidades.
              </p>
            ) : salida ? (
              <FormularioVentas turnoId={t.id} productos={productos} degustacion={degustacion} marcaCodigo={t.marca_codigo} />
            ) : (
              <p className="text-sm text-suave">Disponible al finalizar el turno y registrar tu salida.</p>
            )}
          </Paso>
        </div>

        <aside className="order-1 lg:order-2">
          <div className="tarjeta lg:sticky lg:top-28">
            <p className="titulo text-base">Detalle del turno</p>
            <div className="mt-4 overflow-hidden rounded-lg border border-borde">
              <div className="grid grid-cols-2 border-b border-borde">
                <Dato etiqueta="Inicio" className="border-r border-borde">{hora(t.inicio)}</Dato>
                <Dato etiqueta="Fin">{hora(t.fin)}</Dato>
              </div>
              <div className="grid grid-cols-2">
                <Dato etiqueta="Marca" className="border-r border-borde">{t.marca}</Dato>
                <Dato etiqueta="Uniforme"><Uniforme codigo={t.uniforme} /></Dato>
              </div>
            </div>
            {degustacion.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold">Degustación y obsequios</p>
                <ul className="mt-1 text-sm text-suave">
                  {degustacion.map((d) => <li key={d.id}>{d.asignado} {d.presentacion} {d.marca}{d.tipo === "obsequio" ? " (obsequio)" : ""}</li>)}
                </ul>
              </div>
            )}
            {t.notas && <p className="mt-4 rounded-xl bg-gris px-3.5 py-3 text-sm">{t.notas}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
