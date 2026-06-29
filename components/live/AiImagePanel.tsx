import React from 'react';
import { Plus, X, Wand2, Camera, Check, Package, Crop } from 'lucide-react';
import { Product, Customer, Order } from '../../types';
import { AiImagePanelProps, GachaResult, GachaCustomerItem } from './liveTypes';
import { generateId, DEFAULT_GACHA_IMAGE } from './liveUtils';
import { showAlert } from '../../App';
import { analyzeGachaImage } from '../../services/geminiService';
import { compressImage, getHighQualityBase64 } from '../../utils/imageUtils';
import { cropImage } from './liveUtils';

export const AiImagePanel: React.FC<AiImagePanelProps> = ({
  products, customers, settings, onAddProduct, onAddOrder, onUpdateSettings,
  isGachaModalOpen, setIsGachaModalOpen,
  gachaMode, setGachaMode,
  gachaImage, setGachaImage,
  gachaResults, setGachaResults,
  isAnalyzing, setIsAnalyzing,
  reanalyzingIndex, setReanalyzingIndex,
  gachaCustomers, setGachaCustomers,
  setCropImageSrc, setCropTarget,
}) => {

  const handleGachaImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsAnalyzing(true);

    try {
      const fileArray = Array.from(files);
      const newResults: GachaResult[] = [];

      for (const file of fileArray) {
        const compressed = await compressImage(file);
        const hqImage = await getHighQualityBase64(file);

        if (fileArray.length === 1) {
          setGachaImage(compressed);
        }

        if (gachaMode === 'ai') {
          try {
            const results = await analyzeGachaImage(hqImage, settings.geminiApiKey);
            if (results && results.length > 0) {
              for (const r of results) {
                let twd = 0;
                const rule = settings.gachaPricingRules?.find(rule => rule.jpy === r.priceJPY);
                if (rule) {
                  twd = rule.twd;
                } else {
                  const generalRule = settings.pricingRules.find(rule => r.priceJPY >= rule.minPrice && r.priceJPY <= rule.maxPrice);
                  if (generalRule) twd = Math.ceil(r.priceJPY * generalRule.multiplier);
                }

                let croppedImage = compressed;
                if (r.box_2d && fileArray.length === 1) {
                  try {
                    croppedImage = await cropImage(compressed, r.box_2d);
                  } catch (cropError) {
                    console.warn('Crop failed, using original image', cropError);
                  }
                }

                newResults.push({ image: croppedImage, name: r.name, priceJPY: r.priceJPY, priceTWD: twd, selected: true });
              }
            }
          } catch (aiError: any) {
            if (aiError.message === 'GEMINI_API_KEY_MISSING') {
              showAlert('AI 辨識失敗：找不到 Gemini API 金鑰。請前往系統設定檢查。');
            } else {
              console.warn('AI analysis failed for one file, adding as unrecognized', aiError);
              newResults.push({ image: compressed, name: '未辨識扭蛋', priceJPY: 300, priceTWD: 100, selected: true });
            }
          }
        } else {
          newResults.push({ image: compressed, name: `扭蛋 #${newResults.length + 1}`, priceJPY: 300, priceTWD: 100, selected: true });
        }
      }

      if (newResults.length > 0) {
        setGachaResults(prev => [...prev, ...newResults]);
      } else if (gachaMode === 'ai') {
        showAlert('AI 無法辨識圖片中的扭蛋，已切換為手動模式');
        setGachaMode('manual');
      }
    } catch (error) {
      console.error('Gacha image upload failed:', error);
      showAlert('圖片處理失敗');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReanalyzeSingleGacha = async (index: number) => {
    const targetGacha = gachaResults[index];
    if (!targetGacha || !targetGacha.image) { showAlert('找不到圖片，無法重新辨識'); return; }
    try {
      setReanalyzingIndex(index);
      const results = await analyzeGachaImage(targetGacha.image, settings.geminiApiKey);
      if (results && results.length > 0) {
        const r = results[0];
        let twd = 0;
        const rule = settings.gachaPricingRules?.find(rule => rule.jpy === r.priceJPY);
        if (rule) { twd = rule.twd; } else {
          const generalRule = settings.pricingRules.find(rule => r.priceJPY >= rule.minPrice && r.priceJPY <= rule.maxPrice);
          if (generalRule) twd = Math.ceil(r.priceJPY * generalRule.multiplier);
        }
        const newResults = [...gachaResults];
        newResults[index] = { ...newResults[index], name: r.name, priceJPY: r.priceJPY, priceTWD: twd };
        setGachaResults(newResults);
        showAlert('✨ 重新辨識成功！');
      } else {
        showAlert('⚠️ AI 仍然無法辨識此圖片，請嘗試重新裁切或手動輸入。');
      }
    } catch (err: any) {
      if (err.message === 'GEMINI_API_KEY_MISSING') {
        showAlert('AI 辨識失敗：找不到 Gemini API 金鑰。請前往系統設定檢查。');
      } else {
        showAlert('⚠️ AI 辨識失敗，請嘗試重新裁切或手動輸入。');
      }
    } finally {
      setReanalyzingIndex(null);
    }
  };

  const handleCreateGacha = async (customersList: GachaCustomerItem[], selectedIndices: number[]) => {
    const validCustomers = customersList.filter(c => c.name.trim() !== '' && c.qty > 0);
    if (selectedIndices.length === 0) { showAlert('請選擇至少一款扭蛋'); return; }

    for (const idx of selectedIndices) {
      const gacha = gachaResults[idx];
      if (!gacha) continue;

      const productId = generateId();
      const rawImage = gacha.image || gachaImage || DEFAULT_GACHA_IMAGE;
      // Upload to Storage instead of saving the raw base64 straight into the
      // product document — keeps Firestore reads fast as the catalog grows.
      let imageUrl = rawImage;
      if (rawImage.startsWith('data:')) {
        try {
          const { uploadProductImage } = await import('../../services/firebaseService');
          imageUrl = await uploadProductImage(rawImage);
        } catch (e) { console.error('Gacha image upload failed', e); }
      }
      const newProduct: Product = {
        id: productId, name: gacha.name, brand: '', sourcingLocations: [],
        priceJPY: gacha.priceJPY, priceTWD: gacha.priceTWD, category: '扭蛋',
        variants: [], imageUrl, isPublished: false,
        createdAt: Date.now()
      };

      if (onUpdateSettings && !settings.productCategories.includes('扭蛋')) {
        onUpdateSettings({ ...settings, productCategories: [...settings.productCategories, '扭蛋'] });
      }
      onAddProduct(newProduct);

      validCustomers.forEach(custData => {
        let customer = customers.find(c => c.lineName === custData.name || c.nickname === custData.name);
        let customerId = customer?.id;
        let newCustomer: Customer | undefined;
        if (!customer) {
          customerId = generateId();
          newCustomer = { id: customerId, lineName: custData.name, nickname: custData.name, isBlacklisted: false, totalSpent: 0, sessionCount: 0 };
        }
        onAddOrder({
          id: generateId(), productId, customerId: customerId!,
          quantity: custData.qty, quantityBought: 0, status: 'PENDING',
          notificationStatus: 'UNNOTIFIED', isArchived: false, timestamp: Date.now(),
          variant: '', keepShell: custData.keepShell
        }, newCustomer);
      });
    }

    showAlert('扭蛋建檔與喊單成功！');
    setIsGachaModalOpen(false);
    setGachaImage(null);
    setGachaResults([]);
    setGachaCustomers([{ name: '', qty: 1, keepShell: false }]);
  };

  if (!isGachaModalOpen) return null;

  const renderGachaResultItem = (result: GachaResult, idx: number) => (
    <div key={idx} className={`p-3 border rounded-xl flex gap-3 relative transition-colors ${result.selected ? 'bg-pink-50/50 border-pink-200' : 'bg-stone-50 border-stone-200'}`}>
      <div className="flex items-center">
        <input type="checkbox" checked={result.selected} onChange={() => { const nr = [...gachaResults]; nr[idx].selected = !nr[idx].selected; setGachaResults(nr); }} className="w-5 h-5 rounded border-stone-300 text-pink-600 focus:ring-pink-500" />
      </div>
      <button onClick={() => setGachaResults(gachaResults.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center hover:bg-red-200 shadow-sm z-10"><X size={12} /></button>
      {result.image && (
        <div className="flex flex-col gap-1 shrink-0">
          <div className="w-16 h-16 rounded-lg overflow-hidden border border-stone-200 relative group">
            <img src={result.image} className="w-full h-full object-cover" alt={result.name} referrerPolicy="no-referrer" loading="lazy" />
            <button onClick={(e) => { e.stopPropagation(); setCropImageSrc(result.image!); setCropTarget({ type: 'gachaResult', index: idx }); }} className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" title="裁切圖片">
              <Crop size={16} />
            </button>
          </div>
          <button onClick={() => handleReanalyzeSingleGacha(idx)} disabled={reanalyzingIndex === idx} className="text-[10px] py-1 px-1 bg-pink-50 text-pink-600 rounded border border-pink-100 hover:bg-pink-100 transition-colors flex items-center justify-center gap-1" title="重新辨識">
            {reanalyzingIndex === idx ? <div className="w-3 h-3 border-2 border-pink-200 border-t-pink-600 rounded-full animate-spin"></div> : <><Wand2 size={10} /> 辨識</>}
          </button>
        </div>
      )}
      <div className="flex-1 space-y-2">
        <input type="text" value={result.name} onChange={e => { const nr = [...gachaResults]; nr[idx].name = e.target.value; setGachaResults(nr); }} className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-500 outline-none" placeholder="扭蛋名稱" />
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs">¥</span>
            <input type="number" value={result.priceJPY} onChange={e => { const nr = [...gachaResults]; nr[idx].priceJPY = Number(e.target.value); const rule = settings.gachaPricingRules?.find(r => r.jpy === nr[idx].priceJPY); if (rule) nr[idx].priceTWD = rule.twd; setGachaResults(nr); }} className="w-full pl-7 pr-3 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-500 outline-none" />
          </div>
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs">NT$</span>
            <input type="number" value={result.priceTWD} onChange={e => { const nr = [...gachaResults]; nr[idx].priceTWD = Number(e.target.value); setGachaResults(nr); }} className="w-full pl-9 pr-3 py-2 border border-stone-200 rounded-lg text-sm text-[#7A9E8A] focus:ring-2 focus:ring-pink-500 outline-none" />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 flex justify-between items-center bg-pink-50/50">
          <h2 className="text-xl flex items-center gap-2 text-pink-600"><Package size={24} /> 快速扭蛋</h2>
          <button onClick={() => { setIsGachaModalOpen(false); setGachaImage(null); setGachaResults([]); }}><X size={24} className="text-stone-400" /></button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Mode toggle */}
          <div className="flex bg-stone-100 p-1 rounded-xl">
            <button onClick={() => setGachaMode('manual')} className={`flex-1 py-2 text-sm rounded-lg transition-colors ${gachaMode === 'manual' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>手動輸入</button>
            <button onClick={() => setGachaMode('ai')} className={`flex-1 py-2 text-sm rounded-lg transition-colors flex items-center justify-center gap-1 ${gachaMode === 'ai' ? 'bg-white text-pink-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
              <Wand2 size={16} /> AI 圖片辨識
            </button>
          </div>

          {/* Image upload */}
          <div>
            <label className="block text-xs text-stone-500 mb-2">上傳扭蛋機照片 (選填，將作為商品圖)</label>
            <div
              className="w-full aspect-video bg-stone-50 border-2 border-dashed border-stone-200 rounded-2xl flex items-center justify-center cursor-pointer hover:bg-stone-100 transition-colors relative overflow-hidden"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
                input.onchange = (e) => handleGachaImageUpload(e as any);
                input.click();
              }}
            >
              {isAnalyzing ? (
                <div className="text-center text-stone-400 flex flex-col items-center">
                  <div className="w-8 h-8 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin mb-2"></div>
                  <p className="text-sm text-pink-600">AI 正在辨識扭蛋...</p>
                </div>
              ) : gachaImage ? (
                <div className="relative w-full h-full group">
                  <img src={gachaImage} className="w-full h-full object-contain p-2" alt="Gacha Preview" referrerPolicy="no-referrer" loading="lazy" />
                  <button onClick={(e) => { e.stopPropagation(); setCropImageSrc(gachaImage); setCropTarget({ type: 'gacha' }); }} className="absolute top-2 right-2 p-2 bg-white/90 text-stone-700 rounded-lg shadow-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs font-medium hover:bg-white z-20">
                    <Crop size={14} /> 裁切
                  </button>
                </div>
              ) : (
                <div className="text-center text-stone-400">
                  <Camera size={40} className="mx-auto mb-2 opacity-50" />
                  <p>點擊拍照或上傳圖片</p>
                  {gachaMode === 'ai' && <p className="text-xs mt-1 text-pink-500">將自動辨識名稱與價格</p>}
                </div>
              )}
            </div>
          </div>

          {/* Manual / AI results */}
          {(gachaMode === 'manual' || (gachaMode === 'ai' && gachaResults.length === 0 && !isAnalyzing)) ? (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {(settings.gachaPricingRules || []).map((rule, idx) => (
                  <button key={idx} onClick={() => setGachaResults([{ image: null, name: `扭蛋 ¥${rule.jpy}`, priceJPY: rule.jpy, priceTWD: rule.twd, selected: true }])} className="px-3 py-2 bg-pink-50 text-pink-700 border border-pink-200 rounded-xl text-sm hover:bg-pink-100 transition-colors">
                    ¥{rule.jpy} (NT${rule.twd})
                  </button>
                ))}
              </div>
              {gachaResults.length > 0 && <div className="space-y-3">{gachaResults.map(renderGachaResultItem)}</div>}
            </div>
          ) : gachaResults.length > 0 ? (
            <div className="space-y-3">
              <label className="block text-xs text-stone-500">AI 辨識結果 (可修改)</label>
              {gachaResults.map(renderGachaResultItem)}
            </div>
          ) : null}

          {/* Customer input */}
          <div className="border-t border-stone-100 pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <label className="block text-xs text-stone-500">客人名稱與數量</label>
              <button onClick={() => setGachaCustomers([...gachaCustomers, { name: '', qty: 1, keepShell: false, searchOpen: false }])} className="text-xs text-[#7A9E8A] flex items-center gap-1 hover:text-[#5C8070]">
                <Plus size={14} /> 新增客人
              </button>
            </div>
            <div className="space-y-2 pr-1">
              {gachaCustomers.map((cust, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <input
                      type="text" placeholder="客人名稱 (如: Amy)" value={cust.name}
                      onChange={e => { const nc = [...gachaCustomers]; nc[idx].name = e.target.value; nc[idx].searchOpen = true; setGachaCustomers(nc); }}
                      onFocus={() => { const nc = [...gachaCustomers]; nc[idx].searchOpen = true; setGachaCustomers(nc); }}
                      onBlur={() => { setTimeout(() => { const nc = [...gachaCustomers]; if (nc[idx]) nc[idx].searchOpen = false; setGachaCustomers(nc); }, 200); }}
                      className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none transition-all ${cust.name ? 'border-pink-500 ring-2 ring-pink-50' : 'border-stone-200 bg-stone-50/30'}`}
                      onKeyDown={e => { if (e.key === 'Enter' && idx === gachaCustomers.length - 1 && cust.name && gachaResults.length > 0) { handleCreateGacha(gachaCustomers, gachaResults.map((_, i) => i)); } }}
                    />
                    {cust.searchOpen && cust.name && (
                      <div className="absolute top-full left-0 w-full bg-white border border-stone-200 shadow-xl rounded-xl z-50 mt-1 max-h-48 overflow-y-auto">
                        {customers.filter(c => c.lineName.toLowerCase().includes(cust.name.toLowerCase()) || c.nickname?.toLowerCase().includes(cust.name.toLowerCase())).map(c => (
                          <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-pink-50 border-b border-stone-100 last:border-0 flex items-center gap-3 transition-colors" onClick={() => { const nc = [...gachaCustomers]; nc[idx].name = c.lineName; nc[idx].searchOpen = false; setGachaCustomers(nc); }}>
                            <div className="w-8 h-8 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xs shrink-0">{c.lineName[0]}</div>
                            <div className="text-stone-700 text-xs truncate">{c.lineName} {c.nickname ? `(${c.nickname})` : ''}</div>
                          </button>
                        ))}
                        {customers.filter(c => c.lineName.toLowerCase().includes(cust.name.toLowerCase()) || c.nickname?.toLowerCase().includes(cust.name.toLowerCase())).length === 0 && (
                          <div className="px-3 py-3 text-sm text-stone-500 italic text-center">無符合的顧客，將自動建立新顧客</div>
                        )}
                      </div>
                    )}
                  </div>
                  <input type="number" value={cust.qty} onChange={e => { const nc = [...gachaCustomers]; nc[idx].qty = Number(e.target.value) || 1; setGachaCustomers(nc); }} min={1} className="w-16 px-2 py-2 border border-stone-200 rounded-xl text-sm text-center focus:ring-2 focus:ring-pink-500 outline-none" />
                  <button onClick={() => { const nc = [...gachaCustomers]; nc[idx].keepShell = !nc[idx].keepShell; setGachaCustomers(nc); }} className={`px-2 py-2 rounded-xl text-xs border transition-colors whitespace-nowrap ${cust.keepShell ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'}`}>留殼</button>
                  {gachaCustomers.length > 1 && (
                    <button onClick={() => setGachaCustomers(gachaCustomers.filter((_, i) => i !== idx))} className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg"><X size={16} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 bg-stone-100">
          <button
            onClick={() => { const selectedIndices = gachaResults.map((r, i) => r.selected ? i : -1).filter(i => i !== -1); handleCreateGacha(gachaCustomers, selectedIndices); }}
            disabled={gachaResults.length === 0 || !gachaResults.some(r => r.selected)}
            className={`w-full py-3 rounded-xl text-sm shadow-lg flex items-center justify-center gap-2 ${gachaResults.length === 0 || !gachaResults.some(r => r.selected) ? 'bg-stone-300 text-stone-500 cursor-not-allowed' : 'bg-pink-600 text-white hover:bg-pink-700'}`}
          >
            <Check size={18} /> 建立扭蛋並錄入喊單
          </button>
        </div>
      </div>
    </div>
  );
};
