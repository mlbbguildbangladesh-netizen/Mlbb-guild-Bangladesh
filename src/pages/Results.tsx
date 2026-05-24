import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { ScheduleMatch, Team } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy, 
  Search, 
  Calendar, 
  Clock, 
  Diamond, 
  Users, 
  Gamepad2, 
  ChevronDown, 
  ArrowRightLeft,
  CalendarDays,
  History,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/firebase';
import { ImageWithFallback } from '../components/ImageWithFallback';

const Results: React.FC = () => {
  const { isAdmin, settings } = useAuth();
  
  const [matches, setMatches] = useState<ScheduleMatch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'official' | 'challenge' | 'seasonal'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    // Fetch only completed matches
    const q = query(
      collection(db, 'schedules'), 
      where('status', '==', 'completed'),
      orderBy('date', 'desc'),
      orderBy('time', 'desc')
    );
    
    const unsubscribeSchedules = onSnapshot(q, (snapshot) => {
      const ms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ScheduleMatch[];
      setMatches(ms);
      setLoading(false);
    }, (error) => {
      console.error(error);
      // Fallback if index isn't ready or other error
      const simpleQ = query(collection(db, 'schedules'), where('status', '==', 'completed'));
      onSnapshot(simpleQ, (snap) => {
        const ms = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ScheduleMatch[];
        setMatches(ms.sort((a,b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)));
        setLoading(false);
      });
    });

    const teamsQuery = query(collection(db, 'teams'), where('registrationStatus', '==', 'approved'));
    const unsubscribeTeams = onSnapshot(teamsQuery, (snapshot) => {
      setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'teams');
    });

    return () => {
      unsubscribeSchedules();
      unsubscribeTeams();
    };
  }, []);

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

      return true;
    });
  }, [matches, searchTerm, typeFilter]);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="py-4 md:py-6 space-y-5 md:space-y-6 relative">
      {/* Header Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-neon-blue font-black tracking-[0.2em] text-[10px] uppercase">
          <History size={14} />
          BATTLE ARCHIVES
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-black italic uppercase tracking-tighter leading-none">
          MATCH <span className="gaming-text-stroke">RESULTS</span>
        </h1>
        <p className="text-gray-500 font-bold uppercase tracking-widest text-[9px] max-w-md italic">
          Complete match records, point distributions, and official outcomes from the battlefield.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white/5 p-2 rounded-2xl border border-white/10 backdrop-blur-md">
        <div className="flex flex-wrap gap-2 p-1 bg-black/40 rounded-xl">
          {(['all', 'official', 'challenge', 'seasonal'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                typeFilter === type 
                  ? 'bg-neon-blue text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]' 
                  : 'text-gray-500 hover:text-white hover:bg-white/5'
              }`}
            >
              {type === 'all' ? 'ALL RESULTS' : type + 'S'}
            </button>
          ))}
        </div>

        <div className="relative group min-w-[280px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-neon-blue transition-colors" size={18} />
          <input
            type="text"
            placeholder="Search teams..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white focus:outline-none focus:border-neon-blue transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-neon-blue border-t-transparent rounded-full animate-spin neon-glow-blue" />
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Accessing Records...</p>
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="py-20 text-center space-y-4 border border-white/5 bg-white/5 rounded-3xl">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-gray-700">
            <Trophy size={32} />
          </div>
          <p className="text-gray-500 font-bold uppercase tracking-[0.3em] text-[10px]">No recorded outcomes found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMatches.map((match, idx) => {
            const team1 = teams.find(t => t.id === match.team1Id);
            const team2 = teams.find(t => t.id === match.team2Id);
            const winnerId = match.matchDetails?.winnerId;
            const isT1Winner = winnerId === match.team1Id;
            const isT2Winner = winnerId === match.team2Id;
            const isExpanded = expandedId === match.id;

            return (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.05, 1) }}
                className={`group glass-card border border-white/5 overflow-hidden transition-all hover:border-white/20 ${isExpanded ? 'ring-1 ring-neon-blue/30' : ''}`}
              >
                {/* Main Match Bar */}
                <div 
                  className="flex flex-col lg:flex-row items-stretch cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : match.id)}
                >
                  {/* Date & Type */}
                  <div className="lg:w-48 p-4 lg:p-6 bg-white/5 lg:border-r border-white/5 flex lg:flex-col justify-between lg:justify-center items-center gap-4 text-center">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 justify-center text-neon-blue">
                        <Calendar size={12} />
                        <span className="text-[10px] font-black uppercase">{formatDate(match.date)}</span>
                      </div>
                      <div className="flex items-center gap-2 justify-center text-gray-500">
                        <Clock size={12} />
                        <span className="text-[10px] font-bold uppercase">{match.time}</span>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-black/40 border border-white/10 rounded-full text-[8px] font-black text-gray-400 uppercase tracking-widest group-hover:border-neon-blue/30 transition-all">
                      {match.matchType || 'OFFICIAL'}
                    </span>
                  </div>

                  {/* Battle Result Area */}
                  <div className="flex-1 p-6 flex items-center justify-between gap-4 md:gap-12 bg-gradient-to-r from-transparent via-white/[0.01] to-transparent">
                    {/* Team 1 */}
                    <div className={`flex-1 flex items-center gap-4 justify-end text-right transition-all ${isT1Winner ? 'scale-105' : 'opacity-60 grayscale-[0.5]'}`}>
                      <div className="flex flex-col">
                        <h3 className={`text-sm md:text-xl font-black uppercase italic tracking-tighter ${isT1Winner ? 'text-neon-blue' : 'text-white'}`}>
                          {match.team1Name}
                        </h3>
                        {isT1Winner && (
                          <span className="text-[8px] font-black text-neon-blue uppercase mt-1 flex items-center gap-1 justify-end">
                            <Trophy size={8} /> CHAMPION
                          </span>
                        )}
                      </div>
                      <div className={`w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-black border-2 shrink-0 flex items-center justify-center p-2 transition-all ${isT1Winner ? 'border-neon-blue shadow-[0_0_20px_rgba(0,229,255,0.2)]' : 'border-white/10 opacity-50'}`}>
                        {team1?.logoUrl ? <ImageWithFallback src={team1.logoUrl} className="w-full h-full object-cover rounded-lg" /> : <Users size={20} className="text-gray-700" />}
                      </div>
                    </div>

                    {/* Result Center */}
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <div className="text-[10px] font-black text-gray-500 italic tracking-widest px-4 py-1 bg-white/5 rounded-full border border-white/5">VS</div>
                      <div className="px-4 py-2 bg-neon-blue/10 border border-neon-blue/20 rounded-xl">
                        <span className="text-xl md:text-3xl font-black italic gaming-text-gradient uppercase tracking-widest">
                          {match.matchDetails?.resultType === 'walkout' ? 'W/O' : 'END'}
                        </span>
                      </div>
                    </div>

                    {/* Team 2 */}
                    <div className={`flex-1 flex items-center gap-4 justify-start text-left transition-all ${isT2Winner ? 'scale-105' : 'opacity-60 grayscale-[0.5]'}`}>
                      <div className={`w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-black border-2 shrink-0 flex items-center justify-center p-2 transition-all ${isT2Winner ? 'border-neon-blue shadow-[0_0_20px_rgba(0,229,255,0.2)]' : 'border-white/10 opacity-50'}`}>
                        {team2?.logoUrl ? <ImageWithFallback src={team2.logoUrl} className="w-full h-full object-cover rounded-lg" /> : <Users size={20} className="text-gray-700" />}
                      </div>
                      <div className="flex flex-col">
                        <h3 className={`text-sm md:text-xl font-black uppercase italic tracking-tighter ${isT2Winner ? 'text-neon-blue' : 'text-white'}`}>
                          {match.team2Name}
                        </h3>
                        {isT2Winner && (
                          <span className="text-[8px] font-black text-neon-blue uppercase mt-1 flex items-center gap-1 justify-start">
                            <Trophy size={8} /> CHAMPION
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expand Toggle */}
                  <div className="p-4 lg:p-6 bg-white/5 lg:border-l border-white/5 flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      className="text-gray-500 group-hover:text-neon-blue transition-colors"
                    >
                      <ChevronDown size={20} />
                    </motion.div>
                  </div>
                </div>

                {/* Expanded Details - Point Distribution */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-white/10 bg-black/40 overflow-hidden"
                    >
                      <div className="p-6 md:p-10 space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                          {/* Team 1 Rewards */}
                          <div className={`space-y-4 p-6 rounded-2xl border transition-all ${isT1Winner ? 'bg-neon-blue/5 border-neon-blue/20' : 'bg-white/5 border-white/10'}`}>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl overflow-hidden bg-black border border-white/10">
                                {team1?.logoUrl ? <ImageWithFallback src={team1.logoUrl} className="w-full h-full object-cover" /> : <Users size={16} className="text-gray-700 mx-auto mt-3" />}
                              </div>
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">{match.team1Name} DIST</h4>
                            </div>
                            
                            <div className="flex gap-4">
                              <div className="flex-1 space-y-1">
                                <p className="text-[8px] font-bold text-gray-500 uppercase">Season Points</p>
                                <div className={`flex items-center gap-2 text-lg font-black ${ (match.matchDetails?.pointsExchanged?.team1 || 0) >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                                  <TrendingUp size={16} />
                                  { (match.matchDetails?.pointsExchanged?.team1 || 0) >= 0 ? '+' : ''}{match.matchDetails?.pointsExchanged?.team1 || 0}
                                </div>
                              </div>
                              <div className="flex-1 space-y-1">
                                <p className="text-[8px] font-bold text-gray-500 uppercase">Diamonds</p>
                                <div className="flex items-center gap-2 text-lg font-black text-neon-cyan">
                                  <Diamond size={16} />
                                  { (match.matchDetails?.diamondsExchanged?.team1 || 0) >= 0 ? '+' : ''}{match.matchDetails?.diamondsExchanged?.team1 || 0}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Reward Transfer Visual */}
                          <div className="hidden lg:flex flex-col items-center justify-center space-y-4">
                            <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-gray-500 uppercase tracking-widest">
                               PROFIT DISTRIBUTION
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="h-px w-20 bg-gradient-to-r from-transparent via-neon-blue to-transparent" />
                              <ArrowRightLeft className="text-neon-blue animate-pulse" size={24} />
                              <div className="h-px w-20 bg-gradient-to-r from-transparent via-neon-blue to-transparent" />
                            </div>
                            <p className="text-[8px] font-bold text-gray-600 uppercase text-center max-w-[120px]">Points calculated based on match multiplier</p>
                          </div>

                          {/* Team 2 Rewards */}
                          <div className={`space-y-4 p-6 rounded-2xl border transition-all ${isT2Winner ? 'bg-neon-blue/5 border-neon-blue/20' : 'bg-white/5 border-white/10'}`}>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl overflow-hidden bg-black border border-white/10">
                                {team2?.logoUrl ? <ImageWithFallback src={team2.logoUrl} className="w-full h-full object-cover" /> : <Users size={16} className="text-gray-700 mx-auto mt-3" />}
                              </div>
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">{match.team2Name} DIST</h4>
                            </div>
                            
                            <div className="flex gap-4">
                              <div className="flex-1 space-y-1">
                                <p className="text-[8px] font-bold text-gray-500 uppercase">Season Points</p>
                                <div className={`flex items-center gap-2 text-lg font-black ${ (match.matchDetails?.pointsExchanged?.team2 || 0) >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                                  <TrendingUp size={16} />
                                  { (match.matchDetails?.pointsExchanged?.team2 || 0) >= 0 ? '+' : ''}{match.matchDetails?.pointsExchanged?.team2 || 0}
                                </div>
                              </div>
                              <div className="flex-1 space-y-1">
                                <p className="text-[8px] font-bold text-gray-500 uppercase">Diamonds</p>
                                <div className="flex items-center gap-2 text-lg font-black text-neon-cyan">
                                  <Diamond size={16} />
                                  { (match.matchDetails?.diamondsExchanged?.team2 || 0) >= 0 ? '+' : ''}{match.matchDetails?.diamondsExchanged?.team2 || 0}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Match Footnote */}
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-8 border-t border-white/5">
                           <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full">
                                <Gamepad2 size={12} className="text-gray-500" />
                                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Match ID: {match.id.slice(-8).toUpperCase()}</span>
                              </div>
                              <div className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full">
                                <AlertCircle size={12} className="text-gray-500" />
                                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Result: {match.matchDetails?.resultType}</span>
                              </div>
                              {(match.streamUrl || match.matchDetails?.externalLink) && (
                                <a 
                                  href={match.streamUrl || match.matchDetails?.externalLink} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-3 py-1 bg-neon-blue/10 border border-neon-blue/20 rounded-full text-neon-blue hover:bg-neon-blue hover:text-black transition-all"
                                >
                                  <History size={12} />
                                  <span className="text-[9px] font-black uppercase tracking-widest">MATCH RECORD</span>
                                </a>
                              )}
                           </div>
                           
                           {match.matchType === 'challenge' && match.bet && (
                             <p className="text-[10px] font-bold text-gray-600 uppercase italic">
                               Challenge Stake: <span className="text-neon-cyan">{match.bet} Diamonds</span> committed by teams.
                             </p>
                           )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Seasonal Summary Accent */}
      <div className="pt-10 border-t border-white/5 text-center">
         <p className="text-[10px] font-black text-gray-700 uppercase tracking-[0.5em]">MISSION ARCHIVES TERMINATED • END OF RESULTS</p>
      </div>
    </div>
  );
};

export default Results;
