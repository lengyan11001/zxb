import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DataSource {
  key: string;
  name: string;
  description: string;
  status: string;
}

export default function Settings() {
  const [sources, setSources] = useState<DataSource[]>([]);

  useEffect(() => {
    api.getDataSources().then((data) => setSources(data as DataSource[]));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-[#0F172A]">系统设置</h1>
        <p className="text-sm text-[#64748B]">正式版密钥只允许在服务端环境变量或密钥管理中配置。</p>
      </div>

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
