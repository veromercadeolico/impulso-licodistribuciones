import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import { sql } from "./db";

const COOKIE = "sesion";
const DURACION_S = 60 * 60 * 24 * 14;
const clave = () => new TextEncoder().encode(process.env.SESSION_SECRET!);

export type Rol = "admin" | "trade" | "vendedor" | "impulsadora" | "lider_canal" | "director" | "supervisor";
export type Usuario = {
  id: string;
  cedula: string;
  nombre: string;
  correo: string | null;
  rol: Rol;
  canal: string | null;
  municipio: string | null;
};

export async function iniciarSesion(usuarioId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(usuarioId)
    .setIssuedAt()
    .setExpirationTime(`${DURACION_S}s`)
    .sign(clave());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACION_S,
  });
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE);
}

export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, clave());
    const filas = await sql`SELECT id, cedula, nombre, correo, rol, canal, municipio
      FROM usuarios WHERE id = ${payload.sub} AND activo`;
    return (filas[0] as Usuario) ?? null;
  } catch {
    return null;
  }
});

export async function exigirUsuario(): Promise<Usuario> {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/login");
  return usuario;
}

/** Valida el rol en cada página y acción; el administrador entra a todo. */
export async function exigirRol(...roles: Rol[]): Promise<Usuario> {
  const usuario = await exigirUsuario();
  if (usuario.rol !== "admin" && !roles.includes(usuario.rol)) redirect("/");
  return usuario;
}

export function inicioPorRol(rol: Rol): string {
  const rutas: Record<Rol, string> = {
    admin: "/admin/usuarios",
    trade: "/programacion",
    vendedor: "/solicitudes",
    impulsadora: "/turnos",
    lider_canal: "/reportes",
    director: "/solicitudes",
    supervisor: "/programacion",
  };
  return rutas[rol];
}
