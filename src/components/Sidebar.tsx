import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Building2, ChevronLeft, ChevronRight, LayoutDashboard, Package, Settings, Sparkles } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

const navItems = [
  { path: '/', label: '工作台', icon: LayoutDashboard },
  { path: '/enterprises', label: '企业列表', icon: Building2 },
  { path: '/products', label: '产品管理', icon: Package },
  { path: '/product-ai', label: 'AI话术中心', icon: Sparkles },
  { path: '/dashboard', label: '数据看板', icon: BarChart3 },
  { path: '/settings', label: '系统设置', icon: Settings },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <aside className={`fixed left-0 top-0 z-40 h-full bg-[#111827] flex flex-col transition-all duration-200 ${collapsed ? 'w-16' : 'w-60'}`}>
      <div className="h-14 flex items-center gap-3 px-3 border-b border-white/10">
        <img src="./logo-icon.svg" alt="Logo" className="w-8 h-8 shrink-0" />
        {!collapsed && <span className="text-sm font-semibold text-white whitespace-nowrap">企业智能情报系统</span>}
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 h-10 rounded-md text-sm transition-colors ${
                active ? 'bg-[#1F2937] text-[#22D3EE]' : 'text-slate-400 hover:bg-[#1F2937] hover:text-white'
              }`}
            >
              <Icon size={19} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-2 border-t border-white/10">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center h-8 rounded-md text-slate-400 hover:bg-[#1F2937] hover:text-white"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#22D3EE]/15 text-[#22D3EE] flex items-center justify-center text-xs font-semibold">
            {user?.name?.slice(0, 1) || '用'}
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-xs font-medium text-white truncate">{user?.name || '用户'}</div>
              <div className="text-[11px] text-slate-500 truncate">{user?.role || 'sdr'}</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
