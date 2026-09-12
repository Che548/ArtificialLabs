import type { Metadata } from 'next';
import { BetaInstall } from '@/components/beta-install';
import './beta.css';

export const metadata: Metadata = {
  title: 'Бета «сфера.» — установка',
  description: 'Установите тестовую версию «сфера.» на iPhone, iPad или Android.',
  robots: { index: false, follow: false },
};

export default function BetaPage() {
  return <BetaInstall />;
}
