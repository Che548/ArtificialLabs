import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { BetaInstall } from '@/components/beta-install';
import './beta.css';

const comfortaa = localFont({
  src: '../../../assets/fonts/Comfortaa-Regular.ttf',
  weight: '400',
  style: 'normal',
  variable: '--beta-logo-font',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Бета «сфера.» — установка',
  description: 'Установите тестовую версию «сфера.» на iPhone, iPad или Android.',
  robots: { index: false, follow: false },
};

export default function BetaPage() {
  return <div className={comfortaa.variable}><BetaInstall /></div>;
}
