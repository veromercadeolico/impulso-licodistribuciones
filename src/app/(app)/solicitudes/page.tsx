import Link from "next/link";
import { Icono } from "@/components/iconos";
import { Avisos, Encabezado, EtiquetaPortada, Insignia, Portada, SelectorPeriodo, Vacio } from "@/components/ui";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fechaCorta, fechaLarga, hora, horario, PRIORIDADES } from "@/lib/formato";
import { periodoSeleccionado } from "@/lib/periodos";
import { ordenarSolicitudes } from "@/lib/reglas";
import { retirarSolicitud } from "./acciones";

type Params = Promise<{ p?: string; ok?: string; error?: string }>;

export default async function SolicitudesPage({ searchParams }: { searchParams: Params }) {
  const usuario = await exigirRol("vendedor", "trade");
  const sp = await searchParams;
  const { actual, lista } = await periodoSeleccionado(sp.p);
  const publicado = actual.estado === "publicado";

  const registros = await sql`SELECT s.id, s.fecha::text, s.hora::text, s.notas, s.prioridad, s.extemporanea, s.estado,
      s.creado_en::text AS creado_orden, s.motivo_rechazo, s.obsequios, p.direccion, m.nombre AS marca, m.uniforme, c.nombre AS canal, p.nombre AS lugar, p.municipio,
      (s.creado_en AT TIME ZONE 'America/Bogota')::text AS creado,
      t.inicio::text, t.fin::text, t.publicado, u.nombre AS impulsadora
    FROM solicitudes s
    JOIN puntos p ON p.id = s.punto_id
    JOIN canales c ON c.codigo = s.canal
    JOIN marcas m ON m.codigo = s.marca
    LEFT JOIN turnos t ON t.solicitud_id = s.id AND NOT t.cancelado
    LEFT JOIN usuarios u ON u.id = t.impulsadora_id
    WHERE s.vendedor_id = ${usuario.id} AND s.periodo_id = ${actual.id}
    ORDER BY s.creado_en`;
  const filas = ordenarSolicitudes(
    registros.map((s) => ({ ...s, prioridad: s.prioridad as number | null, creadoEn: s.creado_orden as string })),
  );

  return (
    <>
      <Encabezado
        titulo="Mis solicitudes"
        detalle={`Recibimos solicitudes hasta el ${fechaLarga(actual.limite_solicitudes)} a las ${hora(actual.limite_solicitudes)}.`}
      >
        <SelectorPeriodo ruta="/solicitudes" actual={actual} lista={lista} />
        <Link href="/solicitudes/nueva" className="boton">
          <Icono nombre="mas" className="size-4" /> Nueva solicitud
        </Link>
      </Encabezado>
      <Avisos ok={sp.ok} error={sp.error} />
      {filas.length === 0 && <Vacio>No tienes solicitudes en este periodo.</Vacio>}
      <ul className="grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        {filas.map((s, i) => {
          const visible = publicado || s.publicado;
          const estado = !visible || s.estado === "pendiente" ? "En revisión" : s.estado === "aprobada" ? "Aprobada" : "No aprobada";
          return (
            <li key={s.id} className="min-w-0">
              <Portada uniforme={s.uniforme} marca={s.marca}>
                <EtiquetaPortada>{estado}</EtiquetaPortada>
              </Portada>
              <div className="mt-3 flex items-start justify-between gap-2">
                <h2 className="min-w-0 truncate font-semibold">{s.lugar}</h2>
                <span className="shrink-0 text-sm text-suave">#{i + 1}</span>
              </div>
              <p className="text-sm text-suave">{s.municipio} · {s.canal}</p>
              <p className="text-sm text-suave">{fechaCorta(s.fecha)}, {hora(s.hora)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.prioridad && <Insignia tono="marca">Relevancia {PRIORIDADES[s.prioridad]}</Insignia>}
                {s.extemporanea && <Insignia tono="alerta">Extemporánea</Insignia>}
              </div>
              {s.notas && <p className="mt-2 text-sm">{s.notas}</p>}
              {s.obsequios && <p className="mt-1 text-sm text-suave">Para regalar: {s.obsequios}</p>}
              {s.direccion && <p className="mt-1 text-sm text-suave">Dirección: {s.direccion}</p>}
              {visible && s.estado === "aprobada" && s.impulsadora && (
                <p className="mt-3 rounded-xl bg-ok-claro px-3.5 py-2.5 text-sm text-ok">
                  {s.impulsadora} · {horario(s.inicio, s.fin)}
                </p>
              )}
              {visible && s.estado === "rechazada" && s.motivo_rechazo && (
                <p className="mt-3 rounded-xl bg-error-claro px-3.5 py-2.5 text-sm text-error">Motivo: {s.motivo_rechazo}</p>
              )}
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-suave">Enviada el {fechaCorta(s.creado)} a las {hora(s.creado)}</p>
                {s.estado === "pendiente" && !s.publicado && (
                  <form action={retirarSolicitud}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="min-h-10 cursor-pointer text-sm font-semibold underline underline-offset-2">Retirar</button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
