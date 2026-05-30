import { Navigate, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { Toaster } from './components/ui/sonner';
import type { AuthUser } from './api/client';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import ProductAI from './pages/ProductAI';
import ProductCenter from './pages/ProductCenter';
import Enterprises from './pages/Enterprises';
import EnterpriseDetail from './pages/EnterpriseDetail';
import Settings from './pages/Settings';
import Login from './pages/Login';

type Role = AuthUser['role'];

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-[#64748B]">加载中...</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/product-ai" element={<ProductAI />} />
          <Route path="/products" element={<RoleGate roles={['admin', 'manager']}><ProductCenter /></RoleGate>} />
          <Route path="/products/new" element={<RoleGate roles={['admin', 'manager']}><ProductCenter /></RoleGate>} />
          <Route path="/products/:id" element={<RoleGate roles={['admin', 'manager']}><ProductCenter /></RoleGate>} />
          <Route path="/enterprises" element={<Enterprises />} />
          <Route path="/enterprises/:id" element={<EnterpriseDetail />} />
          <Route path="/settings" element={<RoleGate roles={['admin', 'manager']}><Settings /></RoleGate>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  );
}

function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
