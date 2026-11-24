const ZONA = "America/Bogota";
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function ahoraBogota(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const v = (t: string) => p.find((x) => x.type === t)!.value;
  return `${v("year")}-${v("month")}-${v("day")} ${v("hour")}:${v("minute")}`;
}

export const hoyBogota = () => ahoraBogota().slice(0, 10);

export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
}

function partes(fecha: string) {
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
  return { dia: d.getUTCDay(), num: d.getUTCDate(), mes: MESES[d.getUTCMonth()] };
}

export function fechaCorta(fecha: string): string {
  const { dia, num, mes } = partes(fecha);
  return `${DIAS[dia]} ${num} ${mes}`;
}

export function fechaLarga(fecha: string): string {
  const { dia, num, mes } = partes(fecha);
  return `${DIAS_LARGOS[dia]} ${num} de ${mes}`;
}

export function hora(fechaHora: string): string {
  const texto = fechaHora.length <= 8 ? fechaHora : fechaHora.slice(11);
  const h = Number(texto.slice(0, 2));
  const m = texto.slice(3, 5);
  return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

export const horario = (inicio: string, fin: string) => `${hora(inicio)} a ${hora(fin)}`;

export function nombrePeriodo(inicio: string, fin: string): string {
  const a = partes(inicio);
  const b = partes(fin);
  return a.mes === b.mes ? `${a.num} al ${b.num} de ${b.mes}` : `${a.num} ${a.mes} al ${b.num} ${b.mes}`;
}

export function duracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const numero = (n: number, decimales = 0) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: decimales, minimumFractionDigits: decimales }).format(n);

export const porcentaje = (n: number) => `${Math.round(n * 100)} %`;

export const ROLES: Record<string, string> = {
  admin: "Administrador",
  trade: "Trade Marketing",
  vendedor: "Vendedor",
  impulsadora: "Impulsadora",
  lider_canal: "Líder de canal",
  director: "Director comercial",
  supervisor: "Supervisión",
};

export const MUNICIPIOS = [
  "ARMENIA",
  "BUENAVISTA",
  "CALARCA",
  "CIRCASIA",
  "CORDOBA",
  "FILANDIA",
  "GENOVA",
  "LA TEBAIDA",
  "MONTENEGRO",
  "PIJAO",
  "QUIMBAYA",
  "SALENTO",
];

export const PRESENTACIONES = ["Media", "Botella", "Litro", "Tetra", "Cuarto", "Shot"];
export const PRIORIDADES: Record<number, string> = { 1: "Alta", 2: "Media", 3: "Baja" };

/** Subperfiles del equipo: en qué área trabaja cada persona. */
export const SUBPERFILES: Record<string, string> = { impulso: "Impulso", bodega: "Bodega", oficina: "Oficina", mercadeo: "Mercadeo" };

/** Áreas donde se puede registrar un turno sin programación (además de Impulso). */
export const AREAS_TURNO: Record<string, string> = { bodega: "Bodega", oficina: "Oficina", mercadeo: "Mercadeo" };
