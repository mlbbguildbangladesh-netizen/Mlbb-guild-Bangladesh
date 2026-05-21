import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Team } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Diamond, Zap, TrendingUp, Search, Filter, ArrowDownWideNarrow, ArrowUpNarrowWide, Sword, ChevronRight } from 'lucide-react';
import { FALLBACK_IMAGE, RANKS } from '../lib/utils';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { RankBadge } from '../components/RankBadge';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { handleFirestoreError, OperationType } from '../lib/firebase';
import { TableRowSkeleton } from '../components/LoadingComponents';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const Leaderboard: React.FC = () => {
  const { isAdmin, settings } = useAuth();
  
  if (settings?.showLeaderboard === false && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'points' | 'diamonds' | 'streak' | 'rank' | 'createdAt'>('points');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    // Only subscribe to all teams. Sorting is handled on the client.
    const q = query(
      collection(db, 'teams')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const teamsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Team[];
      setTeams(teamsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'teams');
    });

    return () => { clearTimeout(timer); unsubscribe(); };
  }, []);

  const filteredTeams = teams
    .filter(t => t.teamName.toLowerCase().includes(search.toLowerCase()) && t.registrationStatus === 'approved')
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'points') {
        const rankA = RANKS.indexOf(a.rank || 'E');
        const rankB = RANKS.indexOf(b.rank || 'E');
        if (rankA !== rankB) {
          comparison = rankA - rankB;
        } else {
          comparison = (a.points || 0) - (b.points || 0);
        }
      }
      else if (sortBy === 'diamonds') comparison = (a.diamonds || 0) - (b.diamonds || 0);
      else if (sortBy === 'streak') comparison = (a.streak || 0) - (b.streak || 0);
      else if (sortBy === 'createdAt') comparison = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      else if (sortBy === 'rank') {
        const rankA = RANKS.indexOf(a.rank || 'E');
        const rankB = RANKS.indexOf(b.rank || 'E');
        comparison = rankA - rankB;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

  return (
    <div className="py-6 md:py-10 space-y-8 md:space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
        <div className="space-y-4 md:space-y-6">
          <div className="space-y-2">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 text-neon-blue font-bold tracking-widest text-sm"
            >
              <Trophy size={16} />
              LIVE STANDINGS
            </motion.div>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-black italic uppercase tracking-tighter">LEADER<span className="gaming-text-stroke">BOARD</span></h1>
          </div>
          
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center flex-wrap gap-2 lg:gap-3 bg-white/5 p-3 rounded-xl border border-white/10"
          >
            <span className="text-xs font-black text-gray-500 uppercase tracking-widest mr-2">Rank Tiers:</span>
            {RANKS.map((r, i) => (
              <React.Fragment key={r}>
                <RankBadge rank={r} size="sm" className="hidden md:block" />
                <RankBadge rank={r} size="sm" className="md:hidden !px-1.5 !text-[8px]" />
                {i < RANKS.length - 1 && (
                  <ChevronRight size={14} className="text-gray-600 hidden sm:block" />
                )}
              </React.Fragment>
            ))}
          </motion.div>
        </div>

        <div className="relative group max-w-sm w-full md:w-auto flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-neon-blue transition-colors" size={20} />
          <input
            type="text"
            placeholder="Search teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 focus:outline-none focus:border-neon-blue transition-all"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-48">
            <Filter opacity={0.5} className="absolute left-3 top-1/2 -translate-y-1/2" size={16} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-8 py-3.5 appearance-none focus:outline-none focus:border-neon-blue transition-all text-sm font-bold"
            >
              <option value="points">Points</option>
              <option value="rank">Team Rank</option>
              <option value="createdAt">Recent Join</option>
              <option value="diamonds">Diamonds</option>
              <option value="streak">Streak</option>
            </select>
          </div>
          
          <button
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="p-3.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
          >
            {sortOrder === 'desc' ? <ArrowDownWideNarrow size={20} /> : <ArrowUpNarrowWide size={20} />}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="glass-card gaming-border-blue overflow-hidden divide-y divide-white/5">
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRowSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="glass-card gaming-border-blue w-full overflow-hidden">
          {/* Desktop Table View */}
          <div className="w-full overflow-x-auto hidden md:block">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="px-6 py-5 text-xs font-black uppercase tracking-widest text-gray-400">Rank</th>
                  <th className="px-6 py-5 text-xs font-black uppercase tracking-widest text-gray-400">Team</th>
                  <th className="px-6 py-5 text-xs font-black uppercase tracking-widest text-gray-400 text-center">Class</th>
                  <th className="px-6 py-5 text-xs font-black uppercase tracking-widest text-gray-400 text-center">Points</th>
                  <th className="px-6 py-5 text-xs font-black uppercase tracking-widest text-gray-400 text-center">Diamonds</th>
                  <th className="px-6 py-5 text-xs font-black uppercase tracking-widest text-gray-400 text-center">Matches</th>
                  <th className="px-6 py-5 text-xs font-black uppercase tracking-widest text-gray-400 text-center">Streak</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {filteredTeams.map((team, index) => (
                    <motion.tr
                      key={team.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={cn(
                        "border-b border-white/5 hover:bg-white/5 transition-colors group",
                        index === 0 && sortBy === 'points' && sortOrder === 'desc' && "bg-neon-blue/5"
                      )}
                    >
                      <td className="px-6 py-6">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm",
                          index === 0 && sortBy === 'points' && sortOrder === 'desc' ? "bg-neon-blue text-black neon-glow-blue" :
                          index === 1 && sortBy === 'points' && sortOrder === 'desc' ? "bg-gray-400 text-black" :
                          index === 2 && sortBy === 'points' && sortOrder === 'desc' ? "bg-orange-500 text-black" :
                          "bg-white/10 text-gray-400"
                        )}>
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex items-center gap-4">
                          {team.logoUrl ? (
                            <ImageWithFallback src={team.logoUrl} alt={team.teamName} className="w-10 h-10 rounded-lg object-cover ring-2 ring-white/10 group-hover:ring-neon-blue transition-all" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center font-black text-base text-gray-500">
                              {team.teamName.charAt(0)}
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-lg leading-none">{team.teamName}</p>
                            {isAdmin && (
                              <p className="text-xs text-gray-500 mt-1 font-mono uppercase">ID: {team.uniqueId}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <div className="flex justify-center">
                          <RankBadge rank={team.rank || 'E'} size="md" />
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <div className="flex items-center justify-center gap-2 font-black text-neon-blue text-xl">
                          <TrendingUp size={16} />
                          {team.points}
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <div className="flex items-center justify-center gap-2 font-black text-neon-cyan text-xl">
                          <Diamond size={16} />
                          {team.diamonds}
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <div className="flex items-center justify-center gap-2 font-black text-gray-300 text-xl">
                          <Sword size={16} />
                          {team.matchesThisSeason || 0}
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <div className="flex items-center justify-center gap-2 font-bold text-neon-red text-base">
                          <Zap size={16} className={cn(team.streak > 2 && "animate-pulse")} />
                          x{team.streak}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-white/5">
            <AnimatePresence mode="popLayout">
              {filteredTeams.map((team, index) => (
                <motion.div
                  key={team.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "p-4 flex flex-col gap-4",
                    index === 0 && sortBy === 'points' && sortOrder === 'desc' && "bg-neon-blue/5"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-6 h-6 rounded flex items-center justify-center font-black text-[10px]",
                        index === 0 && sortBy === 'points' && sortOrder === 'desc' ? "bg-neon-blue text-black" :
                        index === 1 && sortBy === 'points' && sortOrder === 'desc' ? "bg-gray-400 text-black" :
                        index === 2 && sortBy === 'points' && sortOrder === 'desc' ? "bg-orange-500 text-black" :
                        "bg-white/10 text-gray-500"
                      )}>
                        {index + 1}
                      </div>
                      <div className="flex items-center gap-2">
                        {team.logoUrl ? (
                          <ImageWithFallback src={team.logoUrl} alt={team.teamName} className="w-8 h-8 rounded object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center font-black text-xs text-gray-500">
                            {team.teamName.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="font-black text-xs leading-none uppercase">{team.teamName}</p>
                          {isAdmin && (
                            <p className="text-[8px] text-gray-500 mt-0.5 font-mono">ID: {team.uniqueId}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <RankBadge rank={team.rank || 'E'} size="sm" />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-white/5 rounded-lg p-2 flex flex-col items-center justify-center border border-white/5">
                       <p className="text-[7px] font-black text-gray-500 uppercase tracking-widest mb-1">Points</p>
                       <div className="flex items-center gap-1 font-black text-neon-blue text-[10px]">
                         <TrendingUp size={8} />
                         {team.points}
                       </div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2 flex flex-col items-center justify-center border border-white/5">
                       <p className="text-[7px] font-black text-gray-500 uppercase tracking-widest mb-1">Diamonds</p>
                       <div className="flex items-center gap-1 font-black text-neon-cyan text-[10px]">
                         <Diamond size={8} />
                         {team.diamonds}
                       </div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2 flex flex-col items-center justify-center border border-white/5">
                       <p className="text-[7px] font-black text-gray-500 uppercase tracking-widest mb-1">Match</p>
                       <div className="flex items-center gap-1 font-black text-gray-300 text-[10px]">
                         <Sword size={8} />
                         {team.matchesThisSeason || 0}
                       </div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2 flex flex-col items-center justify-center border border-white/5">
                       <p className="text-[7px] font-black text-gray-500 uppercase tracking-widest mb-1">Streak</p>
                       <div className="flex items-center gap-1 font-black text-neon-red text-[10px]">
                         <Zap size={8} className={cn(team.streak > 2 && "animate-pulse")} />
                         x{team.streak}
                       </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {filteredTeams.length === 0 && (
            <div className="p-10 text-center text-gray-500 font-medium">
              No teams found matching your search.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
