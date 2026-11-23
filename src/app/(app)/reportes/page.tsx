import { redirect } from "next/navigation";
import { DesempenoCanal } from "@/components/reportes/DesempenoCanal";
import { Efectividad } from "@/components/reportes/Efectividad";
import { InformeVentas } from "@/components/reportes/InformeVentas";
import { MisActivaciones } from "@/components/reportes/MisActivaciones";
import { Encabezado, Pestanas, SelectorPeriodo } from "@/components/ui";
import { exigirUsuario } from "@/lib/auth";
import { sql } from "@/lib/db";
import { nombrePeriodo } from "@/lib/formato";
import { periodoSeleccionado } from "@/lib/periodos";

type Params = Promise<{ p?: string; vista?: string; canal?: string }>;
type Vista = "efectividad" | "desempeno" | "informe" | "activaciones";

const TITULOS: Record<Vista, string> = {
  efectividad: "Efectividad de los turnos de impulso",
  desempeno: "Desempeño de la activación por canal",
  informe: "Informe de ventas de actividades",
  activaciones: "Mis activaciones",
};

export default async function ReportesPage({ searchParams }: { searchParams: Params }) {
  const usuario = await exigirUsuario();
  if (usuario.rol === "impulsadora") redirect("/turnos");
  const sp = await searchParams;
  const { actual, lista } = await periodoSeleccionado(sp.p);

  const propia: Record<string, Vista> = {
    trade: "efectividad",
    lider_canal: "desempeno",
    director: "informe",
    vendedor: "activaciones",
  };
  // Administración y supervisión pueden ver el reporte de cada rol.
  const esAdmin = usuario.rol === "admin" || usuario.rol === "supervisor";
  const vista: Vista = esAdmin
    ? (["efectividad", "desempeno", "informe"] as const).find((v) => v === sp.vista) ?? "efectividad"
    : propia[usuario.rol];

  // Un líder con canal asignado solo ve ese canal; sin canal asignado puede elegir.
  const canalFijo = usuario.rol === "lider_canal" ? usuario.canal : null;
  const canal = canalFijo ?? sp.canal ?? null;
  const canales = vista === "desempeno" && !canalFijo ? await sql`SELECT codigo, nombre FROM canales ORDER BY orden` : [];

  return (
    <>
      <Encabezado titulo={TITULOS[vista]} detalle={`Periodo del ${nombrePeriodo(actual.fecha_inicio, actual.fecha_fin)}`}>
        <SelectorPeriodo ruta="/reportes" actual={actual} lista={lista} extra={{ vista: sp.vista, canal: sp.canal }} />
      </Encabezado>
      {esAdmin && (
        <Pestanas
          activa={vista}
          items={[
            { id: "efectividad", texto: "Trade Marketing", href: `/reportes?p=${actual.id}&vista=efectividad` },
            { id: "desempeno", texto: "Líderes de canal", href: `/reportes?p=${actual.id}&vista=desempeno` },
            { id: "informe", texto: "Director comercial", href: `/reportes?p=${actual.id}&vista=informe` },
          ]}
        />
      )}
      {canales.length > 0 && (
        <form action="/reportes" className="mb-4 flex items-center gap-2">
          <input type="hidden" name="p" value={actual.id} />
          {sp.vista && <input type="hidden" name="vista" value={sp.vista} />}
          <label htmlFor="canal" className="text-sm text-suave">Canal</label>
          <select id="canal" name="canal" defaultValue={canal ?? ""} className="campo w-auto">
            <option value="">Todos los canales</option>
            {canales.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
          </select>
          <button className="boton-sec">Ver</button>
        </form>
      )}
      {vista === "efectividad" && <Efectividad periodoId={actual.id} />}
      {vista === "desempeno" && <DesempenoCanal periodoId={actual.id} canal={canal} />}
      {vista === "informe" && <InformeVentas periodoId={actual.id} />}
      {vista === "activaciones" && (
        <MisActivaciones periodoId={actual.id} vendedorId={usuario.id} publicado={actual.estado === "publicado"} />
      )}
    </>
  );
}
