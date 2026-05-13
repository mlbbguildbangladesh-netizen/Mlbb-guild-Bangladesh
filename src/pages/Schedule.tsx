import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { ScheduleMatch, Team, Challenge } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Trash2, 
  CalendarDays, 
  Zap, 
  Wand2, 
  Search, 
  Play, 
  Trophy, 
  MapPin, 
  ExternalLink,
  ChevronRight,
  Monitor,
  Users,
  ArrowRight,
  Diamond
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/firebase';
import CountdownTimer from '../components/CountdownTimer';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { Link } from 'react-router-dom';

const Schedule: React.FC = () => {
  const { isAdmin, settings } = useAuth();
  
  const [matches, setMatches] = useState<ScheduleMatch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'upcoming' | 'live' | 'results'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'official' | 'challenge'>('all');

  const [showAddModal, setShowAddModal] = useState(false);
  const [newMatch, setNewMatch] = useState<Partial<ScheduleMatch>>({
    date: '',
    time: '',
    status: 'upcoming',
    firstPick: 'Team 1'
  });

  useEffect(() => {
    // Fetch Schedules
    const q = query(collection(db, 'schedules'), orderBy('date', 'asc'));
    const unsubscribeSchedules = onSnapshot(q, (snapshot) => {
      const ms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ScheduleMatch[];
      setMatches(ms);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'schedules');
      setLoading(false);
    });

    const teamsQuery = query(collection(db, 'teams'), where('registrationStatus', '==', 'approved'));
    const unsubscribeTeams = onSnapshot(teamsQuery, (snapshot) => {
      setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'teams (approved)');
    });

    const challengesQuery = collection(db, 'challenges');
    const unsubscribeChallenges = onSnapshot(challengesQuery, (snapshot) => {
      setChallenges(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Challenge)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'challenges');
    });

    return () => {
      unsubscribeSchedules();
      unsubscribeTeams();
      unsubscribeChallenges();
    };
  }, []);

  const liveHighlights = useMemo(() => {
    const highlights: { teams: [Team, Team], time: string, date: string, bet: string, firstPickTeamId: string, firstPickName?: string, isChallenge?: boolean }[] = [];
    const processed = new Set<string>();

    // 1. Mutual Challenges
    challenges.forEach(c1 => {
      const team1 = teams.find(t => t.id === c1.fromTeamId);
      if (!team1) return;

      (c1.targetTeamIds || []).forEach(targetId => {
        const team2 = teams.find(t => t.id === targetId);
        if (!team2) return;

        const c2 = challenges.find(c => c.fromTeamId === targetId);

        if (c2 && (c2.targetTeamIds || []).includes(c1.fromTeamId)) {
          const matchKey = [c1.fromTeamId, targetId].sort().join('-');
          if (!processed.has(matchKey)) {
            const details1 = c1.challengeDetails?.[targetId];
            const details2 = c2.challengeDetails?.[c1.fromTeamId];
            
            const time = details2?.preferredTime || details1?.preferredTime || details1?.time || details2?.time || 'TBD';
            const date = details2?.preferredDate || details1?.preferredDate || details1?.date || details2?.date || 'TBD';
            const bet = details1?.bet || details2?.bet || '0';

            let firstPickTeamId = '';
            if (details1?.sideSelection === '1st') firstPickTeamId = c1.fromTeamId;
            else if (details1?.sideSelection === '2nd') firstPickTeamId = targetId;
            else if (details2?.sideSelection === '1st') firstPickTeamId = targetId;
            else if (details2?.sideSelection === '2nd') firstPickTeamId = c1.fromTeamId;

            let firstPickName = '';
            if (firstPickTeamId === c1.fromTeamId) firstPickName = team1.teamName;
            else if (firstPickTeamId === targetId) firstPickName = team2.teamName;

            highlights.push({ teams: [team1, team2], time, date, bet, firstPickTeamId, firstPickName, isChallenge: true });
            processed.add(matchKey);
          }
        }
      });
    });

    // 2. Live/Upcoming Official Schedules
    matches.filter(s => s.status === 'live' || s.status === 'upcoming').forEach(s => {
      const team1 = teams.find(t => t.id === s.team1Id) || { id: s.team1Id || '', teamName: s.team1Name, logoUrl: '' } as Team;
      const team2 = teams.find(t => t.id === s.team2Id) || { id: s.team2Id || '', teamName: s.team2Name, logoUrl: '' } as Team;
      highlights.push({
        teams: [team1, team2],
        time: s.time,
        date: s.date,
        bet: '0',
        firstPickTeamId: s.firstPick === s.team1Name ? s.team1Id || s.team1Name : s.firstPick === s.team2Name ? s.team2Id || s.team2Name : s.firstPick,
        firstPickName: s.firstPick,
        isChallenge: s.matchType === 'challenge'
      });
    });

    return highlights.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [challenges, teams, matches]);

  const filteredMatches = useMemo(() => {
    return matches.filter(match => {
      const matchesSearch = 
        match.team1Name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        match.team2Name.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchesSearch) return false;

      if (typeFilter !== 'all') {
        const mType = match.matchType || 'official';
        if (mType !== typeFilter) return false;
      }

      if (activeTab === 'all') return true;
      if (activeTab === 'upcoming') return match.status === 'upcoming';
      if (activeTab === 'live') return match.status === 'live';
      if (activeTab === 'results') return match.status === 'completed';
      return true;
    });
  }, [matches, searchTerm, activeTab]);

  const handleAddMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatch.team1Id || !newMatch.team2Id || !newMatch.date || !newMatch.time) return;

    try {
      const team1 = teams.find(t => t.id === newMatch.team1Id);
      const team2 = teams.find(t => t.id === newMatch.team2Id);
      
      const matchData = {
        team1Id: newMatch.team1Id,
        team1Name: team1?.teamName || '',
        team2Id: newMatch.team2Id,
        team2Name: team2?.teamName || '',
        date: newMatch.date,
        time: newMatch.time,
        matchType: 'official' as const,
        status: newMatch.status || 'upcoming',
        firstPick: newMatch.firstPick || '',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'schedules'), matchData);
      setShowAddModal(false);
      setNewMatch({ date: '', time: '', status: 'upcoming', firstPick: 'Team 1' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'schedules');
    }
  };

  const handleDeleteMatch = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'schedules', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'schedules');
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const getCountdown = (date: string, time: string) => {
    const matchTime = new Date(`${date}T${time}`).getTime();
    const now = new Date().getTime();
    const diff = matchTime - now;

    if (diff <= 0) return 'ALREADY STARTED';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}H ${mins}M UNTIL STARTS`;
  };

  return (
    <div className="py-6 md:py-10 space-y-8 md:space-y-12 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none -z-10">
        <div className="absolute top-[10%] left-[-5%] w-[40%] h-[30%] bg-neon-blue/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[20%] right-[-5%] w-[40%] h-[30%] bg-neon-purple/5 blur-[120px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent rotate-12" />
      </div>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
        <div className="space-y-2">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 text-neon-blue font-black tracking-[0.2em] text-[10px] uppercase"
          >
            <Zap size={14} className="animate-pulse" />
            LIVE BATTLE ARENA
          </motion.div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black italic uppercase tracking-tighter leading-none">
            GUILD <span className="gaming-text-stroke">Schedules</span>
          </h1>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[9px] max-w-md italic">
            Official match fixtures and results for the MGB Esports League. Premium competitive gaming environment.
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-4 bg-neon-blue text-black font-black rounded-xl text-[10px] uppercase tracking-widest shadow-[0_0_30px_rgba(0,229,255,0.2)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 border-2 border-transparent hover:border-white/20"
            >
              <Plus size={18} />
              NEW FIXTURE
            </button>
          )}
        </div>
      </div>

      {/* Live Schedule Highlight */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-neon-red shadow-[0_0_10px_rgba(255,46,99,0.5)]" />
            <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter italic text-neon-red">
              LIVE <span className="text-white">SCHEDULE</span>
            </h2>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-neon-red/10 border border-neon-red/20 rounded-full">
            <div className="w-2 h-2 rounded-full bg-neon-red animate-pulse" />
            <span className="text-[10px] font-black text-neon-red uppercase tracking-widest">OFFLINE</span>
          </div>
        </div>

        {liveHighlights.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar px-4 -mx-4 md:px-0 md:mx-0">
            {liveHighlights.map((match, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="shrink-0 w-[300px] md:w-[400px] bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-xl relative group hover:border-neon-red/30 transition-all shadow-2xl overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-neon-red/5 to-transparent pointer-events-none" />
                
                <div className="absolute top-4 right-4 px-2 py-0.5 bg-neon-red/20 border border-neon-red/30 rounded text-[8px] font-black text-neon-red uppercase tracking-widest">
                   UPCOMING
                </div>

                <div className="flex items-center justify-between mt-6">
                  <div className="flex flex-col items-center gap-3 w-[40%]">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-black border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl group-hover:border-neon-blue transition-all">
                      {match.teams[0].logoUrl ? <ImageWithFallback src={match.teams[0].logoUrl} className="w-full h-full object-cover" /> : <Users size={24} className="text-gray-600" />}
                    </div>
                    <h4 className="text-xs md:text-sm font-black uppercase text-center truncate w-full italic tracking-tight">{match.teams[0].teamName}</h4>
                    {match.firstPickTeamId === match.teams[0].id && (
                      <span className="text-[8px] font-black text-neon-blue uppercase bg-neon-blue/10 px-2 py-0.5 rounded border border-neon-blue/30">1ST PICK</span>
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-3">
                    <div className="text-2xl font-black italic gaming-text-stroke group-hover:scale-110 transition-transform">VS</div>
                    <div className="flex flex-col gap-1.5 items-center">
                      <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 flex items-center gap-1.5 shadow-inner">
                        <Clock size={12} className="text-neon-red" />
                        <span className="text-[10px] font-black text-white">{match.time}</span>
                      </div>
                      
                      {match.status !== 'completed' && (
                        <div className="scale-75">
                          <CountdownTimer date={match.date} time={match.time} compact />
                        </div>
                      )}

                      {settings?.bettingEnabled && match.bet && match.bet !== '0' && (
                        <div className="px-3 py-1 bg-neon-cyan/10 rounded-full border border-neon-cyan/30 flex items-center gap-1.5">
                          <Diamond size={12} className="text-neon-cyan" />
                          <span className="text-[10px] font-black text-neon-cyan">{match.bet} DIA</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-3 w-[40%]">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-black border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl group-hover:border-neon-red transition-all">
                      {match.teams[1].logoUrl ? <ImageWithFallback src={match.teams[1].logoUrl} className="w-full h-full object-cover" /> : <Users size={24} className="text-gray-600" />}
                    </div>
                    <h4 className="text-xs md:text-sm font-black uppercase text-center truncate w-full italic tracking-tight">{match.teams[1].teamName}</h4>
                    {match.firstPickTeamId === match.teams[1].id && (
                      <span className="text-[8px] font-black text-neon-blue uppercase bg-neon-blue/10 px-2 py-0.5 rounded border border-neon-blue/30">1ST PICK</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="p-12 glass-card text-center border-dashed border-2 border-white/10 bg-black/20">
             <p className="text-gray-500 font-bold uppercase tracking-widest text-xs italic">No tactical encounters currently scheduled.</p>
          </div>
        )}
      </section>

      {/* Navigation & Search */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-6 bg-white/5 p-2 rounded-2xl border border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-1 p-1 bg-black/40 rounded-xl w-full lg:w-auto">
          {(['all', 'upcoming', 'live', 'results'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 lg:flex-none px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab 
                  ? 'bg-neon-blue text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]' 
                  : 'text-gray-500 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab === 'all' && 'ALL MATCHES'}
              {tab === 'upcoming' && 'UPCOMING'}
              {tab === 'live' && (
                <span className="flex items-center justify-center gap-2">
                  LIVE
                  <span className="w-1.5 h-1.5 bg-neon-red rounded-full animate-ping" />
                </span>
              )}
              {tab === 'results' && 'RESULTS'}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-neon-blue transition-colors" size={18} />
          <input
            type="text"
            placeholder="Search teams or match ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white focus:outline-none focus:border-neon-blue focus:shadow-[0_0_15px_rgba(0,229,255,0.1)] transition-all"
          />
        </div>
      </div>

      {/* Type Filter */}
      <div className="flex gap-4 px-1">
        {(['all', 'official', 'challenge'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
              typeFilter === type
                ? 'bg-white/10 border-white/20 text-white shadow-lg'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {type === 'all' && 'All Types'}
            {type === 'official' && 'Official Season'}
            {type === 'challenge' && 'Team Challenges'}
          </button>
        ))}
      </div>

      {/* Matches List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-20 bg-white/5 animate-pulse rounded-xl border border-white/5" />
          ))}
        </div>
      ) : filteredMatches.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-20 text-center space-y-4"
        >
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-gray-700">
            <Monitor size={32} />
          </div>
          <p className="text-gray-500 font-bold uppercase tracking-[0.3em] text-[10px]">No matches found in this sector.</p>
        </motion.div>
      ) : (
        <div className="bg-black/40 border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden">
          <AnimatePresence mode="popLayout">
            {filteredMatches.map((match, idx) => {
              const team1 = teams.find(t => t.id === match.team1Id);
              const team2 = teams.find(t => t.id === match.team2Id);
              
              return (
                <motion.div
                  key={match.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="group relative flex flex-col lg:flex-row lg:items-center hover:bg-white/[0.02] transition-colors"
                >
                  {/* Metadata & Status */}
                  <div className="lg:w-40 p-4 lg:p-6 lg:border-r border-white/5 flex flex-row lg:flex-col justify-between lg:justify-center items-center gap-2">
                    <div className="text-center">
                      <p className="text-[10px] font-black text-neon-blue uppercase tracking-widest">{match.time}</p>
                      <p className="text-[8px] font-bold text-gray-600 uppercase mt-0.5">{formatDate(match.date)}</p>
                    </div>
                    <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                      match.status === 'live' ? 'bg-neon-red text-white animate-pulse' :
                      match.status === 'completed' ? 'bg-gray-800 text-gray-400' :
                      'bg-white/5 text-gray-500'
                    }`}>
                      {match.status}
                    </div>
                    {match.status === 'upcoming' && (
                      <CountdownTimer date={match.date} time={match.time} compact />
                    )}
                  </div>

                  {/* Teams Row */}
                  <div className="flex-1 p-4 lg:p-6 flex items-center justify-center gap-4 md:gap-8">
                    <div className="flex-1 flex items-center gap-3 justify-end text-right min-w-0">
                      <h3 className="text-sm md:text-lg font-black uppercase italic tracking-tight truncate group-hover:text-neon-blue transition-colors">
                        {match.team1Name}
                      </h3>
                      <div className="w-10 h-10 rounded-lg bg-black border border-white/10 shrink-0 flex items-center justify-center p-1.5">
                        {team1?.logoUrl ? <ImageWithFallback src={team1.logoUrl} className="w-full h-full object-cover rounded-md" /> : <Users size={16} className="text-gray-700" />}
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-center">
                      <div className="text-[10px] font-black italic text-gray-700">VS</div>
                    </div>

                    <div className="flex-1 flex items-center gap-3 justify-start text-left min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-black border border-white/10 shrink-0 flex items-center justify-center p-1.5">
                        {team2?.logoUrl ? <ImageWithFallback src={team2.logoUrl} className="w-full h-full object-cover rounded-md" /> : <Users size={16} className="text-gray-700" />}
                      </div>
                      <h3 className="text-sm md:text-lg font-black uppercase italic tracking-tight truncate group-hover:text-neon-purple transition-colors">
                        {match.team2Name}
                      </h3>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-4 lg:p-6 lg:border-l border-white/5 flex items-center justify-between lg:justify-end gap-6">
                    <div className="text-right hidden xl:block">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest opacity-50">MATCH TYPE</p>
                      <p className="text-[10px] font-black text-gray-400 uppercase italic">{match.matchType || 'official'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <button
                          onClick={(e) => handleDeleteMatch(match.id, e)}
                          className="p-2.5 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                          title="Delete Fixture"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <Link 
                        to={`/schedule/${match.id}`}
                        className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-white/10 transition-all text-gray-400 hover:text-white"
                      >
                        VIEW <ChevronRight size={14} />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Smooth Scroll Animation Anchor */}
      <motion.div 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        className="pt-20 text-center"
      >
        <p className="text-gray-700 font-bold uppercase tracking-[0.5em] text-[8px]">MGB OFFICIAL TOURNAMENT SYSTEM • READY FOR BATTLE</p>
      </motion.div>

      {/* Add Match Modal */}
      <AnimatePresence>
        {showAddModal && isAdmin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-[#050505] border border-white/10 p-6 md:p-8 rounded-2xl w-full max-w-md relative gaming-border-blue"
            >
              <h2 className="text-2xl font-black uppercase tracking-widest text-white mb-6">Schedule Match</h2>
              
              <form onSubmit={handleAddMatch} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Team 1</label>
                  <select
                    required
                    value={newMatch.team1Id || ''}
                    onChange={(e) => setNewMatch({...newMatch, team1Id: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-neon-blue outline-none"
                  >
                    <option value="">Select Team</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.teamName}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Team 2</label>
                  <select
                    required
                    value={newMatch.team2Id || ''}
                    onChange={(e) => setNewMatch({...newMatch, team2Id: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-neon-blue outline-none"
                  >
                    <option value="">Select Team</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.teamName}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Date</label>
                    <input
                      type="date"
                      required
                      value={newMatch.date || ''}
                      onChange={(e) => setNewMatch({...newMatch, date: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-neon-blue outline-none [color-scheme:dark]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Time</label>
                    <input
                      type="time"
                      required
                      value={newMatch.time || ''}
                      onChange={(e) => setNewMatch({...newMatch, time: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-neon-blue outline-none [color-scheme:dark]"
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-3 bg-white/5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-neon-blue text-black rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 shadow-[0_0_20px_rgba(0,229,255,0.3)] transition-all"
                  >
                    Save Match
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Schedule;
