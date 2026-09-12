import { createRoot } from 'react-dom/client';
import AdminPage from '../../admin/app/page';
import { AdminGate } from '../../admin/components/admin-gate';
import { DataBoundary } from '../../admin/components/data-state';
import '../../admin/app/globals.css';
import '../../admin/app/admin.css';
createRoot(document.getElementById('root')!).render(<><div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, background: '#fff1d6', padding: 8, textAlign: 'center', fontSize: 12 }}>Локальная проверка · тестовые данные, не production</div><DataBoundary><AdminGate><AdminPage /></AdminGate></DataBoundary></>);
