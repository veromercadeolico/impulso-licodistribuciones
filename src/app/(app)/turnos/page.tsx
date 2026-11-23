import Link from "next/link";
import { Encabezado, EtiquetaPortada, Portada, Vacio } from "@/components/ui";
import { Icono } from "@/components/iconos";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ahoraBogota, fechaLarga, horario } from "@/lib/formato";

function Paso({ hecho, texto }: { hecho: boolean; texto: string }) {
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${hecho ? "text-ok" : "text-suave"}`}>
      {hecho ? <Icono nombre="check" className="size-3.5" /> : <span aria-hidden className="size-1.5 rounded-full bg-borde" />}
      {texto}
    </span>
  );
}

export default async function TurnosPage() {
  const usuario = await exigirRol("impulsadora");
  const turnos = await sql`SELECT t.id, t.inicio::text, t.fin::text, t.uniforme, m.nombre AS marca, p.nombre AS lugar, p.municipio,
      EXISTS (SELECT 1 FROM asistencias a WHERE a.turno_id = t.id AND a.tipo = 'entrada') AS entrada,
      EXISTS (SELECT 1 FROM asistencias a WHERE a.turno_id = t.id AND a.tipo = 'salida') AS salida,
      EXISTS (SELECT 1 FROM reportes_venta r WHERE r.turno_id = t.id) AS ventas
    FROM turnos t JOIN puntos p ON p.id = t.punto_id JOIN marcas m ON m.codigo = t.marca
    WHERE t.impulsadora_id = ${usuario.id} AND t.publicado AND NOT t.cancelado
    ORDER BY t.inicio DESC LIMIT 40`;
  const ahora = ahoraBogota();
  const proximos = turnos.filter((t) => !t.ventas && t.fin.slice(0, 10) >= ahora.slice(0, 10)).reverse();
  const anteriores = turnos.filter((t) => !proximos.includes(t));

  const Ficha = ({ t }: { t: (typeof turnos)[number] }) => (
    <li>
      <Link href={`/turnos/${t.id}`} className="group block">
        <Portada uniforme={t.uniforme} marca={t.marca} className="aspect-[4/3] transition-transform duration-300 group-hover:scale-[1.015]">
          <EtiquetaPortada>{fechaLarga(t.inicio)}</EtiquetaPortada>
        </Portada>
        <h3 className="mt-3 truncate font-semibold">{t.lugar}</h3>
        <p className="text-sm text-suave">{t.municipio} · {horario(t.inicio, t.fin)}</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          <Paso hecho={t.entrada} texto="Entrada" />
          <Paso hecho={t.salida} texto="Salida" />
          <Paso hecho={t.ventas} texto="Ventas" />
        </div>
      </Link>
    </li>
  );
  const rejilla = "grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <>
      <Encabezado titulo={`Hola, ${usuario.nombre.split(" ")[0]}`} detalle="Estos son tus turnos de impulso." />
      <h2 className="mb-4 titulo text-lg">Próximos turnos</h2>
      {proximos.length === 0 && <Vacio>No tienes turnos pendientes.</Vacio>}
      <ul className={rejilla}>{proximos.map((t) => <Ficha key={t.id} t={t} />)}</ul>
      {anteriores.length > 0 && (
        <>
          <h2 className="mt-12 mb-4 titulo text-lg">Turnos anteriores</h2>
          <ul className={rejilla}>{anteriores.map((t) => <Ficha key={t.id} t={t} />)}</ul>
        </>
      )}
    </>
  );
}
