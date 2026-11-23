import Link from "next/link";
import { Encabezado, Vacio } from "@/components/ui";
import { exigirUsuario } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fechaCorta, hora } from "@/lib/formato";

export default async function NotificacionesPage() {
  const usuario = await exigirUsuario();
  const avisos = await sql`SELECT id, titulo, cuerpo, enlace, leida,
      (creado_en AT TIME ZONE 'America/Bogota')::text AS fecha
    FROM notificaciones WHERE usuario_id = ${usuario.id} ORDER BY creado_en DESC LIMIT 60`;
  await sql`UPDATE notificaciones SET leida = true WHERE usuario_id = ${usuario.id} AND NOT leida`;

  return (
    <>
      <Encabezado titulo="Avisos" />
      {avisos.length === 0 && <Vacio>No tienes avisos todavía.</Vacio>}
      <ul className="space-y-2">
        {avisos.map((a) => (
          <li key={a.id} className="tarjeta-compacta">
            <p className="font-semibold">
              {a.titulo}
              {!a.leida && <span className="ml-2 rounded bg-marca px-1.5 py-0.5 align-middle text-[11px] font-bold text-white">Nuevo</span>}
            </p>
            <p className="mt-0.5 text-sm">{a.cuerpo}</p>
            <p className="mt-1 text-xs text-suave">
              {fechaCorta(a.fecha)}, {hora(a.fecha)}
              {a.enlace && (
                <>
                  {" · "}
                  <Link href={a.enlace} className="font-semibold underline">
                    Ver detalle
                  </Link>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
