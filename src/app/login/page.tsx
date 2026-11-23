import { redirect } from "next/navigation";
import { inicioPorRol, usuarioActual } from "@/lib/auth";
import { entrar } from "./acciones";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; cedula?: string }> }) {
  const usuario = await usuarioActual();
  const { error, cedula } = await searchParams;
  // Los enlaces de la guía de demostración llegan con la cédula de prueba ya escrita.
  const sugerida = process.env.MODO_DEMO === "1" ? (cedula ?? "").replace(/\D/g, "").slice(0, 15) : "";
  if (usuario && !sugerida) redirect(inicioPorRol(usuario.rol));

  return (
    <main className="patron-noche flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[440px] bg-fondo p-2.5 shadow-tarjeta">
        <div className="border border-arena px-6 py-8 sm:px-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/sello.svg" alt="Lico Distribuciones, tradición y excelencia" className="mx-auto size-44" />
          <h1 className="titulo mt-5 text-center text-xl">Impulso y activaciones</h1>
          <p className="mt-2 text-center text-sm text-suave">Ingresa con tu número de cédula.</p>
          <form action={entrar} className="mt-6 space-y-4">
            <div>
              <label htmlFor="cedula" className="etiqueta">Cédula</label>
              <input
                id="cedula"
                name="cedula"
                className="campo"
                inputMode="numeric"
                autoComplete="username"
                pattern="[0-9.\s]{5,15}"
                defaultValue={sugerida}
                required
                autoFocus
              />
            </div>
            {error && (
              <p role="alert" className="rounded-xl bg-error-claro px-4 py-3 text-sm font-medium text-error">
                {error}
              </p>
            )}
            <button className="boton w-full">Continuar</button>
          </form>
          <p className="titulo mt-7 text-center text-[11px] leading-relaxed text-suave">Entregamos con pasión, botella a botella</p>
        </div>
      </div>
    </main>
  );
}
