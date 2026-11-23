import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);
const esquema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const sentencias = esquema
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean);

for (const sentencia of sentencias) {
  await sql.query(sentencia);
}
console.log(`Migración aplicada: ${sentencias.length} sentencias.`);
