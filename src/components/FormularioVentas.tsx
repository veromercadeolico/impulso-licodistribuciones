"use client";

import { useMemo, useState } from "react";
import { enviarReporteVentas } from "@/app/(app)/turnos/acciones";
import { ACTIVIDADES_COMPETENCIA } from "@/lib/competencia";

type Producto = { item: number; descripcion: string; marca: string };
type Degustacion = { id: string; marca: string; presentacion: string; asignado: number; tipo: string };

export function FormularioVentas({
  turnoId,
  productos,
  degustacion,
  marcaTurno,
}: {
  turnoId: string;
  productos: Producto[];
  degustacion: Degustacion[];
  marcaTurno: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [competencia, setCompetencia] = useState<"si" | "no" | null>(null);
  const total = Object.values(cantidades).reduce((s, v) => s + (Number(v) || 0), 0);

  const grupos = useMemo(() => {
    const marcas = [...new Set(productos.map((p) => p.marca))].sort((a, b) =>
      a === marcaTurno ? -1 : b === marcaTurno ? 1 : a.localeCompare(b),
    );
    return marcas.map((marca) => ({ marca, items: productos.filter((p) => p.marca === marca) }));
  }, [productos, marcaTurno]);

  const coincide = (p: Producto) => p.descripcion.toLowerCase().includes(busqueda.trim().toLowerCase());

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

      <div>
        <label htmlFor="buscar" className="etiqueta">Cantidades vendidas por unidad</label>
        <input id="buscar" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto" className="campo" />
      </div>

      {grupos.map((g) => {
        const hay = g.items.some(coincide);
        return (
          <fieldset key={g.marca} hidden={!hay}>
            <legend className="mb-1 text-xs font-bold tracking-wide text-suave uppercase">{g.marca}</legend>
            <ul className="divide-y divide-linea rounded-lg border border-linea">
              {g.items.map((p) => (
                <li key={p.item} hidden={!coincide(p)} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <label htmlFor={`p_${p.item}`} className="min-w-0 text-sm">{p.descripcion}</label>
                  <input
                    id={`p_${p.item}`}
                    name={`p_${p.item}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={cantidades[p.item] ?? ""}
                    onChange={(e) => setCantidades((c) => ({ ...c, [p.item]: e.target.value }))}
                    className="campo w-20 shrink-0 text-right"
                  />
                </li>
              ))}
            </ul>
          </fieldset>
        );
      })}

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
