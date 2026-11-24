// Festivos de Colombia, bloques de fin de semana (viernes a domingo, o a lunes si es festivo) y meses.
// Funciones puras con fechas en texto "AAAA-MM-DD", sin base de datos.

const DIA_MS = 86_400_000;
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const aFecha = (t: string) => new Date(`${t.slice(0, 10)}T00:00:00Z`);
const aTexto = (d: Date) => d.toISOString().slice(0, 10);
const mas = (t: string, dias: number) => aTexto(new Date(aFecha(t).getTime() + dias * DIA_MS));
const diaSemana = (t: string) => aFecha(t).getUTCDay(); // 0 domingo … 5 viernes

/** Domingo de Pascua (algoritmo gregoriano anónimo). */
function pascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Ley Emiliani: si no cae lunes, pasa al lunes siguiente. */
const alLunes = (t: string) => mas(t, (8 - diaSemana(t)) % 7);

const cache = new Map<number, Set<string>>();

export function festivosColombia(anio: number): Set<string> {
  const guardado = cache.get(anio);
  if (guardado) return guardado;
  const f = (mmdd: string) => `${anio}-${mmdd}`;
  const p = pascua(anio);
  const lista = [
    f("01-01"), f("05-01"), f("07-20"), f("08-07"), f("12-08"), f("12-25"),
    ...["01-06", "03-19", "06-29", "08-15", "10-12", "11-01", "11-11"].map((x) => alLunes(f(x))),
    mas(p, -3), mas(p, -2), // Jueves y Viernes Santo
    mas(p, 43), mas(p, 64), mas(p, 71), // Ascensión, Corpus Christi, Sagrado Corazón (ya en lunes)
  ];
  const conjunto = new Set(lista);
  cache.set(anio, conjunto);
  return conjunto;
}

export const esFestivo = (t: string) => festivosColombia(Number(t.slice(0, 4))).has(t.slice(0, 10));

export type Bloque = { inicio: string; fin: string; dias: string[]; conFestivo: boolean };

/** Fin de semana que empieza el viernes dado: viernes a domingo, o a lunes si el lunes es festivo. */
export function bloqueFinDeSemana(viernes: string): Bloque {
  const lunes = mas(viernes, 3);
  const conFestivo = esFestivo(lunes);
  const dias = [0, 1, 2, ...(conFestivo ? [3] : [])].map((n) => mas(viernes, n));
  return { inicio: viernes, fin: dias[dias.length - 1], dias, conFestivo };
}

/** Viernes del fin de semana en curso; de martes a jueves, el del fin de semana que viene. */
export function viernesDe(fecha: string): string {
  const d = diaSemana(fecha);
  if (d === 5) return fecha;
  if (d === 6) return mas(fecha, -1);
  if (d === 0) return mas(fecha, -2);
  if (d === 1 && esFestivo(fecha)) return mas(fecha, -3);
  return mas(fecha, (5 - d + 7) % 7);
}

/** Si el día cae en un fin de semana (viernes, sábado, domingo o lunes festivo de puente). */
export const esDiaDeFinDeSemana = (fecha: string) => bloqueFinDeSemana(viernesDe(fecha)).dias.includes(fecha.slice(0, 10));

/** Lista de fines de semana alrededor de una fecha: algunos anteriores y varios siguientes. */
export function finesDeSemana(fecha: string, antes = 4, despues = 8): Bloque[] {
  const base = viernesDe(fecha);
  return Array.from({ length: antes + despues + 1 }, (_, i) => bloqueFinDeSemana(mas(base, (i - antes) * 7)));
}

export type Mes = { clave: string; inicio: string; fin: string; nombre: string };

/** Mes "AAAA-MM": del día 1 al último día (28 a 31). */
export function mesDe(clave: string): Mes {
  const [anio, mes] = clave.split("-").map(Number);
  const inicio = `${clave}-01`;
  const fin = aTexto(new Date(Date.UTC(anio, mes, 0)));
  return { clave, inicio, fin, nombre: `${MESES_LARGOS[mes - 1]} ${anio}` };
}

/** Meses alrededor de una fecha. */
export function mesesCerca(fecha: string, antes = 3, despues = 3): Mes[] {
  const [anio, mes] = fecha.split("-").map(Number);
  return Array.from({ length: antes + despues + 1 }, (_, i) => {
    const d = new Date(Date.UTC(anio, mes - 1 + i - antes, 1));
    return mesDe(aTexto(d).slice(0, 7));
  });
}

/** Nombre corto de un bloque: "vie 28 nov al dom 30 nov" o "… al lun 8 dic (festivo)". */
export function nombreBloque(b: Bloque, corta: (t: string) => string): string {
  return `${corta(b.inicio)} al ${corta(b.fin)}${b.conFestivo ? " (festivo)" : ""}`;
}

export const esClaveMes = (v: string | undefined): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const esFecha = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(aFecha(v).getTime());
