import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vector · Pro Data Studio",
  description: "A precise Apple-inspired design system for professional data workspaces.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
