
import React, { useState } from 'react';
import { GlobalSettings, Product, Customer, Order, TodoItem } from '../types';
import { Save, Settings as SettingsIcon, Plus, X, Archive, AlertCircle, Download, ChevronDown, ChevronRight, MessageSquare, Upload, RefreshCw, Key, Cloud, CloudLightning, Database, Copy, ClipboardCheck, Users, Tag } from 'lucide-react';
import { uploadLocalDataToCloud, initFirebase } from '../services/firebaseService';

interface SettingsProps {
  settings: GlobalSettings;
  onSave: (s: GlobalSettings) => void;
  onArchive?: () => void;
  onExport?: () => void;
  onImportData?: (data: any) => void;
  currentData: {
      products: Product[];
      customers: Customer[];
      orders: Order[];
      todos: TodoItem[];
  }
}

const CollapsibleSection = ({ title, icon: Icon, children, defaultOpen = false }: { title: string, icon: any, children?: React.ReactNode, defaultOpen?: boolean }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border border-stone-200 rounded-lg overflow-hidden bg-white">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-4 bg-stone-50 hover:bg-stone-100 transition-colors">
                <div className="flex items-center gap-2 font-bold text-stone-800"><Icon className="text-blue-500 w-5 h-5" />{title}</div>
                {isOpen ? <ChevronDown size={20} className="text-stone-400"/> : <ChevronRight size={20} className="text-stone-400"/>}
            </button>
            {isOpen && <div className="p-4 border-t border-stone-100">{children}</div>}
        </div>
    );
};

export const Settings: React.FC<SettingsProps> = ({ settings, onSave, onArchive, onExport, onImportData, currentData }) => {
  const [localSettings, setLocalSettings] = React.useState<GlobalSettings>(settings);
  const [newCategory, setNewCategory] = useState('');
  
  const [fbApiKey, setFbApiKey] = useState(settings.firebaseConfig?.apiKey || '');
  const [fbAuthDomain, setFbAuthDomain] = useState(settings.firebaseConfig?.authDomain || '');
  const [fbProjectId, setFbProjectId] = useState(settings.firebaseConfig?.projectId || '');
  const [fbStorageBucket, setFbStorageBucket] = useState(settings.firebaseConfig?.storageBucket || '');
  const [fbMessagingSenderId, setFbMessagingSenderId] = useState(settings.firebaseConfig?.messagingSenderId || '');
  const [fbAppId, setFbAppId] = useState(settings.firebaseConfig?.appId || '');
  const [isUploading, setIsUploading] = useState(false);
  const [pasteConfigJson, setPasteConfigJson] = useState('');

  const handleChange = (field: keyof GlobalSettings, value: any) => setLocalSettings(prev => ({ ...prev, [field]: value }));
  const handleRuleChange = (index: number, field: string, value: number) => {
    const newRules = [...localSettings.pricingRules];
    // @ts-ignore
    newRules[index][field] = value;
    setLocalSettings(prev => ({ ...prev, pricingRules: newRules }));
  };

  const handleAddCategory = () => {
    if (newCategory && !localSettings.productCategories.includes(newCategory)) {
        setLocalSettings(prev => ({ ...prev, productCategories: [...prev.productCategories, newCategory] }));
        setNewCategory('');
    }
  };

  const handleBackup = () => {
      const data = { products: localStorage.getItem('gpick_products'), customers: localStorage.getItem('gpick_customers'), orders: localStorage.getItem('gpick_orders'), settings: localStorage.getItem('gpick_settings'), todos: localStorage.getItem('gpick_todos'), timestamp: Date.now() };
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
      link.download = `GPick_Backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !window.confirm("警告：匯入備份將完全覆蓋目前資料。確定要繼續嗎？")) return;
      const reader = new FileReader();
      reader.onload = (event) => { try { if (onImportData) onImportData(JSON.parse(event.target?.result as string)); } catch (error) { alert("檔案格式錯誤"); } };
      reader.readAsText(file);
  };

  const handleConnectCloud = () => {
      if (!fbApiKey || !fbProjectId) return alert("請填寫完整的 Firebase 設定");
      const config = { apiKey: fbApiKey, authDomain: fbAuthDomain, projectId: fbProjectId, storageBucket: fbStorageBucket, messagingSenderId: fbMessagingSenderId, appId: fbAppId };
      if (initFirebase(config)) { onSave({ ...localSettings, useCloudSync: true, firebaseConfig: config }); alert("雲端連線成功！"); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="flex justify-between items-center mb-2">
          <h2 className="text-2xl font-bold text-stone-800 flex items-center gap-2"><SettingsIcon className="w-6 h-6 text-blue-500" />系統參數設定</h2>
          <button onClick={() => onSave(localSettings)} className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-blue-200"><Save size={18} />儲存設定</button>
      </div>

      <div className="space-y-4">
        <div className="bg-white p-4 rounded-lg border border-stone-200 shadow-sm space-y-4">
             <div>
                <label className="block text-sm font-medium text-stone-700 mb-1 flex items-center gap-1"><Tag size={14}/> 連線場次名稱 (顯示於對帳單)</label>
                <input type="text" value={localSettings.sessionName || ''} onChange={(e) => handleChange('sessionName', e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg" placeholder="例如：12月大阪聖誕、2025/11月東京連線" />
             </div>
             <hr className="border-stone-100" />
             <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">目前日幣匯率 (成本計算用)</label>
                <input type="number" step="0.001" value={localSettings.jpyExchangeRate} onChange={(e) => handleChange('jpyExchangeRate', parseFloat(e.target.value))} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
             </div>
        </div>

        <CollapsibleSection title="代購匯率/定價規則" icon={AlertCircle}>
            <div className="space-y-3">
              {localSettings.pricingRules.map((rule, idx) => (
                <div key={idx} className="flex gap-4 items-center bg-stone-50 p-3 rounded-lg">
                    <div className="flex-1"><span className="text-xs text-stone-500 block">日幣區間 {idx + 1}</span><div className="flex items-center gap-2"><input type="number" value={rule.minPrice} onChange={(e) => handleRuleChange(idx, 'minPrice', Number(e.target.value))} className="w-24 px-2 py-1 border rounded" /><span>~</span><input type="number" value={rule.maxPrice} onChange={(e) => handleRuleChange(idx, 'maxPrice', Number(e.target.value))} className="w-24 px-2 py-1 border rounded" /></div></div>
                    <div><span className="text-xs text-stone-500 block">乘數 (匯率)</span><input type="number" step="0.01" value={rule.multiplier} onChange={(e) => handleRuleChange(idx, 'multiplier', Number(e.target.value))} className="w-24 px-2 py-1 border rounded font-bold text-blue-600" /></div>
                </div>
              ))}
            </div>
        </CollapsibleSection>

        <CollapsibleSection title="運費與結帳設定" icon={SettingsIcon}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-stone-700 mb-1">一般運費</label><input type="number" value={localSettings.shippingFee} onChange={(e) => handleChange('shippingFee', Number(e.target.value))} className="w-full px-3 py-2 border border-stone-300 rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-stone-700 mb-1">免運門檻</label><input type="number" value={localSettings.freeShippingThreshold} onChange={(e) => handleChange('freeShippingThreshold', Number(e.target.value))} className="w-full px-3 py-2 border border-stone-300 rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-stone-700 mb-1">賣貨便最低支付 (取貨金)</label><input type="number" value={localSettings.pickupPayment} onChange={(e) => handleChange('pickupPayment', Number(e.target.value))} className="w-full px-3 py-2 border border-stone-300 rounded-lg" /><p className="text-xs text-stone-400 mt-1">預設為 20 元 (依平台規定)</p></div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="通知訊息模版" icon={MessageSquare}>
             <div><p className="text-[10px] text-stone-400 mb-2">可用變數：{"{{sessionName}}, {{name}}, {{items}}, {{subtotal}}, {{total}}, {{remittance}}, {{pickupPayment}}, {{shipping}}, {{giftStatus}}, {{shippingStatus}}"}</p><textarea value={localSettings.billingMessageTemplate} onChange={(e) => handleChange('billingMessageTemplate', e.target.value)} className="w-full h-64 p-3 border border-stone-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500" /></div>
        </CollapsibleSection>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100 mt-6 mb-6">
        <h2 className="text-xl font-bold text-stone-800 mb-4 flex items-center gap-2"><Archive className="w-6 h-6 text-amber-500" />場次結算</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4"><h3 className="font-bold text-blue-800 mb-2">匯出 CSV</h3><button onClick={onExport} className="w-full bg-white text-blue-600 border border-blue-200 font-bold py-2 rounded-lg text-sm">下載報表</button></div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4"><h3 className="font-bold text-amber-800 mb-2">結束本次連線</h3><button onClick={() => window.confirm('確定結束連線？') && onArchive?.()} className="w-full bg-amber-500 text-white font-bold py-2 rounded-lg text-sm">結算並封存</button></div>
        </div>
      </div>
    </div>
  );
};
