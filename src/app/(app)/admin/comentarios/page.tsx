import { Encabezado, Insignia, Kpi, Vacio } from "@/components/ui";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fechaCorta, hora } from "@/lib/formato";

const TIPOS = {
  error: { texto: "Error", tono: "error" },
  mejora: { texto: "Mejora", tono: "alerta" },
  idea: { texto: "Idea", tono: "marca" },
  positivo: { texto: "Me gustó", tono: "ok" },
} as const;

export default async function ComentariosPage() {
  await exigirRol("admin");
  const comentarios = await sql`SELECT id, nombre, rol, pantalla, tipo, comentario,
      (creado_en AT TIME ZONE 'America/Bogota')::text AS fecha
    FROM retroalimentacion ORDER BY creado_en DESC LIMIT 200`;
  const total = (t: string) => comentarios.filter((c) => c.tipo === t).length;

  return (
    <>
      <Encabezado titulo="Comentarios del equipo" detalle="Lo que envían quienes exploran la app desde la guía." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(Object.keys(TIPOS) as (keyof typeof TIPOS)[]).map((t) => (
          <Kpi key={t} valor={String(total(t))} etiqueta={TIPOS[t].texto} />
        ))}
      </div>
      {comentarios.length === 0 && <Vacio>Todavía no hay comentarios.</Vacio>}
      <ul className="space-y-3">
        {comentarios.map((c) => {
          const tipo = TIPOS[c.tipo as keyof typeof TIPOS];
          return (
            <li key={c.id} className="tarjeta">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{c.nombre}</p>
                  <p className="text-xs text-suave">
                    {c.rol}{c.pantalla ? ` · ${c.pantalla}` : ""} · {fechaCorta(c.fecha)}, {hora(c.fecha)}
                  </p>
                </div>
                <Insignia tono={tipo.tono}>{tipo.texto}</Insignia>
              </div>
              <p className="mt-3 text-sm whitespace-pre-wrap">{c.comentario}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
