import assert from "node:assert/strict";
import { test } from "node:test";
import { consolidar, minutosEntre } from "./consolidado.ts";

const r = (personaId: string, entrada: string | null, salida: string | null, inicio = "2026-11-28 20:00", fin = "2026-11-29 00:00") => ({
  personaId, nombre: personaId === "a" ? "Ana" : "Bea", subperfil: personaId === "a" ? "impulso" : null, inicio, fin, entrada, salida,
});

test("minutos entre dos horas, cruzando la medianoche", () => {
  assert.equal(minutosEntre("2026-11-28 20:00", "2026-11-29 00:00"), 240);
  assert.equal(minutosEntre("2026-11-28 19:52:10.5", "2026-11-29 00:03:00"), 251);
  assert.equal(minutosEntre("2026-11-28 20:00", "2026-11-28 19:00"), 0);
});

test("un turno son 4 horas reales; las horas de varios turnos se suman", () => {
  const [ana] = consolidar([
    r("a", "2026-11-28 20:00:00", "2026-11-29 00:00:00"),
    r("a", "2026-11-29 14:00:00", "2026-11-29 16:00:00", "2026-11-29 14:00", "2026-11-29 16:00"),
  ]);
  assert.equal(ana.minutosReales, 360);
  assert.equal(ana.turnos, 1.5);
  assert.equal(ana.completos, 2);
});

test("los turnos sin salida o sin entrada se marcan y no suman horas", () => {
  const filas = consolidar([r("b", "2026-11-28 20:00:00", null), r("b", null, null), r("a", "2026-11-28 20:00:00", "2026-11-29 00:00:00")]);
  assert.deepEqual(filas.map((f) => f.nombre), ["Ana", "Bea"]);
  const bea = filas[1];
  assert.deepEqual([bea.programados, bea.sinSalida, bea.sinEntrada, bea.minutosReales, bea.turnos], [2, 1, 1, 0, 0]);
  assert.equal(bea.minutosProgramados, 480);
});
