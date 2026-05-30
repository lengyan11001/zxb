import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, ExternalLink, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Enterprise, Product, ScriptResult } from '@/types/api';

type GenerationState = 'idle' | 'queued' | 'completed' | 'failed';

export default function ProductAI() {
  const [products, setProducts] = useState<Product[]>([]);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [productId, setProductId] = useState('');
  const [enterpriseId, setEnterpriseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generationState, setGenerationState] = useState<GenerationState>('idle');
  const [script, setScript] = useState<ScriptResult | null>(null);
  const [statusText, setStatusText] = useState('选择产品和企业后生成话术。');
  const pollTokenRef = useRef(0);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) || null,
    [products, productId]
  );
  const selectedEnterprise = useMemo(
    () => enterprises.find((enterprise) => enterprise.id === enterpriseId) || null,
    [enterprises, enterpriseId]
  );

  async function load() {
    setLoading(true);
    try {
      const [productData, enterpriseData] = await Promise.all([
        api.getProducts('active'),
        api.getEnterprises(),
      ]);
      const ps = productData as Product[];
      const es = enterpriseData as Enterprise[];
      setProducts(ps);
      setEnterprises(es);
      setProductId((current) => current || ps[0]?.id || '');
      setEnterpriseId((current) => current || es[0]?.id || '');
      if (!ps.length || !es.length) setStatusText('需要先有可用产品和企业，才能生成话术。');
    } catch (err: any) {
      toast.error(err.message || '加载产品和企业失败');
      setStatusText(err.message || '加载失败，请刷新重试。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    return () => {
      pollTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    setScript(null);
    setGenerationState('idle');
    setStatusText('选择产品和企业后生成话术。');
  }, [productId, enterpriseId]);

  async function generate() {
    if (!productId || !enterpriseId) return toast.error('请选择产品和企业');
    pollTokenRef.current += 1;
    const pollToken = pollTokenRef.current;

    setSubmitting(true);
    setGenerationState('queued');
    setScript(null);
    setStatusText('正在提交生成任务...');

    try {
      const queued = await api.generateScript(enterpriseId, productId) as { script?: ScriptResult };
      toast.success('话术生成任务已提交');
      setStatusText('模型正在生成话术，页面会自动刷新结果。');
      await pollScript(pollToken, enterpriseId, queued.script?.id);
    } catch (err: any) {
      setGenerationState('failed');
      setStatusText(err.message || '提交失败');
      toast.error(err.message || '提交失败');
    } finally {
      if (pollTokenRef.current === pollToken) setSubmitting(false);
    }
  }

  async function pollScript(pollToken: number, currentEnterpriseId: string, scriptId?: string) {
    if (!scriptId) {
      setGenerationState('failed');
      setStatusText('生成任务提交成功，但没有返回话术任务ID。');
      return;
    }

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (pollTokenRef.current !== pollToken) return;
      await delay(attempt < 3 ? 2500 : 4000);
      if (pollTokenRef.current !== pollToken) return;

      try {
        const current = await api.getScript(currentEnterpriseId, scriptId) as ScriptResult;
        if (current.status === 'completed') {
          setScript(current);
          setGenerationState('completed');
          setStatusText(`生成完成，模型来源：${current.provider || 'local'}`);
          toast.success('话术已生成');
          return;
        }
        if (current.status === 'failed') {
          setGenerationState('failed');
          setStatusText(current.errorMessage || '生成失败');
          toast.error(current.errorMessage || '生成失败');
          return;
        }
        setStatusText(current.status === 'generating' ? '模型正在生成话术...' : '任务已排队，等待生成...');
      } catch (err: any) {
        setGenerationState('failed');
        setStatusText(err.message || '生成失败');
        toast.error(err.message || '生成失败');
        return;
      }
    }

    if (pollTokenRef.current !== pollToken) return;
    setGenerationState('failed');
    setStatusText('生成时间较长，请稍后点击“刷新结果”查看。');
  }

  async function refreshScript() {
    if (!productId || !enterpriseId) return toast.error('请选择产品和企业');
    try {
      const latest = await api.getLatestScript(enterpriseId, productId) as ScriptResult;
      setScript(latest);
      setGenerationState('completed');
      setStatusText(`已刷新，模型来源：${latest.provider || 'local'}`);
      toast.success('结果已刷新');
    } catch (err: any) {
      setScript(null);
      setGenerationState('idle');
      setStatusText(err.message || '暂无话术');
      toast.error(err.message || '暂无话术');
    }
  }

  async function copyScript() {
    if (!script?.full) return;
    await navigator.clipboard.writeText(script.full);
    toast.success('已复制话术');
  }

  if (loading) return <div className="py-20 text-center text-[#64748B]">加载中...</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-[#0F172A]">AI话术中心</h1>
        <p className="text-sm text-[#64748B]">选择产品和企业后直接生成，并在当前页面查看结果。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-[#0891B2]" />生成企业话术
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <label className="grid gap-2 text-sm">
              <span className="text-[#334155]">产品</span>
              <select className="h-9 rounded-md border px-2" value={productId} onChange={(event) => setProductId(event.target.value)}>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-[#334155]">企业</span>
              <select className="h-9 rounded-md border px-2" value={enterpriseId} onChange={(event) => setEnterpriseId(event.target.value)}>
                {enterprises.map((enterprise) => <option key={enterprise.id} value={enterprise.id}>{enterprise.name}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <Button onClick={generate} disabled={submitting || !products.length || !enterprises.length}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {submitting ? '生成中' : '生成话术'}
              </Button>
              <Button variant="outline" size="icon" onClick={refreshScript} disabled={!productId || !enterpriseId || submitting} title="刷新结果">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-[#64748B]">
            <StatusBadge state={generationState} />
            <span>{statusText}</span>
            {selectedEnterprise && (
              <Link className="inline-flex items-center gap-1 text-[#0891B2] hover:underline" to={`/enterprises/${selectedEnterprise.id}`}>
                查看企业详情<ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>生成结果</span>
              {script?.full && <Button variant="outline" size="sm" onClick={copyScript}><Copy className="h-4 w-4" />复制</Button>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {script?.full ? (
              <div className="space-y-4">
                <div className="whitespace-pre-wrap rounded-md bg-[#F8FAFC] p-4 text-sm leading-7 text-[#0F172A]">{script.full}</div>
                {script.concise && (
                  <div className="rounded-md border p-4 text-sm text-[#475569]">
                    <div className="mb-2 font-medium text-[#0F172A]">精简版</div>
                    <p className="leading-7">{script.concise}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-[#64748B]">
                {submitting ? '正在等待模型返回结果...' : '暂无话术，选择产品和企业后点击生成。'}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">当前对象</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-[#475569]">
              <Info label="产品" value={selectedProduct?.name || '-'} />
              <Info label="企业" value={selectedEnterprise?.name || '-'} />
              <Info label="行业" value={selectedEnterprise?.industry || '-'} />
              <Info label="联系人" value={selectedEnterprise?.contactPerson || '-'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">生成依据</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <ChipGroup title="切入点" items={script?.hookPoints || []} />
              <ChipGroup title="企业线索" items={script?.keyClues || selectedEnterprise?.signals?.map((signal) => signal.label) || []} />
              <ChipGroup title="异议预案" items={script?.objectionPrep || []} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ state }: { state: GenerationState }) {
  const map: Record<GenerationState, { text: string; className: string }> = {
    idle: { text: '待生成', className: 'bg-slate-100 text-slate-700' },
    queued: { text: '生成中', className: 'bg-cyan-100 text-cyan-700' },
    completed: { text: '已完成', className: 'bg-emerald-100 text-emerald-700' },
    failed: { text: '需处理', className: 'bg-rose-100 text-rose-700' },
  };
  const item = map[state];
  return <span className={`inline-flex rounded px-2 py-1 text-xs ${item.className}`}>{item.text}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[#64748B]">{label}</span>
      <span className="text-right font-medium text-[#0F172A]">{value}</span>
    </div>
  );
}

function ChipGroup({ title, items }: { title: string; items: string[] }) {
  const shown = items.filter(Boolean).slice(0, 5);
  return (
    <div>
      <div className="mb-2 font-medium text-[#0F172A]">{title}</div>
      <div className="flex flex-wrap gap-2">
        {shown.length ? shown.map((item, index) => <Badge key={`${item}-${index}`} variant="secondary">{item}</Badge>) : <span className="text-[#94A3B8]">暂无</span>}
      </div>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
