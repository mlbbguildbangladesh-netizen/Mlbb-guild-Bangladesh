import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Team } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Users, Diamond, Trophy, ChevronRight, X, Edit2, BarChart3, TrendingUp, Zap, Target, Star, Flame } from 'lucide-react';
import { TeamCard } from '../components/TeamCard';
import { useAuth } from '../context/AuthContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FALLBACK_IMAGE } from '../lib/utils';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { ScheduleMatch } from '../types';
import { ListSkeleton } from '../components/LoadingComponents';
import toast from 'react-hot-toast';

const Teams: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<ScheduleMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showStatsForTeam, setShowStatsForTeam] = useState<Team | null>(null);

  useEffect(() => {
    if (teams.length > 0 && location.state?.showTeamId && !showStatsForTeam) {
      const team = teams.find(t => t.id === location.state.showTeamId);
      if (team) {
        setShowStatsForTeam(team);
        // Clear state so it doesn't reopen if closed
        const currentLocation = location.pathname;
        navigate(currentLocation, { replace: true, state: {} });
      }
    }
  }, [teams, location.state, showStatsForTeam]);

  const handleRateTeam = async (team: Team, rating: number) => {
    if (!user) {
      toast.error("Please sign in to rate teams.");
      return;
    }
    try {
      const teamRef = doc(db, 'teams', team.id);
      if (team.publicRatings) {
        await updateDoc(teamRef, {
          [`publicRatings.${user.id}`]: rating
        });
      } else {
        await updateDoc(teamRef, {
          publicRatings: { [user.id]: rating }
        });
      }
      toast.success(`You rated ${team.teamName} ${rating} stars!`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit rating.");
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    const qTeams = query(collection(db, 'teams'), orderBy('teamName'));
    const unsubscribeTeams = onSnapshot(qTeams, (snapshot) => {
      setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Team));
      setLoading(false);
    });

    const qMatches = query(collection(db, 'schedules'), orderBy('date', 'desc'));
    const unsubscribeMatches = onSnapshot(qMatches, (snapshot) => {
      setMatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as ScheduleMatch));
    });

    return () => {
      clearTimeout(timer);
      unsubscribeTeams();
      unsubscribeMatches();
    };
  }, []);

  const getTeamStats = (teamId: string) => {
    const teamMatches = matches.filter(m => 
      m.status === 'completed' && (m.team1Id === teamId || m.team2Id === teamId)
    );
    
    const wins = teamMatches.filter(m => m.matchDetails?.winnerId === teamId).length;
    const losses = teamMatches.length - wins;
    const winRate = teamMatches.length > 0 ? Math.round((wins / teamMatches.length) * 100) : 0;
    
    return {
      total: teamMatches.length,
      wins,
      losses,
      winRate
    };
  };

  return (
    <div className="py-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-black italic uppercase tracking-tighter">ALL <span className="gaming-text-stroke">TEAMS</span></h1>
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Official Guild Members of MGB Bangladesh</p>
      </div>

      <AnimatePresence>
        {selectedTeam && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setSelectedTeam(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative p-2 rounded-3xl bg-neon-blue/20"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setSelectedTeam(null)}
                className="absolute -top-4 -right-4 w-10 h-10 bg-black border border-white/20 rounded-full flex items-center justify-center text-white hover:text-neon-blue transition-colors z-50"
              >
                <X size={20} />
              </button>
              <TeamCard 
                team={selectedTeam} 
                showUniqueId={isAdmin} 
                onClickStats={() => {
                  setShowStatsForTeam(selectedTeam);
                  setSelectedTeam(null);
                }} 
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showStatsForTeam && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl"
            onClick={() => setShowStatsForTeam(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="relative w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-[2.5rem] shadow-2xl p-8 sm:p-12 max-h-[90vh] overflow-y-auto overflow-x-hidden custom-scrollbar"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowStatsForTeam(null)}
                className="absolute top-6 right-6 p-2 text-gray-500 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>

              <div className="flex flex-col sm:flex-row items-center gap-6 mb-12">
                <div className="w-24 h-24 rounded-3xl bg-black border border-white/10 p-2 shadow-xl shrink-0">
                  <ImageWithFallback 
                    src={showStatsForTeam.logoUrl || ''} 
                    className="w-full h-full object-cover rounded-2xl" 
                  />
                </div>
                <div className="text-center sm:text-left flex-1">
                  <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">
                    {showStatsForTeam.teamName} <span className="text-neon-blue italic">ANALYTICS</span>
                  </h2>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-3">
                    <span className="flex items-center gap-1.5 text-xs font-black text-gray-500 uppercase tracking-widest px-2 py-1 bg-white/5 border border-white/10 rounded">
                      <Zap size={12} className="text-neon-cyan" />
                      Season Tier: {showStatsForTeam.points > 1000 ? 'Elite' : 'Gold'}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-black text-gray-500 uppercase tracking-widest px-2 py-1 bg-white/5 border border-white/10 rounded">
                      <Flame size={12} className="text-red-500" />
                      Win Streak: {showStatsForTeam.streak || 0}
                    </span>
                  </div>

                  {(() => {
                    const ratingsValues = Object.values(showStatsForTeam.publicRatings || {});
                    const averageRating = ratingsValues.length 
                      ? (ratingsValues.reduce((a, b: any) => a + Number(b), 0) / ratingsValues.length).toFixed(1) 
                      : '0.0';
                    const totalRatingCount = ratingsValues.length;
                    const userRating = user ? showStatsForTeam.publicRatings?.[user.id] : 0;
                    return (
                      <div className="bg-white/5 border border-white/10 rounded-xl p-3 inline-flex flex-col gap-2 mt-4 mx-auto sm:mx-0">
                        <div className="flex items-center gap-3">
                           <div className="flex gap-1">
                             {[1, 2, 3, 4, 5].map((star) => (
                               <Star
                                 key={star}
                                 size={16}
                                 onClick={() => handleRateTeam(showStatsForTeam, star)}
                                 className={`cursor-pointer transition-colors ${
                                   (userRating && star <= userRating)
                                     ? 'text-yellow-400 fill-yellow-400' 
                                     : star <= Number(averageRating) 
                                       ? 'text-yellow-500/50 fill-yellow-500/50' 
                                       : 'text-gray-600'
                                 } hover:text-yellow-400`}
                               />
                             ))}
                           </div>
                           <span className="text-xl font-black text-white">{averageRating}</span>
                        </div>
                        <span className="text-[9px] font-mono text-gray-400 uppercase">
                          {totalRatingCount} PUBLIC RATINGS {userRating ? `(YOU RATED ${userRating})` : ''}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
                {[
                  { label: "Matches", value: getTeamStats(showStatsForTeam.id).total, icon: Zap, color: "text-blue-500" },
                  { label: "Wins", value: getTeamStats(showStatsForTeam.id).wins, icon: Trophy, color: "text-amber-500" },
                  { label: "Win Rate", value: `${getTeamStats(showStatsForTeam.id).winRate}%`, icon: Target, color: "text-neon-cyan" },
                  { label: "Points", value: showStatsForTeam.points, icon: Star, color: "text-neon-blue" }
                ].map((stat, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-3xl p-6 text-center group hover:bg-white/[0.08] transition-all">
                    <stat.icon size={20} className={`${stat.color} mx-auto mb-3`} />
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">{stat.label}</p>
                    <p className="text-2xl font-black text-white italic">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-6">
                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-gray-500 flex items-center gap-3">
                  <span className="h-px bg-white/10 flex-1" />
                  Performance Metrics
                  <span className="h-px bg-white/10 flex-1" />
                </h3>
                
                <div className="space-y-5">
                  {[
                    { label: "Competitive Standing", value: showStatsForTeam.points > 2000 ? 95 : 75 },
                    { label: "Execution Efficiency", value: 85 },
                    { label: "Team Synergy", value: 90 }
                  ].map((metric, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-1">
                        <span className="text-gray-400">{metric.label}</span>
                        <span className="text-neon-blue">{metric.value}%</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${metric.value}%` }}
                          transition={{ delay: 0.5 + (i * 0.1), duration: 1 }}
                          className="h-full bg-gradient-to-r from-neon-blue to-neon-cyan rounded-full shadow-[0_0_10px_rgba(0,255,255,0.3)]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-12 pt-8 border-t border-white/5 flex justify-center">
                <button 
                  onClick={() => setShowStatsForTeam(null)}
                  className="px-8 py-3 bg-neon-blue text-black font-black uppercase italic tracking-tighter rounded-xl hover:scale-105 transition-transform"
                >
                  Close Analytics
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <ListSkeleton />
      ) : (
        <div className="bg-black/40 border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden">
          {teams.map((team, idx) => (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => setSelectedTeam(team)}
              className="group relative flex flex-col md:flex-row items-center gap-4 md:gap-8 p-4 md:p-6 hover:bg-white/[0.02] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-4 md:gap-6 flex-1 w-full">
                <div className="w-4 hidden md:block text-[10px] font-black text-gray-700 italic">{idx + 1}</div>
                <div className="relative shrink-0">
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl bg-black border border-white/10 group-hover:border-neon-blue transition-all overflow-hidden p-1">
                    {team.logoUrl ? (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowStatsForTeam(team);
                        }}
                        className="w-full h-full cursor-pointer hover:opacity-80 transition-opacity"
                        title="View Team Profile & Details"
                      >
                        <ImageWithFallback src={team.logoUrl} alt={team.teamName} className="w-full h-full object-cover rounded-lg" />
                      </div>
                    ) : (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowStatsForTeam(team);
                        }}
                        className="w-full h-full flex items-center justify-center text-xl font-black text-white/10 uppercase cursor-pointer hover:bg-white/5 transition-colors"
                        title="View Team Profile & Details"
                      >
                        {team.teamName.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-neon-blue text-black text-[7px] font-black uppercase rounded shadow-lg">LVL {team.upgradeLevel}</div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base md:text-xl font-black uppercase italic tracking-tight truncate group-hover:text-neon-blue transition-colors">
                      {team.teamName}
                    </h3>
                    {isAdmin && (
                      <Link 
                        to={`/profile?id=${team.id}`}
                        className="p-1 text-gray-600 hover:text-neon-blue transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Edit2 size={10} />
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded border border-white/5">
                      {team.leaderName}
                    </span>
                    <span className="text-[10px] font-bold text-gray-600 uppercase">
                      {team.players.length} Players
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8 md:gap-12 shrink-0 w-full md:w-auto justify-between md:justify-end">
                <div className="grid grid-cols-2 gap-8 md:gap-12">
                  <div className="space-y-0.5 text-center md:text-right">
                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest opacity-50">Points</p>
                    <div className="flex items-center md:justify-end gap-1.5 text-base font-black text-neon-blue italic">
                      <Trophy size={12} />
                      {team.points}
                    </div>
                  </div>
                  <div className="space-y-0.5 text-center md:text-right">
                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest opacity-50">Diamonds</p>
                    <div className="flex items-center md:justify-end gap-1.5 text-base font-black text-neon-cyan italic">
                      <Diamond size={12} />
                      {team.diamonds}
                    </div>
                  </div>
                </div>

                <div className="hidden md:flex items-center justify-center p-2 text-gray-700 group-hover:text-neon-blue transition-colors">
                  <ChevronRight size={18} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {teams.length === 0 && !loading && (
        <div className="p-20 glass-card text-center text-gray-500 font-bold italic border-dashed border-2">
          NO TEAMS REGISTERED YET. BE THE FIRST!
        </div>
      )}
    </div>
  );
};

export default Teams;
