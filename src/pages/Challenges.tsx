import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { 
  Swords, 
  Users, 
  CheckCircle2, 
  Lock, 
  Unlock, 
  Search, 
  Filter,
  AlertTriangle,
  AlertCircle,
  Flame,
  ArrowRight,
  LayoutDashboard,
  Clock,
  Calendar,
  Trophy,
  Loader2,
  X,
  Plus,
  Shield,
  Zap,
  TrendingUp,
  Diamond,
  History,
  TrendingDown,
  MinusCircle
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc,
  serverTimestamp,
  getDocs,
  addDoc,
  writeBatch,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Team, Challenge, AppSetting, ChallengeDetails, ScheduleMatch, Transaction, MATCH_SLOTS } from '../types';
import CountdownTimer from '../components/CountdownTimer';
import { FALLBACK_IMAGE } from '../lib/utils';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { createNotification } from '../lib/notificationUtils';

import { showConfirmToast } from '../lib/toastUtils';

const Challenges: React.FC = () => {
  const { user, isAdmin, settings: globalSettings } = useAuth();

  if (globalSettings?.showChallenges === false && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const [teams, setTeams] = useState<Team[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [schedules, setSchedules] = useState<ScheduleMatch[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<AppSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'board' | 'dashboard' | 'matches' | 'schedule' | 'history'>('board');
  const [newMatchNotify, setNewMatchNotify] = useState<string | null>(null);
  const [timePickerTeam, setTimePickerTeam] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedBet, setSelectedBet] = useState('');
  const [selectedPick, setSelectedPick] = useState<'1st' | '2nd' | ''>('');
  const [selectedTeamSwitch, setSelectedTeamSwitch] = useState<boolean>(false);
  const [occupiedSlots, setOccupiedSlots] = useState<string[]>([]);
  const [teamOccupiedSlots, setTeamOccupiedSlots] = useState<string[]>([]);
  const [acceptModalData, setAcceptModalData] = useState<{ c: Challenge, fromTeam: Team } | null>(null);

  const activeChallenges = useMemo(() => {
    const today = new Date();
    const todayStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    return challenges.filter(c => {
      if (c.challengeDetails) {
        const hasValidDate = Object.values(c.challengeDetails).some((d: any) => d.date >= todayStr);
        return hasValidDate;
      }
      // If no details (legacy), use the 24 hour rule
      if (!c.timestamp) return true;
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const timestamp = c.timestamp?.toMillis ? c.timestamp.toMillis() : (typeof c.timestamp === 'number' ? c.timestamp : new Date(c.timestamp).getTime());
      return timestamp > oneDayAgo;
    });
  }, [challenges]);

  // Auto-cleanup expired challenges
  useEffect(() => {
    if (!challenges.length) return;
    const today = new Date();
    const todayStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    const expiredChallenges = challenges.filter(c => {
      if (!c.challengeDetails) return false;
      const keys = Object.keys(c.challengeDetails);
      if (keys.length === 0) return false;
      const allDatesPast = Object.values(c.challengeDetails).every((d: any) => d.date && d.date < todayStr);
      return allDatesPast;
    });

    if (expiredChallenges.length > 0) {
      const cleanUp = async () => {
        try {
          const batch = writeBatch(db);
          expiredChallenges.forEach(c => {
            batch.delete(doc(db, 'challenges', c.id));
          });
          await batch.commit();
        } catch (err) {
          console.error("Failed to cleanup expired challenges:", err);
        }
      };
      cleanUp();
    }
  }, [challenges]);

  const currentTeam = useMemo(() => {
    if (!user) return null;
    if (user.role === 'admin') return null;

    // First try finding by the teamId associated with the user profile (used as active team)
    if (user.teamId) {
      const activeTeam = teams.find(t => t.id === user.teamId);
      if (activeTeam && (activeTeam.ownerId === user.id || activeTeam.players.includes(user.id))) {
         return activeTeam;
      }
    }
    
    // Fallback: finding by where user is owner (for leaders)
    const ownedTeam = teams.find(t => t.ownerId === user.id);
    if (ownedTeam) return ownedTeam;

    return null;
  }, [user, teams]);

  const isLeader = useMemo(() => {
    return currentTeam && currentTeam.ownerId === user?.id;
  }, [currentTeam, user]);

  const userChallenge = useMemo(() => {
    if (!currentTeam) return null;
    return activeChallenges.find(c => c.fromTeamId === currentTeam.id);
  }, [currentTeam, activeChallenges]);

  const minDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  useEffect(() => {
    if (!selectedDate || !timePickerTeam || !currentTeam) return;

    // Fetch occupied slots for the whole system (Schedules + Active Challenges)
    const qSystem = query(
      collection(db, 'schedules'),
      where('date', '==', selectedDate),
      where('status', 'in', ['upcoming', 'live'])
    );

    const unsubscribeSystem = onSnapshot(qSystem, (snap) => {
      const scheduleSlots = snap.docs.map(doc => (doc.data() as ScheduleMatch).time);
      
      // Also factor in slots from active challenges
      const challengeSlots: string[] = [];
      activeChallenges.forEach(c => {
        if (c.challengeDetails) {
          Object.values(c.challengeDetails).forEach((d: ChallengeDetails) => {
            if (d.date === selectedDate) {
              challengeSlots.push(d.time);
            }
          });
        }
      });

      setOccupiedSlots([...new Set([...scheduleSlots, ...challengeSlots])]);
    });

    // Fetch occupied slots for the specific teams (current and target)
    const qTeams = query(
      collection(db, 'schedules'),
      where('date', '==', selectedDate),
      where('status', 'in', ['upcoming', 'live'])
    );

    const unsubscribeTeams = onSnapshot(qTeams, (snap) => {
      const teamSlots: string[] = [];
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (
          data.team1Id === currentTeam.id || 
          data.team2Id === currentTeam.id || 
          data.team1Id === timePickerTeam || 
          data.team2Id === timePickerTeam
        ) {
          teamSlots.push(data.time);
        }
      });
      setTeamOccupiedSlots(teamSlots);
    });

    return () => {
      unsubscribeSystem();
      unsubscribeTeams();
    };
  }, [selectedDate, timePickerTeam, currentTeam]);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    const unsubscribeTeams = onSnapshot(collection(db, 'teams'), (snapshot) => {
      setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)));
      setLoading(false);
    }, (error) => {
      console.error("Teams Snapshot Error:", error);
    });

    const unsubscribeChallenges = onSnapshot(collection(db, 'challenges'), (snapshot) => {
      setChallenges(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Challenge)));
    }, (error) => {
      console.error("Challenges Snapshot Error:", error);
    });

    const unsubscribeSchedules = onSnapshot(collection(db, 'schedules'), (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    }, (error) => {
      console.error("Schedules Snapshot Error:", error);
    });

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings({ id: 'global', ...snapshot.data() } as AppSetting);
      }
    }, (error) => {
      console.error("Settings Snapshot Error:", error);
    });

    let unsubscribeTransactions: any = () => {};
    const currentUser = auth.currentUser;
    if (currentTeam?.id && currentUser) {
       const qTrans = query(
         collection(db, 'transactions'),
         where('allowedViewerUids', 'array-contains', currentUser.uid),
         orderBy('timestamp', 'desc'),
         limit(50)
       );
       unsubscribeTransactions = onSnapshot(qTrans, (snap) => {
         setTransactions(snap.docs.map(d => ({
           id: d.id,
           ...d.data(),
           timestamp: d.data().timestamp?.toDate ? d.data().timestamp.toDate().toISOString() : d.data().timestamp
         } as Transaction)));
       }, (err) => {
         console.warn("Transactions Snapshot Error:", err);
       });
    }

    return () => {
      clearTimeout(timer);
      unsubscribeTeams();
      unsubscribeChallenges();
      unsubscribeSchedules();
      unsubscribeSettings();
      unsubscribeTransactions();
    };
  }, [currentTeam?.id]);



  const handleCreateChallenge = async () => {
    if (!currentTeam || !timePickerTeam) return;

    // Rule: Active Season Check
    const activeSeasonId = settings?.currentSeasonId;
    if (!activeSeasonId) {
      toast.error("No active season is currently set. Challenges are disabled.");
      return;
    }

    if (currentTeam.seasonId !== activeSeasonId) {
      toast.error("Your team is not part of the active season.");
      return;
    }

    const targetTeam = teams.find(t => t.id === timePickerTeam);
    if (!targetTeam || targetTeam.seasonId !== activeSeasonId) {
      toast.error("The selected guild is not part of the active season.");
      return;
    }

    // Rule: Season Match Limit
    const limit = settings?.challengeLimitPerUser || 7;
    if ((currentTeam.matchesThisSeason || 0) >= limit) {
      toast.error("Limit Reached");
      return;
    }

    // Rule: Date Validation
    if (!selectedDate || selectedDate < minDate) {
      toast.error(`Challenges must be scheduled for tomorrow (${minDate}) or later.`);
      return;
    }

    // Rule: Diamond Bet Validation
    const betAmount = settings?.bettingEnabled ? (parseInt(selectedBet) || 0) : 0;
    if (settings?.bettingEnabled && betAmount > 0 && betAmount > (currentTeam.diamonds || 0)) {
      toast.error("insufficient dimond please recharge", {
        icon: '💎',
        duration: 4000
      });
      return;
    }

    // Rule: Booking Time Check (One challenge/match per slot)
    try {
      const selectedDateTime = `${selectedDate} ${selectedTime}`;
      
      // Check schedules
      const isSlotOccupiedInSchedules = schedules.some(s => 
        s.date === selectedDate && s.time === selectedTime && s.status !== 'cancelled'
      );

      if (isSlotOccupiedInSchedules) {
        toast.error("This time slot is already booked for an official match.");
        return;
      }

      // Check other challenges
      const isSlotOccupiedInChallenges = activeChallenges.some(c => {
        if (!c.challengeDetails) return false;
        return Object.values(c.challengeDetails).some((d: ChallengeDetails) => 
          d.date === selectedDate && d.time === selectedTime
        );
      });

      if (isSlotOccupiedInChallenges) {
        toast.error("This time slot is already booked by another pending challenge. Please select another time.");
        return;
      }
    } catch (err) {
      console.error("Booking check error:", err);
    }

    if (targetTeam && (targetTeam.matchesThisSeason || 0) >= limit) {
      toast.error("Opponent Limit Reached");
      return;
    }

    // New Rule: One challenge per team pair per season
    try {
      const existingMatchQuery = query(
        collection(db, 'schedules'),
        where('team1Id', 'in', [currentTeam.id, timePickerTeam]),
        where('status', '!=', 'cancelled')
      );
      const matchSnap = await getDocs(existingMatchQuery);
      const hasMatch = matchSnap.docs.some(doc => {
        const d = doc.data();
        return (d.team1Id === currentTeam.id && d.team2Id === timePickerTeam) ||
               (d.team1Id === timePickerTeam && d.team2Id === currentTeam.id);
      });

      if (hasMatch) {
        toast.error("You have already challenged/played this team this season.");
        return;
      }
    } catch (err) {
      console.error("Match check error:", err);
    }

    try {
      const challengeId = currentTeam.id;
      const challengeRef = doc(db, 'challenges', challengeId);
      
      const details: any = {
        date: selectedDate || '',
        time: selectedTime || '',
        bet: settings?.bettingEnabled ? (selectedBet || '') : '',
        teamSwitch: selectedTeamSwitch
      };

      if (selectedPick) {
        details.sideSelection = selectedPick;
      }

      if (userChallenge) {
        // Update existing challenge
        const newTargets = [...new Set([...(userChallenge?.targetTeamIds || []), timePickerTeam])];
        await updateDoc(challengeRef, {
          targetTeamIds: newTargets,
          [`challengeDetails.${timePickerTeam}`]: details,
          timestamp: serverTimestamp()
        });
      } else {
        // Create new challenge
        const newChallenge: any = {
          fromTeamId: currentTeam.id,
          targetTeamIds: [timePickerTeam],
          challengeDetails: {
            [timePickerTeam]: details
          },
          timestamp: serverTimestamp()
        };
        await setDoc(challengeRef, newChallenge);
      }

      setTimePickerTeam(null);
      setSelectedTime('');
      setSelectedDate('');
      setSelectedPick('');
      setSelectedTeamSwitch(false);
      if (settings?.bettingEnabled) setSelectedBet('');
      toast.success("Challenge sent successfully!");

      // Notify target team
      if (targetTeam?.ownerId) {
        await createNotification(
          targetTeam.ownerId,
          'New Challenge!',
          `${currentTeam.teamName} has challenged your team to a match!`,
          'challenge',
          '/challenges'
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to send challenge.");
    }
  };

  const handleWithdraw = async (targetId?: string) => {
    if (!userChallenge) return;
    
    try {
      const challengeRef = doc(db, 'challenges', userChallenge.id);
      if (targetId) {
        const newTargets = (userChallenge?.targetTeamIds || []).filter(id => id !== targetId);
        if (newTargets.length === 0) {
          await deleteDoc(challengeRef);
        } else {
          const newDetails = { ...userChallenge.challengeDetails };
          delete newDetails[targetId];
          
          // Sanitize to remove any potential undefined sideSelection or other optional fields
          Object.keys(newDetails).forEach(key => {
            const d = newDetails[key];
            if (d && d.sideSelection === undefined) {
              delete d.sideSelection;
            }
          });

          await updateDoc(challengeRef, {
            targetTeamIds: newTargets,
            challengeDetails: newDetails
          });
        }
      } else {
        await deleteDoc(challengeRef);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async (challenge: Challenge) => {
    if (!currentTeam) return;
    
    const confirmReject = await showConfirmToast({
      title: "Confirm Penalty",
      message: "If you reject this challenge, your team will lose 10 points. Are you sure you want to proceed?",
      type: "danger",
      confirmLabel: "Reject Challenge & Lose Points"
    });
    if (!confirmReject) return;

    try {
      // 10 point penalty for declining as per user request
      const penaltyAmount = 10;
      const currentPoints = currentTeam.points || 0;
      const newPoints = Math.max(0, currentPoints - penaltyAmount);

      const batch = writeBatch(db);
      
      // Update Team points
      const teamRef = doc(db, 'teams', currentTeam.id);
      batch.update(teamRef, { points: newPoints });

      // Sync to User owner
      if (currentTeam.ownerId) {
        const userRef = doc(db, 'users', currentTeam.ownerId);
        batch.update(userRef, { points: newPoints });
      }

      // Add Transaction
      const transRef = doc(collection(db, 'transactions'));
      batch.set(transRef, {
        teamId: currentTeam.id,
        ownerId: currentTeam.ownerId || currentTeam.id,
        type: 'penalty',
        points: -penaltyAmount,
        diamonds: 0,
        reason: 'Declined Incoming Challenge',
        timestamp: serverTimestamp(),
        performedByEmail: auth.currentUser?.email || 'System',
        allowedViewerUids: [currentTeam.ownerId || currentTeam.id, ...(currentTeam.players || [])].filter(Boolean)
      });

      const challengeRef = doc(db, 'challenges', challenge.id);
      const newTargets = (challenge?.targetTeamIds || []).filter(id => id !== currentTeam.id);
      
      if (newTargets.length === 0) {
        batch.delete(challengeRef);
      } else {
        const newDetails = { ...(challenge.challengeDetails || {}) };
        delete newDetails[currentTeam.id];
        
        batch.update(challengeRef, {
          targetTeamIds: newTargets,
          challengeDetails: newDetails
        });
      }
      
      await batch.commit();

      // Notify challenger about rejection and point loss
      const fromTeam = teams.find(t => t.id === challenge.fromTeamId);
      if (fromTeam?.ownerId) {
        await createNotification(
          fromTeam.ownerId,
          'Challenge Declined',
          `${currentTeam?.teamName || 'The team'} has declined your challenge. They lost ${penaltyAmount} points as a penalty.`,
          'challenge',
          '/challenges'
        );
      }

      // Notify the current team members (voluntary)
      await createNotification(
        currentTeam.ownerId!,
        'Challenge Declined (Penalty)',
        `You declined ${fromTeam?.teamName || 'a'} challenge. -${penaltyAmount} points deducted.`,
        'system',
        '/challenges'
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to decline challenge.");
    }
  };

  const activeSeasonId = settings?.currentSeasonId;

  const filteredTeams = teams.filter(t => {
    if (t.id === currentTeam?.id) return false;
    if (t.registrationStatus !== 'approved') return false;
    if (!t.teamName.toLowerCase().includes(searchTerm.toLowerCase())) return false;

    // If no active season is set, hide everything to prevent invalid challenges
    if (!activeSeasonId) return false;

    // Only show teams in the active season
    if (t.seasonId !== activeSeasonId) return false;
    
    // Also the current user's team must be in the active season to see anyone
    if (currentTeam && currentTeam.seasonId !== activeSeasonId) return false;

    return true;
  });

  const matchedChallenges = useMemo(() => {
    const matches: { teamA: Team, teamB: Team, details: ChallengeDetails }[] = [];
    const processed = new Set<string>();

    activeChallenges.forEach(c1 => {
      (c1.targetTeamIds || []).forEach(targetId => {
        const c2 = activeChallenges.find(c => c.fromTeamId === targetId);
        if (c2 && (c2.targetTeamIds || []).includes(c1.fromTeamId)) {
          const pairKey = [c1.fromTeamId, targetId].sort().join('-');
          if (!processed.has(pairKey)) {
            const teamA = teams.find(t => t.id === c1.fromTeamId);
            const teamB = teams.find(t => t.id === targetId);
            if (teamA && teamB) {
              matches.push({
                teamA,
                teamB,
                details: c1.challengeDetails?.[targetId] || c2.challengeDetails?.[c1.fromTeamId] || { date: '', time: '', bet: '' }
              });
              processed.add(pairKey);
            }
          }
        }
      });
    });
    return matches;
  }, [challenges, teams]);

  const executeAccept = async (c: Challenge, fromTeam: Team) => {
    try {
      if (!currentTeam || !fromTeam) return;

      const activeSeasonId = settings?.currentSeasonId;
      if (!activeSeasonId) {
        toast.error("No active season is currently set.");
        return;
      }
      if (currentTeam.seasonId !== activeSeasonId || fromTeam.seasonId !== activeSeasonId) {
        toast.error("Both guilds must be in the active season to participate.");
        return;
      }

      const limit = settings?.challengeLimitPerUser || 7;
      
      const getMatchCount = async (teamId: string) => {
        const q1 = query(collection(db, 'schedules'), 
          where('team1Id', '==', teamId), 
          where('status', '!=', 'cancelled')
        );
        const q2 = query(collection(db, 'schedules'), 
          where('team2Id', '==', teamId), 
          where('status', '!=', 'cancelled')
        );
        const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        return s1.size + s2.size;
      };

      const [currentMatches, challengerMatches] = await Promise.all([
        getMatchCount(currentTeam.id),
        getMatchCount(fromTeam.id)
      ]);

      if (currentMatches >= limit) {
        toast.error("Limit Reached");
        return;
      }
      if (challengerMatches >= limit) {
        toast.error("Opponent Limit Reached");
        return;
      }

      const qPair1 = query(collection(db, 'schedules'),
        where('team1Id', '==', fromTeam.id),
        where('team2Id', '==', currentTeam.id),
        where('status', '!=', 'cancelled')
      );
      const qPair2 = query(collection(db, 'schedules'),
        where('team1Id', '==', currentTeam.id),
        where('team2Id', '==', fromTeam.id),
        where('status', '!=', 'cancelled')
      );
      const [pairSnap1, pairSnap2] = await Promise.all([getDocs(qPair1), getDocs(qPair2)]);

      if (!pairSnap1.empty || !pairSnap2.empty) {
        toast.error("You have already played or have a scheduled challenge against this team this season.");
        return;
      }

      const details = c.challengeDetails?.[currentTeam.id];

      const batch = writeBatch(db);
      
      const scheduleRef = doc(collection(db, 'schedules'));
      const betValue = Number(details?.bet || 0);
      batch.set(scheduleRef, {
        team1Id: c.fromTeamId,
        team1Name: fromTeam.teamName || 'Unknown',
        team2Id: currentTeam.id,
        team2Name: currentTeam.teamName,
        date: details?.date || new Date().toISOString().split('T')[0],
        time: details?.time || "20:00",
        matchType: 'challenge',
        status: 'upcoming',
        bet: betValue,
        firstPick: details?.sideSelection || '1st',
        teamSwitch: details?.teamSwitch || false,
        createdAt: serverTimestamp()
      });

      batch.update(doc(db, 'teams', c.fromTeamId), {
        matchesThisSeason: (fromTeam.matchesThisSeason || 0) + 1
      });
      batch.update(doc(db, 'teams', currentTeam.id), {
        matchesThisSeason: (currentTeam.matchesThisSeason || 0) + 1
      });

      const fromChallengeRef = doc(db, 'challenges', c.fromTeamId);
      const newTargets = (c.targetTeamIds || []).filter(id => id !== currentTeam.id);
      if (newTargets.length === 0) {
        batch.delete(fromChallengeRef);
      } else {
        const newDetails = { ...c.challengeDetails };
        delete newDetails[currentTeam.id];
        batch.update(fromChallengeRef, {
          targetTeamIds: newTargets,
          challengeDetails: newDetails
        });
      }

      const userChallenge = challenges.find(ch => ch.fromTeamId === currentTeam.id);
      if (userChallenge && userChallenge.targetTeamIds.includes(fromTeam.id)) {
        const userChallengeRef = doc(db, 'challenges', currentTeam.id);
        const updatedUserTargets = userChallenge.targetTeamIds.filter(id => id !== fromTeam.id);
        if (updatedUserTargets.length === 0) {
          batch.delete(userChallengeRef);
        } else {
          const updatedUserDetails = { ...userChallenge.challengeDetails || {} };
          delete updatedUserDetails[fromTeam.id];
          batch.update(userChallengeRef, {
            targetTeamIds: updatedUserTargets,
            challengeDetails: updatedUserDetails
          });
        }
      }

      await batch.commit();
      
      setAcceptModalData(null);
      
      toast.success(
        `CHALLENGE ACCEPTED! Match added to schedule.\n\n` +
        `📢 Winning will result in receiving +50 points and +20 diamonds.\n` +
        `📢 Losing will result in subtracting -20 points and -30 diamonds.`,
        { duration: 8000, icon: '⚔️' }
      );

      if (fromTeam?.ownerId) {
        await createNotification(
          fromTeam.ownerId,
          'Challenge Accepted!',
          `${currentTeam.teamName} has accepted your challenge! Match added to schedule. ` +
          `Winning results in receiving +50 points & +20 diamonds. Losing results in subtracting -20 points & -30 diamonds.`,
          'challenge',
          '/schedule'
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to accept challenge.");
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-neon-blue" size={48} />
    </div>
  );

  return (
    <div className="py-4 md:py-6 space-y-5 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
        <div className="space-y-2">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 text-neon-blue font-bold tracking-widest text-sm uppercase"
          >
            <Swords size={16} />
            War Terminal
          </motion.div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black italic uppercase tracking-tighter">GUILD <span className="gaming-text-stroke">CHALLENGES</span></h1>
        </div>

        <div className="flex overflow-x-auto no-scrollbar gap-1 bg-white/5 p-1 rounded-xl border border-white/10 shrink-0">
          {[
            { id: 'board', name: 'Board', icon: Trophy },
            { id: 'dashboard', name: 'My War', icon: LayoutDashboard },
            { id: 'matches', name: 'Matches', icon: Swords },
            { id: 'schedule', name: 'Schedule', icon: Clock },
            { id: 'history', name: 'Battle Log', icon: History }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-neon-blue text-black shadow-[0_0_20px_rgba(0,229,255,0.3)]' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon size={16} />
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'board' && (
          <motion.div 
            key="board"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative group w-full md:max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-neon-blue transition-colors" size={20} />
                <input
                  type="text"
                  placeholder="Search guilds to challenge..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-neon-blue transition-all"
                />
              </div>
              <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-gray-500">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-neon-green/20 border border-neon-green/40 shadow-[0_0_10px_rgba(52,211,153,0.2)]" />
                  ONLINE
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-white/5 border border-white/10" />
                  AVAILABLE
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {filteredTeams.length === 0 && (
                 <div className="glass-card p-12 text-center flex flex-col items-center justify-center border-dashed border-white/20">
                   <AlertCircle size={48} className="text-gray-500 mb-4" />
                   <h3 className="text-xl font-black uppercase text-gray-300">No guilds available to challenge</h3>
                   <p className="text-xs text-gray-500 mt-2 max-w-sm mx-auto">
                      {!activeSeasonId 
                        ? "There is no active season set by administrator."
                        : currentTeam && currentTeam.seasonId !== activeSeasonId 
                          ? "Your team is not registered for the current active season." 
                          : "There are currently no other guilds available in the active season."
                      }
                   </p>
                 </div>
              )}
              {filteredTeams.map((team) => {
                const isChallenged = (userChallenge?.targetTeamIds || []).includes(team.id);
                return (
                  <motion.div
                    key={team.id}
                    layout
                    whileHover={{ x: 10 }}
                    className="glass-card p-4 md:p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden group"
                  >
                    <div className="flex items-center gap-6 flex-1 w-full">
                      <div className="relative shrink-0">
                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-black border-2 border-white/10 group-hover:border-neon-blue transition-all overflow-hidden p-1 shadow-2xl">
                          {team.logoUrl ? (
                            <ImageWithFallback src={team.logoUrl} alt={team.teamName} className="w-full h-full object-cover rounded-xl" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-3xl font-black text-white/10 uppercase">
                              {team.teamName.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="absolute -bottom-2 -right-2 px-2 py-0.5 bg-neon-blue text-black text-[8px] font-black uppercase rounded shadow-lg">LVL {team.upgradeLevel}</div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl md:text-2xl font-black italic tracking-tight uppercase leading-none truncate group-hover:text-neon-blue transition-colors">{team.teamName}</h3>
                        <div className="flex flex-wrap items-center gap-4 mt-3">
                          <div className="flex items-center gap-1.5 text-[10px] font-black text-neon-blue uppercase tracking-widest italic bg-neon-blue/5 px-2 py-1 rounded">
                             <TrendingUp size={12} />
                             {team.points} PTS
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-black text-neon-red uppercase tracking-widest italic bg-neon-red/5 px-2 py-1 rounded">
                             <Zap size={12} />
                             {team.streak}x STREAK
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="w-full md:w-auto">
                      <button
                        disabled={isChallenged || !isLeader || settings?.challengePhaseLocked}
                        onClick={() => setTimePickerTeam(team.id)}
                        className={`w-full md:w-48 py-4 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2 ${
                          isChallenged 
                            ? 'bg-neon-green/10 text-neon-green border border-neon-green/20' 
                            : !isLeader || settings?.challengePhaseLocked
                              ? 'bg-white/5 text-gray-600 border border-white/10 cursor-not-allowed'
                              : 'bg-white text-black hover:bg-neon-blue transition-colors active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                        }`}
                      >
                        {isChallenged ? <CheckCircle2 size={16} /> : <Swords size={16} />}
                        {isChallenged ? 'CHALLENGE PENDING' : !isLeader ? 'LEADER ONLY' : settings?.challengePhaseLocked ? 'PHASE LOCKED' : 'CHALLENGE GUILD'}
                      </button>
                    </div>

                    {/* Decorative Background Icon */}
                    <Swords size={60} className="absolute -right-6 top-1/2 -translate-y-1/2 text-white/5 -rotate-12 group-hover:text-neon-blue/10 transition-colors pointer-events-none" />
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {activeTab === 'dashboard' && (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            {currentTeam ? (
              <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-1">
                    <div className="space-y-2">
                      <h2 className="text-2xl font-black uppercase tracking-tight italic">OUTGOING <span className="text-neon-blue">REQUESTS</span></h2>
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-500">
                        <Swords size={12} className="text-neon-blue" />
                        Match Limit: <span className="text-white">{currentTeam.matchesThisSeason || 0}</span> / {settings?.challengeLimitPerUser || 7} Played
                      </div>
                    </div>
                    {userChallenge && isLeader && (
                      <button 
                        onClick={() => handleWithdraw()}
                        className="text-[10px] font-black text-neon-red hover:underline uppercase tracking-widest flex items-center gap-2"
                      >
                        <X size={14} /> Withdraw All
                      </button>
                    )}
                  </div>

                  {!userChallenge ? (
                    <div className="glass-card p-12 text-center space-y-4">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-gray-700">
                        <Swords size={32} />
                      </div>
                      <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">You haven't issued any challenges yet.</p>
                      <button 
                        onClick={() => setActiveTab('board')}
                        className="px-8 py-3 bg-neon-blue text-black font-black rounded-lg text-xs hover:scale-105 transition-transform uppercase tracking-widest"
                      >
                        Go to board
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(userChallenge?.targetTeamIds || []).map(targetId => {
                        const targetTeam = teams.find(t => t.id === targetId);
                        const details = userChallenge.challengeDetails?.[targetId];
                        return (
                          <div key={targetId} className="glass-card p-6 flex flex-col md:flex-row items-center justify-between gap-6 hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-lg bg-black flex items-center justify-center overflow-hidden border border-white/10 shrink-0 shadow-lg">
                                {targetTeam?.logoUrl ? <ImageWithFallback src={targetTeam.logoUrl} className="w-full h-full object-cover" /> : <Users size={20} className="text-gray-700" />}
                              </div>
                              <div>
                                <h4 className="font-black text-lg uppercase leading-none">{targetTeam?.teamName || 'Unknown'}</h4>
                                <div className="flex items-center gap-3 mt-2">
                                  <div className="flex items-center gap-2">
                                    <Clock size={10} /> {details?.time || 'TBD'}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Calendar size={10} /> {details?.date || 'TBD'}
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                              <div className="flex items-center gap-3">
                                <div className="text-right hidden sm:block">
                                  <p className="text-[10px] font-black text-neon-green uppercase">Awaiting Response</p>
                                  <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">{isLeader ? 'Pending acceptance' : 'Leader managing'}</p>
                                </div>
                                {isLeader && (
                                  <button 
                                    onClick={() => handleWithdraw(targetId)}
                                    className="p-3 bg-neon-red/10 border border-neon-red/20 text-neon-red rounded-xl hover:bg-neon-red/20 transition-all"
                                    title="Withdraw Challenge"
                                  >
                                    <X size={18} />
                                  </button>
                                )}
                              </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <h2 className="text-2xl font-black uppercase tracking-tight italic">INCOMING <span className="text-neon-red">THREATS</span></h2>
                  <div className="space-y-4">
                    {activeChallenges.filter(c => (c.targetTeamIds || []).includes(currentTeam.id)).map(c => {
                      const fromTeam = teams.find(t => t.id === c.fromTeamId);
                      const details = c.challengeDetails?.[currentTeam.id];
                      
                      let isExpired = false;
                      if (details?.date && details?.time) {
                        try {
                          const matchDateTime = new Date(`${details.date}T${details.time}:00`);
                          const now = new Date();
                          const hoursDifference = (matchDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
                          if (hoursDifference < 24) {
                            isExpired = true;
                          }
                        } catch(e) {
                          // Ignore parsing errors
                        }
                      }

                      return (
                        <div key={c.id} className="glass-card p-6 space-y-4 gaming-border-red border-l-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center overflow-hidden border border-white/10 shrink-0 shadow-md">
                              {fromTeam?.logoUrl ? <ImageWithFallback src={fromTeam.logoUrl} className="w-full h-full object-cover" /> : <Users size={16} className="text-gray-700" />}
                            </div>
                            <span className="font-black text-sm uppercase tracking-tight">{fromTeam?.teamName}</span>
                          </div>
                          
                          <div className="p-4 bg-black/40 rounded-xl space-y-3">
                             <div className="flex justify-between items-center text-[10px] font-bold uppercase text-gray-400">
                               <span>Proposed Time</span>
                               <span className="text-white">{details?.time}</span>
                             </div>
                             <div className="flex justify-between items-center text-[10px] font-bold uppercase text-gray-400">
                               <span>Date</span>
                               <span className="text-white">{details?.date}</span>
                             </div>
                             {details?.sideSelection && (
                               <div className="flex justify-between items-center text-[10px] font-bold uppercase text-gray-400">
                                 <span>Pick Turn</span>
                                 <span className="text-neon-blue">{details.sideSelection}</span>
                               </div>
                             )}
                             {details?.teamSwitch !== undefined && (
                               <div className="flex justify-between items-center text-[10px] font-bold uppercase text-gray-400">
                                 <span>Team Switch</span>
                                 <span className={details.teamSwitch ? "text-neon-red" : "text-gray-500"}>
                                   {details.teamSwitch ? 'YES' : 'NO'}
                                 </span>
                               </div>
                             )}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <button 
                              disabled={!isLeader || isExpired}
                              onClick={() => setAcceptModalData({ c, fromTeam })}
                              className={`w-full py-3 ${(isLeader && !isExpired) ? 'bg-neon-green text-black hover:brightness-110 shadow-[0_0_20px_rgba(0,255,102,0.3)]' : 'bg-white/5 text-gray-500'} font-black text-[10px] uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2`}
                            >
                              <CheckCircle2 size={14} />
                              {isExpired ? 'EXPIRED' : (isLeader ? 'ACCEPT CHALLENGE' : 'LEADER ONLY')}
                            </button>
                            <button 
                              disabled={!isLeader}
                              onClick={() => handleReject(c)}
                              className={`w-full py-3 ${isLeader ? 'bg-neon-red/10 border border-neon-red/20 text-neon-red hover:bg-neon-red/20' : 'bg-white/5 text-gray-500'} font-black text-[10px] uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2`}
                            >
                              <X size={14} />
                              {isLeader ? 'DECLINE (-10 PTS)' : '...'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {activeChallenges.filter(c => (c.targetTeamIds || []).includes(currentTeam.id)).length === 0 && (
                      <div className="glass-card p-8 text-center text-gray-600 text-[10px] font-bold uppercase tracking-widest">
                        Zero incoming threats detected.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-card p-20 text-center space-y-6 max-w-2xl mx-auto">
                 <Lock size={48} className="mx-auto text-gray-700" />
                 <h2 className="text-2xl font-black italic uppercase">RESTRICTED <span className="text-neon-blue">ACCESS</span></h2>
                 <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Register your team to unlock warfare capabilities.</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'matches' && (
          <motion.div 
            key="matches"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8"
          >
            <div className="grid md:grid-cols-2 gap-8">
              {matchedChallenges.map((match, i) => (
                <div key={i} className="glass-card p-2 gaming-border-blue relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-neon-blue/5 to-transparent pointer-events-none" />
                  <div className="p-6 space-y-8 relative z-10">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 flex flex-col items-center gap-3 text-center">
                        <div className="relative">
                          {match.teamA.logoUrl ? (
                            <ImageWithFallback src={match.teamA.logoUrl} className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-white/10 group-hover:border-neon-blue transition-all" />
                          ) : (
                            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-white/10 group-hover:border-neon-blue transition-all flex items-center justify-center bg-white/5">
                              <Users size={32} className="text-white/20" />
                            </div>
                          )}
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-neon-blue text-black text-[8px] font-black uppercase rounded">LVL {match.teamA.upgradeLevel}</div>
                        </div>
                        <p className="font-black text-sm uppercase tracking-tighter sm:text-base leading-none">{match.teamA.teamName}</p>
                      </div>
                      
                      <div className="flex flex-col items-center gap-2 mb-8">
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                          <span className="text-xl font-black italic gaming-text-gradient">VS</span>
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col items-center gap-3 text-center">
                        <div className="relative">
                          {match.teamB.logoUrl ? (
                            <ImageWithFallback src={match.teamB.logoUrl} className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-white/10 group-hover:border-neon-red transition-all" />
                          ) : (
                            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-white/10 group-hover:border-neon-red transition-all flex items-center justify-center bg-white/5">
                              <Users size={32} className="text-white/20" />
                            </div>
                          )}
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-neon-red text-white text-[8px] font-black uppercase rounded">LVL {match.teamB.upgradeLevel}</div>
                        </div>
                        <p className="font-black text-sm uppercase tracking-tighter sm:text-base leading-none">{match.teamB.teamName}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-4">
                      <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-gray-400">
                         <div className="flex items-center gap-2">
                           <Calendar size={14} className="text-neon-blue" />
                           {match.details.date}
                         </div>
                         <div className="flex items-center gap-2">
                           <Clock size={14} className="text-neon-blue" />
                           {match.details.time}
                         </div>
                      </div>
                      <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-gray-400">
                         {match.details.sideSelection && (
                           <div className="flex items-center gap-2">
                             Pick: <span className="text-white">{match.details.sideSelection}</span>
                           </div>
                         )}
                         {match.details.teamSwitch !== undefined && (
                           <div className="flex items-center gap-2">
                             Team Switch: <span className={match.details.teamSwitch ? "text-neon-red" : "text-white"}>{match.details.teamSwitch ? 'YES' : 'NO'}</span>
                           </div>
                         )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                      <button className="py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">VIEW ROSTERS</button>
                      <button className="py-3 bg-neon-blue text-black font-black rounded-xl text-[10px] uppercase tracking-widest shadow-[0_0_20px_rgba(0,229,255,0.2)] hover:brightness-110 active:scale-95 transition-all">CONNECT TERMINAL</button>
                    </div>
                  </div>
                </div>
              ))}
              {matchedChallenges.length === 0 && (
                <div className="col-span-2 glass-card p-20 text-center space-y-4">
                   <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto opacity-20">
                     <Swords size={32} />
                   </div>
                   <p className="text-gray-600 font-bold uppercase tracking-widest text-xs">No active matched challenges found.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'schedule' && (
          <motion.div 
            key="schedule"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-4 mb-4">
               <Calendar size={24} className="text-neon-blue" />
               <h2 className="text-2xl font-black italic uppercase tracking-tighter">BATTLE <span className="text-neon-blue">SCHEDULE</span></h2>
            </div>

            <div className="grid gap-4">
              {schedules
                .filter(s => s.matchType === 'challenge' && s.status === 'upcoming')
                .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())
                .map((match) => {
                  const team1 = teams.find(t => t.id === match.team1Id);
                  const team2 = teams.find(t => t.id === match.team2Id);
                  return (
                    <div key={match.id} className="glass-card p-6 flex flex-col md:flex-row items-center justify-between gap-6 border-l-4 border-neon-blue">
                      <div className="flex items-center gap-8 flex-1">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-12 h-12 rounded-lg bg-black border border-white/10 flex items-center justify-center p-1 shrink-0 shadow-lg">
                            {team1?.logoUrl ? <ImageWithFallback src={team1.logoUrl} className="w-full h-full object-cover rounded-md" /> : <Users size={20} className="text-gray-700" />}
                          </div>
                          <span className="text-[10px] font-black uppercase truncate w-24 text-center">{match.team1Name}</span>
                        </div>
                        
                        <div className="text-xl font-black italic text-neon-blue px-4">VS</div>

                        <div className="flex flex-col items-center gap-2">
                          <div className="w-12 h-12 rounded-lg bg-black border border-white/10 flex items-center justify-center p-1 shrink-0 shadow-lg">
                            {team2?.logoUrl ? <ImageWithFallback src={team2.logoUrl} className="w-full h-full object-cover rounded-md" /> : <Users size={20} className="text-gray-700" />}
                          </div>
                          <span className="text-[10px] font-black uppercase truncate w-24 text-center">{match.team2Name}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-6">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-gray-500" />
                          <span className="text-[10px] font-black uppercase text-white">{match.date}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-gray-500" />
                          <span className="text-[10px] font-black uppercase text-white">{match.time}</span>
                        </div>
                        {match.firstPick && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase text-gray-500">Pick: <span className="text-white">{match.firstPick}</span></span>
                          </div>
                        )}
                        {match.teamSwitch !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase text-gray-500">Switch: <span className={match.teamSwitch ? "text-neon-red" : "text-white"}>{match.teamSwitch ? 'YES' : 'NO'}</span></span>
                          </div>
                        )}
                        <Link to={`/schedule/${match.id}`} className="px-4 py-2 bg-neon-blue/10 border border-neon-blue/20 text-neon-blue rounded text-[10px] font-black uppercase tracking-widest hover:bg-neon-blue/20 transition-all">
                          MISSION DETAILS
                        </Link>
                      </div>
                    </div>
                  );
                })}
              
              {schedules.filter(s => s.matchType === 'challenge' && s.status === 'upcoming').length === 0 && (
                <div className="glass-card p-20 text-center space-y-6">
                   <Calendar size={64} className="mx-auto text-gray-800" />
                   <h2 className="text-2xl font-black italic uppercase italic tracking-tighter">ZERO <span className="text-neon-blue">DEPLOYMENTS</span></h2>
                   <p className="text-gray-500 font-bold uppercase tracking-widest text-xs max-w-md mx-auto">
                     No challenge matches found in the tactical schedule.
                   </p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div 
            key="history"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4">
                <History size={24} className="text-neon-blue" />
                <h2 className="text-2xl font-black italic uppercase tracking-tighter">BATTLE <span className="text-neon-blue">LOG</span></h2>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-lg border border-white/10">
                <TrendingUp size={14} className="text-neon-green" />
                <span className="text-[10px] font-black uppercase tracking-widest">Points Consolidated</span>
              </div>
            </div>

            {loading ? (
              <div className="glass-card p-20 flex flex-col items-center justify-center">
                <Loader2 size={32} className="animate-spin text-neon-blue mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Decrypting Battle Records...</p>
              </div>
            ) : transactions.length > 0 ? (
              <div className="grid gap-3">
                {transactions.map((trans) => {
                  const isPositive = (trans.points || 0) > 0 || (trans.diamonds || 0) > 0;
                  const isMatch = trans.type === 'win' || trans.type === 'loss';
                  const date = trans.timestamp ? new Date(trans.timestamp).toLocaleDateString() : 'N/A';
                  const time = trans.timestamp ? new Date(trans.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
                  
                  return (
                    <div key={trans.id} className="glass-card p-4 md:p-5 flex flex-col md:flex-row items-center justify-between gap-4 group hover:bg-white/10 transition-all border-l-2 border-white/10 hover:border-neon-blue">
                      <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                          trans.type === 'win' ? 'bg-neon-green/10 border-neon-green/20 text-neon-green' :
                          trans.type === 'loss' ? 'bg-neon-red/10 border-neon-red/20 text-neon-red' :
                          'bg-neon-blue/10 border-neon-blue/20 text-neon-blue'
                        }`}>
                          {trans.type === 'win' ? <Trophy size={20} /> : 
                           trans.type === 'loss' ? <AlertCircle size={20} /> :
                           <Diamond size={20} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-tight text-white group-hover:text-neon-blue transition-colors truncate">
                            {trans.reason || 'Tactical Transaction'}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
                              <Calendar size={10} /> {date}
                            </span>
                            <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
                              <Clock size={10} /> {time}
                            </span>
                            {isMatch && (
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                trans.type === 'win' ? 'bg-neon-green/20 text-neon-green' : 'bg-neon-red/20 text-neon-red'
                              }`}>
                                {trans.type}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 w-full md:w-auto mt-2 md:mt-0 justify-between md:justify-end">
                        <div className="flex flex-col items-end">
                          {trans.points !== 0 && (
                            <div className={`flex items-center gap-1 font-black text-sm italic ${trans.points > 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                              {trans.points > 0 ? <Plus size={12} /> : <MinusCircle size={12} />}
                              {Math.abs(trans.points)} <span className="text-[10px] non-italic uppercase tracking-widest ml-1">Pts</span>
                            </div>
                          )}
                          {trans.diamonds !== 0 && (
                            <div className={`flex items-center gap-1 font-black text-xs italic ${trans.diamonds > 0 ? 'text-neon-blue' : 'text-neon-red'}`}>
                              {trans.diamonds > 0 ? <Plus size={10} /> : <MinusCircle size={10} />}
                              {Math.abs(trans.diamonds)} <span className="text-[8px] non-italic uppercase tracking-widest ml-1">Dia</span>
                            </div>
                          )}
                        </div>
                        <div className="w-1 h-8 bg-white/5 rounded-full hidden md:block" />
                        <div className="md:w-10 flex justify-center">
                          {isPositive ? <TrendingUp size={16} className="text-neon-green opacity-50" /> : <TrendingDown size={16} className="text-neon-red opacity-50" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="glass-card p-20 text-center space-y-6">
                <History size={64} className="mx-auto text-gray-800 opacity-20" />
                <h3 className="text-xl font-black italic uppercase">NO DATA <span className="text-neon-blue">FOUND</span></h3>
                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs max-w-sm mx-auto">
                  Your battle history is currently empty. Engage in challenges to generate tactical records.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Accept Challenge Modal */}
      <AnimatePresence>
        {acceptModalData && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card max-w-md w-full p-6 space-y-6"
            >
               <h2 className="text-xl font-black uppercase text-neon-blue">Accept Challenge</h2>
               <p className="text-gray-400 text-xs uppercase tracking-widest font-bold">
                   You are about to accept the challenge from <span className="text-white">{acceptModalData.fromTeam.teamName}</span>.
               </p>
               
               <div className="space-y-4 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
                   {/* Your Team Roster */}
                   <div className="space-y-2">
                       <h3 className="text-[10px] uppercase font-black tracking-widest text-gray-500">
                           Your Team Roster (Max 7 Slots)
                       </h3>
                       <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1">
                           {Array.from({ length: 7 }).map((_, i) => (
                               <div key={i} className="flex justify-between items-center text-[10px] font-bold p-1.5 bg-black/40 rounded border border-white/5">
                                   <span className="text-gray-500">Slot {i + 1}</span>
                                   <span className={currentTeam?.players?.[i] ? "text-neon-cyan" : "text-gray-600"}>
                                       {currentTeam?.players?.[i] || 'Empty'}
                                   </span>
                               </div>
                           ))}
                       </div>
                   </div>

                   {/* Opponent Team Roster */}
                   <div className="space-y-2">
                       <h3 className="text-[10px] uppercase font-black tracking-widest text-gray-500">
                           {acceptModalData.fromTeam.teamName} Roster
                       </h3>
                       <div className="bg-neon-red/5 border border-neon-red/10 rounded-xl p-3 space-y-1">
                           {Array.from({ length: 7 }).map((_, i) => (
                               <div key={i} className="flex justify-between items-center text-[10px] font-bold p-1.5 bg-black/40 rounded border border-white/5">
                                   <span className="text-gray-500">Slot {i + 1}</span>
                                   <span className={acceptModalData.fromTeam.players?.[i] ? "text-neon-red" : "text-gray-600"}>
                                       {acceptModalData.fromTeam.players?.[i] || 'Empty'}
                                   </span>
                               </div>
                           ))}
                       </div>
                   </div>
               </div>
               
               <div className="flex gap-3 pt-4">
                  <button 
                      onClick={() => setAcceptModalData(null)}
                      className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                  >
                      Cancel
                  </button>
                  <button 
                      onClick={() => executeAccept(acceptModalData.c, acceptModalData.fromTeam)}
                      className="flex-1 py-3 bg-neon-blue text-black hover:bg-white rounded-xl font-black uppercase tracking-widest text-xs shadow-[0_0_15px_rgba(0,229,255,0.3)] transition-all"
                  >
                      Confirm Accept
                  </button>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Time Picker Modal */}
      <AnimatePresence>
        {timePickerTeam && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-8 max-w-md w-full space-y-6 gaming-border-blue relative"
            >
              <button 
                onClick={() => setTimePickerTeam(null)}
                className="absolute top-4 right-4 text-gray-500 hover:text-white"
              >
                <X size={24} />
              </button>

              <div className="text-center space-y-2">
                <h3 className="text-2xl font-black italic uppercase">TACTICAL <span className="text-neon-blue">ENCOUNTER</span></h3>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Select match intelligence details</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Proposed Match Date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    min={minDate}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-neon-blue transition-all uppercase"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Proposed Slot Time</label>
                  <div className="grid grid-cols-3 gap-2">
                    {MATCH_SLOTS.map(slot => {
                      const isSystemOccupied = occupiedSlots.includes(slot);
                      const isTeamOccupied = teamOccupiedSlots.includes(slot);
                      const isDisabled = isSystemOccupied || isTeamOccupied;

                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => setSelectedTime(slot)}
                          className={`py-2 rounded-lg text-[10px] font-black tracking-widest transition-all border ${
                            selectedTime === slot 
                              ? 'bg-neon-blue text-black border-neon-blue' 
                              : isDisabled
                                ? 'bg-white/5 text-gray-700 border-white/5 cursor-not-allowed line-through'
                                : 'bg-black/40 text-gray-400 border-white/10 hover:border-neon-blue/50'
                          }`}
                        >
                          {slot}
                          {isTeamOccupied && <span className="block text-[6px] opacity-50">BUSY</span>}
                          {isSystemOccupied && !isTeamOccupied && <span className="block text-[6px] opacity-50">TAKEN</span>}
                        </button>
                      );
                    })}
                  </div>
                  {selectedDate && (
                    <p className="text-[8px] text-gray-600 italic uppercase">
                      * Slots crossing 30 min duration. Only available slots are shown active.
                    </p>
                  )}
                </div>
                <div className={`space-y-2 ${!settings?.bettingEnabled ? 'col-span-2' : 'col-span-2'}`}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Pick Turn</label>
                  <select
                    value={selectedPick}
                    onChange={(e) => setSelectedPick(e.target.value as any)}
                    className="w-full bg-black border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-neon-blue transition-all appearance-none"
                  >
                    <option value="">Any</option>
                    <option value="1st">First</option>
                    <option value="2nd">Second</option>
                  </select>
                </div>
                <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl py-3 px-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mr-4">Team Switch</label>
                  <button
                    type="button"
                    onClick={() => setSelectedTeamSwitch(!selectedTeamSwitch)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      selectedTeamSwitch ? 'bg-neon-blue' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        selectedTeamSwitch ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <button
                disabled={!selectedDate || !selectedTime}
                onClick={handleCreateChallenge}
                className="w-full py-4 bg-neon-blue text-black font-black uppercase tracking-widest text-xs rounded-xl shadow-[0_0_30px_rgba(0,229,255,0.4)] hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                DEPLOY CHALLENGE
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Challenges;
