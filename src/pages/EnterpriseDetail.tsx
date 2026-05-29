import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import type { Enterprise, Product, ScriptResult } from '@/types/api';

export default function EnterpriseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [script, setScript] = useState<ScriptResult | null>(null);
  const [productId, setProductId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const [enterpriseData, productData] = await Promise.all([
        api.getEnterprise(id) as Promise<Enterprise>,
        api.getProducts('active') as Promise<Product[]>,
      ]);
      setEnterprise(enterpriseData);
      setProducts(productData);
      setProductId(enterpriseData.activeProductId || productData[0]?.id || '');
      setNotes(enterpriseData.notes || '');
      try {
        setScript(await api.getLatestScript(id, enterpriseData.activeProductId) as ScriptResult);
      } catch {
        setScript(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function generate() {
    if (!id || !productId) return toast.error('请选择产品');
    setGenerating(true);
    try {
      await api.generateScript(id, productId);
      toast.success('话术生成任务已提交，稍后刷新查看结果');
      setTimeout(load, 2500);
    } catch (err: any) {
      toast.error(err.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }

  async function saveNotes() {
    if (!id) return;
    await api.updateEnterprise(id, { notes });
    toast.success('备注已保存');
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success('已复制');
  }

  if (loading) return <div className="py-20 text-center text-[#64748B]">加载中...</div>;
  if (!enterprise) return <div className="py-20 text-center text-[#64748B]">企业不存在</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon-sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-2xl font-semibold text-[#0F172A]">{enterprise.name}</h1>
            <p className="text-sm text-[#64748B]">{enterprise.industry || '待采集'} · {enterprise.location || '未知地区'}</p>
          </div>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" />刷新</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">企业画像</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Info label="联系人" value={enterprise.contactPerson || '-'} />
              <Info label="手机号" value={enterprise.phone || '-'} />
              <Info label="规模" value={enterprise.scale || '-'} />
              <Info label="采集状态" value={enterprise.collectionStatus} />
              <div>
                <div className="mb-2 text-[#64748B]">需求信号</div>
                <div className="flex flex-wrap gap-2">
                  {enterprise.signals.length ? enterprise.signals.map((signal, idx) => (
                    <Badge key={idx} variant="secondary">{signal.label} {signal.confidence ? `${signal.confidence}%` : ''}</Badge>
                  )) : <span className="text-[#94A3B8]">暂无信号</span>}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">采集时间线</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {enterprise.timeline.map((event, idx) => (
                <div key={idx} className="border-l-2 border-[#E2E8F0] pl-3">
                  <div className="text-sm font-medium text-[#0F172A]">{event.title}</div>
                  <div className="text-xs text-[#64748B]">{event.detail}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>AI 话术</span>
                <div className="flex gap-2">
                  <select className="h-9 rounded-md border px-2 text-sm" value={productId} onChange={(event) => setProductId(event.target.value)}>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                  <Button onClick={generate} disabled={generating}>
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    生成
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {script?.full ? (
                <div className="space-y-3">
                  <div className="whitespace-pre-wrap rounded-md bg-[#F8FAFC] p-4 text-sm leading-7 text-[#0F172A]">{script.full}</div>
                  <Button variant="outline" onClick={() => copy(script.full)}><Copy className="h-4 w-4" />复制话术</Button>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-[#64748B]">暂无话术，选择产品后点击生成。</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">跟进备注</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-[120px]" placeholder="记录客户反馈、下次跟进时间、异议点等" />
              <Button onClick={saveNotes}>保存备注</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[#64748B]">{label}</span>
      <span className="font-medium text-[#0F172A]">{value}</span>
    </div>
  );
}
