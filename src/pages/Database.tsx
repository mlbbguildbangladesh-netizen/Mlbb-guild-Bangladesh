import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Table, EyeOff, Moon, Sun, Edit3, X, Search, Trophy, Gem, Save, Swords } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleSheetConfig, Team } from '../types';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-hot-toast';

const Database = () => {
  const { settings, isAdmin, isModerator, moderatorPermissions } = useAuth();
  const [darkMode, setDarkMode] = useState(true);
  
  const canEditLeaderboard = isAdmin || (isModerator && moderatorPermissions?.includes('teams'));
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editValues, setEditValues] = useState<Record<string, { points: number, diamonds: number, matchesThisSeason: number }>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  // Filter sheets: Admins see all, others see only public
  const availableSheets = settings?.googleSheets?.filter(s => isAdmin || s.isPublic) || [];
  
  const [activeSheetId, setActiveSheetId] = useState<string>(availableSheets[0]?.id || '');

  useEffect(() => {
    if (canEditLeaderboard) {
      const q = query(collection(db, 'teams'), orderBy('points', 'desc'));
      const unsub = onSnapshot(q, (snap) => {
        const loadedTeams = snap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
        setTeams(loadedTeams);
        setEditValues(prev => {
          const next = { ...prev };
          loadedTeams.forEach(t => {
            if (!next[t.id]) {
              next[t.id] = { 
                points: Number(t.points) || 0, 
                diamonds: Number(t.diamonds) || 0,
                matchesThisSeason: Number(t.matchesThisSeason) || 0 
              };
            }
          });
          return next;
        });
      });
      return () => unsub();
    }
  }, [canEditLeaderboard]);

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'preview' | 'error' | 'success'>('idle');
  const [syncData, setSyncData] = useState<any[]>([]);
  const [syncRawText, setSyncRawText] = useState('');

  const processSheetText = (text: string) => {
    const rows = text.split('\n').map(r => r.split(/[\t,]/).map(c => c.trim().replace(/^"|"$/g, '')));
    if (rows.length < 2) {
      setSyncStatus('error');
      return;
    }
    
    const headers = rows[0].map(h => h.toLowerCase());
    const teamIdx = headers.findIndex(h => h.includes('team') || h.includes('name'));
    const pointIdx = headers.findIndex(h => h.includes('point') || h.includes('score') || h.includes('pts'));
    const diamondIdx = headers.findIndex(h => h.includes('diamond') || h.includes('gem') || h.includes('dmnd'));
    
    const tIdx = teamIdx !== -1 ? teamIdx : 0;
    const pIdx = pointIdx !== -1 ? pointIdx : 1;
    const dIdx = diamondIdx !== -1 ? diamondIdx : 2;
    
    const updates: any[] = [];
    
    for (let i = 1; i < rows.length; i++) {
       const row = rows[i];
       if (!row || row.length === 0) continue;
       
       const teamName = row[tIdx];
       if (!teamName) continue;
       
       const sheetPoints = parseInt(row[pIdx]) || 0;
       const sheetDiamonds = parseInt(row[dIdx]) || 0;
       
       if (sheetPoints === 0 && sheetDiamonds === 0) continue;
       
       const matchedTeam = teams.find(t => t.teamName.toLowerCase() === teamName.toLowerCase() || t.leaderName.toLowerCase() === teamName.toLowerCase());
       
       if (matchedTeam) {
         updates.push({
           teamId: matchedTeam.id,
           teamName: matchedTeam.teamName,
           currentPoints: matchedTeam.points || 0,
           currentDiamonds: matchedTeam.diamonds || 0,
           sheetPoints,
           sheetDiamonds
         });
       }
    }
    
    if (updates.length > 0) {
      setSyncData(updates);
      setSyncStatus('preview');
    } else {
      toast.error("No matching teams found in sheet data.");
      setSyncStatus('error');
    }
  };

  const handleAutoSync = async () => {
    setSyncStatus('loading');
    setSyncRawText('');
    setShowSyncModal(true);
    
    try {
      let csvUrl = activeSheet?.url || '';
      if (!csvUrl) throw new Error("No active sheet");
      
      if (csvUrl.includes('/pubhtml')) {
        csvUrl = csvUrl.replace(/\/pubhtml.*/, '/pub?output=csv');
      } else if (csvUrl.includes('/edit') || csvUrl.includes('/view')) {
        csvUrl = csvUrl.replace(/\/(edit|view).*/, '/export?format=csv');
      } else if (csvUrl.startsWith('<iframe')) {
        const match = csvUrl.match(/src=["'](.*?)["']/);
        if (match) csvUrl = match[1];
        if (csvUrl.includes('/pubhtml')) {
           csvUrl = csvUrl.replace(/\/pubhtml.*/, '/pub?output=csv');
        } else {
           csvUrl = csvUrl.replace(/\/(edit|view).*/, '/export?format=csv');
        }
      }
      
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error("Could not fetch CSV");
      const text = await res.text();
      processSheetText(text);
    } catch(err) {
      console.warn("Auto-fetch failed. Checking manual fallback.", err);
      toast('Auto-fetch blocked by CORS. Please paste data manually.', { icon: '⚠️' });
      setSyncStatus('error');
    }
  };

  const confirmSync = async () => {
    setSyncStatus('loading');
    try {
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      
      for (const update of syncData) {
        const teamRef = doc(db, 'teams', update.teamId);
        const finalP = update.currentPoints + update.sheetPoints;
        const finalD = update.currentDiamonds + update.sheetDiamonds;
        
        batch.update(teamRef, {
           points: finalP,
           diamonds: finalD
        });
        
        const transRef = doc(collection(db, 'transactions'));
        batch.set(transRef, {
           teamId: update.teamId,
           type: (update.sheetPoints > 0 || update.sheetDiamonds > 0) ? 'bonus' : 'expense',
           points: update.sheetPoints,
           diamonds: update.sheetDiamonds,
           reason: '1-Click Auto Sync from Database',
           timestamp: serverTimestamp()
        });
      }
      
      await batch.commit();
      toast.success(`Synced ${syncData.length} teams successfully!`);
      setShowSyncModal(false);
      setSyncData([]);
      setSyncStatus('idle');
    } catch(err) {
      console.error(err);
      toast.error('Failed to sync. Please try manually.');
      setSyncStatus('preview');
    }
  };

  const handleSaveTeam = async (teamId: string) => {
    const team = teams.find(t => t.id === teamId);
    const values = editValues[teamId];
    if (!team || !values) return;
    
    if (values.points === Number(team.points) && values.diamonds === Number(team.diamonds) && values.matchesThisSeason === Number(team.matchesThisSeason || 0)) {
      toast('No changes detected', { icon: 'ℹ️', style: { borderRadius: '10px', background: '#333', color: '#fff' } });
      return;
    }
    
    setSavingId(teamId);
    try {
      const teamRef = doc(db, 'teams', team.id);
      await updateDoc(teamRef, {
        points: values.points,
        diamonds: values.diamonds,
        matchesThisSeason: values.matchesThisSeason
      });
      
      const pointDelta = values.points - Number(team.points || 0);
      const diamondDelta = values.diamonds - Number(team.diamonds || 0);
      
      const transRef = doc(collection(db, 'transactions'));
      await setDoc(transRef, {
         teamId: team.id,
         ownerId: team.ownerId || team.id,
         type: (pointDelta > 0 || diamondDelta > 0) ? 'bonus' : 'expense',
         points: pointDelta,
         diamonds: diamondDelta,
         reason: 'Database Quick Edit',
         timestamp: serverTimestamp(),
         allowedViewerUids: [team.ownerId || team.id, ...(team.players || [])].filter(Boolean)
      });
      
      if (team.ownerId) {
        const userRef = doc(db, 'users', team.ownerId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          await updateDoc(userRef, {
            points: values.points,
            diamonds: values.diamonds
          });
        }
      }
      toast.success(`${team.teamName} updated!`, { style: { borderRadius: '10px', background: '#333', color: '#fff' } });
    } catch (err) {
      console.error(err);
      toast.error('Failed to update team', { style: { borderRadius: '10px', background: '#333', color: '#fff' } });
    } finally {
      setSavingId(null);
    }
  };

  const filteredTeams = teams.filter(t => 
    t.teamName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.leaderName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (availableSheets.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <Table size={48} className="text-gray-600 mb-4" />
        <h2 className="text-xl font-black uppercase tracking-widest text-gray-500 text-center">
          No Database Records Available
        </h2>
        <p className="text-gray-600 mt-2 text-sm text-center">
          {isAdmin ? 'You can add Google Sheets in the Admin Panel -> Config.' : 'The administrator has not made any records public yet.'}
        </p>
      </div>
    );
  }

  const activeSheet = availableSheets.find(s => s.id === activeSheetId) || availableSheets[0];

  const getEmbedUrl = (rawUrl: string) => {
    if (!rawUrl) return '';
    let finalUrl = rawUrl.trim();
    
    // If user pasted full iframe tag
    if (finalUrl.startsWith('<iframe') && finalUrl.includes('src=')) {
      const match = finalUrl.match(/src=["'](.*?)["']/);
      if (match) finalUrl = match[1];
    }
    
    // If user pasted standard edit/view link
    if (finalUrl.includes('/edit') || finalUrl.includes('/view')) {
      finalUrl = finalUrl.replace(/\/(edit|view).*/, '/htmlembed?rm=minimal&widget=true&headers=false');
    }
    
    return finalUrl;
  };

  return (
    <div className="space-y-6 max-h-[calc(100vh-100px)] flex flex-col pt-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
        <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
          <Table className="text-neon-cyan" size={32} />
          <span className="bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">DATABASE</span>
        </h1>
        
        <div className="flex items-center gap-3">
          {canEditLeaderboard && (
            <>
              <button
                onClick={handleAutoSync}
                className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-neon-purple/20 to-neon-blue/20 text-white border border-neon-purple/30 rounded-lg hover:from-neon-purple/30 hover:to-neon-blue/30 transition-all text-[10px] font-black uppercase tracking-widest whitespace-nowrap shadow-[0_0_15px_rgba(157,78,221,0.2)]"
              >
                1-Click Sync
              </button>
              <button
                onClick={() => setShowEditPanel(true)}
                className="flex items-center gap-2 px-3 py-2 bg-neon-blue/10 text-neon-blue border border-neon-blue/30 rounded-lg hover:bg-neon-blue/20 transition-all text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
              >
                <Edit3 size={14} /> Edit Leaderboard
              </button>
            </>
          )}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Toggle Dark Mode Filter"
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          
          {availableSheets.length > 1 && (
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 overflow-x-auto custom-scrollbar">
              {availableSheets.map(sheet => (
                <button
                  key={sheet.id}
                  onClick={() => setActiveSheetId(sheet.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-black uppercase text-[10px] tracking-widest whitespace-nowrap transition-all ${
                    activeSheet?.id === sheet.id 
                      ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30' 
                      : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {sheet.title} 
                  {!sheet.isPublic && (
                    <span title="Admin only">
                      <EyeOff size={12} className="text-gray-600 ml-1" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <motion.div 
        key={activeSheet?.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 bg-black/40 border border-white/10 rounded-2xl overflow-hidden min-h-[70vh] relative shadow-[0_0_30px_rgba(0,229,255,0.05)]"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-neon-cyan/50 to-transparent z-10 pointer-events-none"></div>
        {activeSheet && (
          <iframe 
            src={getEmbedUrl(activeSheet.url)}
            title={activeSheet.title}
            className="w-full h-full min-h-[70vh] border-0 relative z-0"
            style={{ 
              width: '100%', 
              height: '100%',
              filter: darkMode ? 'invert(90%) hue-rotate(180deg) brightness(1.2)' : 'none',
              transition: 'filter 0.3s ease'
            }}
            allowFullScreen
          />
        )}
      </motion.div>

      <AnimatePresence>
        {showEditPanel && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditPanel(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full sm:w-[450px] bg-black/95 border-l border-white/10 z-50 flex flex-col shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                <div className="flex items-center gap-2">
                  <Trophy className="text-neon-blue" size={20} />
                  <h2 className="text-lg font-black uppercase tracking-widest">Update Leaderboard</h2>
                </div>
                <button 
                  onClick={() => setShowEditPanel(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-3 border-b border-white/10 bg-black/40">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input 
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 pl-9 text-sm focus:border-neon-blue outline-none transition-colors placeholder:text-gray-600"
                    placeholder="Search teams..."
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {filteredTeams.map(team => (
                  <div key={team.id} className="bg-white/5 border border-white/10 hover:border-white/20 transition-colors rounded-xl p-3">
                    <div className="flex justify-between items-center mb-3 border-b border-white/5 pb-2">
                      <p className="font-bold text-white text-sm truncate pr-2 max-w-[200px]" title={team.teamName}>{team.teamName}</p>
                      <button 
                        onClick={() => handleSaveTeam(team.id)}
                        disabled={savingId === team.id || (editValues[team.id]?.points === Number(team.points) && editValues[team.id]?.diamonds === Number(team.diamonds) && editValues[team.id]?.matchesThisSeason === Number(team.matchesThisSeason || 0))}
                        className="px-3 py-1.5 bg-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/30 rounded text-[10px] font-black tracking-widest uppercase transition-all disabled:opacity-50 disabled:grayscale flex items-center gap-1.5"
                      >
                        {savingId === team.id ? 'SAVING...' : <><Save size={12} /> SAVE</>}
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                          <Trophy size={10} className="text-neon-blue" /> Pts <span className="text-gray-600 font-mono ml-auto">({team.points || 0})</span>
                        </label>
                        <div className="flex bg-black/50 border border-white/10 rounded-lg overflow-hidden">
                          <input 
                            type="number"
                            value={editValues[team.id]?.points ?? 0}
                            onChange={(e) => setEditValues(prev => ({ ...prev, [team.id]: { ...prev[team.id], points: Number(e.target.value) } }))}
                            className="w-full bg-transparent p-2 text-xs focus:border-neon-blue outline-none font-mono text-center appearance-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                          <Gem size={10} className="text-neon-cyan" /> Dmnd <span className="text-gray-600 font-mono ml-auto">({team.diamonds || 0})</span>
                        </label>
                        <div className="flex bg-black/50 border border-white/10 rounded-lg overflow-hidden">
                          <input 
                            type="number"
                            value={editValues[team.id]?.diamonds ?? 0}
                            onChange={(e) => setEditValues(prev => ({ ...prev, [team.id]: { ...prev[team.id], diamonds: Number(e.target.value) } }))}
                            className="w-full bg-transparent p-2 text-xs focus:border-neon-cyan outline-none font-mono text-center appearance-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                          <Swords size={10} className="text-neon-purple" /> Mtchs <span className="text-gray-600 font-mono ml-auto">({team.matchesThisSeason || 0})</span>
                        </label>
                        <div className="flex bg-black/50 border border-white/10 rounded-lg overflow-hidden">
                          <input 
                            type="number"
                            value={editValues[team.id]?.matchesThisSeason ?? 0}
                            onChange={(e) => setEditValues(prev => ({ ...prev, [team.id]: { ...prev[team.id], matchesThisSeason: Number(e.target.value) } }))}
                            className="w-full bg-transparent p-2 text-xs focus:border-neon-purple outline-none font-mono text-center appearance-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredTeams.length === 0 && (
                  <p className="text-center text-gray-500 text-sm mt-8 border border-white/5 rounded-lg p-4 bg-white/5">No teams found.</p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showSyncModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-black/90 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-[0_0_50px_rgba(157,78,221,0.1)] flex flex-col max-h-[90vh]"
            >
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-2 text-neon-purple">
                   1-Click Auto Sync
                </h2>
                <button onClick={() => setShowSyncModal(false)} className="text-gray-400 hover:text-white p-2">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto custom-scrollbar">
                 {syncStatus === 'loading' && (
                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                      <div className="w-8 h-8 rounded-full border-4 border-neon-purple/30 border-t-neon-purple animate-spin" />
                      <p className="text-sm font-black uppercase tracking-widest text-neon-purple animate-pulse">Fetching & Parsing Data...</p>
                    </div>
                 )}
                 {syncStatus === 'error' && (
                    <div className="space-y-4">
                      <div className="bg-neon-red/10 border border-neon-red/20 rounded-lg p-4 mb-4">
                         <p className="text-sm text-neon-red font-bold">Could not fetch/parse automatically!</p>
                         <p className="text-xs text-gray-400 mt-1">This is usually due to Google Sheets blocking direct access. Copy the cells from the iframe above and paste them here:</p>
                      </div>
                      <textarea 
                        className="w-full bg-black/50 border border-white/10 rounded-lg p-4 h-48 text-xs font-mono focus:border-neon-purple outline-none transition-colors resize-none" 
                        placeholder="Paste sheet rows here..." 
                        value={syncRawText} 
                        onChange={e => {
                          setSyncRawText(e.target.value);
                          if(e.target.value.length > 10) processSheetText(e.target.value);
                        }}
                      />
                    </div>
                 )}
                 {syncStatus === 'preview' && (
                    <div className="space-y-4">
                      <p className="text-sm text-neon-purple font-bold">Found data for {syncData.length} teams:</p>
                      <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                        {syncData.map(d => (
                          <div key={d.teamId} className="bg-white/5 border border-white/10 p-3 rounded-lg flex justify-between items-center text-sm">
                             <span className="font-bold uppercase text-[10px] tracking-widest">{d.teamName}</span>
                             <div className="flex gap-4">
                               <span className="text-gray-400 text-xs font-mono flex items-center gap-1">
                                 Current Pts: {d.currentPoints} <strong className="text-neon-blue ml-2">+{d.sheetPoints}</strong>
                               </span>
                               <span className="text-gray-400 text-xs font-mono flex items-center gap-1">
                                 Current Dmd: {d.currentDiamonds} <strong className="text-neon-cyan ml-2">+{d.sheetDiamonds}</strong>
                               </span>
                             </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-4 pt-4 border-t border-white/10">
                        <button 
                          onClick={confirmSync} 
                          className="flex-1 py-3 bg-neon-purple text-white font-black uppercase tracking-widest rounded-lg hover:brightness-110 shadow-[0_0_20px_rgba(157,78,221,0.3)] transition-all"
                        >
                          Confirm & Update Leaderboard
                        </button>
                      </div>
                    </div>
                 )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Database;
