import { sql } from "./db";

function escapar(texto: string) {
  return texto.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

async function enviarCorreo(id: string, para: string, asunto: string, cuerpo: string) {
  const clave = process.env.RESEND_API_KEY;
  const remitente = process.env.CORREO_REMITENTE;
  if (!clave || !remitente) return; // Sin proveedor configurado queda pendiente en la bandeja de salida.
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: remitente, to: para, subject: asunto, html: cuerpo }),
    });
    if (!r.ok) throw new Error(`Resend respondió ${r.status}`);
    await sql`UPDATE correos SET estado = 'enviado' WHERE id = ${id}`;
  } catch (e) {
    await sql`UPDATE correos SET estado = 'error', error = ${String(e)} WHERE id = ${id}`;
  }
}

/** Avisa dentro de la app y, si se pide, por correo a quienes tengan correo registrado. */
export async function notificar(
  usuarioIds: (string | null | undefined)[],
  aviso: { titulo: string; cuerpo: string; enlace?: string; correo?: boolean; detalleHtml?: string },
) {
  const ids = [...new Set(usuarioIds.filter(Boolean))] as string[];
  if (!ids.length) return;
  await sql`INSERT INTO notificaciones (usuario_id, titulo, cuerpo, enlace)
    SELECT id, ${aviso.titulo}, ${aviso.cuerpo}, ${aviso.enlace ?? null} FROM usuarios WHERE id = ANY(${ids}::uuid[])`;
  if (!aviso.correo) return;

  const url = aviso.enlace ? `${process.env.APP_URL ?? ""}${aviso.enlace}` : null;
  const html =
    `<p>${escapar(aviso.cuerpo)}</p>${aviso.detalleHtml ?? ""}` +
    (url ? `<p><a href="${escapar(url)}">Ver en la app</a></p>` : "");
  const destinos = await sql`INSERT INTO correos (para, asunto, cuerpo)
    SELECT correo, ${aviso.titulo}, ${html} FROM usuarios
    WHERE id = ANY(${ids}::uuid[]) AND correo IS NOT NULL AND correo <> ''
    RETURNING id, para`;
  await Promise.all(destinos.map((d) => enviarCorreo(d.id, d.para, aviso.titulo, html)));
}

export { escapar };
