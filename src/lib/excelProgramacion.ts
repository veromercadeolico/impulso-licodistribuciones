import ExcelJS from "exceljs";
import { hora } from "./formato";
import { FUENTE_TITULO, LICO, ponerSello } from "./marcaExcel";
import { aMinutos, DESCANSO_MINIMO_MIN } from "./reglas";

// Reproduce la estructura de la plantilla "PROGRAMACION NOVIEMBRE 2026-SEM 3.xlsx" de Trade Marketing,
// con los colores y el sello del manual de marca de Lico Distribuciones.
const VERDE = LICO.tinta; // encabezados
const CREMA = LICO.fondo; // texto de los encabezados y franja del título
const VERDE_OSCURO = LICO.marca; // columna del día y totales
const ORO_CLARO = LICO.fondo;
const FIESTA = LICO.marcaClaro;
const AZUL_CLARO = LICO.arena;
const AZUL_RESUMEN = LICO.arena;
const AZUL_DESTINO = LICO.fondo;
const VERDE_CLARO = LICO.gris;
const VERDE_NEGATIVO = LICO.errorClaro;
const DISPONIBLE = LICO.okClaro;
const NO_DISPONIBLE = LICO.errorClaro;
const A_SOLICITAR = LICO.marcaClaro;
const GRIS = "FFD0CECE";
const NARANJA = "FFFFC000";
const ROJO = "FFFF0000";
const AZUL = "FF0070C0";
const AMARILLO = "FFFFFF00";
const CAFE = "FF843C0C";
const MORADO = "FF7030A0";
const BLANCO = "FFFFFFFF";
const NEGRO = "FF000000";
/** Color de letra del uniforme: amarillo, azul (Esencial) o rojo (Ron Viejo de Caldas). */
export const COLOR_UNIFORME: Record<string, string> = { AA: NARANJA, ESE: "FF2F5597", RVC: ROJO };

const DIAS = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
/** Orden de los canales dentro de cada día, como en la plantilla. */
const ORDEN_CANAL = ["SUPERMERCADOS", "TAT", "MAYORISTAS", "EVENTOS", "CONSUMO", "FIESTAS"];
const NOMBRE_CANAL: Record<string, string> = {
  SUPERMERCADOS: "SUPERMERCADOS",
  TAT: "TAT",
  MAYORISTAS: "MAYORISTAS",
  EVENTOS: "EVENTOS",
  CONSUMO: "CONSUMO",
  FIESTAS: "FIESTAS PATRONALES",
};
const NOMBRE_EJECUCION: Record<string, string> = { ...NOMBRE_CANAL, EVENTOS: "ACTIVACIONES-EVENTOS" };
const ORDEN_MUNICIPIO = ["ARMENIA", "MONTENEGRO", "LA TEBAIDA", "QUIMBAYA", "CALARCA"];
/** Abreviaturas que usa la columna OTRO: "1 CO", "1 JC", "1 CHEERS". */
const ABREVIATURA: Record<string, string> = { CARTA_ORO: "CO", JUAN_CRUZ: "JC", CHEERS: "CHEERS", RVC: "RVC", ESE: "ESE", AA: "AA" };

export type TurnoExcel = {
  id: string;
  dia: string;
  inicio: string;
  fin: string;
  canal: string;
  municipio: string;
  lugar: string;
  direccion: string | null;
  marca: string;
  uniforme: string;
  impulsadora: string;
  notas: string | null;
  obsequios: string | null;
  vendedor: string | null;
  publicado: boolean;
  /** Hora que pidió la solicitud ("HH:MM:SS"); si es distinta a la del turno, el turno quedó corrido. */
  hora_solicitada?: string | null;
};
export type DegustacionExcel = { turno_id: string; marca: string; presentacion: string; asignado: number; tipo: string };
export type SolicitudExcel = {
  fecha: string; hora: string; canal: string; municipio: string; lugar: string; direccion: string | null; marca: string; uniforme: string;
  prioridad: number | null; estado: string; impulsadora: string | null; motivo: string | null; notas: string | null;
  obsequios: string | null; vendedor: string; recibida: string;
};
export type ImpulsadoraExcel = { nombre: string; municipio: string | null };
export type CanalExcel = { codigo: string; meta_semanal: number; turnos: number };
export type DisponibilidadExcel = { nombre: string; fecha: string; franja: string };

const partes = (fecha: string) => {
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
  return { dia: DIAS[d.getUTCDay()], num: d.getUTCDate(), mes: MESES[d.getUTCMonth()], mesNum: d.getUTCMonth() + 1, anio: d.getUTCFullYear() };
};
const horario = (t: TurnoExcel) => `${hora(t.inicio)} A ${hora(t.fin)}`;
const esNoche = (inicio: string) => Number(inicio.slice(11, 13)) >= 18;

/** Columna de la hoja del día: R.V.C (H-I), ESENCIAL (J-K), AMA (L-N). El resto va en OTRO. */
function columnaDia(marca: string, presentacion: string): number | null {
  const tabla: Record<string, Record<string, number>> = {
    RVC: { Media: 8, Botella: 9 },
    ESE: { Media: 10, Botella: 11 },
    AA: { Media: 12, Botella: 13, Litro: 14 },
  };
  return tabla[marca]?.[presentacion] ?? null;
}

/** Columna del cuadro "DEGUSTACION SOLICITADA". */
function columnaDegustacion(marca: string, presentacion: string): number | null {
  const tabla: Record<string, Record<string, number>> = {
    RVC: { Media: 2, Botella: 3, Tetra: 4, Cuarto: 5 },
    CARTA_ORO: { Media: 6, Botella: 7 },
    JUAN_CRUZ: { Media: 8, Botella: 9 },
    ESE: { Media: 11, Botella: 12, Shot: 13, Cuarto: 14 },
    AA: { Media: 17, Botella: 18, Litro: 19, Shot: 21, Tetra: 22 },
  };
  if (marca === "CHEERS") return 16;
  return tabla[marca]?.[presentacion] ?? null;
}

const borde: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" },
};

type Estilo = { fondo?: string; color?: string; tam?: number; h?: "left" | "center"; negrita?: boolean; wrap?: boolean };
function estilo(c: ExcelJS.Cell, o: Estilo = {}) {
  c.font = { name: "Calibri", size: o.tam ?? 16, bold: o.negrita ?? true, color: o.color ? { argb: o.color } : undefined };
  c.alignment = { horizontal: o.h ?? "center", vertical: "middle", wrapText: o.wrap ?? true };
  if (o.fondo) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fondo } };
  c.border = borde;
}

/** Une celdas consecutivas con el mismo valor de agrupación en una columna. */
function unirGrupos(hoja: ExcelJS.Worksheet, col: number, filaInicio: number, claves: string[]) {
  let desde = 0;
  for (let i = 1; i <= claves.length; i++) {
    if (i === claves.length || claves[i] !== claves[desde]) {
      if (i - 1 > desde) hoja.mergeCells(filaInicio + desde, col, filaInicio + i - 1, col);
      desde = i;
    }
  }
}

function cantidadTexto(n: number, presentacion: string, marca: string) {
  const plural: Record<string, string> = { Media: "MEDIAS", Botella: "BOTELLAS", Litro: "LITROS", Tetra: "TETRAS", Cuarto: "CUARTOS", Shot: "SHOTS" };
  return `${n} ${n === 1 ? presentacion.toUpperCase() : plural[presentacion] ?? presentacion.toUpperCase()} ${ABREVIATURA[marca] ?? marca}`;
}

function hojaDia(
  libro: ExcelJS.Workbook,
  dia: string,
  turnos: TurnoExcel[],
  deg: DegustacionExcel[],
  impulsadoras: ImpulsadoraExcel[],
  disponibles: Set<string>,
) {
  const p = partes(dia);
  const hoja = libro.addWorksheet(`${p.dia} ${String(p.num).padStart(2, "0")}-${String(p.mesNum).padStart(2, "0")}`, {
    views: [{ state: "frozen", ySplit: 5, zoomScale: 60 }],
  });
  const anchos = [22.4, 32.2, 22.4, 42.1, 47.8, 35.8, 23.3, 10, 12.4, 10, 10.8, 10, 12.4, 7.4, 19.1, 65.3, 39.1, 34, 60];
  anchos.forEach((w, i) => (hoja.getColumn(i + 1).width = w));

  hoja.mergeCells("A1:A2");
  hoja.mergeCells("B1:P1");
  hoja.getCell("B1").value = `Mes ${p.mes} DE ${p.anio}`;
  estilo(hoja.getCell("B1"), { fondo: VERDE, color: CREMA });
  hoja.mergeCells("B2:P2");
  hoja.getCell("B2").value = `LICODISTRIBUCIONES S.A.S. : ACTIVIDADES ${p.mes} ${p.anio}`;
  estilo(hoja.getCell("B2"), { fondo: CREMA, color: VERDE });
  hoja.getCell("B1").font = { name: FUENTE_TITULO, size: 18, color: { argb: CREMA } };
  hoja.getCell("B2").font = { name: FUENTE_TITULO, size: 18, color: { argb: VERDE } };
  estilo(hoja.getCell("A1"), { fondo: CREMA });
  hoja.mergeCells("Q1:Q2");
  estilo(hoja.getCell("Q1"), { fondo: CREMA });
  hoja.getRow(1).height = 31.2;
  hoja.getRow(2).height = 31.2;
  // Sello de Lico en el recuadro A1:A2, como el logo de la plantilla.
  ponerSello(libro, hoja, 0.3, 0.04, 78);

  const encabezados: [string, string][] = [
    ["A", "DIA"], ["B", "CANAL"], ["C", "CIUDAD"], ["D", "ACTIVIDAD"], ["E", "LUGAR"], ["F", "HORARIO"], ["G", "UNIFORME"],
    ["P", "DEGUSTADORAS"], ["Q", "ESTRATEGIA"], ["R", "SOLICITADO POR"], ["S", "ADICIONALES DEL VENDEDOR"],
  ];
  for (const [col, texto] of encabezados) {
    hoja.mergeCells(`${col}3:${col}5`);
    hoja.getCell(`${col}3`).value = texto;
    estilo(hoja.getCell(`${col}3`), { fondo: col === "A" ? VERDE_OSCURO : VERDE, color: CREMA });
  }
  hoja.mergeCells("H3:O3");
  hoja.getCell("H3").value = "PRODUCTO";
  estilo(hoja.getCell("H3"), { fondo: VERDE, color: CREMA });
  const grupos: [string, string, string, string[]][] = [
    ["H4:I4", "R.V.C", ROJO, ["H", "I"]],
    ["J4:K4", "ESENCIAL", AZUL, ["J", "K"]],
    ["L4:N4", "AMA", AMARILLO, ["L", "M", "N"]],
  ];
  for (const [rango, texto, color, cols] of grupos) {
    hoja.mergeCells(rango);
    const celda = hoja.getCell(rango.split(":")[0]);
    celda.value = texto;
    estilo(celda, { fondo: color, color: NEGRO });
    cols.forEach((c, i) => {
      hoja.getCell(`${c}5`).value = ["MEDIA", "BOTELLA", "LITRO"][i];
      estilo(hoja.getCell(`${c}5`), { fondo: color, color: NEGRO });
    });
  }
  hoja.getCell("O4").value = "OTRO";
  estilo(hoja.getCell("O4"), { color: NEGRO });
  estilo(hoja.getCell("O5"), { color: NEGRO });
  [3, 4, 5].forEach((r) => (hoja.getRow(r).height = 31.2));

  const posicion = (t: TurnoExcel) => {
    const i = ORDEN_CANAL.indexOf(t.canal);
    return i < 0 ? 99 : i;
  };
  const municipio = (m: string) => {
    const i = ORDEN_MUNICIPIO.indexOf(m);
    return i < 0 ? 50 : i;
  };
  const filas = [...turnos].sort(
    (a, b) =>
      posicion(a) - posicion(b) ||
      municipio(a.municipio) - municipio(b.municipio) ||
      a.municipio.localeCompare(b.municipio) ||
      a.inicio.localeCompare(b.inicio) ||
      a.lugar.localeCompare(b.lugar) ||
      a.uniforme.localeCompare(b.uniforme),
  );
  const primera = 6;
  filas.forEach((t, i) => {
    const r = hoja.getRow(primera + i);
    const otros: string[] = [];
    const estrategia: string[] = [];
    const cantidades = new Map<number, number>();
    for (const d of deg.filter((x) => x.turno_id === t.id)) {
      if (d.tipo === "obsequio") {
        estrategia.push(cantidadTexto(d.asignado, d.presentacion, d.marca));
        continue;
      }
      const col = columnaDia(d.marca, d.presentacion);
      if (col) cantidades.set(col, (cantidades.get(col) ?? 0) + d.asignado);
      else otros.push(`${d.asignado} ${d.presentacion === "Media" ? "" : `${d.presentacion.toUpperCase()} `}${ABREVIATURA[d.marca] ?? d.marca}`.replace(/\s+/g, " "));
    }
    if (t.obsequios) estrategia.push(t.obsequios.toUpperCase());
    const fiesta = t.canal === "FIESTAS";
    const valores: (string | number | null)[] = [
      null,
      NOMBRE_CANAL[t.canal] ?? t.canal,
      t.municipio,
      fiesta ? "FIESTAS PATRONALES" : "IMPULSO Y DEGUSTACION",
      t.lugar.toUpperCase(),
      horario(t),
      t.uniforme,
      ...[8, 9, 10, 11, 12, 13, 14].map((c) => cantidades.get(c) ?? null),
      otros.join(" ") || null,
      t.impulsadora.toUpperCase(),
      estrategia.join(", ") || null,
      t.vendedor ? `${t.vendedor}${t.publicado ? "" : " (borrador)"}` : null,
      [t.direccion ? `Dirección: ${t.direccion}` : null, t.notas].filter(Boolean).join(". ") || null,
    ];
    valores.forEach((v, c) => {
      const celda = r.getCell(c + 1);
      if (c > 0) celda.value = v;
      estilo(celda, {
        fondo: c === 6 ? undefined : fiesta && c >= 1 && c <= 4 ? FIESTA : BLANCO,
        color: c === 6 ? COLOR_UNIFORME[t.uniforme] : NEGRO,
        h: c === 4 || c >= 15 ? "left" : "center",
        tam: c >= 17 ? 12 : 16,
        negrita: c < 17,
      });
    });
    r.height = 31.2;
  });

  const ultima = primera + Math.max(filas.length, 1) - 1;
  if (filas.length) {
    hoja.mergeCells(primera, 1, ultima, 1);
    unirGrupos(hoja, 2, primera, filas.map((t) => t.canal));
    unirGrupos(hoja, 4, primera, filas.map((t) => t.canal));
    unirGrupos(hoja, 3, primera, filas.map((t) => `${t.canal}|${t.municipio}`));
    unirGrupos(hoja, 5, primera, filas.map((t) => `${t.canal}|${t.municipio}|${t.lugar.toUpperCase()}|${horario(t)}`));
    unirGrupos(hoja, 6, primera, filas.map((t) => `${t.canal}|${t.municipio}|${horario(t)}`));
  }
  const celdaDia = hoja.getCell(primera, 1);
  celdaDia.value = `${p.dia} ${p.num} DE ${p.mes}`;
  estilo(celdaDia, { fondo: ORO_CLARO, color: VERDE, tam: 20 });
  celdaDia.font = { name: FUENTE_TITULO, size: 20, bold: true, color: { argb: VERDE } };

  const total = hoja.getRow(ultima + 1);
  for (let c = 8; c <= 15; c++) {
    const celda = total.getCell(c);
    const letra = String.fromCharCode(64 + c);
    if (c < 15) celda.value = { formula: `SUM(${letra}${primera}:${letra}${ultima})` };
    else {
      const otros = filas.map((_, i) => hoja.getCell(primera + i, 15).value).filter(Boolean);
      celda.value = otros.length ? otros.join(" ") : null;
    }
    estilo(celda, { fondo: VERDE_OSCURO, color: BLANCO, tam: 24 });
  }
  total.height = 40;

  // Equipo del día: dónde está cada impulsadora en la tarde y en la noche, o si está disponible.
  const inicioEquipo = ultima + 3;
  ["ITEM", "NOMBRE ", "MUNICIPIO", "TARDE ", "NOCHE"].forEach((t, i) => {
    const celda = hoja.getCell(inicioEquipo, 3 + i);
    celda.value = t;
    estilo(celda, { fondo: AZUL_CLARO, color: NEGRO });
  });
  const equipo = [...impulsadoras].sort(
    (a, b) => municipio(a.municipio ?? "ZZ") - municipio(b.municipio ?? "ZZ") || a.nombre.localeCompare(b.nombre),
  );
  equipo.forEach((imp, i) => {
    const r = hoja.getRow(inicioEquipo + 1 + i);
    const suyos = turnos.filter((t) => t.impulsadora === imp.nombre);
    const franja = (noche: boolean): [string, string] => {
      const lugares = suyos.filter((t) => esNoche(t.inicio) === noche).map((t) => t.lugar.toUpperCase());
      if (lugares.length) return [lugares.join(" / "), BLANCO];
      return disponibles.has(`${imp.nombre}|${dia}|${noche ? "noche" : "tarde"}`) ? ["DISPONIBLE", DISPONIBLE] : ["NO DISPONIBLE", NO_DISPONIBLE];
    };
    const [tarde, fondoTarde] = franja(false);
    const [noche, fondoNoche] = franja(true);
    const mercaderista = !imp.municipio;
    const celdas: [string | number, string | undefined][] = [
      [i + 1, undefined],
      [imp.nombre, mercaderista ? GRIS : undefined],
      [imp.municipio ?? "MERCADERISTA", mercaderista ? GRIS : undefined],
      [mercaderista ? "" : tarde, mercaderista ? undefined : fondoTarde],
      [mercaderista ? "" : noche, mercaderista ? undefined : fondoNoche],
    ];
    celdas.forEach(([v, fondo], c) => {
      const celda = r.getCell(3 + c);
      celda.value = v === "" ? null : v;
      estilo(celda, { fondo, color: NEGRO, h: c === 0 ? "center" : "left" });
    });
    r.height = 24;
  });
}

function hojaEjecucion(libro: ExcelJS.Workbook, canales: CanalExcel[]) {
  const hoja = libro.addWorksheet("EJEC TURNOS");
  [23, 10, 15, 16].forEach((w, i) => (hoja.getColumn(i + 1).width = w));
  const celda = (r: number, c: number, v: ExcelJS.CellValue, o: { fondo?: string; negrita?: boolean; formato?: string } = {}) => {
    const x = hoja.getCell(r, c);
    x.value = v;
    x.font = { name: "Calibri", size: 11, bold: o.negrita };
    if (o.fondo) x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fondo } };
    if (o.formato) x.numFmt = o.formato;
    x.border = borde;
  };
  const ordenados = ORDEN_CANAL.map((c) => canales.find((x) => x.codigo === c)).filter(Boolean) as CanalExcel[];
  const orden = ["SUPERMERCADOS", "TAT", "CONSUMO", "MAYORISTAS", "EVENTOS", "FIESTAS"]
    .map((c) => ordenados.find((x) => x.codigo === c))
    .filter(Boolean) as CanalExcel[];

  ["CANAL", "TOTAL", "PROYECTADOS", "DIF"].forEach((t, i) => celda(1, i + 1, t, { fondo: AZUL_RESUMEN, negrita: true }));
  orden.forEach((c, i) => {
    const r = i + 2;
    celda(r, 1, NOMBRE_EJECUCION[c.codigo]);
    celda(r, 2, c.turnos);
    celda(r, 3, c.meta_semanal);
    celda(r, 4, { formula: `+B${r}-C${r}` }, { fondo: c.turnos - c.meta_semanal < 0 ? VERDE_NEGATIVO : undefined });
  });
  const fin = orden.length + 1;
  const tot = fin + 1;
  celda(tot, 1, "TOTAL", { fondo: AZUL_RESUMEN, negrita: true });
  ["B", "C", "D"].forEach((l, i) => celda(tot, i + 2, { formula: `SUM(${l}2:${l}${fin})` }, { fondo: AZUL_RESUMEN, negrita: true }));

  const ini = tot + 4;
  hoja.mergeCells(ini, 1, ini, 4);
  hoja.getCell(ini, 1).value = "PROYECCION SEMANAL";
  hoja.getCell(ini, 1).font = { name: "Calibri", size: 11, bold: true };
  ["CANAL", "TOTAL", "SEM", "%PARTICIPACION"].forEach((t, i) => celda(ini + 1, i + 1, t, { fondo: AZUL_RESUMEN, negrita: true }));
  const nombresProyeccion: Record<string, string> = { ...NOMBRE_EJECUCION, EVENTOS: "ACTIVACIONES Y EVENTOS" };
  const totalFila = ini + 2 + orden.length;
  orden.forEach((c, i) => {
    const r = ini + 2 + i;
    celda(r, 1, nombresProyeccion[c.codigo]);
    celda(r, 2, c.meta_semanal * 4);
    celda(r, 3, { formula: `+B${r}/4` });
    celda(r, 4, { formula: `+B${r}/B${totalFila}` }, { negrita: true, formato: "0%" });
  });
  celda(totalFila, 1, "TOTAL", { fondo: AZUL_RESUMEN, negrita: true });
  ["B", "C", "D"].forEach((l, i) =>
    celda(totalFila, i + 2, { formula: `SUM(${l}${ini + 2}:${l}${totalFila - 1})` }, { fondo: AZUL_RESUMEN, negrita: true, formato: l === "D" ? "0%" : undefined }),
  );
  ponerSello(libro, hoja, 5.2, 0.1, 70);
}

function hojaDegustacion(libro: ExcelJS.Workbook, deg: DegustacionExcel[], oficina: Map<string, number>) {
  const hoja = libro.addWorksheet("DEGUSTACION");
  hoja.getColumn(1).width = 29;
  for (let c = 2; c <= 22; c++) hoja.getColumn(c).width = 15;
  hoja.mergeCells("A1:V1");
  hoja.getCell("A1").value = "DEGUSTACION SOLICITADA";
  estilo(hoja.getCell("A1"), { color: NEGRO });

  const grupos: [string, string, string, string, string[]][] = [
    ["B2:E2", "R.V.C", ROJO, NEGRO, ["MEDIA", "BOTELLA", "TETRAS", "CUARTOS"]],
    ["F2:G2", "CARTA DE ORO", CAFE, BLANCO, ["MEDIA", "BOTELLA"]],
    ["H2:I2", "JUAN DE LA CRUZ", CAFE, BLANCO, ["MEDIA", "BOTELLA"]],
    ["J2:J2", "RTD", MORADO, BLANCO, ["DAHIQUIRI"]],
    ["K2:O2", "ESENCIAL", AZUL, NEGRO, ["MEDIA", "BOTELLA", "SHOTS", "CUARTOS", "SHOT"]],
    ["P2:P2", "OTROS", VERDE_OSCURO, BLANCO, ["CHEERS"]],
    ["Q2:V2", "AMA", AMARILLO, NEGRO, ["MEDIA", "BOTELLA", "LITROS", "RTD", "SHOTS", "TETRAS"]],
  ];
  hoja.mergeCells("A2:A3");
  hoja.getCell("A2").value = "DESTINO";
  estilo(hoja.getCell("A2"), { fondo: AZUL_DESTINO, color: NEGRO });
  for (const [rango, titulo, fondo, color, subs] of grupos) {
    const [a, b] = rango.split(":");
    if (a !== b) hoja.mergeCells(rango);
    hoja.getCell(a).value = titulo;
    estilo(hoja.getCell(a), { fondo, color });
    const col0 = hoja.getCell(a).col;
    subs.forEach((s, i) => {
      const c = hoja.getCell(3, Number(col0) + i);
      c.value = s;
      estilo(c, { fondo, color });
    });
  }

  const sumar = (tipo: string) => {
    const fila = new Map<number, number>();
    for (const d of deg.filter((x) => x.tipo === tipo)) {
      const col = columnaDegustacion(d.marca, d.presentacion);
      if (col) fila.set(col, (fila.get(col) ?? 0) + d.asignado);
    }
    return fila;
  };
  const enOficina = new Map<number, number>();
  for (const [k, v] of oficina) {
    const [marca, presentacion] = k.split("|");
    const col = columnaDegustacion(marca, presentacion);
    if (col) enOficina.set(col, (enOficina.get(col) ?? 0) + v);
  }
  const fila = (r: number, destino: string, valores: Map<number, number> | ((c: number) => ExcelJS.CellValue), fondo = BLANCO) => {
    const a = hoja.getCell(r, 1);
    a.value = destino;
    estilo(a, { fondo, color: NEGRO });
    for (let c = 2; c <= 22; c++) {
      const celda = hoja.getCell(r, c);
      celda.value = typeof valores === "function" ? valores(c) : valores.get(c) ?? null;
      estilo(celda, { fondo, color: NEGRO });
    }
  };
  const letra = (c: number) => String.fromCharCode(64 + c);
  fila(4, "PROGRAMACION IMPULSO", sumar("degustacion"));
  fila(5, "OBSEQUIOS", sumar("obsequio"));
  fila(6, "TOTAL", (c) => ({ formula: `SUM(${letra(c)}4:${letra(c)}5)` }), AZUL_DESTINO);
  fila(7, "OFICINA", enOficina, VERDE_CLARO);
  fila(8, "A SOLICITAR", (c) => ({ formula: `+${letra(c)}6-${letra(c)}7` }), A_SOLICITAR);
  for (let r = 1; r <= 8; r++) hoja.getRow(r).height = 28;
  hoja.getCell("A1").font = { name: FUENTE_TITULO, size: 18, color: { argb: VERDE } };
  ponerSello(libro, hoja, 22.2, 0.1, 70);

  const sinColumna = deg.filter((d) => !columnaDegustacion(d.marca, d.presentacion));
  if (sinColumna.length) {
    hoja.getCell("A11").value = "OTROS PRODUCTOS SIN COLUMNA EN EL CUADRO";
    hoja.getCell("A11").font = { name: "Calibri", size: 12, bold: true };
    sinColumna.forEach((d, i) => {
      hoja.getCell(12 + i, 1).value = `${d.tipo === "obsequio" ? "Obsequio" : "Degustación"}: ${cantidadTexto(d.asignado, d.presentacion, d.marca)}`;
    });
  }
}

function hojaSolicitudes(libro: ExcelJS.Workbook, solicitudes: SolicitudExcel[]) {
  const hoja = libro.addWorksheet("SOLICITUDES", { views: [{ state: "frozen", ySplit: 1 }] });
  const columnas: [string, number][] = [
    ["FECHA", 13], ["HORA", 11], ["CANAL", 22], ["CIUDAD", 16], ["LUGAR", 32], ["DIRECCIÓN", 28], ["MARCA", 34], ["RELEVANCIA", 13],
    ["ESTADO", 15], ["IMPULSADORA", 30], ["MOTIVO", 34], ["ADICIONALES", 45], ["OBSEQUIOS", 34], ["SOLICITADO POR", 28], ["RECIBIDA", 18],
  ];
  const estados: Record<string, string> = { pendiente: "PENDIENTE", aprobada: "APROBADA", rechazada: "NO APROBADA" };
  columnas.forEach(([t, w], i) => {
    hoja.getColumn(i + 1).width = w;
    const c = hoja.getCell(1, i + 1);
    c.value = t;
    estilo(c, { fondo: VERDE, color: CREMA, tam: 12 });
  });
  solicitudes.forEach((s, n) => {
    const valores = [
      s.fecha, hora(s.hora), s.canal, s.municipio, s.lugar, s.direccion, s.marca, s.prioridad ? ["", "ALTA", "MEDIA", "BAJA"][s.prioridad] : "SIN DEFINIR",
      estados[s.estado], s.impulsadora, s.motivo, s.notas, s.obsequios, s.vendedor, s.recibida,
    ];
    valores.forEach((v, i) => {
      const c = hoja.getCell(n + 2, i + 1);
      c.value = v;
      estilo(c, { tam: 12, negrita: i === 6, h: "left", color: i === 6 ? COLOR_UNIFORME[s.uniforme] : NEGRO });
    });
  });
  hoja.getRow(1).height = 30;
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(solicitudes.length + 1, 1), column: columnas.length } };
  ponerSello(libro, hoja, columnas.length + 0.3, 0.1, 70);
}

/**
 * Hoja para revisar un día: cada impulsadora con sus turnos en orden y el descanso entre ellos.
 * Marca en rojo cuando hay menos de 1 h 30 entre un turno y el siguiente, y lista lo que quedó sin impulsadora.
 */
function hojaRevision(libro: ExcelJS.Workbook, turnos: TurnoExcel[], solicitudes: SolicitudExcel[], nombre = "REVISION") {
  const hoja = libro.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  const columnas = ["IMPULSADORA", "HORARIO", "LUGAR", "CIUDAD", "MARCA", "DESCANSO ANTES", "REVISION"];
  const anchos = [34, 22, 42, 16, 28, 18, 30];
  anchos.forEach((w, i) => (hoja.getColumn(i + 1).width = w));
  columnas.forEach((t, i) => {
    const c = hoja.getRow(1).getCell(i + 1);
    c.value = t;
    estilo(c, { fondo: VERDE, color: CREMA, negrita: true });
  });
  const porPersona = new Map<string, TurnoExcel[]>();
  for (const t of turnos) porPersona.set(t.impulsadora, [...(porPersona.get(t.impulsadora) ?? []), t]);
  let fila = 2;
  let problemas = 0;
  for (const [nombre, propios] of [...porPersona].sort(([a], [b]) => a.localeCompare(b))) {
    propios.sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
    propios.forEach((t, i) => {
      const descanso = i === 0 ? null : aMinutos(t.inicio) - aMinutos(propios[i - 1].fin);
      const corto = descanso !== null && descanso < DESCANSO_MINIMO_MIN;
      if (corto) problemas++;
      const valores = [
        i === 0 ? nombre : "",
        `${hora(t.inicio)} a ${hora(t.fin)}`,
        t.lugar,
        t.municipio,
        t.marca,
        descanso === null ? "–" : `${Math.floor(descanso / 60)} h ${String(descanso % 60).padStart(2, "0")} min`,
        [
          descanso === null ? "" : corto ? "MENOS DE 1 H 30" : "OK",
          t.hora_solicitada && t.hora_solicitada.slice(0, 5) !== t.inicio.slice(11, 16)
            ? `CORRIDO (pedido ${hora(`${t.dia} ${t.hora_solicitada}`)})`
            : "",
        ].filter(Boolean).join(" · "),
      ];
      valores.forEach((v, j) => {
        const c = hoja.getRow(fila).getCell(j + 1);
        c.value = v;
        estilo(c, { tam: 12, h: "left", negrita: j === 0 || (j === 6 && corto), color: j === 6 && corto ? ROJO : NEGRO, fondo: corto ? "FFFFE0E0" : undefined });
      });
      fila++;
    });
  }
  const sinImpulsadora = solicitudes.filter((s) => !s.impulsadora && s.estado !== "rechazada");
  fila++;
  const resumen = [
    `Turnos del día: ${turnos.length}`,
    problemas ? `Descansos de menos de 1 h 30: ${problemas}` : "Todas las impulsadoras tienen al menos 1 h 30 entre turnos.",
    `Solicitudes sin impulsadora: ${sinImpulsadora.length}`,
  ];
  for (const r of resumen) {
    const c = hoja.getRow(fila++).getCell(1);
    c.value = r;
    estilo(c, { tam: 12, h: "left", negrita: true, color: r.startsWith("Descansos") ? ROJO : NEGRO });
  }
  for (const s of sinImpulsadora) {
    const valores = ["SIN IMPULSADORA", `${hora(`${s.fecha} ${s.hora}`)}`, s.lugar, s.municipio, s.marca];
    valores.forEach((v, j) => {
      const c = hoja.getRow(fila).getCell(j + 1);
      c.value = v;
      estilo(c, { tam: 12, h: "left", negrita: j === 0, color: j === 0 ? ROJO : NEGRO });
    });
    fila++;
  }
  ponerSello(libro, hoja, columnas.length + 0.3, 0.1, 70);
}

export async function crearExcelProgramacion(d: {
  turnos: TurnoExcel[];
  degustacion: DegustacionExcel[];
  solicitudes: SolicitudExcel[];
  impulsadoras: ImpulsadoraExcel[];
  canales: CanalExcel[];
  disponibilidad: DisponibilidadExcel[];
  oficina: Map<string, number>;
  /** Excel de revisión de un solo día: sin la hoja de ejecución semanal y con la hoja REVISION. */
  soloDias?: string[] | null;
}) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Lico Distribuciones · Trade Marketing";
  const disponibles = new Set(d.disponibilidad.map((x) => `${x.nombre}|${x.fecha}|${x.franja}`));

  if (d.soloDias?.length === 1) hojaRevision(libro, d.turnos, d.solicitudes);
  else if (d.soloDias?.length) {
    // Varios días elegidos: una hoja de revisión por día.
    for (const dia of d.soloDias) {
      const p = partes(dia);
      hojaRevision(libro, d.turnos.filter((t) => t.dia === dia), d.solicitudes.filter((s) => s.fecha === dia), `REVISION ${p.dia} ${String(p.num).padStart(2, "0")}`);
    }
  }
  else hojaEjecucion(libro, d.canales);
  const dias = [...new Set(d.turnos.map((t) => t.dia))].sort();
  for (const dia of dias) {
    hojaDia(libro, dia, d.turnos.filter((t) => t.dia === dia), d.degustacion, d.impulsadoras, disponibles);
  }
  hojaDegustacion(libro, d.degustacion, d.oficina);
  hojaSolicitudes(libro, d.solicitudes);
  return libro.xlsx.writeBuffer();
}
