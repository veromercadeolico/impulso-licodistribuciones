import { redirect } from "next/navigation";
import { exigirUsuario, inicioPorRol } from "@/lib/auth";

export default async function Inicio() {
  const usuario = await exigirUsuario();
  redirect(inicioPorRol(usuario.rol));
}
