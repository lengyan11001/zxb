import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Building2, CloudUpload, Loader2, PhoneCall, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { Enterprise } from '@/types/api';

export default function Home() {
  const navigate = useNavigate();
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [names, setNames] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setEnterprises(await api.getEnterprises() as Enterprise[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => ({
    total: enterprises.length,
    queued: enterprises.filter((e) => ['queued', 'collecting', 'pending'].includes(e.collectionStatus)).length,
    completed: enterprises.filter((e) => e.collectionStatus === 'completed').length,
    scripts: enterprises.filter((e) => e.aiScript).length,
  }), [enterprises]);

  async function submitNames() {
    const list = names.split(/[\n,，;；]+/).map((name) => name.trim()).filter(Boolean);
    if (!list.length) return toast.error('请输入企业名称');
    setSubmitting(true);
    try {
      await api.batchCreate(list);
      setNames('');
      toast.success(`已创建 ${list.length} 家企业，采集任务已进入队列`);
      await load();
    } catch (err: any) {
      toast.error(err.message || '导入失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadFile(file?: File) {
    if (!file) return;
    setSubmitting(true);
    try {
      await api.uploadEnterprises(file);
      toast.success('文件已上传，采集任务已进入队列');
      await load();
    } catch (err: any) {
      toast.error(err.message || '上传失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-[#0F172A]">工作台</h1>
        <p className="text-sm text-[#64748B]">上传名单、查看采集进度，并快速进入外呼流程。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="企业总数" value={stats.total} icon={Building2} />
        <StatCard title="队列中" value={stats.queued} icon={Loader2} />
        <StatCard title="已采集" value={stats.completed} icon={CloudUpload} />
        <StatCard title="已生成话术" value={stats.scripts} icon={Sparkles} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CloudUpload className="h-5 w-5 text-[#0891B2]" />
              导入企业名单
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={names}
              onChange={(event) => setNames(event.target.value)}
              placeholder="每行一个企业名称，也支持逗号或分号分隔"
              className="min-h-[180px]"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={submitNames} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                开始导入
              </Button>
              <label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm hover:bg-[#F8FAFC]">
                上传 Excel/CSV/TXT/ZIP
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt,.zip"
                  className="hidden"
                  onChange={(event) => uploadFile(event.target.files?.[0])}
                />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">快捷入口</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <QuickButton icon={Building2} title="企业列表" desc="进入 SDR 外呼主战场" onClick={() => navigate('/enterprises')} />
            <QuickButton icon={Sparkles} title="AI话术中心" desc="按产品生成个性化话术" onClick={() => navigate('/product-ai')} />
            <QuickButton icon={BarChart3} title="数据看板" desc="查看转化漏斗和跟进表现" onClick={() => navigate('/dashboard')} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PhoneCall className="h-5 w-5 text-[#0891B2]" />
            最近企业
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-sm text-[#64748B]">加载中...</div>
          ) : enterprises.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#64748B]">还没有企业名单，先导入一批试试。</div>
          ) : (
            <div className="divide-y">
              {enterprises.slice(0, 8).map((enterprise) => (
                <button
                  key={enterprise.id}
                  onClick={() => navigate(`/enterprises/${enterprise.id}`)}
                  className="w-full py-3 text-left flex items-center justify-between hover:bg-[#F8FAFC] px-2 rounded-md"
                >
                  <div>
                    <div className="font-medium text-[#0F172A]">{enterprise.name}</div>
                    <div className="text-xs text-[#64748B]">{enterprise.industry || '待采集'} · {enterprise.location || '未知地区'}</div>
                  </div>
                  <span className="text-xs text-[#64748B]">{statusLabel(enterprise.collectionStatus)}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon }: { title: string; value: number; icon: typeof Building2 }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <div className="text-sm text-[#64748B]">{title}</div>
          <div className="mt-1 text-2xl font-semibold text-[#0F172A]">{value}</div>
        </div>
        <div className="h-10 w-10 rounded-md bg-[#ECFEFF] text-[#0891B2] flex items-center justify-center">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function QuickButton({ icon: Icon, title, desc, onClick }: { icon: typeof Building2; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 rounded-md border p-3 text-left hover:bg-[#F8FAFC]">
      <div className="h-9 w-9 rounded-md bg-[#F1F5F9] flex items-center justify-center text-[#334155]">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="font-medium text-[#0F172A]">{title}</div>
        <div className="text-xs text-[#64748B]">{desc}</div>
      </div>
    </button>
  );
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '待采集',
    queued: '队列中',
    collecting: '采集中',
    completed: '已完成',
    failed: '失败',
  };
  return map[status] || status;
}
