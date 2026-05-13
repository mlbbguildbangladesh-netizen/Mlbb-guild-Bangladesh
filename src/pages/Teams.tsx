import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Team } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Users, Diamond, Trophy, ChevronRight, X, Edit2 } from 'lucide-react';
import { TeamCard } from '../components/TeamCard';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { FALLBACK_IMAGE } from '../lib/utils';
import { ImageWithFallback } from '../components/ImageWithFallback';

const Teams: React.FC = () => {
  const { isAdmin } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'teams'), orderBy('teamName'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Team));
      setLoading(false);
    }, (error) => {
      console.error("Teams Snapshot Error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="py-10 space-y-10">
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
              <TeamCard team={selectedTeam} showUniqueId={isAdmin} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-24 bg-white/5 animate-pulse rounded-2xl" />
          ))}
        </div>
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
                      <ImageWithFallback src={team.logoUrl} alt={team.teamName} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl font-black text-white/10 uppercase">
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
