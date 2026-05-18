import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, getDocs, doc, writeBatch, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createNotification } from '../lib/notificationUtils';
import { ScheduleMatch, Team, MatchResultType, MATCH_SLOTS } from '../types';
import { Calendar, Clock, Crown, Trash, Wand2, Plus, Users, Pencil, Check, X, AlertCircle, Trophy, ExternalLink, ShieldCheck, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { handleFirestoreError, OperationType } from '../lib/firebase';
import { recordMatchResult } from '../lib/utils';
import { ImageWithFallback } from './ImageWithFallback';
import CountdownTimer from './CountdownTimer';
import toast from 'react-hot-toast';

export default function SchedulesAdmin() {
  const [schedules, setSchedules] = useState<ScheduleMatch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMatch, setEditMatch] = useState<Partial<ScheduleMatch>>({});
  const [reportingMatch, setReportingMatch] = useState<ScheduleMatch | null>(null);
  const [reportData, setReportData] = useState({
    winnerId: '',
    type: 'win' as MatchResultType,
    externalLink: '',
    pointsA: 0,
    pointsB: 0,
    diamondsA: 0,
    diamondsB: 0,
    useManual: false
  });
  const [isReporting, setIsReporting] = useState(false);
  const [aiSettings, setAiSettings] = useState({
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '11:00',
    durationMinutes: 30
  });

  useEffect(() => {
    const sQuery = collection(db, 'schedules');
    const uSchedules = onSnapshot(sQuery, (snap) => {
      setSchedules(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScheduleMatch)));
    }, error => handleFirestoreError(error, OperationType.GET, 'schedules'));

    const tQuery = collection(db, 'teams');
    const uTeams = onSnapshot(tQuery, (snap) => {
      setTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)).filter(t => t.registrationStatus === 'approved'));
    }, error => handleFirestoreError(error, OperationType.GET, 'teams'));

    return () => {
      uSchedules();
      uTeams();
    };
  }, []);

  const [newMatch, setNewMatch] = useState<Partial<ScheduleMatch>>({
    team1Name: '', team2Name: '', date: '', time: '', firstPick: '', status: 'upcoming'
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatch.team1Name || !newMatch.team2Name || !newMatch.date || !newMatch.time || !newMatch.firstPick) return;

    const hasConflict = schedules.some(s => s.date === newMatch.date && s.time === newMatch.time && s.status !== 'cancelled');
    if (hasConflict) {
      if (!window.confirm(`There is already a match scheduled for ${newMatch.date} at ${newMatch.time}. Do you still want to add this match?`)) {
        return;
      }
    }

    try {
      const matchData = {
        ...newMatch,
        matchType: 'official' as const,
        createdAt: new Date().toISOString()
      };
      
      const newDocRef = doc(collection(db, 'schedules'));
      const batch = writeBatch(db);
      batch.set(newDocRef, matchData);
      await batch.commit();

      setNewMatch({ team1Name: '', team2Name: '', date: '', time: '', firstPick: '', status: 'upcoming' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'schedules');
    }
  };

  const handleGenerateAI = async () => {
    if (!aiSettings.date || !aiSettings.startTime || !aiSettings.endTime || !aiSettings.durationMinutes) {
      toast.error('Please fill out all AI scheduling settings.');
      return;
    }

    setIsGenerating(true);
    try {
      // Logic for random pairing of approved teams
      if (teams.length < 2) {
        toast.error('Not enough teams to generate schedule.');
        setIsGenerating(false);
        return;
      }
      
      const mixedTeams = [...teams].sort(() => Math.random() - 0.5);
      const batch = writeBatch(db);

      let currentDateTime = new Date(`${aiSettings.date}T${aiSettings.startTime}`);
      const endDateTime = new Date(`${aiSettings.date}T${aiSettings.endTime}`);
      let currentDateStr = aiSettings.date;

      for (let i = 0; i < mixedTeams.length - 1; i += 2) {
        const t1 = mixedTeams[i];
        const t2 = mixedTeams[i + 1];

        let timeSlotFound = false;
        let timeString = '';

        while (!timeSlotFound) {
          if (currentDateTime > endDateTime) {
            // Move to next day if time exceeds end time
            currentDateTime = new Date(`${currentDateStr}T${aiSettings.startTime}`);
            currentDateTime.setDate(currentDateTime.getDate() + 1);
            currentDateStr = currentDateTime.toISOString().split('T')[0];
            endDateTime.setDate(endDateTime.getDate() + 1);
          }

          timeString = currentDateTime.toTimeString().slice(0, 5);
          
          // Check for conflicts
          const conflict = schedules.some(s => s.date === currentDateStr && s.time === timeString && s.status !== 'cancelled');
          
          if (conflict) {
            currentDateTime.setMinutes(currentDateTime.getMinutes() + aiSettings.durationMinutes);
          } else {
            timeSlotFound = true;
          }
        }

        const randPick = Math.random() > 0.5 ? t1.teamName : t2.teamName;

        const data = {
          team1Id: t1.id,
          team1Name: t1.teamName,
          team2Id: t2.id,
          team2Name: t2.teamName,
          date: currentDateStr,
          time: timeString,
          firstPick: randPick,
          matchType: 'official' as const,
          status: 'upcoming' as const,
          createdAt: new Date().toISOString()
        };

        const newRef = doc(collection(db, 'schedules'));
        batch.set(newRef, data);
        
        currentDateTime.setMinutes(currentDateTime.getMinutes() + aiSettings.durationMinutes);
      }
      
      await batch.commit();
      setShowAIPanel(false);
    } catch(err) {
      handleFirestoreError(err, OperationType.CREATE, 'schedules');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleResetSeasonCounts = async () => {
    if (!window.confirm("Search and destroy? This will reset all team season match counts to 0. Are you sure?")) {
      return;
    }
    try {
      const batch = writeBatch(db);
      teams.forEach(t => {
        batch.update(doc(db, 'teams', t.id), {
          matchesThisSeason: 0
        });
      });
      await batch.commit();
      toast.success("Season match counts reset successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to reset season counts.");
    }
  };



  const handleUpdate = async () => {
    if (!editingId || !editMatch.team1Name || !editMatch.team2Name) return;
    try {
      await updateDoc(doc(db, 'schedules', editingId), editMatch);
      setEditingId(null);
      setEditMatch({});
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, 'schedules');
    }
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'schedules', id));
      setDeleteConfirmId(null);
      toast.success("Match deleted successfully.");
    } catch (err: any) {
      console.error("Delete failed:", err);
      toast.error("Failed to delete schedule: " + (err.message || "Unknown error"));
    }
  };

  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);

  const handleDeleteAll = async () => {
    if (schedules.length === 0) return;
    try {
      const batch = writeBatch(db);
      schedules.forEach(s => {
        batch.delete(doc(db, 'schedules', s.id));
      });
      await batch.commit();
      setShowClearAllConfirm(false);
      toast.success("All schedules have been cleared successfully.");
    } catch (err: any) {
      console.error("Clear all failed:", err);
      toast.error("Failed to clear schedules: " + (err.message || "Unknown error"));
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingMatch) return;
    if (!reportData.winnerId && reportData.type !== 'rematch' && reportData.type !== 'cancelled') {
      toast.error("Please select a winner or result type");
      return;
    }

    setIsReporting(true);
    try {
      const manualPoints = reportData.useManual ? { teamA: reportData.pointsA, teamB: reportData.pointsB } : undefined;
      const manualDiamonds = reportData.useManual ? { teamA: reportData.diamondsA, teamB: reportData.diamondsB } : undefined;

      // 1. Record the actual match stats (points/diamonds)
      const results = await recordMatchResult(
        reportingMatch.team1Id || '', 
        reportingMatch.team2Id || '', 
        reportData.winnerId as any, 
        reportData.type,
        manualPoints,
        manualDiamonds,
        reportingMatch.matchType === 'challenge',
        Number(reportingMatch.bet || 0)
      );

      // 2. Mark the schedule as completed and store details
      await updateDoc(doc(db, 'schedules', reportingMatch.id), {
        status: reportData.type === 'cancelled' ? 'cancelled' : 'completed',
        matchDetails: {
          winnerId: reportData.winnerId,
          resultType: reportData.type,
          pointsExchanged: { 
            team1: results.pointsExchanged.teamA, 
            team2: results.pointsExchanged.teamB 
          },
          diamondsExchanged: { 
            team1: results.diamondsExchanged.teamA, 
            team2: results.diamondsExchanged.teamB 
          }
        }
      });

      toast.success("Match outcome reported successfully!");

      // 3. Notify team leaders
      const t1 = teams.find(t => t.id === reportingMatch.team1Id);
      const t2 = teams.find(t => t.id === reportingMatch.team2Id);
      
      const winnerName = reportData.winnerId === reportingMatch.team1Id ? reportingMatch.team1Name : reportingMatch.team2Name;

      if (t1?.ownerId) {
        await createNotification(
          t1.ownerId,
          'Match Result Reported',
          `Match vs ${reportingMatch.team2Name} ended. ${reportData.type === 'rematch' ? 'Rematch ordered.' : `Winner: ${winnerName}`}`,
          'system',
          '/schedule'
        );
      }
      if (t2?.ownerId) {
        await createNotification(
          t2.ownerId,
          'Match Result Reported',
          `Match vs ${reportingMatch.team1Name} ended. ${reportData.type === 'rematch' ? 'Rematch ordered.' : `Winner: ${winnerName}`}`,
          'system',
          '/schedule'
        );
      }

      setReportingMatch(null);
      setReportData({ winnerId: '', type: 'win', externalLink: '', pointsA: 0, pointsB: 0, diamondsA: 0, diamondsB: 0, useManual: false });
    } catch (err: any) {
      console.error("Report failed:", err);
      toast.error("Failed to report outcome: " + (err.message || "Unknown error"));
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Modals */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="glass-card p-6 max-w-sm w-full text-center space-y-6">
              <div className="w-16 h-16 bg-neon-red/10 rounded-full flex items-center justify-center mx-auto text-neon-red">
                <Trash size={32} />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase">Delete Match?</h3>
                <p className="text-xs text-gray-500 font-medium">This action cannot be undone.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirmId(null)} className="flex-1 bg-white/5 hover:bg-white/10 p-3 rounded-xl font-bold uppercase text-xs">Cancel</button>
                <button onClick={() => handleDelete(deleteConfirmId)} className="flex-1 bg-neon-red text-white p-3 rounded-xl font-black uppercase text-xs">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showClearAllConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="glass-card p-6 max-w-sm w-full text-center space-y-6">
              <div className="w-16 h-16 bg-neon-red/10 rounded-full flex items-center justify-center mx-auto text-neon-red">
                <AlertCircle size={32} />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase">Clear All?</h3>
                <p className="text-xs text-gray-500 font-medium">You are about to delete ALL {schedules.length} schedules.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowClearAllConfirm(false)} className="flex-1 bg-white/5 hover:bg-white/10 p-3 rounded-xl font-bold uppercase text-xs">Cancel</button>
                <button onClick={handleDeleteAll} className="flex-1 bg-neon-red text-white p-3 rounded-xl font-black uppercase text-xs">Clear All</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {reportingMatch && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="glass-card p-6 max-w-md w-full relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-blue via-neon-cyan to-neon-blue"></div>
              
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black uppercase text-neon-blue">Report Match Result</h3>
                <button onClick={() => setReportingMatch(null)} className="text-gray-500 hover:text-white"><X size={20}/></button>
              </div>

              <form onSubmit={handleReportSubmit} className="space-y-4">
                <div className="bg-black/40 p-4 rounded-xl border border-white/10 text-center mb-4">
                   <div className="flex items-center justify-center gap-4 text-sm font-black">
                      <span className="text-neon-blue">{reportingMatch.team1Name}</span>
                      <span className="text-[10px] text-gray-500 italic">VS</span>
                      <span className="text-neon-blue">{reportingMatch.team2Name}</span>
                   </div>
                   <p className="text-[10px] text-gray-500 mt-2">{reportingMatch.date} @ {reportingMatch.time}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 font-bold uppercase block">Result Type</label>
                  <select 
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm"
                    value={reportData.type}
                    onChange={e => setReportData({...reportData, type: e.target.value as MatchResultType, winnerId: e.target.value === 'rematch' ? '' : reportData.winnerId})}
                  >
                    <option value="win">Win / Loss</option>
                    <option value="walkout">Walkout (Penalty)</option>
                    <option value="rematch">Rematch (No points)</option>
                    <option value="cancelled">Cancelled (Hidden from public)</option>
                  </select>
                </div>

                {reportData.type !== 'rematch' && (
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase block">
                      {reportData.type === 'walkout' ? 'Who Walked Out?' : 'Winner'}
                    </label>
                    <select 
                      className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm"
                      value={reportData.winnerId}
                      onChange={e => setReportData({...reportData, winnerId: e.target.value})}
                      required
                    >
                      <option value="">Select Team</option>
                      <option value={reportingMatch.team1Id}>{reportingMatch.team1Name}</option>
                      <option value={reportingMatch.team2Id}>{reportingMatch.team2Name}</option>
                    </select>
                    {reportData.type === 'walkout' && (
                      <p className="text-[10px] text-neon-red font-medium">Note: Selecting a team for Walkout will deduct points/diamonds from them.</p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 font-bold uppercase block">Proof / External Link (Optional)</label>
                  <input 
                    type="url" 
                    placeholder="https://..." 
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm"
                    value={reportData.externalLink}
                    onChange={e => setReportData({...reportData, externalLink: e.target.value})}
                  />
                </div>

                <div className="space-y-4 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-gray-500 font-bold uppercase">Reward/Penalty Override</label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={reportData.useManual}
                        onChange={e => setReportData({...reportData, useManual: e.target.checked})}
                      />
                      <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:width-4 after:transition-all peer-checked:bg-neon-blue"></div>
                      <span className="ml-2 text-[10px] font-black uppercase text-gray-400">Manual</span>
                    </label>
                  </div>

                  {reportData.useManual && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="grid grid-cols-2 gap-4 bg-black/30 p-4 rounded-xl border border-white/5">
                      <div className="space-y-2">
                        <label className="text-[10px] text-neon-blue font-bold uppercase truncate">{reportingMatch.team1Name}</label>
                        <div className="flex gap-2">
                          <input 
                            type="number" 
                            placeholder="Pts"
                            className="w-full bg-black/50 border border-white/10 rounded p-1 text-xs"
                            value={reportData.pointsA}
                            onChange={e => setReportData({...reportData, pointsA: parseInt(e.target.value) || 0})}
                          />
                          <input 
                            type="number" 
                            placeholder="Dia"
                            className="w-full bg-black/50 border border-white/10 rounded p-1 text-xs"
                            value={reportData.diamondsA}
                            onChange={e => setReportData({...reportData, diamondsA: parseInt(e.target.value) || 0})}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-neon-blue font-bold uppercase truncate text-right block">{reportingMatch.team2Name}</label>
                        <div className="flex gap-2">
                          <input 
                            type="number" 
                            placeholder="Pts"
                            className="w-full bg-black/50 border border-white/10 rounded p-1 text-xs text-right"
                            value={reportData.pointsB}
                            onChange={e => setReportData({...reportData, pointsB: parseInt(e.target.value) || 0})}
                          />
                          <input 
                            type="number" 
                            placeholder="Dia"
                            className="w-full bg-black/50 border border-white/10 rounded p-1 text-xs text-right"
                            value={reportData.diamondsB}
                            onChange={e => setReportData({...reportData, diamondsB: parseInt(e.target.value) || 0})}
                          />
                        </div>
                      </div>
                      <p className="col-span-2 text-[8px] text-gray-500 italic">Positive = Add, Negative = Deduct</p>
                    </motion.div>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setReportingMatch(null)} className="flex-1 bg-white/5 hover:bg-white/10 p-3 rounded-xl font-bold uppercase text-xs">Cancel</button>
                  <button 
                    type="submit" 
                    disabled={isReporting}
                    className="flex-1 bg-neon-blue text-black p-3 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2"
                  >
                    {isReporting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                    Submit Report
                  </button>
                </div>
              </form>

              {reportData.externalLink && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <a 
                    href={reportData.externalLink} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[10px] text-neon-blue hover:underline flex items-center justify-center gap-1"
                  >
                    <ExternalLink size={10} /> Open External Reporting Tool
                  </a>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-xl font-black uppercase text-neon-blue">Schedules Management</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button 
            type="button"
            onClick={handleResetSeasonCounts}
            className="bg-neon-orange/20 text-neon-orange border border-neon-orange/50 px-4 py-2 rounded-lg font-black uppercase flex items-center gap-2 hover:bg-neon-orange hover:text-white transition-all text-xs pointer-events-auto"
          >
            <ShieldCheck size={16} /> Reset Season
          </button>
          <button 
            type="button"
            onClick={() => setShowClearAllConfirm(true)}
            disabled={schedules.length === 0}
            className="bg-neon-red/20 text-neon-red border border-neon-red/50 px-4 py-2 rounded-lg font-black uppercase flex items-center gap-2 hover:bg-neon-red hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs pointer-events-auto"
          >
            <Trash size={16} /> Clear All
          </button>
          <button 
            onClick={() => setShowAIPanel(!showAIPanel)}
            className="bg-neon-purple/20 text-neon-purple border border-neon-purple/50 px-4 py-2 rounded-lg font-black uppercase flex items-center gap-2 hover:bg-neon-purple hover:text-black transition-all text-xs whitespace-nowrap"
          >
            <Wand2 size={16} /> AI Auto-Schedule
          </button>
        </div>
      </div>

      {showAIPanel && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="glass-card p-6 border border-neon-purple/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-purple via-neon-pink to-neon-purple"></div>
          <h3 className="text-xs font-black uppercase text-neon-purple mb-4 flex items-center gap-2">
            <Wand2 size={14} /> AI Scheduler Settings
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">Start Date</label>
              <input type="date" className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm" value={aiSettings.date} onChange={e => setAiSettings({...aiSettings, date: e.target.value})} />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">Start Time</label>
              <input type="time" className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm" value={aiSettings.startTime} onChange={e => setAiSettings({...aiSettings, startTime: e.target.value})} />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">End Time Limit</label>
              <input type="time" className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm" value={aiSettings.endTime} onChange={e => setAiSettings({...aiSettings, endTime: e.target.value})} />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">Minutes Per Match</label>
              <input type="number" min="5" className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm" value={aiSettings.durationMinutes} onChange={e => setAiSettings({...aiSettings, durationMinutes: parseInt(e.target.value)})} />
            </div>
          </div>
          <button 
            onClick={handleGenerateAI}
            disabled={isGenerating}
            className="w-full bg-neon-purple text-black font-black uppercase px-6 py-3 rounded-lg hover:bg-white transition-colors flex items-center justify-center gap-2"
          >
            {isGenerating ? <div className="animate-spin w-4 h-4 border-2 border-black border-t-transparent rounded-full" /> : <Wand2 size={16} />}
            Generate Schedule Now
          </button>
        </motion.div>
      )}

      <div className="glass-card p-6">
        <h3 className="text-xs font-black uppercase text-gray-500 mb-4 flex items-center gap-2">
          <Plus size={14} /> Manually Add Match
        </h3>
        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4">
          <div className="col-span-1 md:col-span-2">
            <select 
              className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm"
              value={newMatch.team1Id || ''}
              onChange={e => {
                const tm = teams.find(t => t.id === e.target.value);
                setNewMatch({...newMatch, team1Id: tm?.id, team1Name: tm?.teamName, firstPick: ''});
              }}
              required
            >
              <option value="">Select Team 1</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.teamName}</option>)}
            </select>
          </div>
          <div className="col-span-1 md:col-span-2">
            <select 
              className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm"
              value={newMatch.team2Id || ''}
              onChange={e => {
                const tm = teams.find(t => t.id === e.target.value);
                setNewMatch({...newMatch, team2Id: tm?.id, team2Name: tm?.teamName, firstPick: ''});
              }}
              required
            >
              <option value="">Select Team 2</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.teamName}</option>)}
            </select>
          </div>
          <div>
            <input 
              type="date" 
              className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm"
              value={newMatch.date}
              onChange={e => setNewMatch({...newMatch, date: e.target.value})}
              required
            />
          </div>
          <div className="col-span-1 md:col-span-1">
            <select 
              className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm"
              value={newMatch.time}
              onChange={e => setNewMatch({...newMatch, time: e.target.value})}
              required
            >
              <option value="">Time Slot</option>
              {MATCH_SLOTS.map(slot => (
                <option key={slot} value={slot}>{slot}</option>
              ))}
            </select>
          </div>
          <div className="col-span-1 md:col-span-2">
            <select 
              className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm"
              value={newMatch.firstPick}
              onChange={e => setNewMatch({...newMatch, firstPick: e.target.value})}
              required
              disabled={!newMatch.team1Name || !newMatch.team2Name}
            >
              <option value="">1st Pick</option>
              {newMatch.team1Name && <option value={newMatch.team1Name}>{newMatch.team1Name}</option>}
              {newMatch.team2Name && <option value={newMatch.team2Name}>{newMatch.team2Name}</option>}
            </select>
          </div>
          <div className="md:col-span-4 flex items-end">
            <button type="submit" className="bg-neon-blue text-black font-black uppercase px-6 py-2 rounded-lg hover:bg-white transition-colors w-full sm:w-auto">
              Add Schedule
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-8">
        {/* Pending Results Section */}
        {(() => {
          const pending = schedules.filter(s => {
            if (s.status === 'completed' || s.status === 'cancelled') return false;
            const matchDateTime = new Date(`${s.date}T${s.time}`).getTime();
            return Date.now() >= matchDateTime;
          });

          if (pending.length === 0) return null;

          return (
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase text-neon-red flex items-center gap-2">
                <AlertCircle size={14} className="animate-pulse" /> Pending Results (Matches Finished)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pending.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(s => renderScheduleCard(s))}
              </div>
            </div>
          );
        })()}

        {/* Upcoming Schedules Section */}
        <div className="space-y-4">
          <h3 className="text-xs font-black uppercase text-gray-500 flex items-center gap-2">
            <Calendar size={14} /> Upcoming / Active Schedules
          </h3>
          
          {schedules.length === 0 ? (
            <div className="text-center py-8 text-gray-500 font-medium text-xs uppercase tracking-widest border border-white/5 rounded-2xl bg-white/5">
              No schedules created yet
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {schedules
                .filter(s => {
                  if (s.status === 'completed' || s.status === 'cancelled') return true;
                  const matchDateTime = new Date(`${s.date}T${s.time}`).getTime();
                  return Date.now() < matchDateTime || s.status === 'live';
                })
                .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map(s => renderScheduleCard(s))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function renderScheduleCard(s: ScheduleMatch) {
    return (
      <div key={s.id} className={`bg-white/5 border p-4 rounded-xl relative group transition-all hover:border-white/20 ${
        (s.status === 'upcoming' && Date.now() >= new Date(`${s.date}T${s.time}`).getTime()) 
          ? 'border-neon-red/30 shadow-[0_0_15px_rgba(255,46,99,0.05)]' 
          : 'border-white/10'
      }`}>
        {editingId === s.id ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input type="date" className="w-full bg-black/50 border border-white/10 rounded p-1 text-xs" value={editMatch.date} onChange={e => setEditMatch({...editMatch, date: e.target.value})} />
              <input type="time" className="w-full bg-black/50 border border-white/10 rounded p-1 text-xs" value={editMatch.time} onChange={e => setEditMatch({...editMatch, time: e.target.value})} />
            </div>
            <div className="flex gap-2 items-center">
              <select className="w-full bg-black/50 border border-white/10 rounded p-1 text-xs" value={editMatch.team1Id || ''} onChange={e => {
                const tm = teams.find(t => t.id === e.target.value);
                setEditMatch({...editMatch, team1Id: tm?.id, team1Name: tm?.teamName, firstPick: ''});
              }}>
                <option value="">Team 1</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.teamName}</option>)}
                {!teams.find(t => t.id === editMatch.team1Id) && editMatch.team1Name && <option value={editMatch.team1Id}>{editMatch.team1Name}</option>}
              </select>
              <span className="text-[10px]">VS</span>
               <select className="w-full bg-black/50 border border-white/10 rounded p-1 text-xs" value={editMatch.team2Id || ''} onChange={e => {
                const tm = teams.find(t => t.id === e.target.value);
                setEditMatch({...editMatch, team2Id: tm?.id, team2Name: tm?.teamName, firstPick: ''});
              }}>
                <option value="">Team 2</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.teamName}</option>)}
                {!teams.find(t => t.id === editMatch.team2Id) && editMatch.team2Name && <option value={editMatch.team2Id}>{editMatch.team2Name}</option>}
              </select>
            </div>
            <div className="flex gap-2 items-center">
              <select className="w-full bg-black/50 border border-white/10 rounded p-1 text-xs" value={editMatch.firstPick} onChange={e => setEditMatch({...editMatch, firstPick: e.target.value})}>
                <option value="">1st Pick</option>
                {editMatch.team1Name && <option value={editMatch.team1Name}>{editMatch.team1Name}</option>}
                {editMatch.team2Name && <option value={editMatch.team2Name}>{editMatch.team2Name}</option>}
              </select>
              <select className="w-full bg-black/50 border border-white/10 rounded p-1 text-xs" value={editMatch.status} onChange={e => setEditMatch({...editMatch, status: e.target.value as any})}>
                <option value="upcoming">Upcoming</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-2">
               <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-white p-1"><X size={16}/></button>
               <button onClick={handleUpdate} className="text-neon-green hover:text-white p-1"><Check size={16}/></button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-black uppercase px-2 py-1 border rounded ${
                  s.status === 'upcoming' ? 'bg-neon-blue/10 text-neon-blue border-neon-blue/20' :
                  s.status === 'live' ? 'bg-neon-red text-white border-neon-red animate-pulse' :
                  s.status === 'completed' ? 'bg-neon-green/10 text-neon-green border-neon-green/20' :
                  'bg-neon-red/10 text-neon-red border-neon-red/20'
                }`}>
                  {s.status}
                </span>
                <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
                  <Calendar size={12} /> {s.date} <Clock size={12} /> {s.time}
                </div>
              </div>

              <div className="flex items-center gap-2 pointer-events-auto">
                <button 
                  type="button"
                  onClick={() => { setEditingId(s.id); setEditMatch(s); }} 
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neon-blue/10 text-neon-blue rounded-lg text-[10px] font-black uppercase border border-neon-blue/20 hover:bg-neon-blue hover:text-black transition-all active:scale-95 shadow-[0_0_10px_rgba(0,229,255,0.1)]"
                >
                  <Pencil size={12}/>
                  Edit
                </button>
                <button 
                  type="button"
                  onClick={() => setDeleteConfirmId(s.id)} 
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neon-red/10 text-neon-red rounded-lg text-[10px] font-black uppercase border border-neon-red/20 hover:bg-neon-red hover:text-white transition-all active:scale-95 shadow-[0_0_10px_rgba(255,46,99,0.1)]"
                >
                  <Trash size={12}/>
                  Delete
                </button>
              </div>
            </div>
            
            <div className="flex justify-between items-center bg-black/50 p-3 rounded-lg border border-white/5">
              <div className="flex space-x-2 items-center w-[40%] overflow-hidden">
                <div className="w-6 h-6 rounded bg-black border border-white/10 shrink-0 flex items-center justify-center overflow-hidden">
                  {teams.find(t => t.id === s.team1Id)?.logoUrl ? 
                    <ImageWithFallback src={teams.find(t => t.id === s.team1Id)!.logoUrl!} className="w-full h-full object-cover" /> : 
                    <Users size={12} className={`shrink-0 ${s.matchDetails?.winnerId === s.team1Id ? 'text-neon-blue' : 'text-gray-500'}`} />
                  }
                </div>
                <span className={`text-sm font-black uppercase truncate ${s.matchDetails?.winnerId === s.team1Id ? 'text-neon-blue' : ''}`}>{s.team1Name}</span>
              </div>
              <span className="text-[10px] font-black italic text-neon-blue px-2">VS</span>
              <div className="flex space-x-2 justify-end items-center w-[40%] overflow-hidden text-right">
                <span className={`text-sm font-black uppercase truncate ${s.matchDetails?.winnerId === s.team2Id ? 'text-neon-blue' : ''}`}>{s.team2Name}</span>
                <div className="w-6 h-6 rounded bg-black border border-white/10 shrink-0 flex items-center justify-center overflow-hidden">
                  {teams.find(t => t.id === s.team2Id)?.logoUrl ? 
                    <ImageWithFallback src={teams.find(t => t.id === s.team2Id)!.logoUrl!} className="w-full h-full object-cover" /> : 
                    <Users size={12} className={`shrink-0 ${s.matchDetails?.winnerId === s.team2Id ? 'text-neon-blue' : 'text-gray-500'}`} />
                  }
                </div>
              </div>
            </div>

            {s.status === 'completed' && s.matchDetails && (
              <div className="mt-3 bg-neon-blue/5 border border-neon-blue/10 rounded-lg p-2 grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-widest">
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded-sm bg-black border border-white/10 flex items-center justify-center overflow-hidden">
                      {teams.find(t => t.id === s.team1Id)?.logoUrl && <ImageWithFallback src={teams.find(t => t.id === s.team1Id)!.logoUrl!} className="w-full h-full object-cover" />}
                    </div>
                    <p className="text-gray-500 truncate">{s.team1Name}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className={s.matchDetails.pointsExchanged?.team1 && s.matchDetails.pointsExchanged.team1 >= 0 ? 'text-neon-green' : 'text-neon-red'}>
                      {s.matchDetails.pointsExchanged?.team1 && s.matchDetails.pointsExchanged.team1 >= 0 ? '+' : ''}{s.matchDetails.pointsExchanged?.team1} PTS
                    </span>
                    <span className={s.matchDetails.diamondsExchanged?.team1 && s.matchDetails.diamondsExchanged.team1 >= 0 ? 'text-neon-cyan' : 'text-neon-red'}>
                      {s.matchDetails.diamondsExchanged?.team1 && s.matchDetails.diamondsExchanged.team1 >= 0 ? '+' : ''}{s.matchDetails.diamondsExchanged?.team1} DIA
                    </span>
                  </div>
                </div>
                <div className="space-y-1 text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <p className="text-gray-500 truncate">{s.team2Name}</p>
                    <div className="w-4 h-4 rounded-sm bg-black border border-white/10 flex items-center justify-center overflow-hidden">
                      {teams.find(t => t.id === s.team2Id)?.logoUrl && <ImageWithFallback src={teams.find(t => t.id === s.team2Id)!.logoUrl!} className="w-full h-full object-cover" />}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <span className={s.matchDetails.pointsExchanged?.team2 && s.matchDetails.pointsExchanged.team2 >= 0 ? 'text-neon-green' : 'text-neon-red'}>
                      {s.matchDetails.pointsExchanged?.team2 && s.matchDetails.pointsExchanged.team2 >= 0 ? '+' : ''}{s.matchDetails.pointsExchanged?.team2} PTS
                    </span>
                    <span className={s.matchDetails.diamondsExchanged?.team2 && s.matchDetails.diamondsExchanged.team2 >= 0 ? 'text-neon-cyan' : 'text-neon-red'}>
                      {s.matchDetails.diamondsExchanged?.team2 && s.matchDetails.diamondsExchanged.team2 >= 0 ? '+' : ''}{s.matchDetails.diamondsExchanged?.team2} DIA
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold text-gray-400 uppercase">
              <Crown size={12} className="text-yellow-500" />
              1st Pick: <span className="text-white">{s.firstPick}</span>
            </div>

            <div className="mt-4 flex gap-2">
              {(() => {
                const matchDateTime = new Date(`${s.date}T${s.time}`).getTime();
                const now = Date.now();
                const isTimePassed = now >= matchDateTime;
                const canReport = s.status === 'completed' || isTimePassed;

                if (!canReport) {
                  return (
                    <div className="flex-1 py-2 px-3 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black uppercase text-gray-600 text-center flex items-center justify-center gap-2">
                      <Clock size={14} />
                      Starts in <CountdownTimer date={s.date} time={s.time} compact />
                    </div>
                  );
                }

                return (
                  <button 
                    onClick={() => {
                      setReportingMatch(s);
                      
                      setReportData({ 
                        winnerId: s.matchDetails?.winnerId || '', 
                        type: s.matchDetails?.resultType || 'win', 
                        externalLink: '', 
                        pointsA: s.matchDetails?.pointsExchanged?.team1 || 0, 
                        pointsB: s.matchDetails?.pointsExchanged?.team2 || 0, 
                        diamondsA: s.matchDetails?.diamondsExchanged?.team1 || 0, 
                        diamondsB: s.matchDetails?.diamondsExchanged?.team2 || 0, 
                        useManual: !!s.matchDetails
                      });
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[10px] font-black uppercase transition-all ${
                      s.status === 'completed' 
                        ? 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/5' 
                        : 'bg-neon-blue/10 text-neon-blue hover:bg-neon-blue hover:text-black border border-neon-blue/20 shadow-[0_0_15px_rgba(0,229,255,0.2)]'
                    }`}
                  >
                    <Trophy size={14} />
                    {s.status === 'completed' ? 'Update Report' : 'Make Result'}
                  </button>
                );
              })()}
              
              {s.status === 'upcoming' && (
                <a 
                  href={`https://facebook.com/groups/mlbbguildbangladesh`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center p-2 rounded-lg bg-white/5 text-gray-500 hover:text-white border border-white/5 transition-all"
                  title="External Tool"
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </>
        )}
      </div>
    );
  }
}
