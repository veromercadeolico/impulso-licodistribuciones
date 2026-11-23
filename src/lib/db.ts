import { neon, types } from "@neondatabase/serverless";

// Fechas y horas llegan como texto: son hora local de Colombia y no deben reinterpretarse.
for (const oid of [1082, 1083, 1114, 1184]) {
  types.setTypeParser(oid, (valor: string) => valor);
}

type Consulta = Promise<any[]>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Sql = {
  (partes: TemplateStringsArray, ...valores: unknown[]): Consulta;
  transaction(consultas: Consulta[]): Promise<any[][]>; // eslint-disable-line @typescript-eslint/no-explicit-any
  query(texto: string, parametros?: unknown[]): Consulta;
};

export const sql = neon(process.env.DATABASE_URL!) as unknown as Sql;
