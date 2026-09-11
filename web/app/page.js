import { isAuthed } from '@/lib/auth';
import Login from './login';
import Writer from './writer';

export const dynamic = 'force-dynamic';

export default async function Page() {
  return (await isAuthed()) ? <Writer /> : <Login />;
}
