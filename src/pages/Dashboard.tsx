import { useEffect, useState } from 'react';
import { BarChart3, Building2, CalendarCheck, PhoneCall, Users } from 'lucide-react';
import { api } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DashboardData {
  enterprises: { total: number; completed: number; pending: number };
  calls: { total_calls: number; connected: number; effective: number; wechat: number; meetings: number };
  scripts: number;
  recentFollowups: Array<{ id: string; name: string; industry: string; result: string; notes: string; called_at: string }>;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api.dashboard().then((res) => setData(res as DashboardData));
  }, []);

  const calls = data?.calls;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-[#0F172A]">数据看板</h1>
        <p className="text-sm text-[#64748B]">企业采集、话术生成和今日外呼漏斗。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="企业总数" value={data?.enterprises.total ?? 0} icon={Building2} />
        <Metric title="已采集" value={data?.enterprises.completed ?? 0} icon={BarChart3} />
        <Metric title="今日拨打" value={calls?.total_calls ?? 0} icon={PhoneCall} />
        <Metric title="已生成话术" value={data?.scripts ?? 0} icon={Users} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">五层销售漏斗</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <FunnelStep title="拨打" value={calls?.total_calls ?? 0} />
          <FunnelStep title="接通" value={calls?.connected ?? 0} rate={rate(calls?.connected, calls?.total_calls)} />
          <FunnelStep title="有效通话" value={calls?.effective ?? 0} rate={rate(calls?.effective, calls?.connected)} />
          <FunnelStep title="加微信" value={calls?.wechat ?? 0} rate={rate(calls?.wechat, calls?.effective)} />
          <FunnelStep title="约见" value={calls?.meetings ?? 0} rate={rate(calls?.meetings, calls?.wechat)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarCheck className="h-5 w-5 text-[#0891B2]" />最近跟进</CardTitle></CardHeader>
        <CardContent>
          {!data?.recentFollowups.length ? (
            <div className="py-8 text-center text-sm text-[#64748B]">暂无跟进记录</div>
          ) : (
            <div className="divide-y">
              {data.recentFollowups.map((item) => (
                <div key={`${item.id}-${item.called_at}`} className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-[#0F172A]">{item.name}</div>
                    <span className="rounded bg-[#F1F5F9] px-2 py-1 text-xs text-[#475569]">{item.result}</span>
                  </div>
                  <div className="mt-1 text-xs text-[#64748B]">{item.industry} · {new Date(item.called_at).toLocaleString()}</div>
                  {item.notes && <div className="mt-2 text-sm text-[#475569]">{item.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: number; icon: typeof Building2 }) {
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

function FunnelStep({ title, value, rate: rateValue }: { title: string; value: number; rate?: string }) {
  return (
    <div className="rounded-md border bg-[#F8FAFC] p-4">
      <div className="text-xs text-[#64748B]">{title}</div>
      <div className="mt-1 text-xl font-semibold text-[#0F172A]">{value}</div>
      {rateValue && <div className="mt-1 text-xs text-[#0891B2]">转化 {rateValue}</div>}
    </div>
  );
}

function rate(numerator = 0, denominator = 0) {
  if (!denominator) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}
