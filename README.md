# Impulso Lico Distribuciones

Aplicación para solicitar, programar, ejecutar y medir las activaciones de impulso de Lico Distribuciones.

- **Vendedores:** envían solicitudes de impulso (una o varias marcas, dirección, obsequios y adicionales).
- **Trade Marketing:** marca disponibilidad, arma y publica la programación, asigna degustación y obsequios, descarga el Excel de programación y administra el equipo.
- **Impulsadoras:** registran entrada y salida con foto y ubicación, y envían el reporte de ventas.
- **Líderes, dirección y supervisión:** consultan los reportes de su rol.

Hecha con Next.js (App Router), PostgreSQL en Neon y Tailwind CSS.

## Arranque local

1. Instala Node.js 22 o superior.
2. Copia `.env.example` como `.env.local` y completa las variables (ver la tabla de abajo).
3. Instala, prepara la base de datos e inicia:

```bash
npm install
npm run db:migrate
npm run dev
```

`npm run db:migrate` es seguro de correr varias veces: solo crea lo que falta y no borra datos. En una base de datos **nueva y vacía**, corre también `npm run db:seed` para cargar canales, marcas, productos y cuentas de prueba.

> No corras `npm run db:demo` sobre la base de datos real: borra toda la operación para cargar datos ficticios.

## Variables de entorno

| Variable | Obligatoria | Para qué sirve |
| --- | --- | --- |
| `DATABASE_URL` | Sí | Conexión a la base de datos Neon |
| `SESSION_SECRET` | Sí | Firma las sesiones. Si cambia, todos deben volver a entrar |
| `APP_URL` | Sí | Dirección pública de la app (enlace de registro y correos) |
| `REGISTRO_CODIGO` | No | Activa el enlace de registro de vendedores |
| `MODO_DEMO` | No | `1` muestra el aviso de demostración y libera el horario de entrada |
| `RESEND_API_KEY`, `CORREO_REMITENTE` | No | Envío real de correos |

Las variables **nunca** se suben al repositorio: `.gitignore` excluye todos los archivos `.env*` menos `.env.example`.

## Publicar en Vercel

1. En Vercel, **Add New → Project** e importa este repositorio.
2. En **Environment Variables**, agrega las variables de la tabla.
3. Pulsa **Deploy**. Cada cambio que se suba a la rama `main` se publica solo.
4. Cuando tengas la dirección definitiva, actualiza `APP_URL` y vuelve a publicar.

## Verificación antes de publicar cambios

```bash
npm test
npm run typecheck
npm run build
```

## Estructura

- `src/app/(app)/`: pantallas con sesión (programación, solicitudes, turnos, reportes, equipo).
- `src/app/api/`: descargas de Excel, fotos y comentarios.
- `src/lib/reglas.ts`: reglas de negocio (turnos de 4 horas, descanso, orden de relevancia, cumplimiento). Sus pruebas están en `src/lib/reglas.test.ts`.
- `src/lib/excelProgramacion.ts`: Excel de programación con el formato de Trade Marketing.
- `src/db/schema.sql`: estructura de la base de datos.
- `public/guia.html`: guía para explorar la app por rol.

## Cuentas de prueba

Las crea `npm run db:seed`. Desactívalas desde **Equipo** o **Usuarios** cuando ya no se necesiten.

| Rol | Cédula |
| --- | --- |
| Administrador | 100000001 |
| Trade Marketing | 100000002 |
| Vendedor | 100000003 |
| Líder de canal | 100000004 |
| Director comercial | 100000005 |
| Impulsadora | 100000006 |

## Marca

Colores, logo y sello salen del manual de marca. Goldenbook y General Sans se reemplazan por Marcellus y Hanken Grotesk hasta tener sus archivos con licencia; se cambian en `src/app/layout.tsx`.
