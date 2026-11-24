import assert from "node:assert/strict";
import { test } from "node:test";
import { bloqueFinDeSemana, esDiaDeFinDeSemana, esFestivo, festivosColombia, finesDeSemana, mesDe, viernesDe } from "./calendario.ts";

test("festivos de Colombia 2025 coinciden con el calendario oficial", () => {
  const esperados = [
    "2025-01-01", "2025-01-06", "2025-03-24", "2025-04-17", "2025-04-18", "2025-05-01", "2025-06-02",
    "2025-06-23", "2025-06-30", "2025-07-20", "2025-08-07", "2025-08-18", "2025-10-13", "2025-11-03",
    "2025-11-17", "2025-12-08", "2025-12-25",
  ];
  assert.deepEqual([...festivosColombia(2025)].sort(), esperados);
});

test("festivos de Colombia 2026 que caen en lunes", () => {
  for (const f of ["2026-01-12", "2026-03-23", "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29", "2026-08-17", "2026-10-12", "2026-11-02", "2026-11-16"]) {
    assert.ok(esFestivo(f), f);
  }
  assert.ok(!esFestivo("2026-11-23"));
});

test("fin de semana normal es de viernes a domingo", () => {
  assert.deepEqual(bloqueFinDeSemana("2026-11-27"), {
    inicio: "2026-11-27", fin: "2026-11-29", dias: ["2026-11-27", "2026-11-28", "2026-11-29"], conFestivo: false,
  });
});

test("puente festivo va de viernes a lunes", () => {
  const b = bloqueFinDeSemana("2026-11-13");
  assert.equal(b.fin, "2026-11-16");
  assert.equal(b.dias.length, 4);
  assert.ok(b.conFestivo);
});

test("viernes del fin de semana en curso o el siguiente", () => {
  assert.equal(viernesDe("2026-11-24"), "2026-11-27"); // martes → próximo viernes
  assert.equal(viernesDe("2026-11-29"), "2026-11-27"); // domingo → viernes anterior
  assert.equal(viernesDe("2026-11-16"), "2026-11-13"); // lunes festivo → su puente
  assert.equal(viernesDe("2026-11-23"), "2026-11-27"); // lunes normal → próximo viernes
  assert.equal(finesDeSemana("2026-11-24", 1, 1).map((b) => b.inicio).join(","), "2026-11-20,2026-11-27,2026-12-04");
});

test("días de fin de semana incluyen el lunes festivo", () => {
  assert.deepEqual(
    ["2026-11-12", "2026-11-13", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-23"].map(esDiaDeFinDeSemana),
    [false, true, true, true, false, false],
  );
});

test("el mes va del 1 al último día", () => {
  assert.deepEqual([mesDe("2026-11").fin, mesDe("2026-12").fin, mesDe("2028-02").fin], ["2026-11-30", "2026-12-31", "2028-02-29"]);
  assert.equal(mesDe("2026-11").nombre, "noviembre 2026");
});
