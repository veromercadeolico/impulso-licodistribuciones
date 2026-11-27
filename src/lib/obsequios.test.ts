import assert from "node:assert/strict";
import { test } from "node:test";
import { auxiliosAlimentacion, extraerObsequios } from "./obsequios.ts";

test("lee anchetas, cuartos, cócteles y shots de lo que escribe el vendedor", () => {
  assert.deepEqual(extraerObsequios("10 anchetas de amarillo y RVC tradicional"), { anchetas: 10, cuartos: 0, cocteles: 0, shots: 0 });
  assert.equal(extraerObsequios("Anchetas 3 con amarillo y ron").anchetas, 3);
  assert.equal(extraerObsequios("Requerimientos adicionales \r\n10 anchetas para ambos eventos").anchetas, 10);
  assert.equal(extraerObsequios("6 cuartos de esencial").cuartos, 6);
  assert.equal(extraerObsequios("12 cuartos VIERNES NEGRO. Horario 4 - 8 PM.").cuartos, 12);
  assert.equal(extraerObsequios("IMPULSO Y DEGUSTACION. Horario 3 - 7 PM. Cocteles: 4.").cocteles, 4);
  assert.equal(extraerObsequios("Obsequios por compras de ron. Cócteles: 6. Merch: 3.").cocteles, 6);
  assert.equal(extraerObsequios("6 shot esencial Gracias").shots, 6);
});

test("no confunde horarios, botellas ni 'producto coctelería' con obsequios", () => {
  assert.deepEqual(extraerObsequios("2 AA 750 - 2 RVCCO 750 + Producto cocteleria 200 Horario 3 - 7 PM"), { anchetas: 0, cuartos: 0, cocteles: 0, shots: 0 });
  assert.deepEqual(extraerObsequios(null), { anchetas: 0, cuartos: 0, cocteles: 0, shots: 0 });
});

const t = (impulsadora: string, inicio: string, fin: string, lugar = "X") => ({ impulsadora, inicio, fin, lugar });

test("auxilio cuando hay menos de 1 h 30 entre dos turnos completos", () => {
  const a = auxiliosAlimentacion([t("Vero", "2026-11-27 13:00", "2026-11-27 17:00"), t("Vero", "2026-11-27 18:00", "2026-11-27 22:00")]);
  assert.equal(a.length, 1);
  assert.equal(a[0].comida, 18000);
  assert.equal(a[0].almuerzo, 0);
  assert.match(a[0].motivo, /1 h de descanso/);
});

test("turno partido de 2 h + 2 h no lleva auxilio", () => {
  const a = auxiliosAlimentacion([t("Geidy", "2026-11-28 20:30", "2026-11-28 22:30"), t("Geidy", "2026-11-28 22:30", "2026-11-29 00:30")]);
  assert.equal(a.length, 0);
});

test("con 1 h 30 o más de descanso no hay auxilio", () => {
  const a = auxiliosAlimentacion([t("Ana", "2026-11-27 14:00", "2026-11-27 18:00"), t("Ana", "2026-11-27 19:30", "2026-11-27 23:30")]);
  assert.equal(a.length, 0);
});

test("evento de 10 horas o más lleva almuerzo, comida e hidratación", () => {
  const a = auxiliosAlimentacion([t("Mariana", "2026-11-28 07:00", "2026-11-28 22:00")]);
  assert.deepEqual([a[0].almuerzo, a[0].comida, a[0].hidratacion], [18000, 18000, 10000]);
});

test("si el primer turno termina antes de las 3 PM el auxilio es almuerzo", () => {
  const a = auxiliosAlimentacion([t("Rita", "2026-11-28 09:00", "2026-11-28 13:00"), t("Rita", "2026-11-28 14:00", "2026-11-28 18:00")]);
  assert.deepEqual([a[0].almuerzo, a[0].comida], [18000, 0]);
});
