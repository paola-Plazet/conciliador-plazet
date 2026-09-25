"use client";

// Resumen general: ahora vive como pestaña "Consolidado" de Tiendas; esta
// ruta se deja para no romper enlaces guardados.
import { PageHeader } from "@/components/ui";
import { ResumenGeneral } from "@/components/resumen-general";

export default function ResumenPage() {
  return (
    <>
      <PageHeader title="Resumen general" subtitle="Cuánto falta o sobra, por método de pago, por mes y por tienda" />
      <div className="p-4 sm:p-8">
        <ResumenGeneral />
      </div>
    </>
  );
}
