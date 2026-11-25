import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cajas,
  clasificarTurno,
  distanciaMetros,
  evaluarTurno,
  franjaDe,
  generarPropuesta,
  ordenarSolicitudes,
  periodoDeFecha,
  sumarMinutos,
  tiempoIncompleto,
  unidadesReducidas,
} from "./reglas.ts";

const base = { impulsadoraId: "a", municipio: "ARMENIA" };
const ctx = { municipioImpulsadora: "ARMENIA", disponible: true };
const codigos = (a: { codigo: string }[]) => a.map((x) => x.codigo);

test("un turno de 4 horas sin otros turnos no genera alertas", () => {
  assert.deepEqual(evaluarTurno({ ...base, inicio: "2026-11-13 15:00", fin: "2026-11-13 19:00" }, [], ctx), []);
});

test("un turno de 6 horas alerta por duración, como La Cava el 7/11", () => {
  const a = evaluarTurno({ ...base, inicio: "2026-11-07 16:00", fin: "2026-11-07 22:00" }, [], ctx);
  assert.deepEqual(codigos(a), ["DURACION"]);
  assert.equal(a[0].requiereMotivo, true);
});

test("turnos seguidos sin descanso alertan, como Elipsis y Ruta 12", () => {
  const otro = { impulsadoraId: "a", inicio: "2026-11-13 18:00", fin: "2026-11-13 22:00" };
  const a = evaluarTurno({ ...base, inicio: "2026-11-13 22:00", fin: "2026-11-14 02:00" }, [otro], ctx);
  assert.deepEqual(codigos(a), ["DESCANSO"]);
});

test("exactamente 1 h 30 min de descanso cumple la regla", () => {
  const otro = { impulsadoraId: "a", inicio: "2026-11-13 15:00", fin: "2026-11-13 19:00" };
  assert.deepEqual(evaluarTurno({ ...base, inicio: "2026-11-13 20:30", fin: "2026-11-14 00:30" }, [otro], ctx), []);
});

test("los turnos que se cruzan alertan y los de otra impulsadora se ignoran", () => {
  const propio = { impulsadoraId: "a", inicio: "2026-11-13 16:00", fin: "2026-11-13 20:00" };
  const ajeno = { impulsadoraId: "b", inicio: "2026-11-13 15:00", fin: "2026-11-13 19:00" };
  const a = evaluarTurno({ ...base, inicio: "2026-11-13 15:00", fin: "2026-11-13 19:00" }, [propio, ajeno], ctx);
  assert.deepEqual(codigos(a), ["CRUCE"]);
});

test("asignar a alguien no marcado como disponible avisa pero no exige motivo", () => {
  const a = evaluarTurno(
    { ...base, inicio: "2026-11-13 15:00", fin: "2026-11-13 19:00" },
    [],
    { municipioImpulsadora: "ARMENIA", disponible: false },
  );
  assert.deepEqual(codigos(a), ["NO_DISPONIBLE"]);
  assert.equal(a[0].requiereMotivo, false);
});

test("el desplazamiento avisa pero no exige motivo", () => {
  const a = evaluarTurno(
    { ...base, municipio: "LA TEBAIDA", inicio: "2026-11-13 15:00", fin: "2026-11-13 19:00" },
    [],
    ctx,
  );
  assert.deepEqual(codigos(a), ["DESPLAZAMIENTO"]);
  assert.equal(a[0].requiereMotivo, false);
});

test("la relevancia manda y el empate lo gana la primera en llegar", () => {
  const lista = [
    { id: "b", prioridad: 2, creadoEn: "2026-11-01 10:00" },
    { id: "a", prioridad: 2, creadoEn: "2026-11-01 09:00" },
    { id: "d", prioridad: 1, creadoEn: "2026-11-02 09:00" },
  ];
  assert.deepEqual(ordenarSolicitudes(lista).map((s) => s.id), ["d", "a", "b"]);
});

test("una solicitud sin relevancia conserva su puesto de llegada", () => {
  const lista = [
    { id: "baja", prioridad: 3, creadoEn: "2026-11-01 08:00" },
    { id: "media", prioridad: 2, creadoEn: "2026-11-01 09:00" },
    { id: "sin", prioridad: null, creadoEn: "2026-11-01 10:00" },
    { id: "alta", prioridad: 1, creadoEn: "2026-11-01 11:00" },
  ];
  assert.deepEqual(ordenarSolicitudes(lista).map((s) => s.id), ["alta", "media", "sin", "baja"]);
});

test("sin ninguna relevancia el orden es el de llegada", () => {
  const lista = [
    { id: "2", prioridad: null, creadoEn: "2026-11-01 09:00" },
    { id: "1", prioridad: null, creadoEn: "2026-11-01 08:00" },
  ];
  assert.deepEqual(ordenarSolicitudes(lista).map((s) => s.id), ["1", "2"]);
});

test("un turno con menos del 80 % del tiempo no cuenta como cumplido", () => {
  const base2 = { entrada: true, ventas: true, fueraDeRango: false, minutosProgramados: 240 };
  assert.equal(tiempoIncompleto(191, 240), true);
  assert.equal(tiempoIncompleto(192, 240), false);
  assert.equal(clasificarTurno({ ...base2, minutosTrabajados: 1 }), "tiempo_incompleto");
  assert.equal(clasificarTurno({ ...base2, minutosTrabajados: 192 }), "cumplido");
  assert.equal(clasificarTurno({ ...base2, fueraDeRango: true, minutosTrabajados: 1 }), "cambio_pdv");
});

test("la propuesta prefiere la ciudad, respeta descansos y reporta lo no cubierto", () => {
  const imp = [
    { id: "arm", nombre: "Ana", municipio: "ARMENIA" },
    { id: "teb", nombre: "Bea", municipio: "LA TEBAIDA" },
  ];
  const disp = new Set(["arm|2026-11-13|noche", "teb|2026-11-13|noche"]);
  const s = (id: string, municipio: string, creadoEn: string) => ({
    id,
    municipio,
    prioridad: null,
    creadoEn,
    inicio: "2026-11-13 20:00",
    fin: "2026-11-14 00:00",
  });
  const r = generarPropuesta(
    [s("1", "LA TEBAIDA", "1"), s("2", "ARMENIA", "2"), s("3", "ARMENIA", "3")],
    imp,
    disp,
  );
  assert.deepEqual(
    r.asignaciones.map((a) => [a.solicitudId, a.impulsadoraId]),
    [["1", "teb"], ["2", "arm"]],
  );
  assert.deepEqual(r.sinCobertura, ["3"]);
});

test("la propuesta usa otra ciudad con alerta si no hay nadie local", () => {
  const r = generarPropuesta(
    [{ id: "1", municipio: "QUIMBAYA", prioridad: 1, creadoEn: "1", inicio: "2026-11-13 15:00", fin: "2026-11-13 19:00" }],
    [{ id: "arm", nombre: "Ana", municipio: "ARMENIA" }],
    new Set(["arm|2026-11-13|tarde"]),
  );
  assert.deepEqual(codigos(r.asignaciones[0].alertas), ["DESPLAZAMIENTO"]);
});

test("clasifica el cumplimiento como el informe de Trade Marketing", () => {
  assert.equal(clasificarTurno({ entrada: true, ventas: true, fueraDeRango: false }), "cumplido");
  assert.equal(clasificarTurno({ entrada: true, ventas: true, fueraDeRango: true }), "cambio_pdv");
  assert.equal(clasificarTurno({ entrada: true, ventas: false, fueraDeRango: false }), "falta_ventas");
  assert.equal(clasificarTurno({ entrada: false, ventas: true, fueraDeRango: false }), "falta_entrada");
  assert.equal(clasificarTurno({ entrada: false, ventas: false, fueraDeRango: false }), "sin_reportes");
});

test("calcula unidades reducidas, cajas, franja y suma de minutos", () => {
  assert.equal(unidadesReducidas(8, 375), 4);
  assert.equal(unidadesReducidas(12, 1500), 24);
  assert.equal(cajas(6, 12), 0.5);
  assert.equal(franjaDe("2026-11-13 17:59"), "tarde");
  assert.equal(franjaDe("2026-11-13 18:00"), "noche");
  assert.equal(sumarMinutos("2026-11-13 20:30", 240), "2026-11-14 00:30");
});

test("mide la distancia entre dos coordenadas", () => {
  const d = distanciaMetros(4.5339, -75.6811, 4.5348, -75.6811);
  assert.ok(d > 90 && d < 110, `distancia ${d}`);
});

test("el periodo va de jueves a miércoles y cierra el miércoles anterior al mediodía", () => {
  const esperado = { inicio: "2026-11-19", fin: "2026-11-25", limite: "2026-11-18 12:00:00" };
  assert.deepEqual(periodoDeFecha("2026-11-19"), esperado);
  assert.deepEqual(periodoDeFecha("2026-11-22"), esperado);
  assert.deepEqual(periodoDeFecha("2026-11-25"), esperado);
});

test("la propuesta reparte: primero 3 por canal y jornada, y lo que sobra se reparte después", () => {
  const imp = ["a", "b", "c", "d", "e"].map((id) => ({ id, nombre: id, municipio: "ARMENIA" }));
  const disp = new Set(imp.map((i) => `${i.id}|2026-11-28|noche`));
  const s = (id: string, canal: string) => ({
    id, canal, municipio: "ARMENIA", prioridad: null, creadoEn: id, inicio: "2026-11-28 20:00", fin: "2026-11-29 00:00",
  });
  const r = generarPropuesta(
    [s("1", "CONSUMO"), s("2", "CONSUMO"), s("3", "CONSUMO"), s("4", "CONSUMO"), s("5", "CONSUMO"), s("6", "EVENTOS")],
    imp,
    disp,
  );
  // Eventos llegó de último pero entra en la primera ronda; la 4 de Consumo usa la impulsadora que sobró.
  assert.deepEqual(r.asignaciones.map((a) => a.solicitudId), ["1", "2", "3", "6", "4"]);
  assert.deepEqual(r.sinCobertura, ["5"]);
});

test("la propuesta prefiere el municipio y, entre las del municipio, a quien tiene menos de 3 turnos", () => {
  const imp = [
    { id: "arm1", nombre: "Ana", municipio: "ARMENIA" },
    { id: "arm2", nombre: "Bea", municipio: "ARMENIA" },
    { id: "cal", nombre: "Cata", municipio: "CALARCA" },
  ];
  const fijos = ["2026-11-27 14:00", "2026-11-27 20:00", "2026-11-28 14:00"].map((inicio) => ({
    impulsadoraId: "arm1", inicio, fin: sumarMinutos(inicio, 240),
  }));
  const disp = new Set(["arm1|2026-11-28|noche", "arm2|2026-11-28|noche", "cal|2026-11-28|noche"]);
  const sol = (id: string, municipio: string) => ({ id, municipio, prioridad: null, creadoEn: id, inicio: "2026-11-28 20:00", fin: "2026-11-29 00:00" });
  const r = generarPropuesta([sol("1", "ARMENIA"), sol("2", "ARMENIA")], imp, disp, fijos);
  // Primero Bea (Armenia, menos de 3), luego Ana (Armenia, ya tiene 3) antes que Cata (Calarcá).
  assert.deepEqual(r.asignaciones.map((a) => a.impulsadoraId), ["arm2", "arm1"]);
});

test("si nadie tiene la hora y media libre, la propuesta corre el turno media hora", () => {
  const imp = [{ id: "a", nombre: "Ana", municipio: "ARMENIA" }];
  // Ana termina a las 6:00 PM: a las 7:00 PM solo tendría 1 h de descanso; a las 7:30 PM ya tiene 1 h 30.
  const fijos = [{ impulsadoraId: "a", inicio: "2026-11-28 14:00", fin: "2026-11-28 18:00" }];
  const r = generarPropuesta(
    [{ id: "1", municipio: "ARMENIA", prioridad: null, creadoEn: "1", inicio: "2026-11-28 19:00", fin: "2026-11-28 23:00" }],
    imp,
    new Set(["a|2026-11-28|noche", "a|2026-11-28|tarde"]),
    fijos,
  );
  assert.equal(r.asignaciones[0].inicio, "2026-11-28 19:30");
  assert.equal(r.asignaciones[0].corridoMin, 30);
  assert.deepEqual(r.sinCobertura, []);
});

test("Consumo en la noche siempre queda a las 9:00 PM; la tarde y otros canales no cambian", async () => {
  const { horaSegunCanal } = await import("./reglas.ts");
  assert.equal(horaSegunCanal("CONSUMO", "20:00"), "21:00");
  assert.equal(horaSegunCanal("CONSUMO", "20:30"), "21:00");
  assert.equal(horaSegunCanal("CONSUMO", "12:00"), "12:00");
  assert.equal(horaSegunCanal("TAT", "20:00"), "20:00");
});

test("reconoce Consumo en la tarde para pedir confirmación", async () => {
  const { esConsumoTarde } = await import("./reglas.ts");
  assert.equal(esConsumoTarde("CONSUMO", "12:00:00"), true);
  assert.equal(esConsumoTarde("CONSUMO", "21:00"), false);
  assert.equal(esConsumoTarde("SUPERMERCADOS", "12:00"), false);
});

test("las de fuera de Armenia solo cubren su municipio, salvo las excepciones de día en Armenia", async () => {
  const { puedeCubrir } = await import("./reglas.ts");
  const quimbaya = { id: "q", municipio: "QUIMBAYA" };
  const danna = { id: "00e683f6-c1ed-4a0f-b452-65397b9c836b", municipio: "MONTENEGRO" };
  const armenia = { id: "a", municipio: "ARMENIA" };
  assert.equal(puedeCubrir(quimbaya, "QUIMBAYA", "2026-11-28 21:00"), true);
  assert.equal(puedeCubrir(quimbaya, "ARMENIA", "2026-11-28 14:00"), false);
  assert.equal(puedeCubrir(danna, "ARMENIA", "2026-11-28 14:00"), true);
  assert.equal(puedeCubrir(danna, "ARMENIA", "2026-11-28 21:00"), false);
  assert.equal(puedeCubrir(danna, "LA TEBAIDA", "2026-11-28 14:00"), false);
  assert.equal(puedeCubrir(armenia, "FILANDIA", "2026-11-28 21:00"), true);
});

test("bloquea municipios y sectores sin impulso en la semana indicada", async () => {
  const { sinImpulsoEstaSemana } = await import("./reglas.ts");
  assert.equal(sinImpulsoEstaSemana("2026-11-26", ["CIRCASIA", "Barkasa", null]), true);
  assert.equal(sinImpulsoEstaSemana("2026-11-26", ["CALARCÁ", "Olímpica", null]), true);
  assert.equal(sinImpulsoEstaSemana("2026-11-26", ["CALARCA", "Tienda", "Corregimiento Barcelona"]), true);
  assert.equal(sinImpulsoEstaSemana("2026-11-26", ["ARMENIA", "Éxito Centro", null]), false);
  assert.equal(sinImpulsoEstaSemana("2026-12-03", ["CIRCASIA", "Barkasa", null]), false);
});

test("Consumo en la noche dura 3 h 30 sin alerta; los demás deben durar 4 h", async () => {
  const { duracionTurno } = await import("./reglas.ts");
  assert.equal(duracionTurno("CONSUMO", "2026-11-28 21:00"), 210);
  assert.equal(duracionTurno("CONSUMO", "2026-11-28 12:00"), 240);
  assert.equal(duracionTurno("TAT", "2026-11-28 20:00"), 240);
  const ctx = { municipioImpulsadora: "ARMENIA", disponible: true };
  const consumo = { impulsadoraId: "a", municipio: "ARMENIA", canal: "CONSUMO", inicio: "2026-11-28 21:00", fin: "2026-11-29 00:30" };
  assert.deepEqual(codigos(evaluarTurno(consumo, [], ctx)), []);
  assert.deepEqual(codigos(evaluarTurno({ ...consumo, canal: "TAT" }, [], ctx)), ["DURACION"]);
});
