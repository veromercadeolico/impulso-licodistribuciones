import { sql } from "@/lib/db";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const ROLES = ["Vendedor", "Trade Marketing", "Impulsadora", "Líder de canal", "Director comercial", "Administrador", "General"];
const TIPOS = ["error", "mejora", "idea", "positivo"];
const MAX_POR_HORA = 15;

const responder = (cuerpo: object, status = 200) => Response.json(cuerpo, { status, headers: CORS });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const d = await req.json().catch(() => null);
  if (!d || typeof d !== "object") return responder({ error: "Solicitud no válida." }, 400);
  if (d.sitio) return responder({ ok: true }); // Campo trampa para bots.

  const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const nombre = texto(d.nombre, 80);
  const rol = texto(d.rol, 40);
  const pantalla = texto(d.pantalla, 120) || null;
  const tipo = texto(d.tipo, 20);
  const comentario = texto(d.comentario, 2000);

  if (nombre.length < 2) return responder({ error: "Escribe tu nombre." }, 400);
  if (!ROLES.includes(rol) || !TIPOS.includes(tipo)) return responder({ error: "Selecciona el rol y el tipo de comentario." }, 400);
  if (comentario.length < 5) return responder({ error: "Cuéntanos un poco más en tu comentario." }, 400);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM retroalimentacion
    WHERE ip = ${ip} AND creado_en > now() - interval '1 hour'`;
  if (total >= MAX_POR_HORA) return responder({ error: "Enviaste muchos comentarios. Intenta de nuevo en una hora." }, 429);

  await sql`INSERT INTO retroalimentacion (nombre, rol, pantalla, tipo, comentario, ip)
    VALUES (${nombre}, ${rol}, ${pantalla}, ${tipo}, ${comentario}, ${ip})`;
  return responder({ ok: true });
}
