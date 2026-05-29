import { useState, useEffect, useCallback } from 'react';

export function useApi<T>(fetcher: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then(d => { if (!cancelled) { setData(d); } })
      .catch(e => { if (!cancelled) setError(e.message || '加载失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, deps);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then(d => { setData(d); })
      .catch(e => setError(e.message || '加载失败'))
      .finally(() => setLoading(false));
  }, deps);

  return { data, loading, error, refresh, setData };
}

export function useApiMutation<T>(mutator: (...args: any[]) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (...args: any[]) => {
    setLoading(true);
    setError(null);
    try {
      const result = await mutator(...args);
      setData(result);
      return result;
    } catch (e: any) {
      setError(e.message || '操作失败');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [mutator]);

  return { data, loading, error, execute, setData };
}
