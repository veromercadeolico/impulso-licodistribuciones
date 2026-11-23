import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Marcellus } from "next/font/google";
import "./globals.css";

// Sustitutas libres de Goldenbook (títulos) y General Sans (párrafos), las fuentes del manual de marca.
const titular = Marcellus({ subsets: ["latin"], weight: "400", variable: "--font-titular", display: "swap" });
const parrafo = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-parrafo", display: "swap" });

export const metadata: Metadata = {
  title: "Impulso | Lico Distribuciones",
  description: "Solicitudes, programación y reportes de impulso de Lico Distribuciones.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a142d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${titular.variable} ${parrafo.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
