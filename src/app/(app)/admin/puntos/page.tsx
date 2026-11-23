import { Avisos, Encabezado, Insignia, Vacio } from "@/components/ui";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { guardarPunto } from "../acciones";

export default async function PuntosPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await exigirRol("admin");
  const sp = await searchParams;
  const puntos = await sql`SELECT p.id, p.nombre, p.municipio, p.lat, p.lng, u.lat AS ultima_lat, u.lng AS ultima_lng
    FROM puntos p LEFT JOIN LATERAL (
      SELECT a.lat, a.lng FROM asistencias a JOIN turnos t ON t.id = a.turno_id
      WHERE t.punto_id = p.id AND a.tipo = 'entrada' ORDER BY a.registrado_en DESC LIMIT 1
    ) u ON true ORDER BY (p.lat IS NULL) DESC, p.municipio, p.nombre`;

  return (
    <>
      <Encabezado titulo="Puntos de activación" detalle="La ubicación permite verificar que la impulsadora llegó al punto programado." />
      <Avisos ok={sp.ok} error={sp.error} />
      {puntos.length === 0 && <Vacio>Los puntos aparecen cuando los vendedores envían solicitudes.</Vacio>}
      <ul className="space-y-2">
        {puntos.map((p) => (
          <li key={p.id} className="tarjeta-compacta">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 font-medium">{p.nombre} <span className="text-sm font-normal text-suave">· {p.municipio}</span></p>
              {p.lat === null ? <Insignia tono="alerta">Sin ubicación</Insignia> : <Insignia tono="ok">Con ubicación</Insignia>}
            </div>
            <form action={guardarPunto} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="id" value={p.id} />
              <input name="lat" required inputMode="decimal" aria-label={`Latitud de ${p.nombre}`} placeholder="Latitud" defaultValue={p.lat ?? p.ultima_lat ?? ""} className="campo" />
              <input name="lng" required inputMode="decimal" aria-label={`Longitud de ${p.nombre}`} placeholder="Longitud" defaultValue={p.lng ?? p.ultima_lng ?? ""} className="campo" />
              <button className="boton-sec col-span-2 sm:col-span-1">Guardar</button>
            </form>
            {p.lat === null && p.ultima_lat !== null && (
              <p className="mt-1 text-xs text-suave">Coordenadas sugeridas de la última entrada registrada. Confírmalas antes de guardar.</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
