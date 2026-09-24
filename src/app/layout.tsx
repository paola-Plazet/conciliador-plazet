import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Sidebar, MobileNav, MobileHeader } from "@/components/sidebar";

// Tipografía de marca, igual que la app de Nómina (sep-2026): Manrope en
// textos y All Round Gothic en títulos. En All Round Gothic el "bold" carga el
// Demi y el "semibold" el Medium (el Bold real se ve muy pesado en pantalla)
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});
const allRoundGothic = localFont({
  src: [
    { path: "./fonts/all-round-gothic/arg-400.woff2", weight: "400" },
    { path: "./fonts/all-round-gothic/arg-500.woff2", weight: "500" },
    { path: "./fonts/all-round-gothic/arg-500.woff2", weight: "600" },
    { path: "./fonts/all-round-gothic/arg-600.woff2", weight: "700" },
  ],
  variable: "--font-arg",
});

export const metadata: Metadata = {
  title: "Conciliador Plazet",
  description: "Conciliación de efectivo y datáfono — Habbie SAS",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${manrope.variable} ${allRoundGothic.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileHeader />
            {/* en celular deja espacio para la barra inferior */}
            <main className="flex-1 overflow-x-hidden pb-24 md:pb-0">{children}</main>
          </div>
        </div>
        <MobileNav />
      </body>
    </html>
  );
}
