// Carga datos ficticios para explorar la app. BORRA toda la operación (solicitudes, turnos, ventas, avisos).
// Uso: CONFIRMAR_DEMO=si npm run db:demo
import { neon, types } from "@neondatabase/serverless";
import { periodoDeFecha, sumarMinutos } from "../lib/reglas.ts";

if (process.env.CONFIRMAR_DEMO !== "si") {
  console.error("Este comando borra la operación registrada. Ejecútalo con CONFIRMAR_DEMO=si.");
  process.exit(1);
}
for (const oid of [1082, 1083, 1114, 1184]) types.setTypeParser(oid, (v: string) => v);
const sql = neon(process.env.DATABASE_URL!);

const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const dia = (fecha: string, n: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

await sql.transaction([
  sql`DELETE FROM correos`,
  sql`DELETE FROM notificaciones`,
  sql`DELETE FROM reportes_venta`,
  sql`DELETE FROM asistencias`,
  sql`DELETE FROM fotos`,
  sql`DELETE FROM turnos`,
  sql`DELETE FROM solicitudes`,
  sql`DELETE FROM puntos`,
  sql`DELETE FROM disponibilidad`,
  sql`DELETE FROM inventario_oficina`,
  sql`UPDATE periodos SET estado = 'abierto', publicado_en = NULL`,
]);

for (const [cedula, nombre, municipio] of [
  ["100000007", "Impulsadora Demo Dos", "ARMENIA"],
  ["100000008", "Impulsadora Demo Tres", "LA TEBAIDA"],
]) {
  await sql`INSERT INTO usuarios (cedula, nombre, rol, municipio) VALUES (${cedula}, ${nombre}, 'impulsadora', ${municipio})
    ON CONFLICT (cedula) DO NOTHING`;
}
const [vendedor] = await sql`SELECT id FROM usuarios WHERE cedula = '100000003'`;
const impulsadoras = await sql`SELECT id, municipio FROM usuarios WHERE cedula IN ('100000006','100000007','100000008') ORDER BY cedula`;
const marcas = Object.fromEntries((await sql`SELECT codigo, uniforme FROM marcas`).map((m) => [m.codigo, m.uniforme]));
const productos = await sql`SELECT item, marca FROM productos WHERE activo AND ml IN (375, 750) AND marca IN ('AMARILLO DE MANZANARES','RON VIEJO DE CALDAS') ORDER BY item`;
const amarillo = productos.filter((p) => p.marca.startsWith("AMARILLO")).map((p) => p.item);
const ron = productos.filter((p) => p.marca.startsWith("RON")).map((p) => p.item);

async function periodo(fecha: string) {
  const { inicio, fin, limite } = periodoDeFecha(fecha);
  const [p] = await sql`INSERT INTO periodos (fecha_inicio, fecha_fin, limite_solicitudes, estado, publicado_en)
    VALUES (${inicio}, ${fin}, ${limite}, 'publicado', now())
    ON CONFLICT (fecha_inicio) DO UPDATE SET estado = 'publicado', publicado_en = now() RETURNING id, fecha_inicio`;
  return p;
}

type Datos = {
  lugar: string; municipio: string; canal: string; marca: string; fecha: string; hora: string;
  prioridad?: number | null; estado?: string; motivo?: string; notas?: string;
};

async function solicitud(periodoId: string, d: Datos) {
  const [p] = await sql`INSERT INTO puntos (nombre, municipio) VALUES (${d.lugar}, ${d.municipio})
    ON CONFLICT (lower(nombre), lower(municipio)) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`;
  const [s] = await sql`INSERT INTO solicitudes (periodo_id, vendedor_id, canal, fecha, hora, marca, punto_id, notas, prioridad, estado, motivo_rechazo)
    VALUES (${periodoId}, ${vendedor.id}, ${d.canal}, ${d.fecha}, ${d.hora}, ${d.marca}, ${p.id}, ${d.notas ?? null}, ${d.prioridad ?? null},
      ${d.estado ?? "pendiente"}, ${d.motivo ?? null}) RETURNING id`;
  return { solicitudId: s.id, puntoId: p.id };
}

async function turno(periodoId: string, d: Datos, imp: number) {
  const { solicitudId, puntoId } = await solicitud(periodoId, { ...d, estado: "aprobada" });
  const inicio = `${d.fecha} ${d.hora}`;
  const [t] = await sql`INSERT INTO turnos (periodo_id, solicitud_id, impulsadora_id, canal, punto_id, marca, uniforme, inicio, fin, publicado)
    VALUES (${periodoId}, ${solicitudId}, ${impulsadoras[imp].id}, ${d.canal}, ${puntoId}, ${d.marca}, ${marcas[d.marca]}, ${inicio},
      ${sumarMinutos(inicio, 240)}, true) RETURNING id`;
  await sql`INSERT INTO degustacion (turno_id, marca, presentacion, asignado) VALUES (${t.id}, ${d.marca}, 'Media', 3)`;
  return { id: t.id as string, inicio };
}

const fotoDemo = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#0a142d"/><text x="320" y="245" fill="#ede4d9" font-family="sans-serif" font-size="30" text-anchor="middle">Foto de demostración</text></svg>',
).toString("base64");

async function asistencia(turnoId: string, tipo: string, momento: string, distancia: number | null = null, fuera = false) {
  const [f] = await sql`INSERT INTO fotos (contenido, mime) VALUES (decode(${fotoDemo}, 'base64'), 'image/svg+xml') RETURNING id`;
  await sql`INSERT INTO asistencias (turno_id, tipo, registrado_en, foto_id, distancia_m, fuera_de_rango)
    VALUES (${turnoId}, ${tipo}, ${momento}, ${f.id}, ${distancia}, ${fuera})`;
}

async function ventas(turnoId: string, momento: string, items: [number, number][]) {
  const [r] = await sql`INSERT INTO reportes_venta (turno_id, enviado_en, observaciones)
    VALUES (${turnoId}, ${momento}, 'Reporte de demostración') RETURNING id`;
  for (const [item, cantidad] of items) {
    await sql`INSERT INTO reporte_items (reporte_id, producto_item, cantidad) VALUES (${r.id}, ${item}, ${cantidad})`;
  }
  await sql`UPDATE degustacion SET usado = 2, sobrante = 1 WHERE turno_id = ${turnoId}`;
}

// Periodo anterior: turnos ya ejecutados, con todos los resultados posibles.
const actual = await periodo(dia(hoy, 2));
const anterior = await periodo(dia(actual.fecha_inicio, -7));
const a = anterior.fecha_inicio;
const pasados: [Datos, number, string, [number, number][]][] = [
  [{ lugar: "Fonda La Floresta", municipio: "ARMENIA", canal: "CONSUMO", marca: "AA", fecha: dia(a, 1), hora: "20:00", prioridad: 1 }, 0, "cumplido", [[amarillo[1], 18], [amarillo[0], 9]]],
  [{ lugar: "Éxito Unicentro", municipio: "ARMENIA", canal: "SUPERMERCADOS", marca: "RVC", fecha: dia(a, 1), hora: "15:00", prioridad: 2 }, 1, "cumplido", [[ron[0], 7], [ron[1], 5]]],
  [{ lugar: "Licorera Imperium", municipio: "ARMENIA", canal: "MAYORISTAS", marca: "ESE", fecha: dia(a, 2), hora: "14:00" }, 0, "cumplido", [[ron[1], 48], [amarillo[1], 36]]],
  [{ lugar: "Laureles Mall", municipio: "LA TEBAIDA", canal: "SUPERMERCADOS", marca: "AA", fecha: dia(a, 2), hora: "15:00", prioridad: 2 }, 2, "cumplido", [[amarillo[1], 14], [amarillo[0], 6]]],
  [{ lugar: "Dos Cielos", municipio: "ARMENIA", canal: "CONSUMO", marca: "AA", fecha: dia(a, 2), hora: "20:30", prioridad: 1 }, 1, "tiempo", [[amarillo[1], 11]]],
  [{ lugar: "Tienda El Descuento", municipio: "ARMENIA", canal: "TAT", marca: "ESE", fecha: dia(a, 3), hora: "14:00" }, 0, "pdv", [[ron[1], 12]]],
  [{ lugar: "Caseta La Pola", municipio: "LA TEBAIDA", canal: "FIESTAS", marca: "AA", fecha: dia(a, 3), hora: "19:00", prioridad: 1 }, 2, "sin_ventas", []],
  [{ lugar: "Festival Cultural", municipio: "ARMENIA", canal: "EVENTOS", marca: "RVC", fecha: dia(a, 3), hora: "15:00", prioridad: 3 }, 1, "sin_reportes", []],
];
for (const [datos, imp, resultado, items] of pasados) {
  const t = await turno(anterior.id, datos, imp);
  if (resultado === "sin_reportes") continue;
  await asistencia(t.id, "entrada", sumarMinutos(t.inicio, 5), resultado === "pdv" ? 1240 : null, resultado === "pdv");
  if (resultado === "sin_ventas") continue;
  const salida = sumarMinutos(t.inicio, resultado === "tiempo" ? 120 : 235);
  await asistencia(t.id, "salida", salida);
  await ventas(t.id, sumarMinutos(salida, 10), items);
}

// Periodo vigente: turnos por ejecutar y solicitudes por decidir.
const v = actual.fecha_inicio;
const proximos: [Datos, number][] = [
  [{ lugar: "Fonda La Floresta", municipio: "ARMENIA", canal: "CONSUMO", marca: "AA", fecha: dia(v, 1), hora: "20:30", prioridad: 1, notas: "Noche de aniversario. Llevar dummy de botella." }, 0],
  [{ lugar: "Éxito Unicentro", municipio: "ARMENIA", canal: "SUPERMERCADOS", marca: "RVC", fecha: dia(v, 2), hora: "15:00", prioridad: 2, notas: "Punta de góndola en licores." }, 0],
  [{ lugar: "Licorera Imperium", municipio: "ARMENIA", canal: "MAYORISTAS", marca: "ESE", fecha: dia(v, 3), hora: "14:00", notas: "Impulso de Esencial por caja." }, 0],
  [{ lugar: "Dos Cielos", municipio: "ARMENIA", canal: "CONSUMO", marca: "AA", fecha: dia(v, 1), hora: "20:30", prioridad: 1 }, 1],
  [{ lugar: "Laureles Mall", municipio: "LA TEBAIDA", canal: "SUPERMERCADOS", marca: "AA", fecha: dia(v, 2), hora: "15:00", prioridad: 2 }, 1],
  [{ lugar: "Tienda El Descuento", municipio: "ARMENIA", canal: "TAT", marca: "ESE", fecha: dia(v, 3), hora: "14:00" }, 1],
  [{ lugar: "Caseta La Pola", municipio: "LA TEBAIDA", canal: "FIESTAS", marca: "AA", fecha: dia(v, 1), hora: "19:00", prioridad: 1 }, 2],
  [{ lugar: "Ara Principal", municipio: "LA TEBAIDA", canal: "SUPERMERCADOS", marca: "RVC", fecha: dia(v, 2), hora: "15:00", prioridad: 3 }, 2],
  [{ lugar: "Licorera Elite", municipio: "LA TEBAIDA", canal: "MAYORISTAS", marca: "AA", fecha: dia(v, 3), hora: "14:00" }, 2],
];
for (const [datos, imp] of proximos) await turno(actual.id, datos, imp);

await solicitud(actual.id, { lugar: "Viejoteca El Duende", municipio: "ARMENIA", canal: "CONSUMO", marca: "AA", fecha: dia(v, 2), hora: "20:30", prioridad: 3, estado: "rechazada", motivo: "No hay impulsadoras disponibles en ese horario." });
await solicitud(actual.id, { lugar: "Mall Centenario", municipio: "ARMENIA", canal: "CONSUMO", marca: "RVC", fecha: dia(v, 2), hora: "20:30", prioridad: 1, notas: "Solicitud pendiente de decidir." });
await solicitud(actual.id, { lugar: "Tropical Club", municipio: "ARMENIA", canal: "CONSUMO", marca: "AA", fecha: dia(v, 3), hora: "19:00", notas: "Sin relevancia: conserva su orden de llegada." });
await solicitud(actual.id, { lugar: "Ara Santander", municipio: "ARMENIA", canal: "SUPERMERCADOS", marca: "AA", fecha: dia(v, 3), hora: "10:00", prioridad: 3 });

for (const imp of impulsadoras) {
  for (let n = 0; n < 7; n++) {
    for (const franja of ["tarde", "noche"]) {
      await sql`INSERT INTO disponibilidad (impulsadora_id, fecha, franja) VALUES (${imp.id}, ${dia(v, n)}, ${franja}) ON CONFLICT DO NOTHING`;
    }
  }
}
console.log(`Demostración cargada. Periodo vigente desde ${v}, periodo anterior desde ${a}.`);
