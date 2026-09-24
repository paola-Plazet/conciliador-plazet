"use client";

// Menú espejo del de la app de Nómina (rediseño sep-2026): sidebar claro con
// la app arriba ("Cambiar de app" vuelve al Portal), usuario abajo, y en
// celular una barra inferior con las primeras pantallas + "Más". Un solo
// lenguaje visual para todo el portal Plazet.

import Link from "next/link";
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
  Wallet,
  Lock,
  Globe,
  Warehouse,
  ChevronsUpDown,
  MoreHorizontal,
  X,
} from "lucide-react";

// minRol: quién ve cada sección (VIEWER < EDITOR < ADMIN)
const NAV = [
  { href: "/", label: "Tablero", icon: LayoutDashboard, minRol: "VIEWER" },
  { href: "/tiendas", label: "Tiendas", icon: Store, minRol: "VIEWER" },
  { href: "/resumen", label: "Resumen general", icon: Wallet, minRol: "VIEWER" },
  { href: "/web", label: "Ventas web", icon: Globe, minRol: "VIEWER" },
  { href: "/principal", label: "Bodega Principal", icon: Warehouse, minRol: "VIEWER" },
  { href: "/cargar", label: "Cargar archivos", icon: Upload, minRol: "EDITOR" },
  { href: "/conciliacion", label: "Conciliación", icon: ListChecks, minRol: "VIEWER" },
  { href: "/meses", label: "Cierre de mes", icon: Lock, minRol: "EDITOR" },
  { href: "/configuracion", label: "Configuración", icon: Settings, minRol: "ADMIN" },
  { href: "/reportes", label: "Reportes", icon: FileSpreadsheet, minRol: "VIEWER" },
];
const NIVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };
// En la barra inferior del celular: las más usadas, el resto va en "Más"
const EN_BARRA = ["/", "/tiendas", "/conciliacion", "/principal"];

const portalUrl = () => `${process.env.NEXT_PUBLIC_NOMINA_URL ?? ""}/portal`;
const esActivo = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

interface Yo { name?: string; email?: string; rol: string }

function useYo(): Yo {
  const [yo, setYo] = useState<Yo>({ rol: "ADMIN" }); // optimista; el proxy manda igual
  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((d) => d?.rol && setYo(d)).catch(() => {});
  }, []);
  return yo;
}

function IconoApp({ size = 17, className = "h-8 w-8" }: { size?: number; className?: string }) {
  return (
    <span className={`flex flex-shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ${className}`}>
      <Store size={size} />
    </span>
  );
}

const iniciales = (n?: string) =>
  n ? n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "?";

export function Sidebar() {
  const pathname = usePathname();
  const yo = useYo();
  const visibles = NAV.filter((n) => NIVEL[yo.rol] >= NIVEL[n.minRol]);
  return (
    <aside className="sticky top-0 z-30 hidden h-screen w-[248px] shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
      {/* App actual: volver al Portal para cambiar de app */}
      <div className="px-3 pb-2 pt-4">
        <a
          href={portalUrl()}
          title="Volver al Portal para cambiar de app"
          className="flex w-full items-center gap-2.5 rounded-xl border border-gray-200 p-2 transition-colors hover:bg-gray-50"
        >
          <IconoApp />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-sm font-semibold text-gray-900">Conciliaciones</span>
            <span className="block text-[11px] text-gray-400">Cambiar de app</span>
          </span>
          <ChevronsUpDown size={15} className="text-gray-400" />
        </a>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4 pt-2">
        {visibles.map(({ href, label, icon: Icon }) => {
          const active = esActivo(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                active
                  ? "bg-plazet-50 font-semibold text-plazet-700"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <Icon size={18} className={`shrink-0 ${active ? "text-plazet-600" : "text-gray-400 group-hover:text-gray-500"}`} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Usuario */}
      <div className="flex items-center gap-2.5 border-t border-gray-200 px-3 py-3">
        <div className="flex h-8 w-8 flex-shrink-0 select-none items-center justify-center rounded-full bg-plazet-600 text-xs font-bold text-white">
          {iniciales(yo.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-gray-900">{yo.name ?? "…"}</p>
          <p className="truncate text-xs text-gray-400">{yo.email}</p>
        </div>
        <a
          href="/api/salir"
          title="Cerrar sesión"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut size={16} />
        </a>
      </div>
    </aside>
  );
}

// Celular: encabezado con la app (tocarla vuelve al Portal)
export function MobileHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-gray-200 bg-white/90 px-4 backdrop-blur md:hidden">
      <a href={portalUrl()} className="flex min-w-0 items-center gap-2">
        <IconoApp />
        <span className="truncate font-display text-base font-semibold text-gray-900">Conciliaciones</span>
      </a>
    </header>
  );
}

// Celular: barra inferior + hoja "Más" con el resto del menú y la cuenta
export function MobileNav() {
  const pathname = usePathname();
  const yo = useYo();
  const [mas, setMas] = useState(false);

  const visibles = NAV.filter((n) => NIVEL[yo.rol] >= NIVEL[n.minRol]);
  const enBarra = visibles.filter((n) => EN_BARRA.includes(n.href));
  const resto = visibles.filter((n) => !EN_BARRA.includes(n.href));
  const masActivo = resto.some((n) => esActivo(pathname, n.href));

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="flex">
          {enBarra.map(({ href, label, icon: Icon }) => {
            const activo = esActivo(pathname, href);
            return (
              <Link key={href} href={href}
                className={`flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium ${activo ? "text-plazet-600" : "text-gray-400"}`}>
                <Icon size={21} strokeWidth={activo ? 2.2 : 1.8} />
                <span className="max-w-full truncate px-1">{label.replace("Bodega ", "")}</span>
              </Link>
            );
          })}
          <button onClick={() => setMas(true)}
            className={`flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium ${masActivo ? "text-plazet-600" : "text-gray-400"}`}>
            <MoreHorizontal size={21} />
            <span>Más</span>
          </button>
        </div>
      </nav>

      {mas && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMas(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200" />
            <div className="mb-2 flex items-center justify-between">
              <p className="font-display text-base font-semibold text-gray-900">Menú</p>
              <button onClick={() => setMas(false)} className="rounded-lg p-1.5 text-gray-400" aria-label="Cerrar"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {resto.map(({ href, label, icon: Icon }) => {
                const activo = esActivo(pathname, href);
                return (
                  <Link key={href} href={href} onClick={() => setMas(false)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs font-medium ${
                      activo ? "border-plazet-200 bg-plazet-50 text-plazet-700" : "border-gray-200 text-gray-500"
                    }`}>
                    <Icon size={20} />
                    {label}
                  </Link>
                );
              })}
            </div>
            <a href={portalUrl()} className="mt-4 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-gray-600">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100"><LayoutGrid size={16} /></span>
              Portal · cambiar de app
            </a>
            <div className="mt-2 flex items-center gap-3 border-t border-gray-200 pt-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{yo.name}</p>
                <p className="truncate text-xs text-gray-400">{yo.email}</p>
              </div>
              <a href="/api/salir" className="rounded-lg p-2 text-red-600" aria-label="Cerrar sesión"><LogOut size={18} /></a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
