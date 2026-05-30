import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/components/AuthProvider';

export default function Login() {
  const { user, login } = useAuth();
  const [account, setAccount] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const trimmed = account.trim();
    if (trimmed !== 'admin' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('请输入正确的邮箱格式，管理员账号可直接使用 admin');
      return;
    }
    setLoading(true);
    try {
      await login(trimmed, password);
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F8FB] flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-[380px] rounded-lg border border-[#E2E8F0] bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-[#0F172A] text-white flex items-center justify-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#0F172A]">企业智能情报系统</h1>
            <p className="text-sm text-[#64748B]">正式运营版</p>
          </div>
        </div>

        <label className="text-sm font-medium text-[#334155]">账号</label>
        <Input className="mt-2 mb-4" value={account} onChange={(e) => setAccount(e.target.value)} type="text" autoComplete="username" placeholder="admin 或邮箱" />

        <label className="text-sm font-medium text-[#334155]">密码</label>
        <Input className="mt-2 mb-4" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="请输入密码" />

        {error && <div className="mb-4 rounded-md bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">{error}</div>}

        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="mr-2 h-4 w-4" />}
          登录
        </Button>
      </form>
    </div>
  );
}
