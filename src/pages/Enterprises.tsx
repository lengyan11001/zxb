import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Eye, Loader2, Phone, RefreshCw, Search, StickyNote, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api, downloadExport, type User } from '@/api/client';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Enterprise } from '@/types/api';

const callResults = ['未拨打', '已接通', '未接', '拒绝', '有效通话', '加微信', '约见', '回拨'];

export default function Enterprises() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canOperate = user?.role === 'admin' || user?.role === 'manager';
  const [items, setItems] = useState<Enterprise[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ownerId, setOwnerId] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [enterpriseData, userData] = await Promise.all([
        api.getEnterprises(search ? { search } : undefined) as Promise<Enterprise[]>,
        canOperate ? api.getAssignableUsers() : Promise.resolve([]),
      ]);
      setItems(enterpriseData);
      setAssignableUsers(userData);
    } catch (err: any) {
      toast.error(err.message || '加载企业失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => ({
    total: items.length,
    completed: items.filter((item) => item.collectionStatus === 'completed').length,
    called: items.filter((item) => item.callCount > 0).length,
  }), [items]);

  async function recordCall(id: string, result: string) {
    try {
      await api.createCall(id, { result });
      toast.success('拨打结果已记录');
      await load();
    } catch (err: any) {
      toast.error(err.message || '记录失败');
    }
  }

  async function regenerate(id: string) {
    const enterprise = items.find((item) => item.id === id);
    if (!enterprise?.activeProductId) {
      toast.error('请先在详情页选择产品');
      return;
    }
    await api.generateScript(id, enterprise.activeProductId);
    toast.success('话术生成任务已进入队列');
  }

  async function exportSelected() {
    const ids = Array.from(selected);
    if (!ids.length) return toast.error('请先选择企业');
    await downloadExport(ids);
  }

  async function assignSelected() {
    const ids = Array.from(selected);
    if (!ids.length) return toast.error('请先选择企业');
    if (!ownerId) return toast.error('请选择接收人');
    try {
      const result = await api.assignEnterprises(ids, ownerId) as { updated: number };
      toast.success(`已分配 ${result.updated} 家企业`);
      setSelected(new Set());
      await load();
    } catch (err: any) {
      toast.error(err.message || '分配失败');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F172A]">企业列表</h1>
          <p className="text-sm text-[#64748B]">{canOperate ? '主管视角可分配、导出和查看全量客户。' : '销售视角仅显示分配给你的客户。'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" />刷新</Button>
          <Button variant="outline" onClick={exportSelected}><Download className="h-4 w-4" />导出</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat title="当前列表" value={stats.total} />
        <Stat title="已采集" value={stats.completed} />
        <Stat title="已外呼" value={stats.called} />
      </div>

      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <Input className="pl-9" placeholder="搜索企业、联系人、手机号" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load()} />
        </div>
        <Button onClick={load}>搜索</Button>
        {canOperate && (
          <div className="flex gap-2">
            <select className="h-9 min-w-[160px] rounded-md border bg-white px-2 text-sm" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              <option value="">选择接收人</option>
              {assignableUsers.map((item) => <option key={item.id} value={item.id}>{item.name}（{item.role === 'manager' ? '主管' : '销售'}）</option>)}
            </select>
            <Button variant="outline" onClick={assignSelected}><UserPlus className="h-4 w-4" />分配</Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>企业名称</TableHead>
              <TableHead>行业/地区</TableHead>
              <TableHead>联系人</TableHead>
              <TableHead>手机号</TableHead>
              <TableHead>信号</TableHead>
              <TableHead>采集状态</TableHead>
              <TableHead>拨打结果</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="py-12 text-center text-[#64748B]"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />加载中...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-12 text-center text-[#64748B]">暂无企业</TableCell></TableRow>
            ) : items.map((enterprise) => (
              <TableRow key={enterprise.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(enterprise.id)}
                    onChange={(event) => {
                      const next = new Set(selected);
                      event.target.checked ? next.add(enterprise.id) : next.delete(enterprise.id);
                      setSelected(next);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <button onClick={() => navigate(`/enterprises/${enterprise.id}`)} className="font-medium text-[#0F172A] hover:text-[#0891B2]">
                    {enterprise.name}
                  </button>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-[#0F172A]">{enterprise.industry || '-'}</div>
                  <div className="text-xs text-[#64748B]">{enterprise.location || '-'}</div>
                </TableCell>
                <TableCell>{enterprise.contactPerson || '-'}</TableCell>
                <TableCell className="font-mono text-sm">{enterprise.phone || '-'}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {enterprise.signals.slice(0, 2).map((signal, idx) => <Badge key={idx} variant="secondary">{signal.label}</Badge>)}
                  </div>
                </TableCell>
                <TableCell><StatusBadge status={enterprise.collectionStatus} /></TableCell>
                <TableCell>
                  <select className="h-8 rounded-md border px-2 text-sm" value={enterprise.latestCallResult || '未拨打'} onChange={(event) => recordCall(enterprise.id, event.target.value)}>
                    {callResults.map((result) => <option key={result}>{result}</option>)}
                  </select>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => navigate(`/enterprises/${enterprise.id}`)} title="查看详情"><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => recordCall(enterprise.id, '回拨')} title="标记回拨"><Phone className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => regenerate(enterprise.id)} title="生成话术"><StickyNote className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs text-[#64748B]">{title}</div>
      <div className="mt-1 text-xl font-semibold text-[#0F172A]">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    pending: { text: '待采集', cls: 'bg-slate-100 text-slate-700' },
    queued: { text: '队列中', cls: 'bg-amber-100 text-amber-700' },
    collecting: { text: '采集中', cls: 'bg-cyan-100 text-cyan-700' },
    completed: { text: '已完成', cls: 'bg-emerald-100 text-emerald-700' },
    failed: { text: '失败', cls: 'bg-red-100 text-red-700' },
  };
  const item = map[status] || { text: status, cls: 'bg-slate-100 text-slate-700' };
  return <span className={`inline-flex rounded px-2 py-1 text-xs ${item.cls}`}>{item.text}</span>;
}
