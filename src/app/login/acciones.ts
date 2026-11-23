"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cerrarSesion, iniciarSesion, inicioPorRol, type Rol } from "@/lib/auth";
import { sql } from "@/lib/db";

const MAX_INTENTOS = 15;

export async function entrar(datos: FormData) {
  const cedula = String(datos.get("cedula") ?? "").replace(/\D/g, "");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

  const [{ total }] = await sql`SELECT count(*)::int AS total FROM intentos_login
    WHERE ip = ${ip} AND creado_en > now() - interval '15 minutes'`;
  if (total >= MAX_INTENTOS) {
    redirect(`/login?error=${encodeURIComponent("Demasiados intentos. Espera 15 minutos.")}`);
  }

  const filas = await sql`SELECT id, rol FROM usuarios WHERE cedula = ${cedula} AND activo`;
  if (!filas[0]) {
    await sql`INSERT INTO intentos_login (ip) VALUES (${ip})`;
    redirect(`/login?error=${encodeURIComponent("Esa cédula no está registrada o está inactiva.")}`);
  }
  await iniciarSesion(filas[0].id);
  redirect(inicioPorRol(filas[0].rol as Rol));
}

export async function salir() {
  await cerrarSesion();
  redirect("/login");
}
