import React from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Check, X, Info } from 'lucide-react';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'danger' | 'warning' | 'info';
};

export const showConfirmToast = ({ 
  title, 
  message, 
  confirmLabel = 'Confirm', 
  cancelLabel = 'Cancel',
  type = 'warning'
}: ConfirmOptions): Promise<boolean> => {
  return new Promise((resolve) => {
    toast.custom(
      (t) => (
        <div 
          className={`bg-[rgba(26,29,35,0.95)] backdrop-blur-xl border border-white/10 rounded-xl p-5 shadow-2xl flex flex-col gap-4 min-w-[320px] max-w-sm pointer-events-auto ${t.visible ? 'animate-in fade-in slide-in-from-top-4' : 'animate-out fade-out slide-out-to-top-4'}`}
        >
          <div className="flex items-start gap-4">
            <div className={`p-2.5 rounded-xl shrink-0 ${
              type === 'danger' ? 'bg-red-500/10 text-red-500' :
              type === 'warning' ? 'bg-amber-500/10 text-amber-500' :
              'bg-blue-500/10 text-blue-500'
            }`}>
              {type === 'info' ? <Info size={24} /> : <AlertTriangle size={24} />}
            </div>
            <div className="flex-1 mt-0.5">
              <h3 className="text-gray-100 font-bold text-[15px] leading-tight mb-1">{title}</h3>
              <p className="text-gray-400 text-[13px] leading-relaxed">{message}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button 
              onClick={() => { toast.dismiss(t.id); resolve(false); }} 
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-xs font-semibold transition-colors active:scale-95"
            >
              {cancelLabel}
            </button>
            <button 
              onClick={() => { toast.dismiss(t.id); resolve(true); }} 
              className={`px-4 py-2 ${
                type === 'danger' ? 'bg-red-500 hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.3)]' :
                type === 'warning' ? 'bg-amber-500 hover:bg-amber-600 shadow-[0_0_15px_rgba(245,158,11,0.3)] text-black' :
                'bg-blue-500 hover:bg-blue-600 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
              } text-white rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5`}
            >
              <Check size={14} />
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      { duration: Infinity, position: 'top-center', id: 'global-confirm' }
    );
  });
};
