"use client";

// Sidebar espejo del de la nómina: mismo degradado, logo Plazet, estilos de
// ítems (resplandor verde + barrita blanca al activo) y pie con cierre de
// sesión. Un solo lenguaje visual para todo el portal Plazet.

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Store,
  Upload,
  ListChecks,
  Settings,
  FileSpreadsheet,
  LayoutGrid,
  LogOut,
} from "lucide-react";

// minRol: quién ve cada sección (VIEWER < EDITOR < ADMIN)
const NAV = [
  { href: "/", label: "Tablero", icon: LayoutDashboard, minRol: "VIEWER" },
  { href: "/tiendas", label: "Tiendas", icon: Store, minRol: "VIEWER" },
  { href: "/cargar", label: "Cargar archivos", icon: Upload, minRol: "EDITOR" },
  { href: "/conciliacion", label: "Conciliación", icon: ListChecks, minRol: "VIEWER" },
  { href: "/configuracion", label: "Configuración", icon: Settings, minRol: "ADMIN" },
  { href: "/reportes", label: "Reportes", icon: FileSpreadsheet, minRol: "VIEWER" },
];
const NIVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

export function Sidebar() {
  const pathname = usePathname();
  const portalUrl = `${process.env.NEXT_PUBLIC_NOMINA_URL ?? ""}/portal`;
  const [rol, setRol] = useState<string>("ADMIN"); // optimista; el proxy manda igual
  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((d) => d?.rol && setRol(d.rol)).catch(() => {});
  }, []);
  const visibles = NAV.filter((n) => NIVEL[rol] >= NIVEL[n.minRol]);
  return (
    <aside className="sticky top-0 h-screen w-[260px] shrink-0 z-30 bg-gradient-to-b from-plazet-950 to-plazet-900 text-white flex flex-col">
      {/* Logo */}
      <div className="flex flex-col items-center border-b border-plazet-800/50 px-5 py-6">
        <Image
          src="/images/logo-plazet-blanco.png"
          alt="Plazet"
          width={140}
          height={42}
          className="mb-1.5"
          priority
        />
        <p className="text-[11px] text-plazet-400 font-medium">Conciliaciones</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {/* Cambiar de app — siempre de primero */}
        <a
          href={portalUrl}
          className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium text-plazet-200 hover:bg-plazet-800/60 hover:text-white transition-all duration-200"
        >
          <LayoutGrid size={20} className="shrink-0" />
          <span>Portal</span>
        </a>
        {visibles.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-all duration-200 relative ${
                active
                  ? "bg-plazet-500/90 text-white shadow-[0_0_12px_rgba(59,165,93,0.4)]"
                  : "text-plazet-200 hover:bg-plazet-800/60 hover:text-white"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-white rounded-r-full" />
              )}
              <Icon size={20} className="shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-plazet-800/50 space-y-1.5">
        <a
          href="/api/salir"
          className="flex items-center gap-2 w-full px-3 py-2 rounded-[10px] text-plazet-300 hover:bg-red-500/20 hover:text-red-300 transition-all duration-200 text-xs font-medium"
        >
          <LogOut size={16} />
          <span>Cerrar sesion</span>
        </a>
        <p className="text-[10px] text-plazet-500 text-center mt-1">a company by Habbie SAS</p>
      </div>
    </aside>
  );
}
