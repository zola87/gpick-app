
import React, { useState, useRef } from 'react';
import { TodoItem } from '../types';
import { showAlert } from '../App';
import { CheckSquare, Square, Trash2, Plus, Sparkles, Store, ShoppingBag, ClipboardList, Image as ImageIcon, X, Eye, ExternalLink, Link as LinkIcon, MapPin } from 'lucide-react';
import { compressImage } from '../utils/imageUtils';

interface TodoListProps {
  todos: TodoItem[];
  onAddTodo: (item: TodoItem) => Promise<void> | void; // Allow async return
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

export const TodoList: React.FC<TodoListProps> = ({ todos, onAddTodo, onToggleTodo, onDeleteTodo }) => {
  const [newInputs, setNewInputs] = useState({
    WISH: '',
    STORE: '',
    PERSONAL: ''
  });
  
  // Image State
  const [tempImages, setTempImages] = useState<{ [key: string]: string | null }>({
      WISH: null,
      STORE: null,
      PERSONAL: null
  });

  // Link State
  const [tempLinks, setTempLinks] = useState<{ [key: string]: string | null }>({
      WISH: null,
      STORE: null,
      PERSONAL: null
  });
  
  // Modals State
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [activeLinkInputCategory, setActiveLinkInputCategory] = useState<TodoItem['category'] | null>(null);
  const [tempLinkInput, setTempLinkInput] = useState('');

  // State for Mobile Tabs
  const [activeTab, setActiveTab] = useState<TodoItem['category']>('WISH');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadCategory, setActiveUploadCategory] = useState<TodoItem['category'] | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0] && activeUploadCategory) {
          try {
              const file = e.target.files[0];
              const compressed = await compressImage(file);
              setTempImages(prev => ({ ...prev, [activeUploadCategory]: compressed }));
          } catch (err) {
              console.error("Image compression failed", err);
              showAlert("圖片處理失敗，請重試");
          }
      }
      // Reset input so same file can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerFileUpload = (category: TodoItem['category']) => {
      setActiveUploadCategory(category);
      fileInputRef.current?.click();
  };

  const openLinkModal = (category: TodoItem['category']) => {
      setTempLinkInput(tempLinks[category] || '');
      setActiveLinkInputCategory(category);
  };

  const saveLink = () => {
      if (activeLinkInputCategory) {
          setTempLinks(prev => ({ ...prev, [activeLinkInputCategory]: tempLinkInput.trim() || null }));
          setActiveLinkInputCategory(null);
          setTempLinkInput('');
      }
  };

  const handleAdd = async (category: TodoItem['category']) => {
    if (!newInputs[category].trim() || isAdding) return;
    
    setIsAdding(true);
    try {
        await onAddTodo({
          id: generateId(),
          content: newInputs[category],
          imageUrl: tempImages[category] || undefined,
          linkUrl: tempLinks[category] || undefined,
          category,
          isCompleted: false,
          createdAt: Date.now()
        });

        // Only clear if successful
        setNewInputs(prev => ({ ...prev, [category]: '' }));
        setTempImages(prev => ({ ...prev, [category]: null }));
        setTempLinks(prev => ({ ...prev, [category]: null }));
    } catch (e) {
        console.error("Add Todo Error", e);
        // Error alert is handled in App.tsx, but we keep the input here so user doesn't lose it
    } finally {
        setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, category: TodoItem['category']) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleAdd(category);
    }
  };

  const renderSection = (title: string, category: TodoItem['category'], icon: React.ReactNode, colorClass: string, bgClass: string) => {
    const items = todos.filter(t => t.category === category).sort((a, b) => {
        if (a.isCompleted === b.isCompleted) return b.createdAt - a.createdAt;
        return a.isCompleted ? 1 : -1;
    });

    const hasTempImage = !!tempImages[category];
    const hasTempLink = !!tempLinks[category];

    // UPDATED: Use explicit height calculation for desktop [calc(100vh-160px)] instead of h-full
    // This ensures internal scrolling works correctly even if parent height is not constrained
    return (
      <div className={`bg-white rounded-2xl shadow-sm border border-slate-100/80 flex flex-col md:h-[calc(100vh-160px)] md:overflow-hidden min-h-[60vh] md:min-h-0`}>
        <div className={`px-4 py-3 border-b border-slate-100 flex items-center gap-2.5 ${bgClass}`}>
          <div className={`p-1.5 rounded-xl bg-white/80 ${colorClass}`}>
            {icon}
          </div>
          <h3 className="font-semibold text-sm text-slate-700">{title}</h3>
          <span className="ml-auto text-[11px] font-semibold bg-white/70 px-2 py-0.5 rounded-full text-slate-500">
            {items.filter(i => !i.isCompleted).length} 待辦
          </span>
        </div>

        <div className="p-2.5 border-b border-slate-100 bg-slate-50/60">
          <div className="flex gap-2">
            <div className="flex-1 relative">
                <input
                    type="text"
                    value={newInputs[category]}
                    onChange={(e) => setNewInputs(prev => ({ ...prev, [category]: e.target.value }))}
                    onKeyDown={(e) => handleKeyDown(e, category)}
                    placeholder="新增記事..."
                    disabled={isAdding}
                    className={`w-full px-3 py-2 border border-slate-200/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 shadow-sm ${hasTempImage ? 'pl-9' : ''} ${isAdding ? 'opacity-50' : ''}`}
                />
                {hasTempImage && (
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded overflow-hidden border border-stone-300">
                        <img src={tempImages[category]!} className="w-full h-full object-cover" alt="Preview" referrerPolicy="no-referrer" loading="lazy" />
                    </div>
                )}
                {hasTempImage && (
                    <button 
                        type="button"
                        onClick={() => setTempImages(prev => ({...prev, [category]: null}))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-red-500 bg-white rounded-full p-0.5"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>
            
            <button
              type="button"
              onClick={() => openLinkModal(category)}
              disabled={isAdding}
              className={`p-2 rounded-xl transition-colors border ${hasTempLink ? 'bg-[#E5EFEA] text-[#7A9E8A] border-[#7A9E8A]/30' : 'bg-white text-slate-400 border-slate-200/80 hover:text-[#7A9E8A] hover:border-[#7A9E8A]/30'}`}
              title="加入連結"
            >
              <LinkIcon size={15} />
            </button>

            <button
              type="button"
              onClick={() => triggerFileUpload(category)}
              disabled={isAdding}
              className={`p-2 rounded-xl transition-colors border ${hasTempImage ? 'bg-amber-50 text-amber-500 border-amber-200/80' : 'bg-white text-slate-400 border-slate-200/80 hover:text-amber-500 hover:border-amber-200'}`}
              title="加入圖片"
            >
              <ImageIcon size={15} />
            </button>

            <button
              type="button"
              onClick={() => handleAdd(category)}
              disabled={isAdding}
              className={`bg-[#3F4550] text-white p-2 rounded-xl hover:bg-[#2F3540] ${isAdding ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Plus size={15} />
            </button>
          </div>
        </div>

        {/* Mobile: Use document scroll (auto height). Desktop: Use internal scroll (flex-1 overflow-y-auto) */}
        {/* UPDATED: Increased md:pb-10 to allow scrolling past bottom edge comfortably */}
        <div className="p-2 space-y-1 pb-20 md:flex-1 md:overflow-y-auto md:min-h-0 md:pb-10">
          {items.length === 0 && (
            <div className="text-center py-10 text-stone-300 text-sm">
              暫無內容
            </div>
          )}
          {items.map(item => {
            const isMap = item.linkUrl && (item.linkUrl.includes('map') || item.linkUrl.includes('goo.gl'));

            return (
            <div
              key={item.id}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors ${item.isCompleted ? 'opacity-50' : ''}`}
            >
              <div
                className="flex items-center gap-3 flex-1 cursor-pointer min-w-0"
                onClick={() => onToggleTodo(item.id)}
              >
                <div className={`${item.isCompleted ? 'text-slate-300' : 'text-slate-400'} flex-shrink-0`}>
                  {item.isCompleted ? <CheckSquare size={18} /> : <Square size={18} />}
                </div>
                <div className="flex flex-col min-w-0">
                    <span className={`text-sm truncate ${item.isCompleted ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}`}>
                        {item.content}
                    </span>
                    {item.imageUrl && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <ImageIcon size={9} /> 有附圖
                        </span>
                    )}
                </div>
              </div>

              <div className="flex items-center gap-0.5">
                  {item.linkUrl && (
                      <a
                        href={item.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`p-1.5 rounded-lg ${isMap ? 'text-red-400 hover:bg-red-50' : 'text-slate-400 hover:bg-slate-100 hover:text-[#7A9E8A]'}`}
                        title={isMap ? "開啟地圖" : "開啟連結"}
                      >
                          {isMap ? <MapPin size={15} /> : <ExternalLink size={15} />}
                      </a>
                  )}
                  {item.imageUrl && (
                      <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setViewingImage(item.imageUrl || null);
                        }}
                        className="text-amber-400 hover:text-amber-500 p-1.5 rounded-lg hover:bg-amber-50"
                        title="查看圖片"
                      >
                          <Eye size={15} />
                      </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(item.id);
                    }}
                    className="text-slate-300 hover:text-red-400 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 size={15} />
                  </button>
              </div>
            </div>
            );
          })}
        </div>
      </div>
    );
  };

  const MobileTab = ({ category, label, icon: Icon, activeColorClass }: { category: TodoItem['category'], label: string, icon: any, activeColorClass: string }) => (
      <button 
        type="button"
        onClick={() => setActiveTab(category)}
        className={`flex-1 py-3 text-sm font-medium flex flex-col items-center justify-center gap-1 transition-all border-b-2 
            ${activeTab === category 
                ? `${activeColorClass} border-current bg-white` 
                : 'text-stone-400 border-transparent hover:text-stone-600 hover:bg-stone-50'
            }`}
      >
          <Icon size={18} />
          {label}
      </button>
  );

  return (
    <div className="space-y-4 md:h-full flex flex-col">
      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-md">
              <div className="bg-white rounded-2xl shadow-2xl shadow-black/10 max-w-sm w-full p-6">
                  <div className="text-center">
                      <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                          <Trash2 size={22} className="text-red-500" />
                      </div>
                      <h3 className="text-base font-bold text-slate-800 mb-2">確定刪除此項目？</h3>
                      <p className="text-slate-500 text-sm leading-relaxed">
                          刪除後將無法復原。
                      </p>
                  </div>
                  <div className="flex gap-3 mt-5">
                      <button
                          onClick={() => setDeleteConfirm(null)}
                          className="flex-1 py-2.5 text-slate-600 font-semibold text-sm bg-slate-100 rounded-xl hover:bg-slate-200"
                      >
                          取消
                      </button>
                      <button
                          onClick={() => {
                              onDeleteTodo(deleteConfirm);
                              setDeleteConfirm(null);
                          }}
                          className="flex-1 py-2.5 bg-red-500 text-white font-semibold text-sm rounded-xl hover:bg-red-600"
                      >
                          確定刪除
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">待辦筆記</h2>
            <p className="text-slate-400 text-xs mt-1 hidden md:block">隨手記錄客人許願、行程規劃與私人採購清單</p>
        </div>
      </div>

      {/* Hidden File Input */}
      <input 
         type="file" 
         ref={fileInputRef} 
         className="hidden" 
         accept="image/*"
         onChange={handleFileSelect}
      />

      {/* Mobile Tabs Navigation */}
      <div className="flex md:hidden bg-white border border-slate-100/80 rounded-2xl overflow-hidden shadow-sm sticky top-[53px] z-10">
          <MobileTab category="WISH" label="客人許願" icon={Sparkles} activeColorClass="text-violet-600" />
          <MobileTab category="STORE" label="行程店家" icon={Store} activeColorClass="text-amber-600" />
          <MobileTab category="PERSONAL" label="自用雜項" icon={ShoppingBag} activeColorClass="text-emerald-600" />
      </div>

      {/* Content Area */}
      {/* Changed: Removed overflow-hidden and h-full on mobile, added md: prefixes */}
      <div className="md:flex-1 md:overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:h-full">
            {/* Wishlist Section */}
            <div className={`md:h-full ${activeTab === 'WISH' ? 'block' : 'hidden'} md:block`}>
                {renderSection('客人許願池', 'WISH', <Sparkles size={20} />, 'text-purple-600', 'bg-purple-50')}
            </div>
            
            {/* Store Section */}
            <div className={`md:h-full ${activeTab === 'STORE' ? 'block' : 'hidden'} md:block`}>
                {renderSection('行程與店家', 'STORE', <Store size={20} />, 'text-amber-600', 'bg-amber-50')}
            </div>
            
            {/* Personal Section */}
            <div className={`md:h-full ${activeTab === 'PERSONAL' ? 'block' : 'hidden'} md:block`}>
                {renderSection('自用與其他', 'PERSONAL', <ShoppingBag size={20} />, 'text-emerald-600', 'bg-emerald-50')}
            </div>
          </div>
      </div>

      {/* Image View Modal */}
      {viewingImage && (
          <div 
             className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm cursor-pointer"
             onClick={() => setViewingImage(null)}
          >
              <div className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center">
                  <img src={viewingImage} alt="Full view" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" referrerPolicy="no-referrer" loading="lazy" />
                  <button className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white p-2 rounded-full">
                      <X size={24} />
                  </button>
              </div>
          </div>
      )}

      {/* Link Input Modal */}
      {activeLinkInputCategory && (
          <div
             className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-md"
             onClick={() => setActiveLinkInputCategory(null)}
          >
              <div
                className="bg-white rounded-2xl shadow-2xl shadow-black/10 w-full max-w-sm p-6"
                onClick={e => e.stopPropagation()}
              >
                  <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <LinkIcon size={16} className="text-slate-400" />
                      貼上連結
                  </h3>
                  <input
                      type="url"
                      placeholder="https://..."
                      className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 mb-4 focus:ring-2 focus:ring-slate-300 outline-none text-sm shadow-sm"
                      autoFocus
                      value={tempLinkInput}
                      onChange={e => setTempLinkInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveLink()}
                  />
                  <div className="flex gap-3">
                      <button onClick={() => setActiveLinkInputCategory(null)} className="flex-1 py-2.5 bg-slate-100 rounded-xl text-slate-600 font-semibold text-sm hover:bg-slate-200">取消</button>
                      <button onClick={saveLink} className="flex-1 py-2.5 bg-[#3F4550] text-white rounded-xl font-semibold text-sm hover:bg-[#2F3540]">確認</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
