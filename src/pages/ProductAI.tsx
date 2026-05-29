import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Enterprise, Product } from '@/types/api';

export default function ProductAI() {
  const [products, setProducts] = useState<Product[]>([]);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [productId, setProductId] = useState('');
  const [enterpriseId, setEnterpriseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([api.getProducts('active'), api.getEnterprises()])
      .then(([productData, enterpriseData]) => {
        const ps = productData as Product[];
        const es = enterpriseData as Enterprise[];
        setProducts(ps);
        setEnterprises(es);
        setProductId(ps[0]?.id || '');
        setEnterpriseId(es[0]?.id || '');
      })
      .finally(() => setLoading(false));
  }, []);

  async function generate() {
    if (!productId || !enterpriseId) return toast.error('请选择产品和企业');
    setSubmitting(true);
    try {
      await api.generateScript(enterpriseId, productId);
      toast.success('话术生成任务已提交，请稍后到企业详情查看');
    } catch (err: any) {
      toast.error(err.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="py-20 text-center text-[#64748B]">加载中...</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-[#0F172A]">AI话术中心</h1>
        <p className="text-sm text-[#64748B]">正式版由服务端调用大模型，浏览器不保存任何 API Key。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-5 w-5 text-[#0891B2]" />生成企业话术</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
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
          <div className="flex items-end">
            <Button onClick={generate} disabled={submitting || !products.length || !enterprises.length}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              提交生成
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {products.map((product) => (
          <Card key={product.id}>
            <CardHeader><CardTitle className="text-base">{product.name}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-[#475569]">
              <p>{product.description}</p>
              <div>
                <div className="font-medium text-[#0F172A]">核心价值</div>
                <p>{product.coreValue}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
