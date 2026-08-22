import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { AdminGate } from '@/components/admin-gate';

export const metadata: Metadata = {
  title: 'ArtificialLabs · Admin',
  description: 'Защищённая административная консоль ArtificialLabs',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <Providers>
          <AdminGate>{children}</AdminGate>
        </Providers>
      </body>
    </html>
  );
}
