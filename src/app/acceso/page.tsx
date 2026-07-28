// Página pública: aquí cae quien llega sin sesión. El acceso es únicamente a
// través del portal de la nómina (un solo login para todo Plazet).
import { ShieldCheck } from "lucide-react";

export default function AccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const nominaUrl = process.env.NEXT_PUBLIC_NOMINA_URL ?? "#";
  return (
    <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-plazet-950 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-plazet-50 text-plazet-600">
          <ShieldCheck size={26} />
        </div>
        <h1 className="mt-4 text-xl font-bold text-gray-900">Conciliador Plazet</h1>
        <p className="mt-2 text-sm text-gray-500">
          El acceso es con tu cuenta de Plazet, desde el portal.
        </p>
        <ErrorPase searchParams={searchParams} />
        <a
          href={nominaUrl}
          className="mt-6 inline-block w-full rounded-xl bg-plazet-500 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-plazet-600"
        >
          Ir al portal de Plazet
        </a>
        <p className="mt-3 text-[11px] text-gray-400">Habbie SAS · un solo ingreso para todo</p>
      </div>
    </div>
  );
}

async function ErrorPase({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
      El pase de ingreso venció o no es válido — vuelve a entrar desde el portal.
    </p>
  );
}
