import { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Product } from '@/types/api';

export default function ProductCenter() {
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState({ name: '', category: '融资', description: '', coreValue: '' });

  async function load() {
    setProducts(await api.getProducts() as Product[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!draft.name.trim()) return toast.error('请输入产品名称');
    await api.createProduct({
      ...draft,
      targetCustomer: '',
      uniqueAdvantage: '',
      priceStrategy: '',
      successCases: [],
      painPoints: [],
      benefits: [],
    });
    setDraft({ name: '', category: '融资', description: '', coreValue: '' });
    toast.success('产品已创建');
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-[#0F172A]">产品管理</h1>
        <p className="text-sm text-[#64748B]">产品信息会作为 AI 话术生成的基础材料。</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="h-5 w-5" />新增产品</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input placeholder="产品名称" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <Input placeholder="分类" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
          <Textarea className="md:col-span-2" placeholder="产品描述" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          <Textarea className="md:col-span-2" placeholder="核心价值" value={draft.coreValue} onChange={(event) => setDraft({ ...draft, coreValue: event.target.value })} />
          <div className="md:col-span-2">
            <Button onClick={create}><Save className="h-4 w-4" />保存产品</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {products.map((product) => (
          <Card key={product.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>{product.name}</span>
                <span className="rounded bg-[#F1F5F9] px-2 py-1 text-xs text-[#64748B]">{product.status}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[#475569]">
              <div>{product.category}</div>
              <p>{product.description || '暂无描述'}</p>
              {product.coreValue && <p className="text-[#0F172A]">核心价值：{product.coreValue}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
