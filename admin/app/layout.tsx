import type { Metadata } from 'next';
import './globals.css';
import './admin.css';
import { Providers } from './providers';
import { AdminGate } from '@/components/admin-gate';
import { DataBoundary } from '@/components/data-state';

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
          <DataBoundary><AdminGate>{children}</AdminGate></DataBoundary>
        </Providers>
      </body>
    </html>
  );
}
