export interface Signal {
  type: 'gaoxin' | 'zhuanjing' | 'financing' | 'combined' | string;
  label: string;
  description?: string;
  evidence?: string;
  confidence?: number;
}

export interface Enterprise {
  id: string;
  name: string;
  industry: string;
  scale: string;
  location: string;
  contactPerson: string;
  phone: string;
  phoneStatus: 'pending' | 'cleaned' | 'invalid' | 'duplicate';
  collectionStatus: 'pending' | 'queued' | 'collecting' | 'completed' | 'failed';
  collectionProgress: number;
  signals: Signal[];
  timeline: Array<{ time: string; title: string; detail: string }>;
  notes: string;
  latestCallResult: string;
  callCount: number;
  aiScript: string;
  activeProductId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  status: 'active' | 'inactive' | 'archived';
  description: string;
  coreValue: string;
  targetCustomer: string;
  uniqueAdvantage: string;
  priceStrategy: string;
  successCases: string[];
  painPoints: string[];
  benefits: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ScriptResult {
  id: string;
  enterpriseId: string;
  productId: string;
  status: string;
  full: string;
  concise: string;
  opening: string;
  hookPoints: string[];
  keyClues: string[];
  objectionPrep: string[];
  provider: string;
}
