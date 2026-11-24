import { BotonCopiar } from "@/components/BotonCopiar";
import { Avisos, Encabezado, Insignia, Tarjeta } from "@/components/ui";
import { exigirRol } from "@/lib/auth";
import { sql } from "@/lib/db";
import { MUNICIPIOS, ROLES, SUBPERFILES } from "@/lib/formato";
import { cambiarActivo, guardarUsuario, importarUsuarios, rolesQuePuedeGestionar } from "../acciones";

type Fila = Record<string, string | null>;

function Campos({ u, canales, roles }: { u?: Fila; canales: Fila[]; roles: string[] }) {
  const k = u?.id ?? "nuevo";
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <label htmlFor={`ced-${k}`} className="etiqueta">Cédula</label>
        <input id={`ced-${k}`} name="cedula" inputMode="numeric" defaultValue={u?.cedula ?? ""} className="campo" />
      </div>
      <div>
        <label htmlFor={`nom-${k}`} className="etiqueta">Nombre</label>
        <input id={`nom-${k}`} name="nombre" required defaultValue={u?.nombre ?? ""} className="campo" />
      </div>
      <div>
        <label htmlFor={`cor-${k}`} className="etiqueta">Correo</label>
        <input id={`cor-${k}`} name="correo" type="email" defaultValue={u?.correo ?? ""} className="campo" />
      </div>
      <div>
        <label htmlFor={`rol-${k}`} className="etiqueta">Rol</label>
        <select id={`rol-${k}`} name="rol" defaultValue={u?.rol ?? "vendedor"} className="campo">
          {roles.map((v) => <option key={v} value={v}>{ROLES[v]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`can-${k}`} className="etiqueta">Canal</label>
        <select id={`can-${k}`} name="canal" defaultValue={u?.canal ?? ""} className="campo">
          <option value="">Sin canal</option>
          {canales.map((c) => <option key={c.codigo} value={c.codigo!}>{c.nombre}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`mun-${k}`} className="etiqueta">Municipio</label>
        <select id={`mun-${k}`} name="municipio" defaultValue={u?.municipio ?? ""} className="campo">
          <option value="">Sin municipio</option>
          {MUNICIPIOS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`sub-${k}`} className="etiqueta">Subperfil</label>
        <select id={`sub-${k}`} name="subperfil" defaultValue={u?.subperfil ?? ""} className="campo">
          <option value="">Sin subperfil</option>
          {Object.entries(SUBPERFILES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>
    </div>
  );
}

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const usuario = await exigirRol("admin", "trade");
  const roles = await rolesQuePuedeGestionar(usuario);
  const sp = await searchParams;
  const [usuarios, canales] = await Promise.all([
    sql`SELECT u.id, u.cedula, u.nombre, u.correo, u.rol, u.canal, u.municipio, u.subperfil, u.activo, c.nombre AS canal_nombre
      FROM usuarios u LEFT JOIN canales c ON c.codigo = u.canal
      WHERE u.rol = ANY(${roles}) ORDER BY u.activo DESC, u.rol DESC, u.nombre`,
    sql`SELECT codigo, nombre FROM canales ORDER BY orden`,
  ]);
  const sinCedula = usuarios.filter((u) => !u.cedula && u.activo).length;
  const codigo = process.env.REGISTRO_CODIGO;
  const enlace = codigo ? `${process.env.APP_URL ?? ""}/registro?c=${codigo}` : null;
  const esAdmin = usuario.rol === "admin";

  return (
    <>
      <Encabezado
        titulo={esAdmin ? "Usuarios" : "Equipo"}
        detalle={`${usuarios.length} registrados · ${sinCedula} sin cédula${esAdmin ? "" : " · vendedores, impulsadoras y supervisión"}`}
      >
        <a href="/api/admin/plantilla" className="boton-sec">Descargar plantilla Excel</a>
      </Encabezado>
      <Avisos ok={sp.ok} error={sp.error} />

      <Tarjeta titulo="Enlace de registro para vendedores" className="mb-4">
        {enlace ? (
          <>
            <p className="mb-3 text-sm text-suave">
              Compártelo con los vendedores. Cada uno se registra con su nombre, cédula y canal, y queda listo para enviar solicitudes.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input readOnly value={enlace} aria-label="Enlace de registro" className="campo font-mono text-xs" />
              <BotonCopiar texto={enlace} />
            </div>
          </>
        ) : (
          <p className="text-sm text-suave">El registro por enlace está desactivado. Falta configurar el código de registro.</p>
        )}
      </Tarjeta>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Cargar desde Excel">
          <p className="mb-3 text-sm text-suave">La plantilla trae a las personas registradas. Completa cédula, correo y canal, y súbela.</p>
          <form action={importarUsuarios} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="archivo" className="sr-only">Archivo de Excel</label>
            <input id="archivo" name="archivo" type="file" accept=".xlsx" required className="campo" />
            <button className="boton shrink-0">Importar</button>
          </form>
        </Tarjeta>
        <Tarjeta>
          <details>
            <summary className="cursor-pointer font-semibold">Agregar una persona</summary>
            <form action={guardarUsuario} className="mt-3 space-y-3">
              <Campos canales={canales} roles={roles} />
              <button className="boton">Agregar</button>
            </form>
          </details>
        </Tarjeta>
      </div>
      <ul className="space-y-2">
        {usuarios.map((u) => (
          <li key={u.id} className={`tarjeta-compacta ${u.activo ? "" : "opacity-60"}`}>
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-medium">{u.nombre}</span>
                  <span className="block text-xs text-suave">
                    {u.cedula ?? "Sin cédula"} · {u.canal_nombre ?? "Sin canal"} · {u.municipio ?? "Sin municipio"}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Insignia tono="marca">{ROLES[u.rol]}</Insignia>
                  {u.subperfil && <Insignia>{SUBPERFILES[u.subperfil] ?? u.subperfil}</Insignia>}
                  {!u.cedula && <Insignia tono="alerta">Sin cédula</Insignia>}
                  {!u.activo && <Insignia tono="error">Inactivo</Insignia>}
                </span>
              </summary>
              <form action={guardarUsuario} className="mt-3 space-y-3">
                <input type="hidden" name="id" value={u.id} />
                <Campos u={u} canales={canales} roles={roles} />
                <button className="boton">Guardar</button>
              </form>
              <form action={cambiarActivo} className="mt-2">
                <input type="hidden" name="id" value={u.id} />
                <button className="boton-sec">{u.activo ? "Desactivar" : "Activar"}</button>
              </form>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
