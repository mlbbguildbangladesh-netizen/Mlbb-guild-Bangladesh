import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Table, Plus, Trash2, Check, X, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { GoogleSheetConfig, AppSetting } from '../types';

const SheetsAdmin = () => {
  const [settings, setSettings] = useState<AppSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheets, setSheets] = useState<GoogleSheetConfig[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as AppSetting;
        setSettings(data);
        setSheets(data.googleSheets || []);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleAddSheet = async () => {
    const newSheet: GoogleSheetConfig = {
      id: Date.now().toString(),
      title: 'New Sheet',
      url: '',
      isPublic: false
    };
    
    const updatedSheets = [...sheets, newSheet];
    setSheets(updatedSheets);
    await setDoc(doc(db, 'settings', 'global'), { googleSheets: updatedSheets }, { merge: true });
  };

  const handleLocalUpdate = (index: number, field: keyof GoogleSheetConfig, value: any) => {
    const updatedSheets = [...sheets];
    updatedSheets[index] = { ...updatedSheets[index], [field]: value };
    setSheets(updatedSheets);
  };

  const handleSaveToDb = async () => {
    try {
      await setDoc(doc(db, 'settings', 'global'), { googleSheets: sheets }, { merge: true });
      toast.success('Sheets configuration saved');
    } catch (error) {
      toast.error('Failed to save sheets configuration');
    }
  };

  const handleTogglePublic = async (index: number, currentPublic: boolean) => {
    const updatedSheets = [...sheets];
    updatedSheets[index].isPublic = !currentPublic;
    setSheets(updatedSheets);
    try {
      await setDoc(doc(db, 'settings', 'global'), { googleSheets: updatedSheets }, { merge: true });
    } catch (error) {
      toast.error('Failed to update sheet configuration');
    }
  };

  const handleDeleteSheet = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this sheet link?')) return;
    const updatedSheets = sheets.filter(s => s.id !== id);
    setSheets(updatedSheets);
    await setDoc(doc(db, 'settings', 'global'), { googleSheets: updatedSheets }, { merge: true });
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading sheets...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-3">
          <Table className="text-neon-blue" />
          Google Sheets Integration
        </h2>
        <button 
          onClick={handleAddSheet}
          className="flex items-center gap-2 px-4 py-2 bg-neon-blue/20 text-neon-blue hover:bg-neon-blue hover:text-black border border-neon-blue/50 rounded-lg transition-all font-black uppercase text-xs tracking-widest"
        >
          <Plus size={16} /> Add Sheet
        </button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <p className="text-gray-400 text-sm mb-6">
          Add Google Sheets embed links here (File {'>'} Share {'>'} Publish to web {'>'} Embed). You can choose to make them public or admin-only.
        </p>

        {sheets.length === 0 ? (
          <div className="text-center py-12 text-gray-500 uppercase tracking-widest font-black text-sm border-2 border-dashed border-white/10 rounded-xl">
            No Google Sheets added yet
          </div>
        ) : (
          <div className="space-y-4">
            {sheets.map((sheet, index) => (
              <div key={sheet.id} className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black tracking-widest text-gray-500">Title</label>
                    <input 
                      type="text" 
                      value={sheet.title}
                      onChange={(e) => handleLocalUpdate(index, 'title', e.target.value)}
                      onBlur={handleSaveToDb}
                      placeholder="e.g. Leaderboard, Match Logs"
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:border-neon-blue focus:outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black tracking-widest text-gray-500">Public Access</label>
                    <div className="flex items-center gap-4 h-[46px]">
                      <button
                        onClick={() => handleTogglePublic(index, sheet.isPublic)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-black uppercase text-[10px] tracking-widest transition-all ${
                          sheet.isPublic 
                            ? 'bg-neon-green/20 text-neon-green border border-neon-green/30' 
                            : 'bg-neon-red/20 text-neon-red border border-neon-red/30'
                        }`}
                      >
                        {sheet.isPublic ? <><Eye size={14} /> Public</> : <><EyeOff size={14} /> Admin Only</>}
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black tracking-widest text-gray-500">Embed URL (src from iframe)</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={sheet.url}
                      onChange={(e) => handleLocalUpdate(index, 'url', e.target.value)}
                      onBlur={handleSaveToDb}
                      placeholder="https://docs.google.com/spreadsheets/d/.../pubhtml?widget=true&headers=false"
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:border-neon-blue focus:outline-none transition-colors"
                    />
                    <button 
                      onClick={() => handleDeleteSheet(sheet.id)}
                      className="p-3 bg-neon-red/10 text-neon-red hover:bg-neon-red hover:text-black border border-neon-red/20 rounded-lg transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SheetsAdmin;
