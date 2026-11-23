import ExcelJS from "exceljs";
import { usuarioActual } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const usuario = await usuarioActual();
  if (usuario?.rol !== "admin" && usuario?.rol !== "trade") return new Response("No autorizado", { status: 403 });
  const roles = usuario.rol === "admin" ? ["admin", "trade", "vendedor", "impulsadora", "lider_canal", "director", "supervisor"] : ["vendedor", "impulsadora", "supervisor"];

  const [usuarios, canales] = await Promise.all([
    sql`SELECT cedula, nombre, correo, rol, canal, municipio FROM usuarios WHERE activo AND rol = ANY(${roles}) ORDER BY rol, nombre`,
    sql`SELECT codigo, nombre FROM canales ORDER BY orden`,
  ]);
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Usuarios");
  hoja.columns = [
    { header: "cedula", key: "cedula", width: 16, style: { numFmt: "@" } },
    { header: "nombre", key: "nombre", width: 36 },
    { header: "correo", key: "correo", width: 32 },
    { header: "rol", key: "rol", width: 14 },
    { header: "canal", key: "canal", width: 16 },
    { header: "municipio", key: "municipio", width: 16 },
  ];
  hoja.getRow(1).font = { bold: true };
  usuarios.forEach((u) => hoja.addRow(u));

  const ayuda = libro.addWorksheet("Valores permitidos");
  ayuda.addRow([`Roles: ${roles.join(", ")}`]);
  ayuda.addRow(["Los vendedores deben tener canal."]);
  ayuda.addRow(["Canales (código):"]);
  canales.forEach((c) => ayuda.addRow([c.codigo, c.nombre]));
  ayuda.getColumn(1).width = 28;

  const contenido = await libro.xlsx.writeBuffer();
  return new Response(contenido as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-usuarios.xlsx"',
    },
  });
}
