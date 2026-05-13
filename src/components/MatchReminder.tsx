import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { ScheduleMatch } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, Bell, X } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/firebase';

export const MatchReminder: React.FC = () => {
  const { user } = useAuth();
  const [todayMatches, setTodayMatches] = useState<ScheduleMatch[]>([]);
  const [dismissedMatches, setDismissedMatches] = useState<Set<string>>(new Set());

  useEffect(() => {
    // We only show reminders for normal users that are assigned to a team
    if (!user || !user.teamId) return;

    // Get today's date in YYYY-MM-DD format
    // Because users may be in different timezones, we'll construct it using local date
    const dateObj = new Date();
    const todayStr = dateObj.toLocaleDateString('en-CA'); // e.g., 2026-04-28 (YYYY-MM-DD local timezone)

    const q = query(
      collection(db, 'schedules'),
      where('date', '==', todayStr)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ScheduleMatch[];
      // Filter locally for matches where this user's team is participating
      const myMatches = ms.filter(m => m.team1Id === user.teamId || m.team2Id === user.teamId);
      setTodayMatches(myMatches);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'schedules');
    });

    return () => unsubscribe();
  }, [user]);

  if (todayMatches.length === 0) return null;

  const displayMatches = todayMatches.filter(m => !dismissedMatches.has(m.id));
  if (displayMatches.length === 0) return null;

  const handleDismiss = (id: string) => {
    setDismissedMatches(prev => {
      const newSet = new Set(prev);
      newSet.add(id);
      return newSet;
    });
  };

  return (
    <div className="fixed top-24 right-4 z-50 flex flex-col gap-3">
      <AnimatePresence>
        {displayMatches.map(match => (
          <motion.div
            key={match.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9 }}
            className="bg-black/80 border border-neon-cyan/50 p-4 rounded-xl shadow-[0_0_20px_rgba(0,255,255,0.2)] backdrop-blur-md flex flex-col gap-2 w-72 relative group"
          >
            <button 
              onClick={() => handleDismiss(match.id)} 
              className="absolute top-2 right-2 text-gray-500 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
            <div className="flex items-center gap-2 text-neon-cyan font-black tracking-widest text-[10px] uppercase">
              <Bell size={12} className="animate-pulse" />
              Match Today Reminder!
            </div>
            
            <div className="flex justify-between items-center text-sm font-black text-white px-1 mt-1 uppercase tracking-wider">
              <span className="truncate flex-1 text-left">{match.team1Name}</span>
              <span className="text-neon-blue text-[10px] px-2">VS</span>
              <span className="truncate flex-1 text-right">{match.team2Name}</span>
            </div>

            <div className="flex justify-center items-center gap-4 text-xs font-mono text-gray-300 mt-2 bg-white/5 py-1.5 rounded border border-white/5">
              <div className="flex items-center gap-1.5">
                <Clock size={12} className="text-neon-cyan" />
                <span>{match.time}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
