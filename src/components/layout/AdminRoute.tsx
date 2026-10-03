import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { onIdTokenChanged } from 'firebase/auth';
import { auth } from '../../config/firebase';

/** UI guard; the API independently checks the verified admin claim. */
export function AdminRoute() {
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied'>('loading');
  useEffect(() => {
    let generation = 0;
    const unsubscribe = onIdTokenChanged(auth, async user => {
      const request = ++generation;
      setAccess('loading');
      try {
        const token = await user?.getIdTokenResult();
        if (request === generation) setAccess(token?.claims.admin === true ? 'allowed' : 'denied');
      } catch {
        if (request === generation) setAccess('denied');
      }
    });
    return () => { generation++; unsubscribe(); };
  }, []);
  if (access === 'loading') return <p>Verificando permisos…</p>;
  return access === 'allowed' ? <Outlet /> : <Navigate to="/dashboard" replace />;
}
