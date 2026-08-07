import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SHOMER",
  description: "Inteligência de fluxo para ambientes físicos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
