import {cookies} from 'next/headers';
import {COOKIE,getSession} from '../lib/auth';
import Login from '../components/Login';
import Workspace from '../components/Workspace';
export const dynamic='force-dynamic';
export default async function Page(){const session=getSession((await cookies()).get(COOKIE)?.value);return session?<Workspace session={{role:session.role,owner:session.owner,expiresAt:session.expiresAt}}/>:<Login/>;}
