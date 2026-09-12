import { Providers } from '../providers';
import { AdminGate } from '@/components/admin-gate';
import { DataBoundary } from '@/components/data-state';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <Providers><DataBoundary><AdminGate>{children}</AdminGate></DataBoundary></Providers>;
}
