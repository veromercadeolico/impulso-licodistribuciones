import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

type Producto = {
  item: number;
  referencia: string;
  ean: string | null;
  descripcion: string;
  ml: number;
  marca: string;
  unidades_caja: number;
};

const sql = neon(process.env.DATABASE_URL!);
const datos = JSON.parse(readFileSync(new URL("./seed-data.json", import.meta.url), "utf8")) as {
  productos: Producto[];
  impulsadoras: { nombre: string; municipio: string | null }[];
};

// Metas semanales tomadas de la hoja "EJEC TURNOS" de la programación de Trade Marketing.
const canales = [
  ["SUPERMERCADOS", "Supermercados", 20, 1],
  ["TAT", "Tienda a tienda", 15, 2],
  ["CONSUMO", "Consumo", 35, 3],
  ["MAYORISTAS", "Mayoristas", 15, 4],
  ["EVENTOS", "Activaciones y eventos", 10, 5],
  ["FIESTAS", "Fiestas patronales", 5, 6],
] as const;

const marcas = [
  ["AA", "Amarillo de Manzanares", "AA"],
  ["RVC", "Ron Viejo de Caldas Tradicional", "RVC"],
  ["ESE", "Ron Viejo de Caldas Esencial", "ESE"],
  ["CARTA_ORO", "Ron Viejo de Caldas Carta de Oro", "RVC"],
  ["JUAN_CRUZ", "Ron Viejo de Caldas Juan de la Cruz", "RVC"],
  ["CHEERS", "Cheers, crema de ron", "RVC"],
] as const;

// Cuentas de prueba: se desactivan desde Administración antes de salir a producción.
const demo = [
  ["100000001", "Administrador Demo", "admin", null, "ARMENIA"],
  ["100000002", "Trade Marketing Demo", "trade", null, "ARMENIA"],
  ["100000003", "Vendedor Consumo Demo", "vendedor", "CONSUMO", "ARMENIA"],
  ["100000004", "Líder de Canal Demo", "lider_canal", null, "ARMENIA"],
  ["100000005", "Director Comercial Demo", "director", null, "ARMENIA"],
  ["100000006", "Impulsadora Demo", "impulsadora", null, "ARMENIA"],
] as const;

for (const [codigo, nombre, meta, orden] of canales) {
  await sql`INSERT INTO canales (codigo, nombre, meta_semanal, orden) VALUES (${codigo}, ${nombre}, ${meta}, ${orden})
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden`;
}
for (const [codigo, nombre, uniforme] of marcas) {
  await sql`INSERT INTO marcas (codigo, nombre, uniforme) VALUES (${codigo}, ${nombre}, ${uniforme})
    ON CONFLICT (codigo) DO NOTHING`;
}
for (const p of datos.productos) {
  await sql`INSERT INTO productos (item, referencia, ean, descripcion, ml, marca, unidades_caja)
    VALUES (${p.item}, ${p.referencia}, ${p.ean}, ${p.descripcion}, ${p.ml}, ${p.marca}, ${p.unidades_caja})
    ON CONFLICT (item) DO UPDATE SET descripcion = EXCLUDED.descripcion, ml = EXCLUDED.ml,
      marca = EXCLUDED.marca, unidades_caja = EXCLUDED.unidades_caja`;
}
for (const i of datos.impulsadoras) {
  await sql`INSERT INTO usuarios (nombre, rol, municipio)
    SELECT ${i.nombre}, 'impulsadora', ${i.municipio}
    WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE lower(nombre) = lower(${i.nombre}) AND rol = 'impulsadora')`;
}
for (const [cedula, nombre, rol, canal, municipio] of demo) {
  await sql`INSERT INTO usuarios (cedula, nombre, rol, canal, municipio)
    VALUES (${cedula}, ${nombre}, ${rol}, ${canal}, ${municipio})
    ON CONFLICT (cedula) DO NOTHING`;
}
console.log(
  `Datos iniciales: ${canales.length} canales, ${marcas.length} marcas, ${datos.productos.length} productos, ` +
    `${datos.impulsadoras.length} impulsadoras, ${demo.length} cuentas demo.`,
);
