import assert from "node:assert/strict";
import { test } from "node:test";
import { buscarReferencias, esDeLaMarca, ordenarPorLiquidador, posicionLiquidador } from "./liquidador.ts";

const p = (item: number, descripcion: string, marca: string, ean: string | null) => ({ item, descripcion, marca, ean });
const productos = [
  p(1, "RON VIEJO CALDAS 750 ML", "RON VIEJO DE CALDAS", "7702168217308"),
  p(2, "AGUARDIENTE AMARILLO 750 ML 24 GRADOS", "AMARILLO DE MANZANARES", "7702168278477"),
  p(3, "LICOR DE RVC ESENCIAL 375 VIDRIO 29°", "RON VIEJO DE CALDAS", "7702168725254"),
  p(4, "AGUARDIENTE. CRISTAL 375 ML", "CRISTAL", "7702168114003"),
  p(5, "MULE AGUARDIENTE AMARILLO (LATA)", "COCTEL DE AMARILLO", "7702168457841"),
  p(6, "PRODUCTO NUEVO", "OTRA", null),
  p(7, "RVC 5 JUAN DE LA CRUZ 750 ML", "RON VIEJO DE CALDAS", "7702168239201"),
];

test("orden del liquidador y productos sin EAN al final", () => {
  assert.equal(posicionLiquidador("7702168114409"), 0);
  assert.equal(posicionLiquidador(null), posicionLiquidador("0000"));
  assert.deepEqual(ordenarPorLiquidador(productos).map((x) => x.item), [4, 2, 3, 1, 7, 5, 6]);
});

test("productos de la marca del turno", () => {
  const de = (codigo: string) => productos.filter((x) => esDeLaMarca(codigo, x)).map((x) => x.item);
  assert.deepEqual(de("AA"), [2, 5]);
  assert.deepEqual(de("ESE"), [3]);
  assert.deepEqual(de("RVC"), [1, 7]);
  assert.deepEqual(de("JUAN_CRUZ"), [7]);
  assert.deepEqual(de("OTRA"), []);
});

test("buscar por las primeras letras, sin importar tildes ni mayúsculas", () => {
  // Primero las que empiezan por "aguar"; después las que lo contienen.
  assert.deepEqual(buscarReferencias(productos, "aguar").map((x) => x.item), [4, 2, 5]);
  assert.deepEqual(buscarReferencias(productos, "amarillo").map((x) => x.item), [2, 5]);
  assert.deepEqual(buscarReferencias(productos, "licor de").map((x) => x.item), [3]);
  assert.equal(buscarReferencias(productos, "", 3).length, 3);
});
