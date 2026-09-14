import { Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthService } from '../../services/AuthService';
import type { User } from 'firebase/auth';

const authService = new AuthService();

export const ProtectedRoute = () => {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange((u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  if (user === undefined) {
    return <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>Cargando validacion segura...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
