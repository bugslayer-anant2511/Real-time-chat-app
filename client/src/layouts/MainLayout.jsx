import { Outlet } from 'react-router-dom';

import Navbar from '../components/layout/Navbar.jsx';
import Footer from '../components/common/Footer.jsx';

const MainLayout = () => {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default MainLayout;
