import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { BetaInstall } from '@/components/beta-install';
import './beta.css';

const stackSans = localFont({
  src: '../../../ArtificialLabs/Resources/Fonts/StackSansNotch-VariableFont_wght.ttf',
  weight: '200 700',
  style: 'normal',
  variable: '--beta-brand-font',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Бета «сфера.» — установка',
  description: 'Установите тестовую версию «сфера.» на iPhone, iPad или Android.',
  robots: { index: false, follow: false },
};

export default function BetaPage() {
  return <div className={stackSans.variable}><BetaInstall /></div>;
}
