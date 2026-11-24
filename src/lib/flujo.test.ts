import assert from "node:assert/strict";
import { test } from "node:test";
import { enlaceFlujo, estadoDeAviso, pasoDeEnlace, pasosPermitidos, puedeEditar, puedePublicar } from "./flujo.ts";

const P = "2e3380d6-689e-4612-a804-55f824db6e5c";

test("el paso se lee del enlace del aviso", () => {
  assert.equal(enlaceFlujo(P, "enviada"), `/programacion?p=${P}&flujo=enviada`);
  assert.equal(pasoDeEnlace(enlaceFlujo(P, "devuelta")), "devuelta");
  assert.equal(pasoDeEnlace(`/programacion?p=${P}`), null);
  assert.equal(pasoDeEnlace(`/programacion?p=${P}&flujo=otra`), null);
  assert.equal(pasoDeEnlace(null), null);
});

test("estado de la semana según el último aviso", () => {
  assert.equal(estadoDeAviso(null), "preparacion");
  assert.equal(estadoDeAviso(enlaceFlujo(P, "enviada")), "en_revision");
  assert.equal(estadoDeAviso(enlaceFlujo(P, "aprobada")), "aprobada");
  assert.equal(estadoDeAviso(enlaceFlujo(P, "devuelta")), "devuelta");
  assert.equal(estadoDeAviso(enlaceFlujo(P, "retomada")), "preparacion");
});

test("quién edita en cada paso", () => {
  assert.ok(puedeEditar("trade", "preparacion", false));
  assert.ok(puedeEditar("trade", "devuelta", false));
  assert.ok(!puedeEditar("trade", "en_revision", false));
  assert.ok(!puedeEditar("trade", "aprobada", false));
  assert.ok(puedeEditar("supervisor", "en_revision", false));
  assert.ok(!puedeEditar("supervisor", "preparacion", false));
  assert.ok(!puedeEditar("supervisor", "en_revision", true));
  assert.ok(puedeEditar("trade", "aprobada", true));
  assert.ok(!puedeEditar("vendedor", "en_revision", false));
});

test("publicar solo después de la aprobación", () => {
  assert.ok(!puedePublicar("preparacion", false));
  assert.ok(!puedePublicar("en_revision", false));
  assert.ok(puedePublicar("aprobada", false));
  assert.ok(puedePublicar("preparacion", true));
});

test("pasos que puede dar cada rol", () => {
  assert.deepEqual(pasosPermitidos("trade", "preparacion", false), ["enviada"]);
  assert.deepEqual(pasosPermitidos("trade", "devuelta", false), ["enviada"]);
  assert.deepEqual(pasosPermitidos("supervisor", "en_revision", false), ["aprobada", "devuelta"]);
  assert.deepEqual(pasosPermitidos("trade", "aprobada", false), ["retomada"]);
  assert.deepEqual(pasosPermitidos("supervisor", "aprobada", false), []);
  assert.deepEqual(pasosPermitidos("trade", "aprobada", true), []);
});
