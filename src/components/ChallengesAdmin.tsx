import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, deleteDoc, getDocs, where, writeBatch, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createNotification } from '../lib/notificationUtils';
import { Challenge, Team, ScheduleMatch, MAX_SEASON_MATCHES } from '../types';
import { Swords, Trash, Check, X, Shield, AlertTriangle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function ChallengesAdmin() {
  const { settings } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubTeams = onSnapshot(collection(db, 'teams'), (snap) => {
      setTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)));
    });

    const unsubChallenges = onSnapshot(collection(db, 'challenges'), (snap) => {
      setChallenges(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Challenge)));
      setLoading(false);
    });

    return () => {
      unsubTeams();
      unsubChallenges();
    };
  }, []);

  const handleForceAccept = async (challenge: Challenge, targetTeamId: string) => {
    if (processingId) return;
    setProcessingId(`${challenge.id}-${targetTeamId}`);

    const fromTeam = teams.find(t => t.id === challenge.fromTeamId);
    const targetTeam = teams.find(t => t.id === targetTeamId);
    const details = challenge.challengeDetails?.[targetTeamId];

    if (!fromTeam || !targetTeam || !details) {
      toast.error("Missing match data");
      setProcessingId(null);
      return;
    }

    // Season Limit Check
    if ((fromTeam.matchesThisSeason || 0) >= MAX_SEASON_MATCHES) {
      toast.error(`${fromTeam.teamName} has reached match limit.`);
      setProcessingId(null);
      return;
    }
    if ((targetTeam.matchesThisSeason || 0) >= MAX_SEASON_MATCHES) {
      toast.error(`${targetTeam.teamName} has reached match limit.`);
      setProcessingId(null);
      return;
    }

    try {
      const batch = writeBatch(db);

      // 1. Create Schedule
      const scheduleRef = doc(collection(db, 'schedules'));
      batch.set(scheduleRef, {
        team1Id: fromTeam.id,
        team1Name: fromTeam.teamName,
        team2Id: targetTeam.id,
        team2Name: targetTeam.teamName,
        date: details.date,
        time: details.time,
        matchType: 'challenge',
        status: 'upcoming',
        firstPick: details.sideSelection || '1st',
        createdAt: serverTimestamp()
      });

      // 2. Increment Counts
      batch.update(doc(db, 'teams', fromTeam.id), {
        matchesThisSeason: (fromTeam.matchesThisSeason || 0) + 1
      });
      batch.update(doc(db, 'teams', targetTeam.id), {
        matchesThisSeason: (targetTeam.matchesThisSeason || 0) + 1
      });

      // 3. Remove Challenge Entry for this target
      const newTargets = (challenge.targetTeamIds || []).filter(id => id !== targetTeamId);
      if (newTargets.length === 0) {
        batch.delete(doc(db, 'challenges', challenge.id));
      } else {
        const newDetails = { ...challenge.challengeDetails };
        delete newDetails[targetTeamId];
        
        // Sanitize to remove any potential undefined sideSelection or other optional fields
        Object.keys(newDetails).forEach(key => {
          const d = newDetails[key] as any;
          if (d && d.sideSelection === undefined) {
            delete d.sideSelection;
          }
        });

        batch.update(doc(db, 'challenges', challenge.id), {
          targetTeamIds: newTargets,
          challengeDetails: newDetails
        });
      }

      await batch.commit();
      toast.success("Match forced into schedule!");

      // Notify teams
      if (fromTeam.ownerId) {
        await createNotification(
          fromTeam.ownerId,
          'Admin: Match Forced',
          `An admin has officially scheduled your match against ${targetTeam.teamName}. Check the schedule!`,
          'system',
          '/schedule'
        );
      }
      if (targetTeam.ownerId) {
        await createNotification(
          targetTeam.ownerId,
          'Admin: Match Forced',
          `An admin has officially scheduled your match against ${fromTeam.teamName}. Check the schedule!`,
          'system',
          '/schedule'
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to approve challenge.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteChallenge = async (challenge: Challenge, targetTeamId?: string) => {
    try {
      if (targetTeamId) {
        const newTargets = (challenge.targetTeamIds || []).filter(id => id !== targetTeamId);
        if (newTargets.length === 0) {
          await deleteDoc(doc(db, 'challenges', challenge.id));
        } else {
          const newDetails = { ...challenge.challengeDetails };
          delete newDetails[targetTeamId];
          
          // Sanitize to remove any potential undefined sideSelection or other optional fields
          Object.keys(newDetails).forEach(key => {
            const d = newDetails[key] as any;
            if (d && d.sideSelection === undefined) {
              delete d.sideSelection;
            }
          });

          await updateDoc(doc(db, 'challenges', challenge.id), {
            targetTeamIds: newTargets,
            challengeDetails: newDetails
          });
        }
      } else {
        await deleteDoc(doc(db, 'challenges', challenge.id));
      }
      toast.success("Challenge deleted.");

      // Notify challenger
      const fromTeam = teams.find(t => t.id === challenge.fromTeamId);
      if (fromTeam?.ownerId) {
        const targetTeam = targetTeamId ? teams.find(t => t.id === targetTeamId) : null;
        await createNotification(
          fromTeam.ownerId,
          'Challenge Removed',
          `An admin has cancelled your challenge ${targetTeam ? `targeting ${targetTeam.teamName}` : 'completely'}.`,
          'system',
          '/challenges'
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("Delete failed.");
    }
  };

  if (loading) return (
    <div className="flex justify-center p-20">
      <Loader2 size={40} className="animate-spin text-neon-blue" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black uppercase text-neon-blue">Pending Challenges</h2>
        <div className="text-[10px] font-black uppercase text-gray-500 bg-white/5 px-4 py-2 rounded-lg border border-white/10">
          {challenges.reduce((acc, c) => acc + (c.targetTeamIds || []).length, 0)} TOTAL REQUESTS
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {challenges.map(c => {
          const fromTeam = teams.find(t => t.id === c.fromTeamId);
          return (c.targetTeamIds || []).map(targetId => {
            const targetTeam = teams.find(t => t.id === targetId);
            const details = c.challengeDetails?.[targetId];
            const isProcessing = processingId === `${c.id}-${targetId}`;

            return (
              <div key={`${c.id}-${targetId}`} className="glass-card p-6 flex flex-col md:flex-row items-center justify-between gap-6 hover:border-white/20 transition-all border border-white/10">
                <div className="flex items-center gap-6 flex-1">
                  <div className="text-center">
                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-2">Challenger</p>
                    <div className="flex items-center gap-3 bg-neon-blue/5 border border-neon-blue/20 rounded-xl p-3 min-w-[160px]">
                      <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center border border-white/10 overflow-hidden">
                        {fromTeam?.logoUrl ? <img src={fromTeam.logoUrl} className="w-full h-full object-cover" /> : <Shield size={16} />}
                      </div>
                      <span className="font-black text-xs uppercase truncate">{fromTeam?.teamName || 'Unknown'}</span>
                    </div>
                  </div>

                  <Swords size={20} className="text-gray-600 shrink-0 mt-4" />

                  <div className="text-center">
                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-2">Target</p>
                    <div className="flex items-center gap-3 bg-neon-red/5 border border-neon-red/20 rounded-xl p-3 min-w-[160px]">
                      <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center border border-white/10 overflow-hidden">
                        {targetTeam?.logoUrl ? <img src={targetTeam.logoUrl} className="w-full h-full object-cover" /> : <Shield size={16} />}
                      </div>
                      <span className="font-black text-xs uppercase truncate">{targetTeam?.teamName || 'Unknown'}</span>
                    </div>
                  </div>
                </div>

                {settings?.bettingEnabled && (
                  <div className="hidden lg:grid grid-cols-2 gap-4 px-6 border-x border-white/5">
                    <div>
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Proposed Slot</p>
                      <p className="text-[10px] font-bold text-white uppercase">{details?.date} @ {details?.time}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Stakes</p>
                      <p className="text-[10px] font-black text-neon-cyan uppercase">{details?.bet || 0} Diamonds</p>
                    </div>
                  </div>
                )}
                {!settings?.bettingEnabled && (
                  <div className="hidden lg:block px-6 border-x border-white/5">
                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Proposed Slot</p>
                    <p className="text-[10px] font-bold text-white uppercase">{details?.date} @ {details?.time}</p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    disabled={isProcessing}
                    onClick={() => handleForceAccept(c, targetId)}
                    className="p-3 bg-neon-green/10 text-neon-green border border-neon-green/30 rounded-xl hover:bg-neon-green/20 transition-all"
                    title="Force Approve"
                  >
                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  </button>
                  <button
                    onClick={() => handleDeleteChallenge(c, targetId)}
                    className="p-3 bg-neon-red/10 text-neon-red border border-neon-red/30 rounded-xl hover:bg-neon-red/20 transition-all"
                    title="Reject/Delete"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            );
          });
        })}

        {challenges.length === 0 && (
          <div className="text-center py-20 bg-white/5 border border-white/5 rounded-3xl space-y-4">
            <Swords size={48} className="mx-auto text-gray-800" />
            <p className="text-gray-600 font-bold uppercase tracking-widest text-xs italic">
              Terminal clear. No active challenge requests detected.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
