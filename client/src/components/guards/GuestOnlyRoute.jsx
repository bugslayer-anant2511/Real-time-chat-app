import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../../contexts/AuthContext.jsx';
import Spinner from '../common/Spinner.jsx';

const GuestOnlyRoute = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <Spinner fullPage size="lg" />;
  }

  if (isAuthenticated) {
    return <Navigate to="/chat" replace />;
  }

  return <Outlet />;
};

export default GuestOnlyRoute;
