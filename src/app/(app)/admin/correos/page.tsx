import { Encabezado, Insignia, Vacio } from "@/components/ui";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fechaCorta, hora } from "@/lib/formato";

export default async function CorreosPage() {
  await exigirRol("admin");
  const correos = await sql`SELECT id, para, asunto, estado, error, (creado_en AT TIME ZONE 'America/Bogota')::text AS fecha
    FROM correos ORDER BY creado_en DESC LIMIT 100`;
  const activo = Boolean(process.env.RESEND_API_KEY && process.env.CORREO_REMITENTE);

  return (
    <>
      <Encabezado
        titulo="Bandeja de salida"
        detalle={activo ? "El envío de correos está activo." : "El envío está pendiente de configurar: los correos quedan guardados aquí."}
      />
      {correos.length === 0 && <Vacio>Todavía no se han generado correos.</Vacio>}
      <ul className="space-y-2">
        {correos.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 tarjeta-compacta">
            <div className="min-w-0">
              <p className="font-medium">{c.asunto}</p>
              <p className="text-xs text-suave">{c.para} · {fechaCorta(c.fecha)}, {hora(c.fecha)}</p>
              {c.error && <p className="text-xs text-error">{c.error}</p>}
            </div>
            <Insignia tono={c.estado === "enviado" ? "ok" : c.estado === "error" ? "error" : "alerta"}>
              {c.estado === "enviado" ? "Enviado" : c.estado === "error" ? "Error" : "Pendiente"}
            </Insignia>
          </li>
        ))}
      </ul>
    </>
  );
}
