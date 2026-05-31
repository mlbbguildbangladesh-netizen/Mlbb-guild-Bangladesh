import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, getDocs, doc, writeBatch, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Season, AppSetting } from '../types';
import { Calendar, Plus, Trash, Check, X, Pencil, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { showConfirmToast } from '../lib/toastUtils';
import { handleFirestoreError, OperationType } from '../lib/firebase';

export default function SeasonsAdmin() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSeason, setEditSeason] = useState<Partial<Season>>({});
  const [appSettings, setAppSettings] = useState<AppSetting | null>(null);

  useEffect(() => {
    const sQuery = collection(db, 'seasons');
    const unsub = onSnapshot(sQuery, (snap) => {
      setSeasons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Season)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'seasons');
    });

    const appQuery = doc(db, 'settings', 'global');
    const unsubApp = onSnapshot(appQuery, (snap) => {
      if (snap.exists()) {
        setAppSettings({ id: snap.id, ...snap.data() } as AppSetting);
      }
    });

    return () => {
      unsub();
      unsubApp();
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSeasonName) return;
    setIsCreating(true);
    try {
      const batch = writeBatch(db);
      const newRef = doc(collection(db, 'seasons'));
      batch.set(newRef, {
        name: newSeasonName,
        status: 'upcoming',
        createdAt: new Date().toISOString()
      });
      await batch.commit();
      setNewSeasonName('');
    } catch(err) {
      handleFirestoreError(err, OperationType.CREATE, 'seasons');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !editSeason.name) return;
    try {
      await updateDoc(doc(db, 'seasons', editingId), editSeason);
      setEditingId(null);
      setEditSeason({});
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'seasons');
    }
  };

  const handleDelete = async (id: string) => {
    const confirm = await showConfirmToast({
      title: "Delete Season",
      message: "Delete this season? This cannot be undone.",
      type: "danger",
      confirmLabel: "Delete"
    });
    if (!confirm) return;
    try {
      await deleteDoc(doc(db, 'seasons', id));
    } catch(err) {
      handleFirestoreError(err, OperationType.DELETE, 'seasons');
    }
  };

  const handleSetCurrentSeason = async (seasonId: string, seasonName: string) => {
    try {
      await updateDoc(doc(db, 'settings', 'global'), {
        currentSeasonId: seasonId,
        currentSeasonName: seasonName
      });
      
      // Update the status of all seasons
      const batch = writeBatch(db);
      seasons.forEach(s => {
         const ref = doc(db, 'seasons', s.id);
         if (s.id === seasonId) {
           batch.update(ref, { status: 'active' });
         } else if (s.status === 'active' || s.status === 'registration') {
           batch.update(ref, { status: 'completed' });
         }
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'settings/global');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black uppercase text-neon-blue">Seasons Management</h2>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-xs font-black uppercase text-gray-500 mb-4 flex items-center gap-2">
          <Plus size={14} /> Add New Season
        </h3>
        <form onSubmit={handleCreate} className="flex gap-4">
          <div className="flex-1">
            <input 
              type="text" 
              placeholder="e.g. Season 1, Summer Championship" 
              className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm"
              value={newSeasonName}
              onChange={e => setNewSeasonName(e.target.value)}
              required
            />
          </div>
          <button 
            type="submit" 
            disabled={isCreating}
            className="bg-neon-blue text-black font-black uppercase px-6 py-2 rounded-lg hover:bg-white transition-colors flex items-center gap-2 shrink-0"
          >
            {isCreating ? 'Adding...' : <><Plus size={16} /> Add Season</>}
          </button>
        </form>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-xs font-black uppercase text-gray-500 mb-4">All Seasons</h3>
        
        {seasons.length === 0 ? (
           <div className="text-center py-8 text-gray-500 text-sm font-mono">
             No seasons found.
           </div>
        ) : (
          <div className="space-y-4">
            {seasons.sort((a,b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()).map(s => {
              const isActive = appSettings?.currentSeasonId === s.id;
              
              return (
              <div key={s.id} className={`bg-white/5 border ${isActive ? 'border-neon-blue' : 'border-white/10'} p-4 rounded-xl relative group flex flex-col md:flex-row md:items-center justify-between gap-4`}>
                {isActive && (
                  <div className="absolute -top-3 -right-3 bg-neon-blue text-black text-[10px] font-black uppercase px-2 py-1 rounded-full flex items-center gap-1 shadow-[0_0_10px_rgba(0,229,255,0.5)] z-10">
                    <Star size={10} /> Active Season
                  </div>
                )}
                
                {editingId === s.id ? (
                  <div className="flex-1 flex gap-2 items-center">
                    <input 
                      type="text" 
                      className="flex-1 bg-black/50 border border-white/10 rounded p-2 text-sm" 
                      value={editSeason.name || ''} 
                      onChange={e => setEditSeason({...editSeason, name: e.target.value})} 
                    />
                    <select 
                      className="bg-black/50 border border-white/10 rounded p-2 text-sm" 
                      value={editSeason.status || ''} 
                      onChange={e => setEditSeason({...editSeason, status: e.target.value as any})}
                    >
                      <option value="upcoming">Upcoming</option>
                      <option value="registration">Registration Open</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                    </select>
                    <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-white p-2 bg-white/5 rounded"><X size={16}/></button>
                    <button onClick={handleUpdate} className="text-neon-green hover:text-white p-2 bg-white/5 rounded"><Check size={16}/></button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-lg font-black uppercase text-white">{s.name}</span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 border rounded ${
                          s.status === 'upcoming' ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' :
                          s.status === 'registration' ? 'bg-neon-pink/10 text-neon-pink border-neon-pink/20' :
                          s.status === 'active' ? 'bg-neon-blue/10 text-neon-blue border-neon-blue/20' :
                          'bg-neon-green/10 text-neon-green border-neon-green/20'
                        }`}>
                          {s.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                         <Calendar size={12} /> Created: {new Date(s.createdAt || Date.now()).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                       {!isActive && (
                         <button 
                           onClick={() => handleSetCurrentSeason(s.id, s.name)}
                           className="text-[10px] bg-white/5 hover:bg-neon-blue/20 text-gray-300 hover:text-neon-blue px-3 py-2 rounded font-black uppercase transition-colors"
                         >
                           Set as Active
                         </button>
                       )}
                       <button onClick={() => { setEditingId(s.id); setEditSeason(s); }} className="text-gray-500 hover:text-neon-blue p-2 bg-white/5 rounded transition-colors"><Pencil size={14}/></button>
                       <button onClick={() => handleDelete(s.id)} className="text-gray-500 hover:text-neon-red p-2 bg-white/5 rounded transition-colors"><Trash size={14}/></button>
                    </div>
                  </>
                )}
              </div>
            )})}
          </div>
        )}
      </div>
    </div>
  );
}
