import { MarcaLD } from "./marca";

const TRAZOS = {
  calendario: "M7 3v3m10-3v3M4 9.5h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z",
  lista: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  grafico: "M4 20h16M7 16v-5m5 5V6m5 10v-8",
  usuarios: "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10 8.5v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.7a3 3 0 0 1 0 5.6",
  pin: "M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  correo: "M4 6.5h16v11H4v-11Zm0 .5 8 6 8-6",
  campana: "M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2ZM10 21h4",
  menu: "M4 7h16M4 12h16M4 17h16",
  buscar: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Zm5.5-2 5 5",
  mas: "M12 5v14M5 12h14",
  check: "m5 12.5 4.5 4.5L19 7.5",
  flecha: "M15 5l-7 7 7 7",
  reloj: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13.5V12l3 2",
  carrito: "M3 4h2.2l2.2 11h10.2l2-8H6M9 20h.01M17 20h.01",
  tienda: "M4 10v10h16V10M3 10l2-6h14l2 6a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Zm7 10v-5h4v5",
  copa: "M7 3h10l-1 7a4 4 0 0 1-8 0L7 3Zm5 11v7m-4 0h8",
  camion: "M3 6h11v10H3V6Zm11 4h4l3 3v3h-7v-6ZM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  estrella: "m12 3 2.7 5.8 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3.1 1.2-6.2L3 9.6l6.3-.8L12 3Z",
  bandera: "M5 21V4m0 1c5-3 9 3 14 0v9c-5 3-9-3-14 0",
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, className = "size-5" }: { nombre: NombreIcono; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-3">
      <MarcaLD className="h-10 text-marca" />
      <span aria-hidden className="h-7 w-px bg-white/25" />
      <span className="titulo text-sm text-fondo">Impulso</span>
    </span>
  );
}
