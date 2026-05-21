import React from 'react';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface RankBadgeProps {
  rank: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const RankBadge: React.FC<RankBadgeProps> = ({ rank, className, size = 'md' }) => {
  const getRankStyles = (r: string) => {
    switch (r) {
      case 'E':
        return {
          container: "bg-zinc-800/50 border-zinc-500/30 text-zinc-400",
          text: "text-zinc-400",
          animation: {}
        };
      case 'D':
        return {
          container: "bg-emerald-900/40 border-emerald-500/40 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]",
          text: "text-emerald-400",
          animation: { boxShadow: ['0 0 5px rgba(16,185,129,0.2)', '0 0 15px rgba(16,185,129,0.4)', '0 0 5px rgba(16,185,129,0.2)'] }
        };
      case 'C':
        return {
          container: "bg-cyan-900/40 border-cyan-400/50 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)]",
          text: "text-cyan-400",
          animation: { boxShadow: ['0 0 10px rgba(34,211,238,0.3)', '0 0 20px rgba(34,211,238,0.6)', '0 0 10px rgba(34,211,238,0.3)'] }
        };
      case 'B':
        return {
          container: "bg-fuchsia-900/40 border-fuchsia-400/60 text-fuchsia-400 shadow-[0_0_20px_rgba(232,121,249,0.4)]",
          text: "text-fuchsia-400 drop-shadow-[0_0_3px_rgba(232,121,249,0.8)]",
          animation: { 
            boxShadow: ['0 0 15px rgba(232,121,249,0.4)', '0 0 25px rgba(232,121,249,0.7)', '0 0 15px rgba(232,121,249,0.4)'],
          }
        };
      case 'A':
        return {
          container: "bg-orange-900/50 border-orange-400/70 text-orange-400 shadow-[0_0_25px_rgba(251,146,60,0.5)]",
          text: "text-orange-400 drop-shadow-[0_0_5px_rgba(251,146,60,0.9)] animate-pulse",
          animation: { 
             boxShadow: ['0 0 20px rgba(251,146,60,0.5)', '0 0 35px rgba(251,146,60,0.8)', '0 0 20px rgba(251,146,60,0.5)']
          }
        };
      case 'S':
        return {
          container: "bg-red-900/60 border-red-500/80 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.6)]",
          text: "text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,1)]",
          animation: { 
            boxShadow: ['0 0 25px rgba(239,68,68,0.6)', '0 0 45px rgba(239,68,68,0.9)', '0 0 25px rgba(239,68,68,0.6)'],
            scale: [1, 1.02, 1]
          }
        };
      case 'SS':
        return {
          container: "bg-gradient-to-r from-yellow-900/80 via-yellow-600/50 to-yellow-900/80 border-yellow-400 text-yellow-300 shadow-[0_0_35px_rgba(250,204,21,0.7)]",
          text: "text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-200 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]",
          animation: {
            boxShadow: ['0 0 30px rgba(250,204,21,0.7)', '0 0 60px rgba(250,204,21,1)', '0 0 30px rgba(250,204,21,0.7)'],
            scale: [1, 1.05, 1]
          }
        };
      case 'SSS':
        return {
          container: "relative bg-gradient-to-r from-violet-900 via-fuchsia-900 to-red-900 border-x-transparent border-y-white/50 shadow-[0_0_50px_rgba(255,255,255,0.5)] overflow-hidden",
          text: "text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-yellow-400 to-fuchsia-400 drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] font-black tracking-widest relative z-10",
          animation: {
            boxShadow: ['0 0 40px rgba(255,255,255,0.5)', '0 0 80px rgba(255,0,255,0.8)', '0 0 40px rgba(255,255,255,0.5)'],
            scale: [1, 1.1, 1]
          }
        };
      default:
        return {
          container: "bg-white/10 border-white/10 text-gray-400",
          text: "text-gray-400",
          animation: {}
        };
    }
  };

  const style = getRankStyles(rank);

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[8px] md:text-[10px]",
    md: "px-3 py-1 text-xs md:text-sm",
    lg: "px-4 py-1.5 text-sm md:text-base",
    xl: "px-8 py-3 text-2xl md:text-4xl border-2"
  };

  return (
    <motion.div
      animate={style.animation}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      className={cn(
        "border rounded uppercase italic font-black text-center whitespace-nowrap",
        sizeClasses[size],
        style.container,
        className
      )}
    >
      {rank === 'SSS' && (
        <motion.div 
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 z-0"
        />
      )}
      <span className={cn("inline-block", style.text)}>RANK {rank}</span>
    </motion.div>
  );
};
