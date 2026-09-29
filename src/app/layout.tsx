import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Artigot Personal",
  description: "Gestión de camareros, maîtres y mozos para bodas y eventos",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#5b3fd6" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
