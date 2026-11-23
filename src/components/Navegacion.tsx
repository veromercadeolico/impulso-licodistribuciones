"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono, type NombreIcono } from "./iconos";

export type ItemNav = { href: string; texto: string; icono: NombreIcono };

export function Navegacion({ items }: { items: ItemNav[] }) {
  const ruta = usePathname();
  const activo = (href: string) => ruta === href || ruta.startsWith(`${href}/`);
  return (
    <>
      <nav aria-label="Principal" className="hidden h-full items-stretch gap-6 lg:flex">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={activo(i.href) ? "page" : undefined}
            className={`flex items-center border-b-2 pt-0.5 text-sm font-medium transition-colors ${
              activo(i.href) ? "border-marca text-fondo" : "border-transparent text-fondo/70 hover:text-fondo"
            }`}
          >
            {i.texto}
          </Link>
        ))}
      </nav>
      <nav
        aria-label="Principal móvil"
        className="fixed inset-x-0 bottom-0 z-20 flex justify-around bg-tinta pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={activo(i.href) ? "page" : undefined}
            className={`flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 border-t-2 px-1 text-center text-[11px] font-semibold ${
              activo(i.href) ? "border-marca text-fondo" : "border-transparent text-fondo/70"
            }`}
          >
            <Icono nombre={i.icono} className={`size-6 ${activo(i.href) ? "text-marca" : ""}`} />
            <span className="leading-tight">{i.texto}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

export function MenuUsuario({ nombre, rol, children }: { nombre: string; rol: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        aria-label="Menú de usuario"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="flex h-11 cursor-pointer items-center gap-2.5 rounded-full border border-white/25 pr-1.5 pl-3 text-fondo transition-colors hover:bg-white/10"
      >
        <Icono nombre="menu" className="size-4" />
        <span className="flex size-8 items-center justify-center rounded-full bg-fondo text-sm font-semibold text-tinta">
          {nombre.charAt(0).toUpperCase()}
        </span>
      </button>
      {abierto && (
        <div className="absolute top-13 right-0 z-30 w-64 overflow-hidden rounded-xl border border-linea bg-white py-2 text-tinta shadow-tarjeta">
          <div className="border-b border-linea px-4 pt-1 pb-3">
            <p className="truncate text-sm font-semibold">{nombre}</p>
            <p className="text-xs text-suave">{rol}</p>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
