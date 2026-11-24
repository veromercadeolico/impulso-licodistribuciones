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
