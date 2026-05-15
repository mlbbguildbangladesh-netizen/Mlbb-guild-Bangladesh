import React, { forwardRef } from 'react';
import { Trophy, Users, BarChart3 } from 'lucide-react';
import { Team } from '../types';
import { FALLBACK_IMAGE } from '../lib/utils';
import { ImageWithFallback } from './ImageWithFallback';

interface TeamCardProps {
  team: Partial<Team>;
  showUniqueId?: boolean;
  onClickStats?: () => void;
}

export const TeamCard = forwardRef<HTMLDivElement, TeamCardProps>(({ team, showUniqueId = true, onClickStats }, ref) => {
  return (
    <div className="w-full flex justify-center">
      <div 
        ref={ref}
        className="w-[320px] sm:w-[400px] h-[200px] sm:h-[250px] flex-shrink-0 relative rounded-xl sm:rounded-2xl overflow-hidden bg-black border-2 border-neon-blue neon-glow-blue text-left flex p-4 sm:p-6 gap-3 sm:gap-6 mx-auto"
      >
        <div className="absolute inset-0 bg-neutral-900 overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px]" />
        </div>
        <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-neon-blue/20 to-transparent pointer-events-none" />
        
        {onClickStats && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onClickStats();
            }}
            className="absolute top-3 right-3 z-20 p-1.5 sm:p-2 bg-black/40 backdrop-blur-sm border border-neon-blue/30 rounded-lg text-neon-blue hover:bg-neon-blue hover:text-black transition-all flex items-center justify-center gap-1.5 group shadow-[0_0_15px_rgba(0,255,255,0.2)]"
            title="View Statistics"
          >
            <BarChart3 size={14} className="sm:w-4 sm:h-4" />
            <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest hidden sm:inline-block">STATS</span>
          </button>
        )}
        
        <div className="relative z-10 w-16 h-16 sm:w-24 sm:h-24 flex-shrink-0 bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          {team.logoUrl ? (
            <img 
              src={team.logoUrl} 
              className="w-full h-full object-cover" 
              referrerPolicy="no-referrer" 
              onError={(e) => {
                (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl sm:text-4xl font-black text-white/20">?</div>
          )}
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-between">
          <div>
            <h3 className="text-lg sm:text-2xl font-black text-neon-blue tracking-tighter uppercase leading-none truncate pr-2">
              {team.teamName || "TEAM NAME"}
            </h3>
            <div className="flex items-center gap-1.5 sm:gap-2 mt-1 sm:mt-2">
              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-neon-blue animate-pulse" />
              <span className="text-[8px] sm:text-[10px] font-bold text-gray-400 tracking-widest uppercase">MGB OFFICIAL MEMBER</span>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[8px] sm:text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-none">PLAYER ROSTER</p>
            <p className="text-[10px] sm:text-xs font-medium text-white/80 line-clamp-2 pr-2">
              {team.players?.filter(p => p).join(' • ') || "NO PLAYERS"}
            </p>
          </div>

          <div className="flex justify-between items-end pr-2">
            <div>
              <p className="text-[8px] sm:text-[9px] text-gray-500 font-bold uppercase tracking-widest">LEADER</p>
              <p className="text-xs sm:text-sm font-black text-white truncate max-w-[80px] sm:max-w-[120px]">{team.leaderName || "LEADER"}</p>
            </div>
            <div className="text-right">
              <p className="text-[8px] sm:text-[9px] text-neon-blue font-bold uppercase tracking-widest">
                {(team.uniqueId && showUniqueId) ? "TICKET NO." : "RANK"}
              </p>
              <p className={`text-xs sm:text-sm font-black ${(team.uniqueId && showUniqueId) ? 'text-neon-cyan neon-glow-blue' : 'text-gray-300'}`}>
                {(team.uniqueId && showUniqueId) ? team.uniqueId : (team.points && team.points > 1000 ? 'LEGEND' : 'MEMBER')}
              </p>
            </div>
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute bottom-4 left-6 opacity-20 pointer-events-none hidden sm:block">
          <Trophy size={40} className="text-neon-blue" />
        </div>
      </div>
    </div>
  );
});

TeamCard.displayName = 'TeamCard';
