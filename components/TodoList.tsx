
import React, { useState, useRef } from 'react';
import { TodoItem } from '../types';
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

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0] && activeUploadCategory) {
          try {
              const file = e.target.files[0];
              const compressed = await compressImage(file);
              setTempImages(prev => ({ ...prev, [activeUploadCategory]: compressed }));
          } catch (err) {
              console.error("Image compression failed", err);
              alert("圖片處理失敗，請重試");
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
      <div className={`bg-white rounded-xl shadow-sm border border-stone-200 flex flex-col md:h-[calc(100vh-160px)] md:overflow-hidden min-h-[60vh] md:min-h-0`}>
        <div className={`p-4 border-b border-stone-100 flex items-center gap-2 ${bgClass}`}>
          <div className={`p-2 rounded-lg bg-white/80 ${colorClass}`}>
            {icon}
          </div>
          <h3 className={`font-bold text-lg ${colorClass.replace('text-', 'text-stone-800 ')}`}>{title}</h3>
          <span className="ml-auto text-xs font-bold bg-white/50 px-2 py-1 rounded-full text-stone-500">
            {items.filter(i => !i.isCompleted).length} 待辦
          </span>
        </div>

        <div className="p-3 border-b border-stone-100 bg-stone-50">
          <div className="flex gap-2">
            <div className="flex-1 relative">
                <input
                    type="text"
                    value={newInputs[category]}
                    onChange={(e) => setNewInputs(prev => ({ ...prev, [category]: e.target.value }))}
                    onKeyDown={(e) => handleKeyDown(e, category)}
                    placeholder="新增記事..."
                    disabled={isAdding}
                    // Increased font size to text-base (16px) to prevent iOS zoom
                    className={`w-full px-3 py-2 border border-stone-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${hasTempImage ? 'pl-10' : ''} ${isAdding ? 'opacity-50' : ''}`}
                />
                {hasTempImage && (
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded overflow-hidden border border-stone-300">
                        <img src={tempImages[category]!} className="w-full h-full object-cover" alt="preview" />
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
              className={`p-2 rounded-lg transition-colors border ${hasTempLink ? 'bg-blue-100 text-blue-600 border-blue-200' : 'bg-white text-stone-400 border-stone-200 hover:text-blue-500 hover:border-blue-300'}`}
              title="加入連結"
            >
              <LinkIcon size={18} />
            </button>

            <button 
              type="button"
              onClick={() => triggerFileUpload(category)}
              disabled={isAdding}
              className={`p-2 rounded-lg transition-colors border ${hasTempImage ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-white text-stone-400 border-stone-200 hover:text-amber-500 hover:border-amber-300'}`}
              title="加入圖片"
            >
              <ImageIcon size={18} />
            </button>
            
            <button 
              type="button"
              onClick={() => handleAdd(category)}
              disabled={isAdding}
              className={`bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors ${isAdding ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Plus size={18} />
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
              className={`group flex items-center justify-between p-3 rounded-lg hover:bg-stone-50 transition-colors ${item.isCompleted ? 'opacity-50' : ''}`}
            >
              <div 
                className="flex items-center gap-3 flex-1 cursor-pointer min-w-0"
                onClick={() => onToggleTodo(item.id)}
              >
                <div className={`${item.isCompleted ? 'text-stone-400' : 'text-blue-500'} flex-shrink-0`}>
                  {item.isCompleted ? <CheckSquare size={20} /> : <Square size={20} />}
                </div>
                <div className="flex flex-col min-w-0">
                    <span className={`text-sm truncate ${item.isCompleted ? 'line-through text-stone-400' : 'text-stone-700 font-medium'}`}>
                        {item.content}
                    </span>
                    {item.imageUrl && (
                        <span className="text-[10px] text-stone-400 flex items-center gap-1">
                            <ImageIcon size={10} /> 有附圖
                        </span>
                    )}
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                  {item.linkUrl && (
                      <a 
                        href={item.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`p-2 rounded-full hover:bg-blue-50 ${isMap ? 'text-red-500 hover:text-red-600' : 'text-blue-500 hover:text-blue-600'}`}
                        title={isMap ? "開啟地圖" : "開啟連結"}
                      >
                          {isMap ? <MapPin size={16} /> : <ExternalLink size={16} />}
                      </a>
                  )}
                  {item.imageUrl && (
                      <button 
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setViewingImage(item.imageUrl || null);
                        }}
                        className="text-amber-400 hover:text-amber-600 p-2 rounded-full hover:bg-amber-50"
                        title="查看圖片"
                      >
                          <Eye size={16} />
                      </button>
                  )}
                  <button 
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        if(window.confirm('確定刪除此項目？')) onDeleteTodo(item.id);
                    }}
                    className="text-stone-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-2"
                  >
                    <Trash2 size={16} />
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
        className={`flex-1 py-3 text-sm font-bold flex flex-col items-center justify-center gap-1 transition-all border-b-2 
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
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <ClipboardList className="text-blue-600" />
            待辦筆記
            </h2>
            <p className="text-stone-500 text-sm mt-1 hidden md:block">隨手記錄客人許願、行程規劃與私人採購清單。(支援圖片與網址連結)</p>
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
      <div className="flex md:hidden bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm sticky top-0 z-10">
          <MobileTab category="WISH" label="客人許願" icon={Sparkles} activeColorClass="text-purple-600" />
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
                  <img src={viewingImage} alt="Full view" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
                  <button className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white p-2 rounded-full">
                      <X size={24} />
                  </button>
              </div>
          </div>
      )}

      {/* Link Input Modal */}
      {activeLinkInputCategory && (
          <div 
             className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm"
             onClick={() => setActiveLinkInputCategory(null)}
          >
              <div 
                className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 animate-in zoom-in-95" 
                onClick={e => e.stopPropagation()}
              >
                  <h3 className="text-lg font-bold text-stone-800 mb-3 flex items-center gap-2">
                      <LinkIcon size={20} className="text-blue-500" />
                      貼上連結
                  </h3>
                  <input 
                      type="url"
                      placeholder="https://..."
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                      autoFocus
                      value={tempLinkInput}
                      onChange={e => setTempLinkInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveLink()}
                  />
                  <div className="flex gap-3">
                      <button onClick={() => setActiveLinkInputCategory(null)} className="flex-1 py-2 bg-stone-100 rounded-lg text-stone-600 font-bold">取消</button>
                      <button onClick={saveLink} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-md">確認</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
