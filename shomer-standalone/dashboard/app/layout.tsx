import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Trocado de Inter (não estava nem sendo carregada — caía no fallback do
// sistema) para Plus Jakarta Sans: mesma legibilidade em telas densas de
// dashboard, mas com curvas mais humanistas/convidativas — recomendada em
// pesquisas de UX pra produtos que precisam parecer menos "corporativos".
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SHOMER",
  description: "Inteligência de fluxo para ambientes físicos",
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={plusJakarta.variable}>{children}</body>
    </html>
  );
}
