import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Сфера Scan — сканирование тестов',description:'Закрытая веб-версия сканирования Сфера',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>;}
