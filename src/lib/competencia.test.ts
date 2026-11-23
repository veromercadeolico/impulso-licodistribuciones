import assert from "node:assert/strict";
import { test } from "node:test";
import { leerCompetencia, resumenCompetencia } from "./competencia.ts";

const formulario = (campos: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of campos) f.append(k, v);
  return f;
};

test("exige responder si había competencia", () => {
  assert.deepEqual(leerCompetencia(formulario([])), { error: "Indica si había competencia en el punto." });
});

test("sin competencia no pide más datos", () => {
  assert.deepEqual(leerCompetencia(formulario([["competencia", "no"], ["competencia_marcas", "X"]])), {
    competencia: { hay: false, marcas: null, actividades: [], detalle: null },
  });
});

test("con competencia exige las marcas", () => {
  const r = leerCompetencia(formulario([["competencia", "si"], ["competencia_marcas", "  "]]));
  assert.ok("error" in r);
});

test("con competencia guarda marcas, actividades válidas y detalle", () => {
  const r = leerCompetencia(
    formulario([
      ["competencia", "si"],
      ["competencia_marcas", " Ron Medellín "],
      ["competencia_actividad", "Precio especial"],
      ["competencia_actividad", "Inventada"],
      ["competencia_actividad", "Precio especial"],
      ["competencia_detalle", "2x1 en 375"],
    ]),
  );
  assert.deepEqual(r, {
    competencia: { hay: true, marcas: "Ron Medellín", actividades: ["Precio especial"], detalle: "2x1 en 375" },
  });
});

test("resumen legible", () => {
  assert.equal(resumenCompetencia(null), "Sin información de competencia.");
  assert.equal(resumenCompetencia({ hay: false, marcas: null, actividades: [], detalle: null }), "Sin competencia en el punto.");
  assert.equal(
    resumenCompetencia({ hay: true, marcas: "Ron Medellín", actividades: ["Impulso", "Precio especial"], detalle: "2x1" }),
    "Competencia: Ron Medellín (impulso, precio especial). 2x1",
  );
});
