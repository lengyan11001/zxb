import { useEffect, useState } from 'react';
import { Loader2, Plus, Save, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, type User } from '@/api/client';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface DataSource {
  key: string;
  name: string;
  description: string;
  status: string;
}

const roleLabel: Record<User['role'], string> = {
  admin: '管理员',
  manager: '主管',
  sdr: '销售',
};

const statusLabel: Record<User['status'], string> = {
  active: '启用',
  disabled: '停用',
};

export default function Settings() {
  const { user } = useAuth();
  const [sources, setSources] = useState<DataSource[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState({ email: '', name: '', role: 'sdr' as User['role'], password: '' });

  async function load() {
    setLoading(true);
    try {
      const [sourceData, userData] = await Promise.all([
        api.getDataSources() as Promise<DataSource[]>,
        api.getUsers(),
      ]);
      setSources(sourceData);
      setUsers(userData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((err) => toast.error(err.message || '加载设置失败'));
  }, []);

  async function createUser() {
    if (user?.role !== 'admin') return toast.error('只有管理员可以创建用户');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) return toast.error('请输入正确的邮箱');
    if (!draft.name.trim()) return toast.error('请输入姓名');
    if (draft.password.length < 8) return toast.error('初始密码至少 8 位');
    setSubmitting(true);
    try {
      await api.createUser(draft);
      setDraft({ email: '', name: '', role: 'sdr', password: '' });
      toast.success('用户已创建');
      await load();
    } catch (err: any) {
      toast.error(err.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateUserStatus(item: User, status: User['status']) {
    if (user?.role !== 'admin') return toast.error('只有管理员可以修改用户');
    if (item.id === user.id && status === 'disabled') return toast.error('不能停用当前登录账号');
    try {
      await api.updateUser(item.id, { status });
      toast.success('用户状态已更新');
      await load();
    } catch (err: any) {
      toast.error(err.message || '更新失败');
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-[#0F172A]">系统设置</h1>
        <p className="text-sm text-[#64748B]">正式版密钥只允许在服务端环境变量中配置，浏览器不保存任何 API Key。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-[#0891B2]" />用户与权限</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {user?.role === 'admin' && (
            <div className="grid gap-3 rounded-md border bg-[#F8FAFC] p-3 md:grid-cols-[1fr_0.8fr_0.7fr_0.8fr_auto]">
              <Input placeholder="邮箱" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
              <Input placeholder="姓名" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              <select className="h-9 rounded-md border bg-white px-2 text-sm" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as User['role'] })}>
                <option value="manager">主管</option>
                <option value="sdr">销售</option>
                <option value="admin">管理员</option>
              </select>
              <Input type="password" placeholder="初始密码" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} />
              <Button onClick={createUser} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                创建
              </Button>
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-sm text-[#64748B]">加载中...</div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-[#F8FAFC] text-left text-[#64748B]">
                  <tr>
                    <th className="px-3 py-2 font-medium">姓名</th>
                    <th className="px-3 py-2 font-medium">账号</th>
                    <th className="px-3 py-2 font-medium">角色</th>
                    <th className="px-3 py-2 font-medium">客户数</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="px-3 py-2 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-medium text-[#0F172A]">{item.name}</td>
                      <td className="px-3 py-2 text-[#475569]">{item.email}</td>
                      <td className="px-3 py-2">{roleLabel[item.role]}</td>
                      <td className="px-3 py-2">{item.enterpriseCount ?? 0}</td>
                      <td className="px-3 py-2">{statusLabel[item.status]}</td>
                      <td className="px-3 py-2 text-right">
                        {user?.role === 'admin' && item.id !== user.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateUserStatus(item, item.status === 'active' ? 'disabled' : 'active')}
                          >
                            <Save className="h-4 w-4" />
                            {item.status === 'active' ? '停用' : '启用'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">数据源状态</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {sources.map((source) => (
            <div key={source.key} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium text-[#0F172A]">{source.name}</div>
                <div className="text-sm text-[#64748B]">{source.description}</div>
              </div>
              <span className="rounded bg-[#F1F5F9] px-2 py-1 text-xs text-[#475569]">{source.status}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
