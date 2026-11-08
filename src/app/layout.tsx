import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Domma UGC Creator",
  description: "Produção de vídeos UGC com IA",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
