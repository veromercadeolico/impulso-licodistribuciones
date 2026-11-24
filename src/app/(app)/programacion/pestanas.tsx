import { Pestanas } from "@/components/ui";

export function PestanasProgramacion({ periodo, activa, soloLectura = false }: { periodo: string; activa: string; soloLectura?: boolean }) {
  return (
    <Pestanas
      activa={activa}
      items={[
        { id: "solicitudes", texto: "Solicitudes", href: `/programacion?p=${periodo}` },
        ...(soloLectura
          ? []
          : [
              { id: "disponibilidad", texto: "Disponibilidad", href: `/programacion/disponibilidad?p=${periodo}` },
              { id: "degustacion", texto: "Degustación", href: `/programacion/degustacion?p=${periodo}` },
            ]),
        { id: "calendario", texto: "Programación por día y canal", href: `/calendario?p=${periodo}` },
        { id: "consolidado", texto: "Turnos por persona", href: "/programacion/turnos-persona" },
      ]}
    />
  );
}
