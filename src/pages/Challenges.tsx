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
  Diamond
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
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Team, Challenge, AppSetting, ChallengeDetails, ScheduleMatch, MATCH_SLOTS, MAX_SEASON_MATCHES } from '../types';
import CountdownTimer from '../components/CountdownTimer';
import { FALLBACK_IMAGE } from '../lib/utils';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { createNotification } from '../lib/notificationUtils';

const Challenges: React.FC = () => {
  const { user, isAdmin, settings: globalSettings } = useAuth();

  if (globalSettings?.showChallenges === false && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const [teams, setTeams] = useState<Team[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [schedules, setSchedules] = useState<ScheduleMatch[]>([]);
  const [settings, setSettings] = useState<AppSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'board' | 'dashboard' | 'matches' | 'schedule'>('board');
  const [newMatchNotify, setNewMatchNotify] = useState<string | null>(null);
  const [timePickerTeam, setTimePickerTeam] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedBet, setSelectedBet] = useState('');
  const [selectedPick, setSelectedPick] = useState<'1st' | '2nd' | ''>('');
  const [occupiedSlots, setOccupiedSlots] = useState<string[]>([]);
  const [teamOccupiedSlots, setTeamOccupiedSlots] = useState<string[]>([]);

  const activeChallenges = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return challenges.filter(c => {
      if (!c.timestamp) return true; // Keep legacy if no timestamp
      const timestamp = c.timestamp?.toMillis ? c.timestamp.toMillis() : (typeof c.timestamp === 'number' ? c.timestamp : new Date(c.timestamp).getTime());
      return timestamp > oneDayAgo;
    });
  }, [challenges]);

  // For current user's team
  const currentTeam = useMemo(() => {
    if (!user || user.role === 'admin') return null;
    return teams.find(t => t.teamName === user.teamName || t.ownerId === user.id);
  }, [user, teams]);

  const userChallenge = useMemo(() => {
    if (!currentTeam) return null;
    return activeChallenges.find(c => c.fromTeamId === currentTeam.id);
  }, [currentTeam, activeChallenges]);

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

    return () => {
      clearTimeout(timer);
      unsubscribeTeams();
      unsubscribeChallenges();
      unsubscribeSchedules();
      unsubscribeSettings();
    };
  }, []);



  const handleCreateChallenge = async () => {
    if (!currentTeam || !timePickerTeam) return;

    // Rule: Season Match Limit
    if ((currentTeam.matchesThisSeason || 0) >= MAX_SEASON_MATCHES) {
      toast.error(`Your team has reached the limit of ${MAX_SEASON_MATCHES} matches this season.`);
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

    const targetTeam = teams.find(t => t.id === timePickerTeam);
    if (targetTeam && (targetTeam.matchesThisSeason || 0) >= MAX_SEASON_MATCHES) {
      toast.error("The opponent team has reached their season match limit.");
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
        bet: settings?.bettingEnabled ? (selectedBet || '') : ''
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
      setSelectedBet('');
      setSelectedPick('');
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
    try {
      const challengeRef = doc(db, 'challenges', challenge.id);
      const newTargets = (challenge?.targetTeamIds || []).filter(id => id !== currentTeam.id);
      
      if (newTargets.length === 0) {
        await deleteDoc(challengeRef);
      } else {
        const newDetails = { ...(challenge.challengeDetails || {}) };
        delete newDetails[currentTeam.id];
        
        await updateDoc(challengeRef, {
          targetTeamIds: newTargets,
          challengeDetails: newDetails
        });
      }
      toast.success("Challenge rejected.");

      // Notify challenger
      const fromTeam = teams.find(t => t.id === challenge.fromTeamId);
      if (fromTeam?.ownerId) {
        await createNotification(
          fromTeam.ownerId,
          'Challenge Rejected',
          `${currentTeam?.teamName || 'The team'} has rejected your challenge.`,
          'challenge',
          '/challenges'
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to reject challenge.");
    }
  };

  const activeSeasonId = settings?.currentSeasonId;

  const filteredTeams = teams.filter(t => {
    if (t.id === currentTeam?.id) return false;
    if (t.registrationStatus !== 'approved') return false;
    if (!t.teamName.toLowerCase().includes(searchTerm.toLowerCase())) return false;

    if (activeSeasonId) {
      if (currentTeam && currentTeam.seasonId !== activeSeasonId) return false;
      if (t.seasonId !== activeSeasonId) return false;
    }

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

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-neon-blue" size={48} />
    </div>
  );

  return (
    <div className="py-6 md:py-10 space-y-8 md:space-y-10">
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
            { id: 'schedule', name: 'Schedule', icon: Clock }
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
                      {settings?.currentSeasonId && currentTeam?.seasonId !== settings?.currentSeasonId ? "Your team is not registered for the current active season." : "There are currently no other guilds available or matching your search."}
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
                        disabled={isChallenged || !currentTeam || settings?.challengePhaseLocked}
                        onClick={() => setTimePickerTeam(team.id)}
                        className={`w-full md:w-48 py-4 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2 ${
                          isChallenged 
                            ? 'bg-neon-green/10 text-neon-green border border-neon-green/20' 
                            : settings?.challengePhaseLocked
                              ? 'bg-white/5 text-gray-600 border border-white/10 cursor-not-allowed'
                              : 'bg-white text-black hover:bg-neon-blue transition-colors active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                        }`}
                      >
                        {isChallenged ? <CheckCircle2 size={16} /> : <Swords size={16} />}
                        {isChallenged ? 'CHALLENGE PENDING' : settings?.challengePhaseLocked ? 'PHASE LOCKED' : 'CHALLENGE GUILD'}
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
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-black uppercase tracking-tight italic">OUTGOING <span className="text-neon-blue">REQUESTS</span></h2>
                    {userChallenge && (
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
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-gray-500">
                                    <Clock size={10} /> {details?.time || 'TBD'}
                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-gray-500">
                                    <Calendar size={10} /> {details?.date || 'TBD'}
                                  </div>
                                  {settings?.bettingEnabled && details?.bet && (
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-neon-cyan">
                                      <Diamond size={10} /> {details.bet} BET
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <div className="text-right hidden sm:block">
                                <p className="text-[10px] font-black text-neon-green uppercase">Awaiting Response</p>
                                <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Pending acceptance</p>
                              </div>
                              <button 
                                onClick={() => handleWithdraw(targetId)}
                                className="p-3 bg-neon-red/10 border border-neon-red/20 text-neon-red rounded-xl hover:bg-neon-red/20 transition-all"
                                title="Withdraw Challenge"
                              >
                                <X size={18} />
                              </button>
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
                             {settings?.bettingEnabled && details?.bet && (
                               <div className="flex justify-between items-center text-[10px] font-bold uppercase text-gray-400">
                                 <span>Resources Bet</span>
                                 <span className="text-neon-cyan font-black tracking-widest">{details.bet} DIA</span>
                               </div>
                             )}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <button 
                              onClick={async () => {
                                try {
                                  if (!currentTeam || !fromTeam) return;

                                  // Rule: Season Match Limit check for acceptance
                                  if ((currentTeam.matchesThisSeason || 0) >= MAX_SEASON_MATCHES) {
                                    toast.error("Your team has reached the season match limit.");
                                    return;
                                  }
                                  if ((fromTeam.matchesThisSeason || 0) >= MAX_SEASON_MATCHES) {
                                    toast.error("The challenger has reached the season match limit.");
                                    return;
                                  }

                                  // Check for existing schedule between these two
                                  const existingMatchQuery = query(
                                    collection(db, 'schedules'),
                                    where('team1Id', 'in', [fromTeam.id, currentTeam.id]),
                                    where('status', '!=', 'cancelled')
                                  );
                                  const matchSnap = await getDocs(existingMatchQuery);
                                  const hasRecentMatch = matchSnap.docs.some(doc => {
                                    const d = doc.data();
                                    return (d.team1Id === fromTeam.id && d.team2Id === currentTeam.id) ||
                                           (d.team1Id === currentTeam.id && d.team2Id === fromTeam.id);
                                  });

                                  if (hasRecentMatch) {
                                    toast.error("A match is already scheduled or has been played between these teams.");
                                    return;
                                  }

                                  const challengeRef = doc(db, 'challenges', currentTeam.id);
                                  if (userChallenge) {
                                    const newTargets = [...new Set([...(userChallenge?.targetTeamIds || []), c.fromTeamId])];
                                    await updateDoc(challengeRef, { targetTeamIds: newTargets });
                                  } else {
                                    await setDoc(challengeRef, {
                                      fromTeamId: currentTeam.id,
                                      targetTeamIds: [c.fromTeamId],
                                      timestamp: serverTimestamp()
                                    });
                                  }
                                  
                                  // Create an official schedule entry
                                  const details = c.challengeDetails?.[currentTeam.id];

                                  const batch = writeBatch(db);
                                  
                                  // 1. Create the schedule entry
                                  const scheduleRef = doc(collection(db, 'schedules'));
                                  batch.set(scheduleRef, {
                                    team1Id: c.fromTeamId,
                                    team1Name: fromTeam.teamName || 'Unknown',
                                    team2Id: currentTeam.id,
                                    team2Name: currentTeam.teamName,
                                    date: details?.date || new Date().toISOString().split('T')[0],
                                    time: details?.time || "20:00",
                                    matchType: 'challenge',
                                    status: 'upcoming',
                                    firstPick: details?.sideSelection || '1st',
                                    createdAt: serverTimestamp()
                                  });

                                  // 2. Increment season match counts
                                  batch.update(doc(db, 'teams', c.fromTeamId), {
                                    matchesThisSeason: (fromTeam.matchesThisSeason || 0) + 1
                                  });
                                  batch.update(doc(db, 'teams', currentTeam.id), {
                                    matchesThisSeason: (currentTeam.matchesThisSeason || 0) + 1
                                  });

                                  // 3. Remove the challenge target/document
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

                                  await batch.commit();
                                  toast.success("CHALLENGE ACCEPTED! Match added to schedule.");

                                  // Notify challenger
                                  if (fromTeam?.ownerId) {
                                    await createNotification(
                                      fromTeam.ownerId,
                                      'Challenge Accepted!',
                                      `${currentTeam.teamName} has accepted your challenge! Match added to schedule.`,
                                      'challenge',
                                      '/schedule'
                                    );
                                  }
                                } catch (err) {
                                  console.error(err);
                                  toast.error("Failed to accept challenge.");
                                }
                              }}
                              className="w-full py-3 bg-neon-green text-black font-black text-[10px] uppercase tracking-widest rounded-lg shadow-[0_0_15px_rgba(52,211,153,0.2)] hover:brightness-110 transition-all flex items-center justify-center gap-2"
                            >
                              <CheckCircle2 size={14} />
                              ACCEPT
                            </button>
                            <button 
                              onClick={() => handleReject(c)}
                              className="w-full py-3 bg-neon-red/10 border border-neon-red/20 text-neon-red font-black text-[10px] uppercase tracking-widest rounded-lg hover:bg-neon-red/20 transition-all flex items-center justify-center gap-2"
                            >
                              <X size={14} />
                              REJECT
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
                      
                      {settings?.bettingEnabled && match.details.bet && (
                        <div className="px-6 py-2 bg-neon-cyan/10 border border-neon-cyan/30 rounded-full text-neon-cyan text-xs font-black uppercase tracking-widest flex items-center gap-2">
                          <Diamond size={14} />
                          {match.details.bet} TOTAL STAKES
                        </div>
                      )}
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
                <div className="grid grid-cols-2 gap-4">
                  {settings?.bettingEnabled && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Bet Stakes</label>
                      <input
                        type="number"
                        value={selectedBet}
                        onChange={(e) => setSelectedBet(e.target.value)}
                        placeholder="Diamonds"
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-neon-blue transition-all"
                      />
                    </div>
                  )}
                  <div className={`space-y-2 ${!settings?.bettingEnabled ? 'col-span-2' : ''}`}>
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
