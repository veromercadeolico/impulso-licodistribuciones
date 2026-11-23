import Link from "next/link";
import { Icono, Logo } from "@/components/iconos";
import { MenuUsuario, Navegacion, type ItemNav } from "@/components/Navegacion";
import { exigirUsuario, type Rol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ROLES } from "@/lib/formato";
import { salir } from "../login/acciones";

const MENU: Record<Rol, ItemNav[]> = {
  admin: [
    { href: "/admin/usuarios", texto: "Usuarios", icono: "usuarios" },
    { href: "/admin/puntos", texto: "Puntos", icono: "pin" },
    { href: "/admin/correos", texto: "Correos", icono: "correo" },
    { href: "/admin/comentarios", texto: "Comentarios", icono: "lista" },
    { href: "/programacion", texto: "Programación", icono: "calendario" },
    { href: "/reportes", texto: "Reportes", icono: "grafico" },
  ],
  trade: [
    { href: "/programacion", texto: "Programación", icono: "calendario" },
    { href: "/solicitudes", texto: "Solicitudes", icono: "lista" },
    { href: "/reportes", texto: "Efectividad", icono: "grafico" },
    { href: "/admin/usuarios", texto: "Equipo", icono: "usuarios" },
  ],
  vendedor: [
    { href: "/solicitudes", texto: "Mis solicitudes", icono: "lista" },
    { href: "/calendario", texto: "Programación", icono: "calendario" },
    { href: "/reportes", texto: "Mis activaciones", icono: "grafico" },
  ],
  impulsadora: [{ href: "/turnos", texto: "Mis turnos", icono: "calendario" }],
  lider_canal: [
    { href: "/reportes", texto: "Desempeño", icono: "grafico" },
    { href: "/calendario", texto: "Programación", icono: "calendario" },
  ],
  supervisor: [
    { href: "/programacion", texto: "Programación", icono: "calendario" },
    { href: "/calendario", texto: "Por día y canal", icono: "lista" },
    { href: "/reportes", texto: "Reportes", icono: "grafico" },
  ],
  director: [
    { href: "/reportes", texto: "Informe de ventas", icono: "grafico" },
    { href: "/calendario", texto: "Programación", icono: "calendario" },
  ],
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM notificaciones
    WHERE usuario_id = ${usuario.id} AND NOT leida`;

  return (
    <div className="min-h-dvh pb-24 lg:pb-12">
      <header className="sticky top-0 z-10 bg-tinta text-fondo">
        <div className="mx-auto flex h-[76px] max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Inicio" className="shrink-0">
            <Logo />
          </Link>
          <Navegacion items={MENU[usuario.rol]} />
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href="/notificaciones"
              aria-label={`Avisos, ${total} sin leer`}
              className="relative flex size-11 items-center justify-center rounded-full transition-colors hover:bg-white/10"
            >
              <Icono nombre="campana" />
              {total > 0 && (
                <span className="absolute top-1 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-tinta bg-marca px-1 text-[10px] font-bold text-white">
                  {total}
                </span>
              )}
            </Link>
            <MenuUsuario nombre={usuario.nombre} rol={ROLES[usuario.rol]}>
              <Link href="/notificaciones" className="block px-4 py-2.5 text-sm hover:bg-gris">Avisos</Link>
              <form action={salir}>
                <button className="w-full cursor-pointer px-4 py-2.5 text-left text-sm hover:bg-gris">Cerrar sesión</button>
              </form>
            </MenuUsuario>
          </div>
        </div>
      </header>
      {process.env.MODO_DEMO === "1" && (
        <p className="bg-arena px-4 py-2 text-center text-xs font-semibold text-tinta">
          Ambiente de demostración: los datos son ficticios y son compartidos por todos los que exploran.
        </p>
      )}
      <main className="mx-auto max-w-[1120px] px-4 py-7 sm:px-6 sm:py-9">{children}</main>
    </div>
  );
}
