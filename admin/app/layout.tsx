import type { Metadata } from 'next';
import './globals.css';
import './admin.css';

export const metadata: Metadata = {
  title: 'ArtificialLabs · Admin',
  description: 'Защищённая административная консоль ArtificialLabs',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
