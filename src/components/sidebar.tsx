"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  Upload,
  ListChecks,
  Settings,
  FileSpreadsheet,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Tablero", icon: LayoutDashboard },
  { href: "/tiendas", label: "Tiendas", icon: Store },
  { href: "/cargar", label: "Cargar archivos", icon: Upload },
  { href: "/conciliacion", label: "Conciliación", icon: ListChecks },
  { href: "/configuracion", label: "Configuración", icon: Settings },
  { href: "/reportes", label: "Reportes", icon: FileSpreadsheet },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 bg-plazet-950 text-plazet-100 flex flex-col">
      <div className="px-5 py-6 border-b border-plazet-800">
        <div className="text-xl font-bold text-white">Conciliador</div>
        <div className="text-sm text-plazet-300">Plazet · Habbie SAS</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-plazet-500 text-white"
                  : "text-plazet-200 hover:bg-plazet-800 hover:text-white"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 text-xs text-plazet-400 border-t border-plazet-800">
        Conciliación de efectivo y datáfono
      </div>
    </aside>
  );
}
