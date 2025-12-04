import React, { useState } from 'react';
import { GlobalSettings, Product, Customer, Order, TodoItem } from '../types';
import { Save, Settings as SettingsIcon, Plus, X, Archive, AlertCircle, Download, ChevronDown, ChevronRight, MessageSquare, Upload, RefreshCw, Key, Cloud, CloudLightning, Database } from 'lucide-react';
import { uploadLocalDataToCloud, initFirebase } from '../services/firebaseService';

interface SettingsProps {
  settings: GlobalSettings;
  onSave: (s: GlobalSettings) => void;
  onArchive?: () => void;
  onExport?: () => void;
  onImportData?: (data: any) => void;
  // Data for migration
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

export const Settings: React.FC<SettingsProps> = ({ settings, onSave, onArchive, onExport, onImportData, currentData }) => {
  const [localSettings, setLocalSettings] = React.useState<GlobalSettings>(settings);
  const [newCategory, setNewCategory] = useState('');
  
  // Firebase Form State
  const [fbApiKey, setFbApiKey] = useState(settings.firebaseConfig?.apiKey || '');
  const [fbAuthDomain, setFbAuthDomain] = useState(settings.firebaseConfig?.authDomain || '');
  const [fbProjectId, setFbProjectId] = useState(settings.firebaseConfig?.projectId || '');
  const [fbStorageBucket, setFbStorageBucket] = useState(settings.firebaseConfig?.storageBucket || '');
  const [fbMessagingSenderId, setFbMessagingSenderId] = useState(settings.firebaseConfig?.messagingSenderId || '');
  const [fbAppId, setFbAppId] = useState(settings.firebaseConfig?.appId || '');
  const [isUploading, setIsUploading] = useState(false);

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

  // Generate a full JSON backup
  const handleBackup = () => {
      const data = {
          products: localStorage.getItem('gpick_products'),
          customers: localStorage.getItem('gpick_customers'),
          orders: localStorage.getItem('gpick_orders'),
          settings: localStorage.getItem('gpick_settings'),
          todos: localStorage.getItem('gpick_todos'),
          timestamp: Date.now()
      };
      
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `GPick_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!window.confirm("警告：匯入備份檔將會「完全覆蓋」目前的所有資料（商品、訂單、顧客）。\n\n確定要繼續嗎？")) {
          e.target.value = ''; // Reset input
          return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const json = JSON.parse(event.target?.result as string);
              if (onImportData) {
                  onImportData(json);
              }
          } catch (error) {
              alert("檔案格式錯誤，無法還原。");
              console.error(error);
          }
      };
      reader.readAsText(file);
  };

  const handleConnectCloud = () => {
      if (!fbApiKey || !fbProjectId) {
          alert("請填寫完整的 Firebase 設定 (API Key, Project ID)");
          return;
      }
      
      const config = {
          apiKey: fbApiKey,
          authDomain: fbAuthDomain,
          projectId: fbProjectId,
          storageBucket: fbStorageBucket,
          messagingSenderId: fbMessagingSenderId,
          appId: fbAppId
      };
      
      // Attempt Init
      const success = initFirebase(config);
      if (success) {
          // Update Settings to enable cloud
          onSave({
              ...localSettings,
              useCloudSync: true,
              firebaseConfig: config
          });
          alert("雲端連線成功！已切換至即時同步模式。");
      } else {
          alert("連線失敗，請檢查設定值。");
      }
  };

  const handleDisableCloud = () => {
      if(window.confirm("確定要中斷雲端連線，切換回單機模式嗎？")) {
          onSave({
              ...localSettings,
              useCloudSync: false
          });
      }
  };

  const handleMigrateToCloud = async () => {
      if(!settings.useCloudSync) {
          alert("請先啟用雲端連線");
          return;
      }
      if(window.confirm("這將會把您目前的「單機資料」全部上傳覆蓋至雲端資料庫。\n\n建議您先執行一次「下載備份」以防萬一。\n\n確定要上傳嗎？")) {
          setIsUploading(true);
          try {
              const count = await uploadLocalDataToCloud(
                  currentData.products,
                  currentData.customers,
                  currentData.orders,
                  currentData.todos,
                  settings
              );
              alert(`上傳成功！共同步了 ${count} 筆資料。`);
          } catch(e) {
              console.error(e);
              alert("上傳失敗，請檢查主控台錯誤訊息。");
          } finally {
              setIsUploading(false);
          }
      }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      
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
        
        {/* Basic Settings (Top Priority for daily use) */}
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
        
        {/* Data Backup & Sync */}
        <CollapsibleSection title="手動備份與還原 (單機模式用)" icon={Database}>
             <div className="space-y-4">
                 <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 text-sm text-stone-600">
                     <p>若您未使用雲端同步，可使用此功能手動轉移資料：</p>
                     <ol className="list-decimal list-inside mt-2 space-y-1">
                         <li>A裝置（例如現場喊單）：點擊<strong>「下載備份」</strong></li>
                         <li>將檔案傳給 B裝置（例如電腦結帳）</li>
                         <li>B裝置：點擊<strong>「匯入備份」</strong></li>
                     </ol>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <button 
                         onClick={handleBackup}
                         className="flex items-center justify-center gap-2 bg-white hover:bg-stone-50 text-stone-700 py-3 rounded-lg border border-stone-300 font-bold transition-colors"
                     >
                         <Download size={18} />
                         下載完整備份 (.json)
                     </button>
                     
                     <label className="flex items-center justify-center gap-2 bg-stone-700 hover:bg-stone-800 text-white py-3 rounded-lg font-bold transition-colors cursor-pointer shadow-md">
                         <Upload size={18} />
                         匯入備份檔案
                         <input 
                            type="file" 
                            accept=".json" 
                            className="hidden" 
                            onChange={handleRestore}
                         />
                     </label>
                 </div>
             </div>
        </CollapsibleSection>
      </div>

      {/* Session Management Section (Middle Priority) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100 mt-6 mb-6">
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

      {/* Advanced Settings (Cloud & AI) at Bottom */}
      <div className="space-y-4 pt-6 border-t border-stone-200">
         <h3 className="text-lg font-bold text-stone-500 px-1">進階功能設定</h3>
         
         {/* AI API KEY Section */}
         <CollapsibleSection title="Gemini AI 設定 (魔法棒/智慧分析)" icon={Key}>
             <p className="text-xs text-stone-500 mb-2">
                 若您在手機上使用 AI 魔法棒或營運分析，請在此貼上您的 API Key。<br/>
                 (此 Key 僅儲存於您的瀏覽器 LocalStorage，不會上傳至伺服器)
             </p>
             <input
                type="text"
                value={localSettings.geminiApiKey || ''}
                onChange={(e) => handleChange('geminiApiKey', e.target.value)}
                placeholder="貼上您的 API Key (例如: AIzaSy...)"
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono text-sm"
             />
             <div className="mt-2 text-right">
                 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">
                     前往 Google AI Studio 獲取免費 Key &rarr;
                 </a>
             </div>
         </CollapsibleSection>

         {/* Cloud Sync Config Section */}
         <CollapsibleSection title={`雲端即時同步 ${settings.useCloudSync ? '(連線中)' : '(單機模式)'}`} icon={CloudLightning}>
             <div className="space-y-3">
                 {!settings.useCloudSync && (
                     <div className="p-3 bg-blue-50 text-blue-800 text-sm rounded-lg border border-blue-100 mb-4">
                         <strong>多人協作必備：</strong>啟用此功能後，您與夥伴的所有操作將會透過雲端即時同步 (Real-time)。<br/>
                         請前往 <a href="https://console.firebase.google.com/" target="_blank" className="underline font-bold">Firebase Console</a> 申請專案並取得設定碼。
                     </div>
                 )}

                 <div className="grid grid-cols-2 gap-3">
                     <div className="col-span-2">
                         <label className="text-xs font-bold text-stone-500">API Key</label>
                         <input type="text" className="w-full border rounded px-2 py-1 text-sm font-mono" placeholder="AIzaSy..." value={fbApiKey} onChange={e => setFbApiKey(e.target.value)} />
                     </div>
                     <div>
                         <label className="text-xs font-bold text-stone-500">Auth Domain</label>
                         <input type="text" className="w-full border rounded px-2 py-1 text-sm font-mono" placeholder="xxx.firebaseapp.com" value={fbAuthDomain} onChange={e => setFbAuthDomain(e.target.value)} />
                     </div>
                     <div>
                         <label className="text-xs font-bold text-stone-500">Project ID</label>
                         <input type="text" className="w-full border rounded px-2 py-1 text-sm font-mono" placeholder="gpick-app" value={fbProjectId} onChange={e => setFbProjectId(e.target.value)} />
                     </div>
                     <div>
                         <label className="text-xs font-bold text-stone-500">Storage Bucket</label>
                         <input type="text" className="w-full border rounded px-2 py-1 text-sm font-mono" placeholder="xxx.appspot.com" value={fbStorageBucket} onChange={e => setFbStorageBucket(e.target.value)} />
                     </div>
                     <div>
                         <label className="text-xs font-bold text-stone-500">Messaging Sender ID</label>
                         <input type="text" className="w-full border rounded px-2 py-1 text-sm font-mono" value={fbMessagingSenderId} onChange={e => setFbMessagingSenderId(e.target.value)} />
                     </div>
                     <div className="col-span-2">
                         <label className="text-xs font-bold text-stone-500">App ID</label>
                         <input type="text" className="w-full border rounded px-2 py-1 text-sm font-mono" placeholder="1:123456789:web:xxx" value={fbAppId} onChange={e => setFbAppId(e.target.value)} />
                     </div>
                 </div>

                 <div className="flex gap-3 mt-4 pt-2 border-t border-stone-100/50">
                     {!settings.useCloudSync ? (
                         <button onClick={handleConnectCloud} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold transition-colors shadow-md">
                             連線並啟用雲端模式
                         </button>
                     ) : (
                         <div className="flex gap-3 w-full">
                             <button onClick={handleMigrateToCloud} disabled={isUploading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-bold transition-colors shadow-md flex items-center justify-center gap-2">
                                 {isUploading ? '上傳中...' : <><Upload size={16}/> 本機資料上傳至雲端</>}
                             </button>
                             <button onClick={handleDisableCloud} className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 py-2 rounded-lg font-bold transition-colors">
                                 中斷連線 (回單機)
                             </button>
                         </div>
                     )}
                 </div>
             </div>
         </CollapsibleSection>
      </div>

    </div>
  );
};