"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirRol, type Usuario } from "@/lib/auth";
import { sql } from "@/lib/db";
import { MUNICIPIOS, ROLES } from "@/lib/formato";

const aUsuarios = (tipo: "ok" | "error", m: string): never =>
  redirect(`/admin/usuarios?${tipo}=${encodeURIComponent(m)}`);

/** Trade Marketing administra solo a su equipo: vendedores, impulsadoras y perfiles de supervisión. */
export async function rolesQuePuedeGestionar(u: Pick<Usuario, "rol">): Promise<string[]> {
  return u.rol === "admin" ? Object.keys(ROLES) : ["vendedor", "impulsadora", "supervisor"];
}

type Datos = { cedula: string | null; nombre: string; correo: string | null; rol: string; canal: string | null; municipio: string | null };

function validar(d: Datos, canales: string[], permitidos: string[]): string | null {
  if (d.nombre.length < 3) return "El nombre es obligatorio.";
  if (d.cedula && !/^\d{5,15}$/.test(d.cedula)) return `La cédula ${d.cedula} no es válida.`;
  if (d.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo)) return `El correo ${d.correo} no es válido.`;
  if (!ROLES[d.rol]) return `El rol ${d.rol} no existe.`;
  if (!permitidos.includes(d.rol)) return "Solo puedes crear o editar vendedores, impulsadoras y perfiles de supervisión.";
  if (d.canal && !canales.includes(d.canal)) return `El canal ${d.canal} no existe.`;
  if (d.rol === "vendedor" && !d.canal) return `Indica el canal del vendedor ${d.nombre}.`;
  if (d.municipio && !MUNICIPIOS.includes(d.municipio)) return `El municipio ${d.municipio} no existe.`;
  return null;
}

function leerFormulario(f: FormData): Datos {
  const texto = (k: string) => String(f.get(k) ?? "").trim() || null;
  return {
    cedula: texto("cedula")?.replace(/\D/g, "") || null,
    nombre: texto("nombre") ?? "",
    correo: texto("correo")?.toLowerCase() ?? null,
    rol: texto("rol") ?? "",
    canal: texto("canal"),
    municipio: texto("municipio"),
  };
}

async function exigirGestionable(id: string, permitidos: string[]) {
  const [u] = await sql`SELECT rol FROM usuarios WHERE id = ${id}`;
  if (!u || !permitidos.includes(u.rol)) aUsuarios("error", "No puedes modificar este usuario.");
}

export async function guardarUsuario(f: FormData) {
  const autor = await exigirRol("admin", "trade");
  const permitidos = await rolesQuePuedeGestionar(autor);
  const id = String(f.get("id") ?? "");
  const d = leerFormulario(f);
  const canales = (await sql`SELECT codigo FROM canales`).map((c) => c.codigo);
  const problema = validar(d, canales, permitidos);
  if (problema) aUsuarios("error", problema);
  if (id) await exigirGestionable(id, permitidos);

  const [repetida] = await sql`SELECT nombre FROM usuarios WHERE cedula = ${d.cedula} AND id::text <> ${id}`;
  if (repetida) aUsuarios("error", `La cédula ya pertenece a ${repetida.nombre}.`);

  if (id) {
    await sql`UPDATE usuarios SET cedula = ${d.cedula}, nombre = ${d.nombre}, correo = ${d.correo}, rol = ${d.rol},
      canal = ${d.canal}, municipio = ${d.municipio} WHERE id = ${id}`;
  } else {
    await sql`INSERT INTO usuarios (cedula, nombre, correo, rol, canal, municipio)
      VALUES (${d.cedula}, ${d.nombre}, ${d.correo}, ${d.rol}, ${d.canal}, ${d.municipio})`;
  }
  revalidatePath("/admin/usuarios");
  aUsuarios("ok", "Usuario guardado.");
}

export async function cambiarActivo(f: FormData) {
  const autor = await exigirRol("admin", "trade");
  const id = String(f.get("id"));
  if (id === autor.id) aUsuarios("error", "No puedes desactivar tu propia cuenta.");
  await exigirGestionable(id, await rolesQuePuedeGestionar(autor));
  await sql`UPDATE usuarios SET activo = NOT activo WHERE id = ${id}`;
  revalidatePath("/admin/usuarios");
  aUsuarios("ok", "Estado del usuario actualizado.");
}

function celda(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object" && "text" in valor) return String(valor.text).trim();
  if (typeof valor === "object" && "result" in valor) return String(valor.result ?? "").trim();
  return String(valor).trim();
}

export async function importarUsuarios(f: FormData) {
  const autor = await exigirRol("admin", "trade");
  const permitidos = await rolesQuePuedeGestionar(autor);
  const archivo = f.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) aUsuarios("error", "Selecciona el archivo de Excel.");
  if ((archivo as File).size > 3_000_000) aUsuarios("error", "El archivo supera 3 MB.");

  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(await (archivo as File).arrayBuffer());
  } catch {
    aUsuarios("error", "No se pudo leer el archivo. Usa la plantilla en formato .xlsx.");
  }
  const hoja = libro.worksheets[0];
  const canales = (await sql`SELECT codigo FROM canales`).map((c) => c.codigo);
  const errores: string[] = [];
  const filas: Datos[] = [];

  hoja.eachRow((fila, n) => {
    if (n === 1) return;
    const v = (i: number) => celda(fila.getCell(i).value);
    const d: Datos = {
      cedula: v(1).replace(/\D/g, "") || null,
      nombre: v(2),
      correo: v(3).toLowerCase() || null,
      rol: v(4).toLowerCase(),
      canal: v(5).toUpperCase() || null,
      municipio: v(6).toUpperCase() || null,
    };
    if (!d.nombre && !d.cedula) return;
    const problema = validar(d, canales, permitidos);
    if (problema) errores.push(`Fila ${n}: ${problema}`);
    else filas.push(d);
  });
  const cedulas = filas.map((d) => d.cedula).filter(Boolean);
  if (new Set(cedulas).size !== cedulas.length) errores.push("El archivo tiene cédulas repetidas.");
  if (errores.length) aUsuarios("error", `No se importó nada. ${errores.slice(0, 4).join(" ")}`);

  let omitidos = 0;
  for (const d of filas) {
    const [existente] = await sql`SELECT id, rol FROM usuarios
      WHERE (${d.cedula}::text IS NOT NULL AND cedula = ${d.cedula})
         OR (lower(nombre) = lower(${d.nombre}) AND rol = ${d.rol})
      ORDER BY (cedula = ${d.cedula}) DESC NULLS LAST LIMIT 1`;
    if (existente && !permitidos.includes(existente.rol)) {
      omitidos++;
      continue;
    }
    if (existente) {
      await sql`UPDATE usuarios SET cedula = COALESCE(${d.cedula}, cedula), nombre = ${d.nombre}, correo = COALESCE(${d.correo}, correo),
        rol = ${d.rol}, canal = ${d.canal}, municipio = COALESCE(${d.municipio}, municipio) WHERE id = ${existente.id}`;
    } else {
      await sql`INSERT INTO usuarios (cedula, nombre, correo, rol, canal, municipio)
        VALUES (${d.cedula}, ${d.nombre}, ${d.correo}, ${d.rol}, ${d.canal}, ${d.municipio})`;
    }
  }
  revalidatePath("/admin/usuarios");
  aUsuarios("ok", `${filas.length - omitidos} usuarios importados.${omitidos ? ` ${omitidos} omitidos por no ser de tu equipo.` : ""}`);
}

export async function guardarPunto(f: FormData) {
  await exigirRol("admin", "trade");
  const lat = Number(f.get("lat"));
  const lng = Number(f.get("lng"));
  const valido = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && lat !== 0;
  if (!valido) redirect(`/admin/puntos?error=${encodeURIComponent("Las coordenadas no son válidas.")}`);
  await sql`UPDATE puntos SET lat = ${lat}, lng = ${lng} WHERE id = ${String(f.get("id"))}`;
  revalidatePath("/admin/puntos");
  redirect(`/admin/puntos?ok=${encodeURIComponent("Ubicación del punto guardada.")}`);
}
