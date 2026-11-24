"use client";

import { useMemo, useState } from "react";
import { enviarReporteVentas } from "@/app/(app)/turnos/acciones";
import { ACTIVIDADES_COMPETENCIA } from "@/lib/competencia";
import { buscarReferencias, esDeLaMarca, ordenarPorLiquidador, type ProductoVenta } from "@/lib/liquidador";

type Degustacion = { id: string; marca: string; presentacion: string; asignado: number; tipo: string };

export function FormularioVentas({
  turnoId,
  productos,
  degustacion,
  marcaCodigo,
}: {
  turnoId: string;
  productos: ProductoVenta[];
  degustacion: Degustacion[];
  /** Código de la marca del turno (AA, RVC, ESE, CARTA_ORO, JUAN_CRUZ, CHEERS). */
  marcaCodigo: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [extras, setExtras] = useState<number[]>([]);
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [competencia, setCompetencia] = useState<"si" | "no" | null>(null);
  const total = Object.values(cantidades).reduce((s, v) => s + (Number(v) || 0), 0);

  // Arriba los productos de la marca del turno; el resto se agrega desde el buscador, en orden del liquidador.
  const principales = useMemo(() => ordenarPorLiquidador(productos.filter((p) => esDeLaMarca(marcaCodigo, p))), [productos, marcaCodigo]);
  const agregados = extras.map((i) => productos.find((p) => p.item === i)).filter((p): p is ProductoVenta => !!p);
  const disponibles = productos.filter((p) => !principales.includes(p) && !extras.includes(p.item));
  const sugerencias = buscarReferencias(disponibles, busqueda);
  const agregar = (item: number) => {
    setExtras((x) => (x.includes(item) ? x : [...x, item]));
    setBusqueda("");
    setAbierto(false);
    setTimeout(() => document.getElementById(`p_${item}`)?.focus(), 0);
  };

  return (
    <form action={enviarReporteVentas} className="space-y-4">
      <input type="hidden" name="turno" value={turnoId} />

      {degustacion.length > 0 && (
        <fieldset className="rounded-lg border border-linea p-3">
          <legend className="px-1 text-sm font-semibold">Degustación y obsequios asignados</legend>
          <div className="space-y-3">
            {degustacion.map((d) => (
              <div key={d.id} className="grid grid-cols-[1fr_5rem_5rem] items-end gap-2">
                <p className="text-sm">
                  <strong>{d.asignado}</strong> {d.presentacion} {d.marca}{d.tipo === "obsequio" ? " · obsequio" : ""}
                </p>
                <div>
                  <label htmlFor={`u_${d.id}`} className="mb-1 block text-xs text-suave">Usado</label>
                  <input id={`u_${d.id}`} name={`u_${d.id}`} type="number" inputMode="numeric" min={0} max={d.asignado} required className="campo" />
                </div>
                <div>
                  <label htmlFor={`s_${d.id}`} className="mb-1 block text-xs text-suave">Sobrante</label>
                  <input id={`s_${d.id}`} name={`s_${d.id}`} type="number" inputMode="numeric" min={0} max={d.asignado} required className="campo" />
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="etiqueta">Cantidades vendidas por unidad</legend>
        {principales.length > 0 && (
          <p className="mb-1 text-xs font-bold tracking-wide text-suave uppercase">Marca del turno</p>
        )}
        {[...principales, ...agregados].length > 0 && (
          <ul className="divide-y divide-linea rounded-lg border border-linea">
            {[...principales, ...agregados].map((p) => (
              <li key={p.item} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <label htmlFor={`p_${p.item}`} className="min-w-0 text-sm">{p.descripcion}</label>
                <div className="flex shrink-0 items-center gap-1">
                  <input
                    id={`p_${p.item}`}
                    name={`p_${p.item}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={cantidades[p.item] ?? ""}
                    onChange={(e) => setCantidades((c) => ({ ...c, [p.item]: e.target.value }))}
                    className="campo w-20 text-right"
                  />
                  {extras.includes(p.item) && (
                    <button
                      type="button"
                      aria-label={`Quitar ${p.descripcion}`}
                      onClick={() => {
                        setExtras((x) => x.filter((i) => i !== p.item));
                        setCantidades((c) => ({ ...c, [p.item]: "" }));
                      }}
                      className="cursor-pointer px-1 font-bold text-error"
                    >
                      ×
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="relative mt-3">
          <label htmlFor="otra-ref" className="mb-1 block text-sm font-semibold">Agregar otra referencia</label>
          <input
            id="otra-ref"
            type="search"
            role="combobox"
            aria-expanded={abierto && sugerencias.length > 0}
            aria-controls="lista-referencias"
            autoComplete="off"
            value={busqueda}
            onFocus={() => setAbierto(true)}
            onBlur={() => setTimeout(() => setAbierto(false), 150)}
            onChange={(e) => { setBusqueda(e.target.value); setAbierto(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (sugerencias[0]) agregar(sugerencias[0].item);
              }
            }}
            placeholder="Escribe las primeras letras, p. ej. ron, cristal, gin"
            className="campo"
          />
          {abierto && sugerencias.length > 0 && (
            <ul id="lista-referencias" role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-borde bg-white shadow-md">
              {sugerencias.map((p) => (
                <li key={p.item} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => agregar(p.item)}
                    className="w-full cursor-pointer px-3 py-2.5 text-left text-sm hover:bg-gris"
                  >
                    {p.descripcion}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-suave">Las referencias salen en el orden del liquidador. Al elegir una, se agrega arriba para escribir la cantidad.</p>
        </div>
      </fieldset>

      <div>
        <label htmlFor="observaciones" className="etiqueta">Observaciones</label>
        <textarea id="observaciones" name="observaciones" rows={3} maxLength={500} className="campo" />
      </div>

      <div>
        <label htmlFor="publicidad" className="etiqueta">Publicidad del establecimiento</label>
        <textarea
          id="publicidad"
          name="publicidad"
          rows={2}
          maxLength={500}
          placeholder="Afiches, habladores, neveras, exhibidores, de nuestras marcas o de la competencia"
          className="campo"
        />
      </div>

      <fieldset className="rounded-lg border border-linea p-3">
        <legend className="px-1 text-sm font-semibold">Competencia</legend>
        <p className="text-sm">¿Había competencia en el punto?</p>
        <div className="mt-2 flex gap-2">
          {(["si", "no"] as const).map((v) => (
            <label
              key={v}
              className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold ${
                competencia === v ? "border-tinta bg-tinta text-fondo" : "border-borde"
              }`}
            >
              <input type="radio" name="competencia" value={v} required checked={competencia === v} onChange={() => setCompetencia(v)} className="sr-only" />
              {v === "si" ? "Sí" : "No"}
            </label>
          ))}
        </div>
        {competencia === "si" && (
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="competencia_marcas" className="etiqueta">¿Qué marcas?</label>
              <input id="competencia_marcas" name="competencia_marcas" required maxLength={200} placeholder="Ron Medellín, Antioqueño" className="campo" />
            </div>
            <div>
              <p className="etiqueta">¿Qué estaban haciendo?</p>
              <div className="flex flex-wrap gap-2">
                {ACTIVIDADES_COMPETENCIA.map((a) => (
                  <label key={a} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-borde px-3 text-sm has-[:checked]:border-tinta has-[:checked]:bg-gris">
                    <input type="checkbox" name="competencia_actividad" value={a} className="size-4 accent-tinta" />
                    {a}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="competencia_detalle" className="etiqueta">Detalle</label>
              <textarea id="competencia_detalle" name="competencia_detalle" rows={2} maxLength={500} placeholder="Precios, promociones, cuántas impulsadoras tenían" className="campo" />
            </div>
          </div>
        )}
      </fieldset>

      <div className="sticky bottom-16 flex items-center justify-between gap-3 tarjeta-compacta shadow-md lg:bottom-2">
        <p className="text-sm"><strong className="text-lg tabular-nums">{total}</strong> unidades</p>
        <button className="boton">Enviar reporte</button>
      </div>
    </form>
  );
}
