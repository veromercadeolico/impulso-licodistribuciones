// Orden de las referencias según el liquidador (lista de precios) y productos de la marca de cada turno.
// Funciones puras, sin base de datos.

/** EAN en el orden del liquidador de Trade Marketing. */
export const ORDEN_LIQUIDADOR = [
  "7702168114409", "7702168117400", "7702168118308", "7702168118407", "7702168119114",
  "7702168114003", "7702168117004", "7702168118209", "7702168119008",
  "7702168117509", "7702168113303",
  "7702168315196", "7702168594300", "7702168278477", "7702168420135", "7702168884944", "7702168537581",
  "7702168725254", "7702168364231",
  "7702168211504", "7702168213508", "7702168214000", "7702168217308", "7702168218206", "7702168218305", "7702168219005",
  "7702168239102", "7702168239201", "7702168627046", "7702168594737", "7702168268508", "7702168007930",
  "7702168975246", "7702168997156", "7702168729238",
  "7702168247732",
  "7702168329605", "7702168456882", "7702168694833",
  "7702168893885", "7702168866490", "7702168439847",
  "7702168457841", "7702168498097",
];

export type ProductoVenta = { item: number; descripcion: string; marca: string; ean: string | null };

/** Posición en el liquidador; los productos que no están en la lista van al final. */
export function posicionLiquidador(ean: string | null): number {
  const i = ean ? ORDEN_LIQUIDADOR.indexOf(ean) : -1;
  return i === -1 ? ORDEN_LIQUIDADOR.length : i;
}

export function ordenarPorLiquidador<T extends ProductoVenta>(productos: T[]): T[] {
  return [...productos].sort((a, b) => posicionLiquidador(a.ean) - posicionLiquidador(b.ean) || a.descripcion.localeCompare(b.descripcion));
}

/** Si un producto es de la marca del turno (código de la marca: AA, RVC, ESE, CARTA_ORO, JUAN_CRUZ, CHEERS). */
export function esDeLaMarca(codigoMarca: string, p: ProductoVenta): boolean {
  const desc = p.descripcion.toUpperCase();
  const marca = p.marca.toUpperCase();
  const esencial = desc.includes("ESENCIAL");
  switch (codigoMarca) {
    case "AA":
      return marca.includes("AMARILLO");
    case "ESE":
      return esencial;
    case "CHEERS":
      return marca.includes("CHEERS");
    case "JUAN_CRUZ":
      return desc.includes("JUAN DE LA CRUZ");
    case "CARTA_ORO":
      return desc.includes("CARTA DE ORO") || desc.includes("8 AÑOS");
    case "RVC":
      return marca === "RON VIEJO DE CALDAS" && !esencial;
    default:
      return false;
  }
}

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/** Busca referencias: primero las que empiezan por lo escrito, luego las que lo contienen; en orden del liquidador. */
export function buscarReferencias<T extends ProductoVenta>(productos: T[], texto: string, maximo = 8): T[] {
  const q = normalizar(texto);
  if (!q) return ordenarPorLiquidador(productos).slice(0, maximo);
  const ordenados = ordenarPorLiquidador(productos);
  const empiezan = ordenados.filter((p) => normalizar(p.descripcion).startsWith(q));
  const contienen = ordenados.filter((p) => !empiezan.includes(p) && normalizar(p.descripcion).includes(q));
  return [...empiezan, ...contienen].slice(0, maximo);
}
