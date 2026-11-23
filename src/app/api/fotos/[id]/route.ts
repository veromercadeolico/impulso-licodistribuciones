import { usuarioActual } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioActual();
  if (!usuario) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("No encontrada", { status: 404 });

  const [foto] = await sql`SELECT encode(f.contenido, 'base64') AS datos, f.mime, t.impulsadora_id
    FROM fotos f JOIN asistencias a ON a.foto_id = f.id JOIN turnos t ON t.id = a.turno_id WHERE f.id = ${id}`;
  if (!foto) return new Response("No encontrada", { status: 404 });
  if (usuario.rol === "impulsadora" && foto.impulsadora_id !== usuario.id) {
    return new Response("No autorizado", { status: 403 });
  }
  return new Response(Buffer.from(foto.datos, "base64"), {
    headers: { "Content-Type": foto.mime, "Cache-Control": "private, max-age=86400" },
  });
}
