/** Participación de la competencia que la impulsadora reporta al final de cada turno. */

export const ACTIVIDADES_COMPETENCIA = ["Impulso", "Degustación", "Precio especial", "Obsequios", "Exhibición"] as const;

export type Competencia = {
  hay: boolean;
  marcas: string | null;
  actividades: string[];
  detalle: string | null;
};

type Lector = { get(nombre: string): unknown; getAll(nombre: string): unknown[] };

const limpio = (v: unknown, max: number) => {
  const t = String(v ?? "").trim().slice(0, max);
  return t || null;
};

/** Lee y valida la sección de competencia del formulario. Devuelve un mensaje de error o los datos. */
export function leerCompetencia(datos: Lector): { error: string } | { competencia: Competencia } {
  const respuesta = String(datos.get("competencia") ?? "");
  if (respuesta !== "si" && respuesta !== "no") return { error: "Indica si había competencia en el punto." };
  if (respuesta === "no") return { competencia: { hay: false, marcas: null, actividades: [], detalle: null } };

  const marcas = limpio(datos.get("competencia_marcas"), 200);
  if (!marcas) return { error: "Escribe qué marcas de la competencia había en el punto." };
  const actividades = datos
    .getAll("competencia_actividad")
    .map(String)
    .filter((a): a is string => (ACTIVIDADES_COMPETENCIA as readonly string[]).includes(a));
  return {
    competencia: { hay: true, marcas, actividades: [...new Set(actividades)], detalle: limpio(datos.get("competencia_detalle"), 500) },
  };
}

/** Texto corto para avisos y correos. */
export function resumenCompetencia(c: Competencia | null): string {
  if (!c) return "Sin información de competencia.";
  if (!c.hay) return "Sin competencia en el punto.";
  const partes = [`Competencia: ${c.marcas}`];
  if (c.actividades.length) partes.push(`(${c.actividades.join(", ").toLowerCase()})`);
  if (c.detalle) partes.push(`. ${c.detalle}`);
  return partes.join(" ").replace(" .", ".");
}
