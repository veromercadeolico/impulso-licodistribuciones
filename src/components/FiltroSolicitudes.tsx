"use client";

import { useEffect, useState } from "react";
import { Icono } from "./iconos";

type Opcion = { valor: string; texto: string };
type Filtro = { texto: string; canal: string; estado: string; dia: string };
const VACIO: Filtro = { texto: "", canal: "", estado: "", dia: "" };

function normalizar(t: string) {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Filtra en el navegador las solicitudes de la lista, sin recargar la página. */
export function FiltroSolicitudes({ lista, clave, canales, dias }: { lista: string; clave: string; canales: Opcion[]; dias: Opcion[] }) {
  const [f, setF] = useState<Filtro>(VACIO);
  const [conteo, setConteo] = useState({ visibles: 0, total: 0 });

  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(`filtro-${clave}`);
      if (guardado) setF({ ...VACIO, ...JSON.parse(guardado) });
    } catch {}
  }, [clave]);

  useEffect(() => {
    try {
      sessionStorage.setItem(`filtro-${clave}`, JSON.stringify(f));
    } catch {}
    const items = [...document.querySelectorAll<HTMLElement>(`#${lista} > li`)];
    const palabras = normalizar(f.texto).split(/\s+/).filter(Boolean);
    let visibles = 0;
    for (const li of items) {
      const d = li.dataset;
      const ok =
        (!f.canal || d.canal === f.canal) &&
        (!f.estado || (f.estado === "sin_impulsadora" ? d.sinimp === "1" : d.estado === f.estado)) &&
        (!f.dia || d.dia === f.dia) &&
        palabras.every((p) => normalizar(d.texto ?? "").includes(p));
      li.hidden = !ok;
      if (ok) visibles++;
    }
    setConteo({ visibles, total: items.length });
  }, [f, lista, clave]);

  const cambiar = (k: keyof Filtro) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));
  const activo = f.texto || f.canal || f.estado || f.dia;

  return (
    <div className="tarjeta-compacta mb-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div className="relative">
          <label htmlFor="buscar-solicitud" className="sr-only">Buscar solicitudes</label>
          <Icono nombre="buscar" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-suave" />
          <input
            id="buscar-solicitud"
            type="search"
            value={f.texto}
            onChange={cambiar("texto")}
            placeholder="Buscar lugar, vendedor, municipio o adicionales"
            className="campo pl-10"
          />
        </div>
        <select aria-label="Canal" value={f.canal} onChange={cambiar("canal")} className="campo">
          <option value="">Todos los canales</option>
          {canales.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
        </select>
        <select aria-label="Estado" value={f.estado} onChange={cambiar("estado")} className="campo">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendientes</option>
          <option value="sin_impulsadora">Sin impulsadora (pendientes)</option>
          <option value="aprobada">Aprobadas</option>
          <option value="rechazada">No aprobadas</option>
        </select>
        <select aria-label="Día" value={f.dia} onChange={cambiar("dia")} className="campo">
          <option value="">Todos los días</option>
          {dias.map((d) => <option key={d.valor} value={d.valor}>{d.texto}</option>)}
        </select>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm text-suave">
        <p aria-live="polite">Mostrando {conteo.visibles} de {conteo.total} solicitudes</p>
        {activo && (
          <button type="button" onClick={() => setF(VACIO)} className="min-h-10 cursor-pointer font-semibold text-tinta underline underline-offset-2">
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}
