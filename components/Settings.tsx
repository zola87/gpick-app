
import React, { useState, useEffect, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { GlobalSettings, Product, Customer, Order, TodoItem } from '../types';
import { showAlert } from '../App';
import { Save, Settings as SettingsIcon, Plus, X, Archive, AlertCircle, Download, ChevronDown, ChevronRight, MessageSquare, Tag, ListFilter, Layers, Cloud, Database, RefreshCw, Send, Loader2, Camera } from 'lucide-react';
import { initFirebase, db, broadcastCheckoutOpen, uploadProductImage } from '../services/firebaseService';
import { compressImage } from '../utils/imageUtils';

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
  // settings arrives async from the cloud (and may still be the local default on
  // first mount) — re-sync local form state whenever the real value lands, so we
  // never save stale/default data back over the customer's real cloud settings.
  const hasUnsavedEdits = useRef(false);
  useEffect(() => {
    if (!hasUnsavedEdits.current) setLocalSettings(settings);
  }, [settings]);
  const [newCategory, setNewCategory] = useState('');
  const [newCategoryGroup, setNewCategoryGroup] = useState('');

  // Categories actually used by existing products but missing from the current list
  // (e.g. lost after a settings overwrite) — surfaced here so they're easy to restore.
  const orphanCategories = Array.from(new Set(
    currentData.products.map(p => p.category).filter(Boolean)
  )).filter(cat => !localSettings.productCategories.includes(cat));

  const handleRestoreOrphanCategories = () => {
    hasUnsavedEdits.current = true;
    setLocalSettings(prev => ({
      ...prev,
      productCategories: [...prev.productCategories, ...orphanCategories],
    }));
  };

  // All brand values actually in use, for the 大分類管理 brand-toggle picker below.
  const allBrands = Array.from(new Set(
    currentData.products.map(p => p.brand).filter(Boolean) as string[]
  )).sort();

  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [broadcastConfirm, setBroadcastConfirm] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const handleChange = (field: keyof GlobalSettings, value: any) => { hasUnsavedEdits.current = true; setLocalSettings(prev => ({ ...prev, [field]: value })); };

  // 本場扭蛋牆照片 — 跟商品照片用同一套上傳機制，存到 Storage 換成短網址，不直接存 base64
  const [isUploadingGachaWall, setIsUploadingGachaWall] = useState(false);
  const handleUploadGachaWallImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploadingGachaWall(true);
    try {
      const urls = await Promise.all(Array.from(files).map(async f => uploadProductImage(await compressImage(f))));
      handleChange('gachaWallImages', [...(localSettings.gachaWallImages || []), ...urls]);
    } catch {
      showAlert('照片上傳失敗，請重試');
    } finally {
      setIsUploadingGachaWall(false);
    }
  };

  const handleRuleChange = (index: number, field: string, value: number) => {
    hasUnsavedEdits.current = true;
    const newRules = localSettings.pricingRules.map((r, i) =>
      i === index ? { ...r, [field]: value } : r
    );
    setLocalSettings(prev => ({ ...prev, pricingRules: newRules }));
  };

  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    if (trimmed && !localSettings.productCategories.includes(trimmed)) {
        hasUnsavedEdits.current = true;
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
      hasUnsavedEdits.current = true;
      setLocalSettings(prev => ({
          ...prev,
          productCategories: prev.productCategories.filter(c => c !== catToRemove)
      }));
  };

  // ── 大分類 (category groups) — purely a display/filter grouping over the
  // existing small categories; doesn't touch what's stored on each product.
  const handleAddCategoryGroup = () => {
      const trimmed = newCategoryGroup.trim();
      if (!trimmed) return;
      if ((localSettings.categoryGroups || []).some(g => g.name === trimmed)) {
          showAlert('已經有這個大分類了');
          return;
      }
      hasUnsavedEdits.current = true;
      setLocalSettings(prev => ({
          ...prev,
          categoryGroups: [...(prev.categoryGroups || []), { name: trimmed, categories: [] }]
      }));
      setNewCategoryGroup('');
  };

  const handleRemoveCategoryGroup = (groupName: string) => {
      hasUnsavedEdits.current = true;
      setLocalSettings(prev => ({
          ...prev,
          categoryGroups: (prev.categoryGroups || []).filter(g => g.name !== groupName)
      }));
  };

  // 把「類別」或「品牌」納入大分類成員，讓同一個商品可以同時透過兩條路徑出現在不同的
  // 大分類底下（例如皮克敏軟糖：類別=零食、品牌=皮克敏，可以同時在「零食」跟「任天堂」
  // 底下被看到）。類別/品牌兩種開關只有欄位名稱不同，共用同一段勾選/取消邏輯。
  const handleToggleGroupMember = (groupName: string, field: 'categories' | 'brands', value: string) => {
      hasUnsavedEdits.current = true;
      setLocalSettings(prev => ({
          ...prev,
          categoryGroups: (prev.categoryGroups || []).map(g => {
              if (g.name !== groupName) return g;
              const current = g[field] || [];
              return { ...g, [field]: current.includes(value) ? current.filter(v => v !== value) : [...current, value] };
          })
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
      bankAccounts: localSettings.bankAccounts || [],
      shopeeOrderLink: localSettings.shopeeOrderLink || '',
      categoryGroups: localSettings.categoryGroups || [],
      gachaWallImages: localSettings.gachaWallImages || [],
    });
  };

  const handleBroadcastCheckoutOpen = async () => {
    setIsBroadcasting(true);
    try {
      const updated = { ...localSettings, checkoutEnabled: true };
      setLocalSettings(updated);
      await onSave(updated);
      hasUnsavedEdits.current = false;
      if (db) {
        await setDoc(doc(db, 'settings', 'public'), {
          sessionName: updated.sessionName || '',
          shippingFee: updated.shippingFee,
          freeShippingThreshold: updated.freeShippingThreshold,
          pickupPayment: updated.pickupPayment,
          checkoutEnabled: true,
          bankAccounts: updated.bankAccounts || [],
          shopeeOrderLink: updated.shopeeOrderLink || '',
          categoryGroups: updated.categoryGroups || [],
          gachaWallImages: updated.gachaWallImages || [],
        });
      }
      const result = await broadcastCheckoutOpen();
      if (result.success) {
        showAlert(`已開放結帳並推播給 ${result.sent ?? 0} 位客人！`);
      } else {
        showAlert(`推播失敗：${result.error || '未知錯誤'}`);
      }
    } catch (e) {
      console.error('broadcast checkout open failed', e);
      showAlert('推播失敗，請重試');
    } finally {
      setIsBroadcasting(false);
      setBroadcastConfirm(false);
    }
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

      {/* Broadcast Checkout Open Confirmation Modal */}
      {broadcastConfirm && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
                  <div className="text-center">
                      <div className="w-16 h-16 bg-[#e8f8ee] text-[#06C755] rounded-full flex items-center justify-center mx-auto mb-4">
                          <Send size={28} />
                      </div>
                      <h3 className="text-xl font-medium text-stone-800 mb-2">確定要開放結帳並推播給所有客人嗎？</h3>
                      <p className="text-stone-500 text-sm leading-relaxed">
                          每位已連結 LINE 的客人都會收到一則訊息（已買到清單＋匯款帳號），送出後無法收回，請確認商品狀態都已確認無誤。
                      </p>
                  </div>
                  <div className="flex border-t border-stone-100">
                      <button
                          disabled={isBroadcasting}
                          onClick={() => setBroadcastConfirm(false)}
                          className="flex-1 px-6 py-4 text-stone-500 font-medium hover:bg-stone-50 transition-colors disabled:opacity-50"
                      >
                          取消
                      </button>
                      <button
                          disabled={isBroadcasting}
                          onClick={handleBroadcastCheckoutOpen}
                          className="flex-1 px-6 py-4 bg-[#06C755] text-white font-medium hover:bg-[#05a847] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                          {isBroadcasting ? (
                            <>
                              <Loader2 size={18} className="animate-spin" />
                              推播中...
                            </>
                          ) : (
                            "確定推播"
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
                hasUnsavedEdits.current = false;
                showAlert("設定已儲存！");
              } catch (e: any) {
                console.error('Save settings failed', e);
                showAlert(`儲存失敗：${e?.code || e?.message || '請重試'}`);
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

        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider px-1 pt-2">📦 商品與分類</p>
        {/* Category Management */}
        <CollapsibleSection title="商品類別管理" icon={ListFilter} defaultOpen={true}>
            <div className="space-y-4">
                {orphanCategories.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs text-amber-700">
                      偵測到 {orphanCategories.length} 個類別有商品在用，但不在下面的清單裡：
                      <span className="font-semibold">{orphanCategories.join('、')}</span>
                    </p>
                    <button
                      onClick={handleRestoreOrphanCategories}
                      className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors"
                    >
                      一鍵補回清單
                    </button>
                  </div>
                )}
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

        {/* Category Groups (大分類) */}
        <CollapsibleSection title="大分類管理" icon={Layers}>
            <div className="space-y-4">
                <p className="text-xs text-stone-400">
                    把「類別」或「品牌」勾選到同一個大分類底下，客人頁面會先選大分類，再依品牌細分。
                    同一個商品只要類別或品牌符合，就會同時出現在對應的大分類裡（例如類別是零食、品牌是皮克敏的商品，
                    可以同時在「零食」跟「任天堂」兩個大分類底下被看到）。沒被歸類的會自動顯示在「其他」，不會消失。
                </p>

                {(localSettings.categoryGroups || []).map(group => (
                    <div key={group.name} className="bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-sm text-stone-700">{group.name}</span>
                            <button onClick={() => handleRemoveCategoryGroup(group.name)} className="p-1 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <X size={14} />
                            </button>
                        </div>
                        <div>
                            <p className="text-[11px] text-stone-400 mb-1">依類別</p>
                            <div className="flex flex-wrap gap-1.5">
                                {localSettings.productCategories.map(cat => {
                                    const active = group.categories.includes(cat);
                                    return (
                                        <button
                                            key={cat}
                                            onClick={() => handleToggleGroupMember(group.name, 'categories', cat)}
                                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-[#7A9E8A] text-white border-[#7A9E8A]' : 'bg-white text-stone-500 border-stone-200 hover:border-[#7A9E8A]/50'}`}
                                        >
                                            {cat}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        {allBrands.length > 0 && (
                            <div>
                                <p className="text-[11px] text-stone-400 mb-1">依品牌</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {allBrands.map(brand => {
                                        const active = (group.brands || []).includes(brand);
                                        return (
                                            <button
                                                key={brand}
                                                onClick={() => handleToggleGroupMember(group.name, 'brands', brand)}
                                                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-[#E8A87C] text-white border-[#E8A87C]' : 'bg-white text-stone-500 border-stone-200 hover:border-[#E8A87C]/50'}`}
                                            >
                                                {brand}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                <div className="flex gap-2 pt-2 border-t border-stone-100">
                    <input
                        type="text"
                        value={newCategoryGroup}
                        onChange={(e) => setNewCategoryGroup(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCategoryGroup()}
                        placeholder="新增大分類，例如：藥妝美容"
                        className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-[#7A9E8A] outline-none"
                    />
                    <button
                        onClick={handleAddCategoryGroup}
                        className="bg-[#E5EFEA] text-[#2C2926] border border-[#7A9E8A]/30 px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d4e8dc] transition-colors"
                    >
                        <Plus size={18} />
                    </button>
                </div>
            </div>
        </CollapsibleSection>

        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider px-1 pt-2">💰 定價規則</p>
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

        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider px-1 pt-2">🎰 扭蛋專區</p>
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

        {/* 本場扭蛋牆照片 */}
        <CollapsibleSection title="本場扭蛋牆照片" icon={Camera}>
            <div className="space-y-3">
                <p className="text-xs text-stone-400">
                    現場拍機台的照片直接上傳這裡，客人商品頁會出現一個「本場扭蛋牆」入口讓他們瀏覽，
                    跟丟到 LINE 社群是同一批照片，不用另外整理、不用命名。換場次時這裡會自動清空。
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {(localSettings.gachaWallImages || []).map((url, idx) => (
                        <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-stone-200 group">
                            <img src={url} className="w-full h-full object-cover" alt={`扭蛋牆 ${idx + 1}`} referrerPolicy="no-referrer" loading="lazy" />
                            <button
                                onClick={() => handleChange('gachaWallImages', (localSettings.gachaWallImages || []).filter(u => u !== url))}
                                className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                            ><X size={18} /></button>
                        </div>
                    ))}
                    <label className="aspect-square rounded-lg border-2 border-dashed border-stone-300 flex items-center justify-center cursor-pointer text-stone-400 hover:border-[#7A9E8A] hover:text-[#7A9E8A] transition-colors">
                        {isUploadingGachaWall ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                        <input
                            type="file" accept="image/*" multiple className="hidden"
                            onChange={e => { handleUploadGachaWallImages(e.target.files); e.target.value = ''; }}
                        />
                    </label>
                </div>
            </div>
        </CollapsibleSection>

        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider px-1 pt-2">💳 結帳與訊息</p>
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
            <div className="md:col-span-2">
                <label className="block text-xs font-medium text-stone-400 mb-1">匯款銀行帳號 (顯示給客人)</label>
                <p className="text-xs text-stone-400 mb-2">
                    可以設定多組帳號，客人會依照固定規則自動分配到同一組（同一個客人每次都一樣），
                    把匯款量分散到不同帳戶。客戶管理頁可以幫個別客人指定要用哪一組（例如同行轉帳免手續費）。
                </p>
                <div className="space-y-2">
                    {(localSettings.bankAccounts || []).map((bank, idx) => (
                        <div key={bank.id} className="flex gap-2 items-center bg-stone-50 p-2.5 rounded-lg border border-stone-100">
                            <input
                                type="text" value={bank.label} placeholder="銀行名稱，例如：國泰世華"
                                onChange={(e) => {
                                    const next = [...(localSettings.bankAccounts || [])];
                                    next[idx] = { ...next[idx], label: e.target.value };
                                    handleChange('bankAccounts', next);
                                }}
                                className="w-32 shrink-0 px-2 py-1.5 border rounded text-sm bg-white"
                            />
                            <input
                                type="text" value={bank.account} placeholder="(013) 1234-5678-9012"
                                onChange={(e) => {
                                    const next = [...(localSettings.bankAccounts || [])];
                                    next[idx] = { ...next[idx], account: e.target.value };
                                    handleChange('bankAccounts', next);
                                }}
                                className="flex-1 px-2 py-1.5 border rounded text-sm bg-white"
                            />
                            <button
                                onClick={() => handleChange('bankAccounts', (localSettings.bankAccounts || []).filter((_, i) => i !== idx))}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                            ><X size={16} /></button>
                        </div>
                    ))}
                    <button
                        onClick={() => handleChange('bankAccounts', [...(localSettings.bankAccounts || []), { id: `bank_${Date.now()}`, label: '', account: '' }])}
                        className="w-full py-2 border-2 border-dashed border-stone-200 text-stone-500 rounded-lg font-medium text-sm hover:bg-stone-50 hover:border-stone-300 transition-colors flex items-center justify-center gap-2"
                    ><Plus size={16} /> 新增一組匯款帳號</button>
                </div>
            </div>
            <div className="md:col-span-2">
                <label className="block text-xs font-medium text-stone-400 mb-1">賣貨便本場連線連結 (匯款確認後推播給客人)</label>
                <input type="text" value={localSettings.shopeeOrderLink || ''} onChange={(e) => handleChange('shopeeOrderLink', e.target.value)} placeholder="https://shopee.tw/..." className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm" />
            </div>
            <div className="md:col-span-2 flex items-center justify-between bg-stone-50 border border-stone-200 rounded-lg p-4">
                <div className="pr-4">
                    <p className="text-sm font-medium text-stone-700">開放客人匯款結帳</p>
                    <p className="text-xs text-stone-400 mt-0.5">關閉時客人端會顯示「結帳功能尚未開放」。連線進行中建議保持關閉，回國確認商品都買到後再開啟。</p>
                </div>
                <button
                    type="button"
                    onClick={() => handleChange('checkoutEnabled', !localSettings.checkoutEnabled)}
                    className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${localSettings.checkoutEnabled ? 'bg-[#7A9E8A]' : 'bg-stone-300'}`}
                >
                    <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${localSettings.checkoutEnabled ? 'translate-x-5' : ''}`} />
                </button>
            </div>
            <div className="md:col-span-2 bg-[#f0faf4] border border-[#c3e6d0] rounded-lg p-4">
                <p className="text-sm font-medium text-[#2C6E45] mb-1">回國結算：開放結帳並通知所有客人</p>
                <p className="text-xs text-[#2C6E45]/70 mb-3 leading-relaxed">確認商品都買到後按下這個鍵：會自動開放結帳，並依本場訂單狀況推播 LINE 訊息給每位已連結的客人（已買到清單＋匯款帳號；沒買到的會自動保留至下次連線）。</p>
                <button
                    type="button"
                    onClick={() => setBroadcastConfirm(true)}
                    className="w-full py-2.5 bg-[#06C755] text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#05a847] transition-colors"
                >
                    <Send size={14} />開放結帳並推播通知
                </button>
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

        {/* Bought Notification Template */}
        <CollapsibleSection title="買到通知訊息模版" icon={MessageSquare}>
             <div>
                <p className="text-xs text-stone-400 mb-2">客人商品買到時，按「通知客人」傳送的 LINE 訊息。可用變數：{"{{sessionName}}, {{name}}, {{items}}"}</p>
                <textarea
                    value={localSettings.boughtNotificationTemplate || ''}
                    onChange={(e) => handleChange('boughtNotificationTemplate', e.target.value)}
                    className="w-full h-48 p-3 border border-stone-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-[#7A9E8A] outline-none leading-relaxed"
                />
             </div>
        </CollapsibleSection>

        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider px-1 pt-2">🤖 AI 功能</p>
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
