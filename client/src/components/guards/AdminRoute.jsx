import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';

import { useAuth } from '../../contexts/AuthContext.jsx';
import Spinner from '../common/Spinner.jsx';

const ADMIN_TOAST_ID = 'admin-access-required';

const AdminRoute = () => {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();

  const shouldDenyAdmin = !loading && isAuthenticated && !isAdmin;
  useEffect(() => {
    if (!shouldDenyAdmin) return;
    toast.error('Admin access required', { id: ADMIN_TOAST_ID });
  }, [shouldDenyAdmin]);

  if (loading) {
    return <Spinner fullPage size="lg" />;
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  if (!isAdmin) {
    return <Navigate to="/chat" replace />;
  }

  return <Outlet />;
};

export default AdminRoute;
