import { useLocation } from 'react-router-dom';
import { Bell, ChevronRight, LogOut, Search } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

const routeNames: Record<string, string> = {
  '/': '工作台',
  '/enterprises': '企业列表',
  '/products': '产品管理',
  '/product-ai': 'AI话术中心',
  '/dashboard': '数据看板',
  '/settings': '系统设置',
};

export default function Navbar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const pageName = routeNames[location.pathname] || (location.pathname.startsWith('/enterprises/') ? '企业详情' : '工作台');

  return (
    <header className="sticky top-0 z-30 h-14 bg-white/85 backdrop-blur border-b border-[#E2E8F0] flex items-center justify-between px-6">
      <nav className="flex items-center gap-1.5 text-sm">
        <span className="text-[#64748B]">首页</span>
        <ChevronRight size={14} className="text-[#94A3B8]" />
        <span className="font-medium text-[#0F172A]">{pageName}</span>
      </nav>

      <div className="flex items-center gap-2">
        <button className="w-9 h-9 flex items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9]">
          <Search size={18} />
        </button>
        <button className="relative w-9 h-9 flex items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9]">
          <Bell size={18} />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#EF4444]" />
        </button>
        <div className="flex items-center gap-2 pl-3 ml-1 border-l border-[#E2E8F0]">
          <div className="w-8 h-8 rounded-full bg-[#E0F2FE] text-[#0369A1] flex items-center justify-center text-xs font-semibold">
            {user?.name?.slice(0, 1) || '用'}
          </div>
          <div className="hidden lg:block">
            <div className="text-sm font-medium text-[#0F172A]">{user?.name || '用户'}</div>
            <div className="text-[11px] text-[#64748B]">{user?.role}</div>
          </div>
          <button onClick={logout} className="w-8 h-8 flex items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9]" title="退出登录">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
