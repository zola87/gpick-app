
import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { GlobalSettings, Product, Customer, Order, TodoItem } from '../types';
import { showAlert } from '../App';
import { Save, Settings as SettingsIcon, Plus, X, Archive, AlertCircle, Download, ChevronDown, ChevronRight, MessageSquare, Tag, ListFilter, Cloud, Database, RefreshCw, Zap, CheckCircle2, UserCheck } from 'lucide-react';
import { initFirebase, db } from '../services/firebaseService';

interface SettingsProps {
  settings: GlobalSettings;
  onSave: (s: GlobalSettings) => void | Promise<void>;
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
        <div className="border border-slate-100/80 rounded-2xl overflow-hidden bg-white shadow-sm">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between px-5 py-4 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2.5 font-semibold text-slate-700 text-sm"><Icon className="text-slate-400 w-4 h-4" />{title}</div>
                {isOpen ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
            </button>
            {isOpen && <div className="p-5 border-t border-slate-100">{children}</div>}
        </div>
    );
};

export const Settings: React.FC<SettingsProps> = ({ settings, onSave, onArchive, onExport, onImportData, currentData }) => {
  const [localSettings, setLocalSettings] = React.useState<GlobalSettings>(settings);
  const [newCategory, setNewCategory] = useState('');
  
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  // 快速下單：管理員 LINE 綁定
  const BINDING_EXPIRY_MS = 5 * 60 * 1000;
  const [adminLineUserIds, setAdminLineUserIds]     = useState<string[]>([]);
  const [pendingLineUserId, setPendingLineUserId]   = useState<string | null>(null);
  const [pendingLineUserIdAt, setPendingLineUserIdAt] = useState<number | null>(null);
  const [isConfirming, setIsConfirming]             = useState(false);

  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, 'settings', 'adminLine')).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        setAdminLineUserIds(data.adminLineUserIds || []);
        setPendingLineUserId(data.pendingLineUserId || null);
        setPendingLineUserIdAt(data.pendingLineUserIdAt || null);
      }
    });
  }, []);

  const handleConfirmAdminLine = async () => {
    if (!pendingLineUserId || !db) return;
    setIsConfirming(true);
    const updated = [...new Set([...adminLineUserIds, pendingLineUserId])];
    await updateDoc(doc(db, 'settings', 'adminLine'), {
      adminLineUserIds: updated,
      pendingLineUserId: deleteField(),
      pendingLineUserIdAt: deleteField(),
    });
    setAdminLineUserIds(updated);
    setPendingLineUserId(null);
    setPendingLineUserIdAt(null);
    setIsConfirming(false);
  };

  const handleRemoveAdminLine = async (uid: string) => {
    if (!db) return;
    const updated = adminLineUserIds.filter(id => id !== uid);
    await updateDoc(doc(db, 'settings', 'adminLine'), { adminLineUserIds: updated });
    setAdminLineUserIds(updated);
  };

  const handleChange = (field: keyof GlobalSettings, value: any) => setLocalSettings(prev => ({ ...prev, [field]: value }));
  
  const handleRuleChange = (index: number, field: string, value: number) => {
    const newRules = localSettings.pricingRules.map((r, i) =>
      i === index ? { ...r, [field]: value } : r
    );
    setLocalSettings(prev => ({ ...prev, pricingRules: newRules }));
  };

  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    if (trimmed && !localSettings.productCategories.includes(trimmed)) {
        setLocalSettings(prev => ({ 
            ...prev, 
            productCategories: [...prev.productCategories, trimmed] 
        }));
        setNewCategory('');
    }
  };

  const handleRemoveCategory = (catToRemove: string) => {
      if (localSettings.productCategories.length <= 1) {
          showAlert("至少需保留一個類別。");
          return;
      }
      setLocalSettings(prev => ({
          ...prev,
          productCategories: prev.productCategories.filter(c => c !== catToRemove)
      }));
  };

  const savePublicSettings = async () => {
    if (!db) return;
    await setDoc(doc(db, 'settings', 'public'), {
      sessionName: localSettings.sessionName || '',
      shippingFee: localSettings.shippingFee,
      freeShippingThreshold: localSettings.freeShippingThreshold,
      pickupPayment: localSettings.pickupPayment,
      checkoutEnabled: localSettings.checkoutEnabled ?? false,
      bankAccount: localSettings.bankAccount || '',
    });
  };

  const handleExportAllData = () => {
      const allData = {
          products: currentData.products,
          customers: currentData.customers,
          orders: currentData.orders,
          todos: currentData.todos,
          settings: localSettings,
          exportDate: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `live-buy-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showAlert("已下載完整資料備份檔！");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-20">
      {/* Archive Confirmation Modal */}
      {archiveConfirm && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
                  <div className="text-center">
                      <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Archive size={32} />
                      </div>
                      <h3 className="text-xl font-medium text-stone-800 mb-2">確定結束並封存本次所有訂單嗎？</h3>
                      <p className="text-stone-500 text-sm leading-relaxed">
                          此動作將清空採購清單並將紀錄存入歷史報表。
                      </p>
                  </div>
                  <div className="flex border-t border-stone-100">
                      <button 
                          onClick={() => setArchiveConfirm(false)}
                          className="flex-1 px-6 py-4 text-stone-500 font-medium hover:bg-stone-50 transition-colors"
                      >
                          取消
                      </button>
                      <button 
                          disabled={isArchiving}
                          onClick={async () => {
                              setIsArchiving(true);
                              try {
                                await onArchive?.();
                              } finally {
                                setIsArchiving(false);
                                setArchiveConfirm(false);
                              }
                          }}
                          className="flex-1 px-6 py-4 bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                          {isArchiving ? (
                            <>
                              <RefreshCw size={18} className="animate-spin" />
                              分析並封存中...
                            </>
                          ) : (
                            "確定封存"
                          )}
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="flex justify-between items-center mb-2">
          <h2 className="text-2xl font-medium text-stone-800 flex items-center gap-2"><SettingsIcon className="w-5 h-5 text-[#8A8278]" />系統參數設定</h2>
          <button
            disabled={isSavingSettings}
            onClick={async () => {
              setIsSavingSettings(true);
              try {
                await onSave(localSettings);
                await savePublicSettings();
                showAlert("設定已儲存！");
              } catch (e) {
                console.error('Save settings failed', e);
                showAlert("儲存失敗，請重試");
              } finally {
                setIsSavingSettings(false);
              }
            }}
            className="bg-[#3F4550] hover:bg-[#2F3540] text-white py-1.5 px-4 rounded-lg font-medium text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-60"
          >
            {isSavingSettings ? <><RefreshCw size={14} className="animate-spin" />儲存中...</> : <><Save size={14} />儲存設定</>}
          </button>
      </div>

      <div className="space-y-4">
        {/* Basic Info */}
        <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
             <div>
                <label className="block text-sm font-medium text-stone-700 mb-2 flex items-center gap-1"><Tag size={14}/> 連線場次名稱</label>
                <input 
                    type="text" 
                    value={localSettings.sessionName || ''} 
                    onChange={(e) => handleChange('sessionName', e.target.value)} 
                    className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:ring-2 focus:ring-[#7A9E8A] outline-none" 
                    placeholder="例如：12月大阪聖誕" 
                />
                <p className="text-xs text-stone-400 mt-1">此名稱會出現在對帳單的標題中。</p>
             </div>
             <hr className="border-stone-100" />
             <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">目前日幣匯率 (成本計算用)</label>
                <input 
                    type="number" 
                    step="0.001" 
                    value={localSettings.jpyExchangeRate} 
                    onChange={(e) => handleChange('jpyExchangeRate', parseFloat(e.target.value))} 
                    className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:ring-2 focus:ring-[#7A9E8A] outline-none" 
                />
             </div>
        </div>

        {/* Category Management */}
        <CollapsibleSection title="商品類別管理" icon={ListFilter} defaultOpen={true}>
            <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                    {localSettings.productCategories.map(cat => (
                        <div key={cat} className="flex items-center gap-1 bg-stone-100 text-stone-700 pl-3 pr-1 py-1.5 rounded-full text-sm border border-stone-200 group">
                            <span className="font-medium">{cat}</span>
                            <button 
                                onClick={() => handleRemoveCategory(cat)}
                                className="p-1 hover:bg-red-500 hover:text-white rounded-full transition-colors text-stone-400"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
                
                <div className="flex gap-2 pt-2 border-t border-stone-100">
                    <input 
                        type="text" 
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                        placeholder="新增自定義類別..."
                        className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-[#7A9E8A] outline-none"
                    />
                    <button 
                        onClick={handleAddCategory}
                        className="bg-[#E5EFEA] text-[#2C2926] border border-[#7A9E8A]/30 px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d4e8dc] transition-colors"
                    >
                        <Plus size={18} />
                    </button>
                </div>
                <p className="text-xs text-stone-400">刪除類別不會刪除已上架的商品，但該商品將會顯示為原有的類別名稱。</p>
            </div>
        </CollapsibleSection>

        {/* Pricing Rules */}
        <CollapsibleSection title="代購匯率/定價規則" icon={AlertCircle}>
            <div className="space-y-3">
              {localSettings.pricingRules.map((rule, idx) => (
                <div key={idx} className="flex gap-4 items-center bg-stone-50 p-3 rounded-lg border border-stone-100">
                    <div className="flex-1">
                        <span className="text-xs text-stone-400 font-medium uppercase tracking-wider block mb-1">日幣金額區間</span>
                        <div className="flex items-center gap-2">
                            <input type="number" value={rule.minPrice} onChange={(e) => handleRuleChange(idx, 'minPrice', Number(e.target.value))} className="w-full px-2 py-1.5 border rounded text-sm bg-white" />
                            <span className="text-stone-400">~</span>
                            <input type="number" value={rule.maxPrice} onChange={(e) => handleRuleChange(idx, 'maxPrice', Number(e.target.value))} className="w-full px-2 py-1.5 border rounded text-sm bg-white" />
                        </div>
                    </div>
                    <div className="w-24">
                        <span className="text-xs text-stone-400 font-medium uppercase tracking-wider block mb-1">乘數/匯率</span>
                        <input type="number" step="0.01" value={rule.multiplier} onChange={(e) => handleRuleChange(idx, 'multiplier', Number(e.target.value))} className="w-full px-2 py-1.5 border rounded font-medium text-[#8A8278] bg-white" />
                    </div>
                </div>
              ))}
              <p className="text-xs text-stone-400 mt-2">系統會根據商品的日幣價格自動匹配區間並計算台幣售價。</p>
            </div>
        </CollapsibleSection>

        {/* Gacha Pricing Rules */}
        <CollapsibleSection title="扭蛋專屬定價設定" icon={Tag}>
            <div className="space-y-3">
              {(localSettings.gachaPricingRules || []).map((rule, idx) => (
                <div key={idx} className="flex gap-4 items-center bg-stone-50 p-3 rounded-lg border border-stone-100">
                    <div className="flex-1">
                        <span className="text-xs text-stone-400 font-medium uppercase tracking-wider block mb-1">扭蛋日幣金額 (¥)</span>
                        <input type="number" value={rule.jpy} onChange={(e) => {
                            const newRules = [...(localSettings.gachaPricingRules || [])];
                            newRules[idx].jpy = Number(e.target.value);
                            handleChange('gachaPricingRules', newRules);
                        }} className="w-full px-2 py-1.5 border rounded text-sm bg-white" />
                    </div>
                    <div className="flex-1">
                        <span className="text-xs text-stone-400 font-medium uppercase tracking-wider block mb-1">台幣售價 (NT$)</span>
                        <input type="number" value={rule.twd} onChange={(e) => {
                            const newRules = [...(localSettings.gachaPricingRules || [])];
                            newRules[idx].twd = Number(e.target.value);
                            handleChange('gachaPricingRules', newRules);
                        }} className="w-full px-2 py-1.5 border rounded font-medium text-[#8A8278] bg-white" />
                    </div>
                    <button 
                        onClick={() => {
                            const newRules = (localSettings.gachaPricingRules || []).filter((_, i) => i !== idx);
                            handleChange('gachaPricingRules', newRules);
                        }}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg mt-4"
                    >
                        <X size={16} />
                    </button>
                </div>
              ))}
              <button 
                  onClick={() => {
                      const newRules = [...(localSettings.gachaPricingRules || []), { jpy: 0, twd: 0 }];
                      handleChange('gachaPricingRules', newRules);
                  }}
                  className="w-full py-2 border-2 border-dashed border-stone-200 text-stone-500 rounded-lg font-medium text-sm hover:bg-stone-50 hover:border-stone-300 transition-colors flex items-center justify-center gap-2"
              >
                  <Plus size={16} /> 新增扭蛋定價
              </button>
              <p className="text-xs text-stone-400 mt-2">在「快速扭蛋」功能中，會根據此處設定的日幣金額提供快速按鈕與對應台幣售價。</p>
            </div>
        </CollapsibleSection>

        {/* AI Settings */}
        <CollapsibleSection title="AI 功能設定" icon={Cloud}>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-stone-700 mb-2 flex items-center gap-1">
                        Gemini API 金鑰
                    </label>
                    <input 
                        type="password" 
                        value={localSettings.geminiApiKey || ''} 
                        onChange={(e) => handleChange('geminiApiKey', e.target.value)} 
                        className="w-full px-4 py-2.5 border border-stone-300 rounded-lg focus:ring-2 focus:ring-[#7A9E8A] outline-none" 
                        placeholder="在此輸入您的 Gemini API Key" 
                    />
                    <p className="text-xs text-stone-400 mt-2 leading-relaxed">
                        用於「快速扭蛋」的 AI 辨圖功能。若未設定，辨圖可能會因額度限制而失敗。
                        您可以前往 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[#8A8278] underline">Google AI Studio</a> 免費申請。
                    </p>
                </div>
            </div>
        </CollapsibleSection>

        {/* Shipping & Billing */}
        <CollapsibleSection title="運費與結帳設定" icon={SettingsIcon}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-medium text-stone-400 mb-1">一般運費</label>
                <input type="number" value={localSettings.shippingFee} onChange={(e) => handleChange('shippingFee', Number(e.target.value))} className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm" />
            </div>
            <div>
                <label className="block text-xs font-medium text-stone-400 mb-1">免運門檻</label>
                <input type="number" value={localSettings.freeShippingThreshold} onChange={(e) => handleChange('freeShippingThreshold', Number(e.target.value))} className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm" />
            </div>
            <div className="md:col-span-2">
                <label className="block text-xs font-medium text-stone-400 mb-1">賣貨便最低支付 (取貨金)</label>
                <input type="number" value={localSettings.pickupPayment} onChange={(e) => handleChange('pickupPayment', Number(e.target.value))} className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm" />
                <p className="text-xs text-stone-400 mt-1">預設為 20 元 (依賣貨便規定之包裹最低金額)。</p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Message Template */}
        <CollapsibleSection title="對帳訊息模版" icon={MessageSquare}>
             <div>
                <p className="text-xs text-stone-400 mb-2">可用變數：{"{{sessionName}}, {{name}}, {{items}}, {{subtotal}}, {{remittance}}"}</p>
                <textarea 
                    value={localSettings.billingMessageTemplate} 
                    onChange={(e) => handleChange('billingMessageTemplate', e.target.value)} 
                    className="w-full h-64 p-3 border border-stone-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-[#7A9E8A] outline-none leading-relaxed" 
                />
             </div>
        </CollapsibleSection>
      </div>

      {/* 快速下單設定 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mt-6">
        <h2 className="text-xl font-medium text-stone-800 mb-1 flex items-center gap-2">
          <Zap className="w-6 h-6 text-[#06C755]" />LINE 快速下單設定
        </h2>
        <p className="text-xs text-stone-400 mb-4">綁定後可在現場直接傳訊息給官方 LINE 帳號建立訂單，例如：「Amy 龍角散抹茶 2」</p>

        {/* 步驟說明 */}
        <div className="bg-[#f0faf4] border border-[#c3e6d0] rounded-xl p-4 mb-4 text-sm text-[#2C6E45] space-y-1">
          <p className="font-semibold mb-2">📲 如何啟用快速下單？</p>
          <p>① 用你的個人 LINE 私訊官方帳號（<span className="font-mono font-bold">@483ueusy</span>）</p>
          <p>② 傳送訊息：<span className="font-mono bg-white/70 px-1.5 py-0.5 rounded font-bold">!setup</span></p>
          <p>③ 回到這頁點「確認是我」完成綁定</p>
        </div>

        {/* 待確認（5 分鐘有效期） */}
        {pendingLineUserId && pendingLineUserIdAt !== null && (Date.now() - pendingLineUserIdAt) < BINDING_EXPIRY_MS && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
            <UserCheck size={18} className="text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">有新的綁定申請！</p>
              <p className="text-xs text-amber-600 font-mono truncate mt-0.5">{pendingLineUserId}</p>
            </div>
            <button
              onClick={handleConfirmAdminLine}
              disabled={isConfirming}
              className="px-3 py-1.5 bg-[#06C755] text-white text-xs font-semibold rounded-lg disabled:opacity-60 shrink-0"
            >
              {isConfirming ? '處理中…' : '確認是我'}
            </button>
          </div>
        )}

        {/* 已綁定 */}
        {adminLineUserIds.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-stone-500 mb-1">已綁定的管理員 LINE</p>
            {adminLineUserIds.map(uid => (
              <div key={uid} className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                <CheckCircle2 size={14} className="text-[#06C755] shrink-0" />
                <span className="text-xs font-mono text-stone-600 flex-1 truncate">{uid}</span>
                <button onClick={() => handleRemoveAdminLine(uid)} className="p-1 text-stone-300 hover:text-rose-400 transition-colors">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : !(pendingLineUserId && pendingLineUserIdAt !== null && (Date.now() - pendingLineUserIdAt) < BINDING_EXPIRY_MS) && (
          <p className="text-xs text-stone-400 text-center py-2">尚未綁定任何管理員 LINE</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mt-6">
        <h2 className="text-xl font-medium text-stone-800 mb-4 flex items-center gap-2"><Archive className="w-6 h-6 text-amber-500" />場次結算與管理</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <h3 className="font-medium text-[#2C2926] mb-2 text-sm">訂單數據匯出</h3>
                <button onClick={onExport} className="w-full bg-white text-[#8A8278] border border-blue-200 font-medium py-2.5 rounded-lg text-xs hover:bg-white/80 shadow-sm transition-all mb-2">
                    下載 Excel (CSV)
                </button>
                <p className="text-xs text-[#8A8278]/70">僅匯出本次連線的有效訂單資料。</p>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
                <h3 className="font-medium text-stone-800 mb-2 text-sm flex items-center gap-1"><Database size={16}/> 完整資料備份</h3>
                <button onClick={handleExportAllData} className="w-full bg-white text-stone-700 border border-stone-300 font-medium py-2.5 rounded-lg text-xs hover:bg-stone-50 shadow-sm transition-all mb-2">
                    下載完整備份檔 (.json)
                </button>
                <p className="text-xs text-stone-500">包含所有商品、客人、歷史訂單與系統設定，建議在重大更新前備份。</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 md:col-span-2">
                <h3 className="font-medium text-amber-800 mb-2 text-sm">結束本次連線</h3>
                <button onClick={() => setArchiveConfirm(true)} className="w-full bg-amber-500 text-white font-medium py-2.5 rounded-lg text-xs hover:bg-amber-600 shadow-md transition-all active:scale-95">
                    結算並封存場次
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
