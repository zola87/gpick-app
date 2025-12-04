
import React, { useState } from 'react';
import { TodoItem } from '../types';
import { CheckSquare, Square, Trash2, Plus, Sparkles, Store, ShoppingBag, ClipboardList } from 'lucide-react';

interface TodoListProps {
  todos: TodoItem[];
  onAddTodo: (item: TodoItem) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

export const TodoList: React.FC<TodoListProps> = ({ todos, onAddTodo, onToggleTodo, onDeleteTodo }) => {
  const [newInputs, setNewInputs] = useState({
    WISH: '',
    STORE: '',
    PERSONAL: ''
  });
  
  // State for Mobile Tabs
  const [activeTab, setActiveTab] = useState<TodoItem['category']>('WISH');

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const handleAdd = (category: TodoItem['category']) => {
    if (!newInputs[category].trim()) return;
    
    onAddTodo({
      id: generateId(),
      content: newInputs[category],
      category,
      isCompleted: false,
      createdAt: Date.now()
    });

    setNewInputs(prev => ({ ...prev, [category]: '' }));
  };

  const handleKeyPress = (e: React.KeyboardEvent, category: TodoItem['category']) => {
    if (e.key === 'Enter') {
      handleAdd(category);
    }
  };

  const renderSection = (title: string, category: TodoItem['category'], icon: React.ReactNode, colorClass: string, bgClass: string) => {
    const items = todos.filter(t => t.category === category).sort((a, b) => {
        if (a.isCompleted === b.isCompleted) return b.createdAt - a.createdAt;
        return a.isCompleted ? 1 : -1;
    });

    return (
      <div className={`bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden flex flex-col h-full`}>
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
            <input
              type="text"
              value={newInputs[category]}
              onChange={(e) => setNewInputs(prev => ({ ...prev, [category]: e.target.value }))}
              onKeyPress={(e) => handleKeyPress(e, category)}
              placeholder="新增記事..."
              className="flex-1 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button 
              onClick={() => handleAdd(category)}
              className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-[300px]">
          {items.length === 0 && (
            <div className="text-center py-10 text-stone-300 text-sm">
              暫無內容
            </div>
          )}
          {items.map(item => (
            <div 
              key={item.id} 
              className={`group flex items-center justify-between p-3 rounded-lg hover:bg-stone-50 transition-colors ${item.isCompleted ? 'opacity-50' : ''}`}
            >
              <div 
                className="flex items-center gap-3 flex-1 cursor-pointer"
                onClick={() => onToggleTodo(item.id)}
              >
                <div className={`${item.isCompleted ? 'text-stone-400' : 'text-blue-500'}`}>
                  {item.isCompleted ? <CheckSquare size={20} /> : <Square size={20} />}
                </div>
                <span className={`text-sm ${item.isCompleted ? 'line-through text-stone-400' : 'text-stone-700 font-medium'}`}>
                  {item.content}
                </span>
              </div>
              <button 
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    if(window.confirm('確定刪除此項目？')) onDeleteTodo(item.id);
                }}
                className="text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const MobileTab = ({ category, label, icon: Icon, activeColorClass }: { category: TodoItem['category'], label: string, icon: any, activeColorClass: string }) => (
      <button 
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
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <ClipboardList className="text-blue-600" />
            待辦筆記
            </h2>
            <p className="text-stone-500 text-sm mt-1 hidden md:block">隨手記錄客人許願、行程規劃與私人採購清單。</p>
        </div>
      </div>

      {/* Mobile Tabs Navigation */}
      <div className="flex md:hidden bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm sticky top-0 z-10">
          <MobileTab category="WISH" label="客人許願" icon={Sparkles} activeColorClass="text-purple-600" />
          <MobileTab category="STORE" label="行程店家" icon={Store} activeColorClass="text-amber-600" />
          <MobileTab category="PERSONAL" label="自用雜項" icon={ShoppingBag} activeColorClass="text-emerald-600" />
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
            {/* Wishlist Section */}
            <div className={`h-full ${activeTab === 'WISH' ? 'block' : 'hidden'} md:block`}>
                {renderSection('客人許願池', 'WISH', <Sparkles size={20} />, 'text-purple-600', 'bg-purple-50')}
            </div>
            
            {/* Store Section */}
            <div className={`h-full ${activeTab === 'STORE' ? 'block' : 'hidden'} md:block`}>
                {renderSection('行程與店家', 'STORE', <Store size={20} />, 'text-amber-600', 'bg-amber-50')}
            </div>
            
            {/* Personal Section */}
            <div className={`h-full ${activeTab === 'PERSONAL' ? 'block' : 'hidden'} md:block`}>
                {renderSection('自用與其他', 'PERSONAL', <ShoppingBag size={20} />, 'text-emerald-600', 'bg-emerald-50')}
            </div>
          </div>
      </div>
    </div>
  );
};
