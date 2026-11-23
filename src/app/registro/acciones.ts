"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { iniciarSesion } from "@/lib/auth";
import { sql } from "@/lib/db";
import { MUNICIPIOS } from "@/lib/formato";
import { notificar } from "@/lib/notificar";

const MAX_INTENTOS_HORA = 10;

export async function registrarVendedor(f: FormData) {
  const codigo = String(f.get("c") ?? "");
  const volver = (m: string): never => redirect(`/registro?c=${encodeURIComponent(codigo)}&error=${encodeURIComponent(m)}`);
  if (!process.env.REGISTRO_CODIGO || codigo !== process.env.REGISTRO_CODIGO) volver("El enlace de registro no es válido.");

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM intentos_login
    WHERE ip = ${ip} AND creado_en > now() - interval '1 hour'`;
  if (total >= MAX_INTENTOS_HORA) volver("Demasiados intentos. Espera una hora e inténtalo de nuevo.");
  await sql`INSERT INTO intentos_login (ip) VALUES (${ip})`;

  const nombre = String(f.get("nombre") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const cedula = String(f.get("cedula") ?? "").replace(/\D/g, "");
  const canal = String(f.get("canal") ?? "");
  const municipio = String(f.get("municipio") ?? "");
  const correo = String(f.get("correo") ?? "").trim().toLowerCase() || null;

  if (nombre.length < 5 || !nombre.includes(" ")) volver("Escribe tu nombre y apellido.");
  if (!/^\d{5,15}$/.test(cedula)) volver("La cédula debe tener solo números.");
  if (!MUNICIPIOS.includes(municipio)) volver("Selecciona tu municipio.");
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) volver("El correo no es válido.");
  const [canalValido] = await sql`SELECT nombre FROM canales WHERE codigo = ${canal}`;
  if (!canalValido) volver("Selecciona tu canal.");

  const [existente] = await sql`SELECT id FROM usuarios WHERE cedula = ${cedula}`;
  if (existente) volver("Esa cédula ya está registrada. Entra a la app con ella desde el inicio de sesión.");

  const [nuevo] = await sql`INSERT INTO usuarios (cedula, nombre, correo, rol, canal, municipio)
    VALUES (${cedula}, ${nombre}, ${correo}, 'vendedor', ${canal}, ${municipio}) RETURNING id`;
  const trade = await sql`SELECT id FROM usuarios WHERE rol = 'trade' AND activo`;
  await notificar(trade.map((u) => u.id), {
    titulo: "Nuevo vendedor registrado",
    cuerpo: `${nombre} se registró en el canal ${canalValido.nombre}.`,
    enlace: "/admin/usuarios",
  });

  await iniciarSesion(nuevo.id);
  redirect(`/solicitudes?ok=${encodeURIComponent(`Bienvenido, ${nombre.split(" ")[0]}. Ya puedes enviar tus solicitudes.`)}`);
}
