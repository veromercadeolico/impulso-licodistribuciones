import Link from "next/link";
import type { Periodo } from "@/lib/periodos";
import { nombrePeriodo } from "@/lib/formato";
import { Icono } from "./iconos";
import { Botella } from "./marca";

export function Encabezado({
  titulo,
  detalle,
  children,
}: {
  titulo: string;
  detalle?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="titulo text-2xl leading-snug text-balance sm:text-[28px]">{titulo}</h1>
        {detalle && <p className="mt-1.5 text-base text-suave">{detalle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </header>
  );
}

export function Tarjeta({
  titulo,
  children,
  className = "",
}: {
  titulo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`tarjeta min-w-0 ${className}`}>
      {titulo && <h2 className="titulo mb-4 text-base">{titulo}</h2>}
      {children}
    </section>
  );
}

type Tono = "neutro" | "ok" | "alerta" | "error" | "marca";
const TONOS: Record<Tono, string> = {
  neutro: "bg-gris text-suave",
  ok: "bg-ok-claro text-ok",
  alerta: "bg-alerta-claro text-alerta",
  error: "bg-error-claro text-error",
  marca: "bg-marca-claro text-marca-fuerte",
};

export function Insignia({ tono = "neutro", children }: { tono?: Tono; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${TONOS[tono]}`}>
      {children}
    </span>
  );
}

export function Avisos({ ok, error }: { ok?: string; error?: string }) {
  return (
    <>
      {ok && (
        <p role="status" className="mb-5 flex items-center gap-2.5 rounded-xl bg-ok-claro px-4 py-3 text-sm font-medium text-ok">
          <Icono nombre="check" className="size-5 shrink-0" />
          {ok}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-5 rounded-xl bg-error-claro px-4 py-3 text-sm font-medium text-error">
          {error}
        </p>
      )}
    </>
  );
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div className="tarjeta flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-fondo text-marca-fuerte">
        <Icono nombre="calendario" className="size-6" />
      </span>
      <p className="max-w-sm text-base text-suave">{children}</p>
    </div>
  );
}

export function Kpi({ valor, etiqueta, tono }: { valor: string; etiqueta: string; tono?: "ok" | "error" }) {
  const color = tono === "ok" ? "text-ok" : tono === "error" ? "text-error" : "text-tinta";
  return (
    <div className="tarjeta-compacta">
      <p className={`text-[30px] leading-none font-semibold tabular-nums ${color}`}>{valor}</p>
      <p className="mt-2.5 text-[13px] leading-snug text-suave">{etiqueta}</p>
    </div>
  );
}

export function SelectorPeriodo({
  ruta,
  actual,
  lista,
  extra = {},
}: {
  ruta: string;
  actual: Periodo;
  lista: Periodo[];
  extra?: Record<string, string | undefined>;
}) {
  return (
    <form action={ruta} className="flex items-center gap-2 rounded-full border border-linea bg-white py-1.5 pr-1.5 pl-6 shadow-suave transition-shadow hover:shadow-tarjeta">
      {Object.entries(extra).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <div>
        <label htmlFor="periodo" className="block text-xs font-bold">Periodo</label>
        <select id="periodo" name="p" defaultValue={actual.id} className="-ml-1 cursor-pointer bg-transparent pr-1 text-sm text-suave outline-none">
          {lista.map((p) => (
            <option key={p.id} value={p.id}>
              {nombrePeriodo(p.fecha_inicio, p.fecha_fin)}
            </option>
          ))}
        </select>
      </div>
      <button
        aria-label="Ver periodo"
        className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-marca text-white transition hover:bg-marca-fuerte"
      >
        <Icono nombre="buscar" className="size-4" />
      </button>
    </form>
  );
}

export function Pestanas({ items, activa }: { items: { href: string; texto: string; id: string }[]; activa: string }) {
  return (
    <nav aria-label="Secciones" className="sin-barra -mx-4 mb-7 flex gap-6 overflow-x-auto px-4 shadow-[inset_0_-1px_0_var(--color-linea)] sm:mx-0 sm:px-0">
      {items.map((i) => (
        <Link
          key={i.id}
          href={i.href}
          aria-current={i.id === activa ? "page" : undefined}
          className={`border-b-2 py-3.5 text-sm font-semibold whitespace-nowrap transition-colors ${
            i.id === activa ? "border-marca text-tinta" : "border-transparent text-suave hover:border-borde hover:text-tinta"
          }`}
        >
          {i.texto}
        </Link>
      ))}
    </nav>
  );
}

export function Uniforme({ codigo }: { codigo: string }) {
  const estilos: Record<string, string> = {
    AA: "bg-[#ffd23f] text-tinta",
    RVC: "bg-[#c0262d] text-white",
    ESE: "bg-[#1f5fae] text-white",
  };
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${estilos[codigo] ?? "bg-gris text-tinta"}`}>
      {codigo}
    </span>
  );
}

const PORTADAS: Record<string, { fondo: string; texto: string; patron: string }> = {
  // Colores de uniforme que usa Trade Marketing: amarillo, rojo y azul.
  AA: { fondo: "#f4c430", texto: "#0a142d", patron: "/marca/patron-oscuro.svg" },
  RVC: { fondo: "#b3262c", texto: "#ffffff", patron: "/marca/patron-oscuro.svg" },
  ESE: { fondo: "#1f5fae", texto: "#ffffff", patron: "/marca/patron-oscuro.svg" },
};

/** Portada ilustrada de una activación, según el uniforme de la marca. */
export function Portada({
  uniforme,
  marca,
  className = "aspect-[4/3]",
  children,
}: {
  uniforme: string;
  marca: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const estilo = PORTADAS[uniforme] ?? PORTADAS.ESE;
  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{ backgroundColor: estilo.fondo, backgroundImage: `url(${estilo.patron})`, color: estilo.texto }}
    >
      <span aria-hidden className="absolute inset-2.5 border border-current opacity-40" />
      <span aria-hidden className="absolute top-0 right-7 flex h-16 w-11 items-end justify-center bg-marca pb-2.5 text-fondo">
        <Botella className="h-8" />
      </span>
      <div className="absolute bottom-6 left-6 max-w-[70%]">
        <p className="titulo text-2xl leading-none">{uniforme}</p>
        <p className="mt-1.5 text-xs font-medium">{marca}</p>
      </div>
      {children && <div className="absolute top-6 left-6 flex flex-wrap gap-1.5">{children}</div>}
    </div>
  );
}

export function EtiquetaPortada({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-lg bg-fondo px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-tinta">{children}</span>
  );
}
