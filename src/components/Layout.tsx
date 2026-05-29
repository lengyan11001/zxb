import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import Footer from './Footer';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-[100dvh] bg-ds-bg-primary">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content wrapper */}
      <div className="ml-16 xl:ml-60 min-h-[100dvh] flex flex-col transition-all duration-300">
        {/* Top Navbar */}
        <Navbar />

        {/* Page content */}
        <main className="flex-1 p-6 lg:p-8">
          <div className="max-w-ds-content mx-auto">
            {children}
          </div>
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
}
