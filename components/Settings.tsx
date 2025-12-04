import React, { useState } from 'react';
import { GlobalSettings } from '../types';
import { Save, Settings as SettingsIcon, Plus, X, Archive, AlertCircle, Download, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';

interface SettingsProps {
  settings: GlobalSettings;
  onSave: (s: GlobalSettings) => void;
  onArchive?: () => void;
  onExport?: () => void;
}

const CollapsibleSection = ({ title, icon: Icon, children, defaultOpen = false }: { title: string, icon: any, children?: React.ReactNode, defaultOpen?: boolean }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border border-stone-200 rounded-lg overflow-hidden bg-white">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 bg-stone-50 hover:bg-stone-100 transition-colors"
            >
                <div className="flex items-center gap-2 font-bold text-stone-800">
                    <Icon className="text-blue-500 w-5 h-5" />
                    {title}
                </div>
                {isOpen ? <ChevronDown size={20} className="text-stone-400"/> : <ChevronRight size={20} className="text-stone-400"/>}
            </button>
            {isOpen && (
                <div className="p-4 border-t border-stone-100">
                    {children}
                </div>
            )}
        </div>
    );
};

export const Settings: React.FC<SettingsProps> = ({ settings, onSave, onArchive, onExport }) => {
  const [localSettings, setLocalSettings] = React.useState<GlobalSettings>(settings);
  const [newCategory, setNewCategory] = useState('');

  const handleChange = (field: keyof GlobalSettings, value: any) => {
    setLocalSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleRuleChange = (index: number, field: string, value: number) => {
    const newRules = [...localSettings.pricingRules];
    // @ts-ignore
    newRules[index][field] = value;
    setLocalSettings(prev => ({ ...prev, pricingRules: newRules }));
  };

  const handleAddCategory = () => {
    if (newCategory && !localSettings.productCategories.includes(newCategory)) {
        setLocalSettings(prev => ({
            ...prev,
            productCategories: [...prev.productCategories, newCategory]
        }));
        setNewCategory('');
    }
  };

  const handleRemoveCategory = (cat: string) => {
      setLocalSettings(prev => ({
          ...prev,
          productCategories: prev.productCategories.filter(c => c !== cat)
      }));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      
      <div className="flex justify-between items-center mb-2">
          <h2 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-blue-500" />
            系統參數設定
          </h2>
          <button
            onClick={() => onSave(localSettings)}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-lg shadow-blue-200"
          >
            <Save size={18} />
            儲存設定
          </button>
      </div>

      <div className="space-y-4">
        
        {/* Basic Settings (Always Visible) */}
        <div className="bg-white p-4 rounded-lg border border-stone-200 shadow-sm">
             <div className="mb-4">
                <label className="block text-sm font-medium text-stone-700 mb-1">目前日幣匯率 (成本計算用)</label>
                <div className="flex items-center gap-2">
                    <input
                    type="number"
                    step="0.001"
                    value={localSettings.jpyExchangeRate}
                    onChange={(e) => handleChange('jpyExchangeRate', parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-stone-500 whitespace-nowrap">TWD/JPY</span>
                </div>
                <p className="text-xs text-stone-500 mt-1">此匯率用於計算淨利 (日幣成本 x 匯率)</p>
             </div>
             
             <hr className="border-stone-100 mb-4" />

             <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">商品分類管理</label>
                <div className="flex flex-wrap gap-2 mb-2">
                    {localSettings.productCategories.map(cat => (
                        <span key={cat} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                            {cat}
                            <button onClick={() => handleRemoveCategory(cat)} className="hover:text-blue-900"><X size={14}/></button>
                        </span>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={newCategory}
                        onChange={e => setNewCategory(e.target.value)}
                        className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
                        placeholder="輸入新分類..."
                        onKeyPress={e => e.key === 'Enter' && handleAddCategory()}
                    />
                    <button onClick={handleAddCategory} className="bg-stone-100 px-4 rounded-lg hover:bg-stone-200"><Plus size={18}/></button>
                </div>
            </div>
        </div>

        {/* Pricing Rules */}
        <CollapsibleSection title="代購匯率/定價規則 (5個區間)" icon={AlertCircle}>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, idx) => {
                  const rule = localSettings.pricingRules[idx] || { minPrice: 0, maxPrice: 0, multiplier: 0.3 };
                  return (
                    <div key={idx} className="flex gap-4 items-center bg-stone-50 p-3 rounded-lg">
                    <div className="flex-1">
                        <span className="text-xs text-stone-500 block">日幣區間 {idx + 1}</span>
                        <div className="flex items-center gap-2">
                        <input
                            type="number"
                            value={rule.minPrice}
                            onChange={(e) => handleRuleChange(idx, 'minPrice', Number(e.target.value))}
                            className="w-24 px-2 py-1 border rounded"
                        />
                        <span>~</span>
                        <input
                            type="number"
                            value={rule.maxPrice}
                            onChange={(e) => handleRuleChange(idx, 'maxPrice', Number(e.target.value))}
                            className="w-24 px-2 py-1 border rounded"
                        />
                        </div>
                    </div>
                    <div>
                        <span className="text-xs text-stone-500 block">乘數 (匯率)</span>
                        <input
                        type="number"
                        step="0.01"
                        value={rule.multiplier}
                        onChange={(e) => handleRuleChange(idx, 'multiplier', Number(e.target.value))}
                        className="w-24 px-2 py-1 border rounded font-bold text-blue-600"
                        />
                    </div>
                    </div>
                  );
              })}
            </div>
            <p className="text-xs text-stone-500 mt-2">系統會根據輸入的日幣原價，自動依此區間乘數計算台幣售價。</p>
        </CollapsibleSection>

        {/* Shipping Rules */}
        <CollapsibleSection title="運費與結帳設定" icon={SettingsIcon}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">一般運費</label>
              <input
                type="number"
                value={localSettings.shippingFee}
                onChange={(e) => handleChange('shippingFee', Number(e.target.value))}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">免運門檻</label>
              <input
                type="number"
                value={localSettings.freeShippingThreshold}
                onChange={(e) => handleChange('freeShippingThreshold', Number(e.target.value))}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">賣貨便取貨付款金額</label>
              <input
                type="number"
                value={localSettings.pickupPayment}
                onChange={(e) => handleChange('pickupPayment', Number(e.target.value))}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg"
              />
              <p className="text-xs text-stone-400 mt-1">通常為20元 (包裹遺失理賠用)</p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Message Templates */}
        <CollapsibleSection title="通知訊息模版" icon={MessageSquare}>
             <div>
                 <p className="text-xs text-stone-500 mb-2">
                     可使用變數: 
                     <code className="bg-stone-100 px-1 rounded mx-1">{"{{name}}"}</code>
                     <code className="bg-stone-100 px-1 rounded mx-1">{"{{items}}"}</code>
                     <code className="bg-stone-100 px-1 rounded mx-1">{"{{subtotal}}"}</code>
                     <code className="bg-stone-100 px-1 rounded mx-1">{"{{shipping}}"}</code>
                     <code className="bg-stone-100 px-1 rounded mx-1">{"{{total}}"}</code>
                     <code className="bg-stone-100 px-1 rounded mx-1">{"{{remittance}}"}</code>
                     <code className="bg-stone-100 px-1 rounded mx-1">{"{{date}}"}</code>
                 </p>
                 <textarea 
                    value={localSettings.billingMessageTemplate}
                    onChange={(e) => handleChange('billingMessageTemplate', e.target.value)}
                    className="w-full h-64 p-3 border border-stone-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500"
                 />
             </div>
        </CollapsibleSection>

      </div>

      {/* Session Management Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100 mt-6">
        <h2 className="text-xl font-bold text-stone-800 mb-4 flex items-center gap-2">
            <Archive className="w-6 h-6 text-amber-500" />
            連線場次管理與匯出
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <h3 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                    <Download size={16} /> 匯出連線報表
                </h3>
                <p className="text-xs text-blue-600 mb-3">
                    匯出 CSV 檔，包含：<br/>日幣成本、毛利預估、付款狀態。
                </p>
                <button 
                   onClick={onExport}
                   className="w-full bg-white text-blue-600 border border-blue-200 hover:bg-blue-100 font-bold py-2 rounded-lg text-sm"
                >
                    下載報表
                </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                   <Archive size={16} /> 結束本次連線
                </h3>
                 <p className="text-xs text-amber-700 mb-3">
                    封存「進行中」的訂單，清空採購清單以開始新連線。<br/>
                    <strong>現貨庫存(Stock)將會保留。</strong>
                </p>
                <button
                    onClick={() => {
                        if(window.confirm('確定要結束本次連線並封存所有訂單嗎？現貨庫存將會保留，但其他訂單將移入歷史紀錄。')) {
                            onArchive && onArchive();
                        }
                    }}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 rounded-lg text-sm transition-colors"
                >
                    封存舊訂單
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};