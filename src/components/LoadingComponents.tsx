import React from 'react';
import { motion } from 'framer-motion';

interface SkeletonProps {
  className?: string;
  variant?: 'rectangular' | 'circular' | 'text';
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', variant = 'rectangular' }) => {
  const baseClasses = "bg-white/5 overflow-hidden relative";
  const variantClasses = {
    rectangular: "rounded-lg",
    circular: "rounded-full",
    text: "rounded-md h-4 w-full"
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        animate={{
          x: ['-100%', '100%'],
        }}
        transition={{
          repeat: Infinity,
          duration: 1.5,
          ease: "linear",
        }}
      />
    </div>
  );
};

export const LoadingIndicator: React.FC<{ message?: string }> = ({ message = "Loading Data..." }) => (
  <div className="flex flex-col items-center justify-center p-12 space-y-4">
    <div className="relative">
      <div className="w-12 h-12 border-2 border-neon-blue/20 rounded-full" />
      <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-neon-blue rounded-full animate-spin" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-neon-blue rounded-full animate-pulse" />
    </div>
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 animate-pulse">
      {message}
    </p>
  </div>
);

export const TeamCardSkeleton: React.FC = () => (
  <div className="w-full flex justify-center">
    <div className="w-full max-w-sm h-32 bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-4 relative overflow-hidden">
      <Skeleton className="w-24 h-24 sm:w-24 sm:h-24 flex-shrink-0" />
      <div className="flex-1 space-y-3 py-2">
        <Skeleton variant="text" className="w-3/4 h-6" />
        <Skeleton variant="text" className="w-1/2 h-4" />
        <div className="flex gap-2">
          <Skeleton className="w-16 h-4" />
          <Skeleton className="w-16 h-4" />
        </div>
      </div>
      <Skeleton className="absolute top-0 right-0 w-full h-full opacity-10" />
    </div>
  </div>
);

export const MatchCardSkeleton: React.FC = () => (
  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">
    <div className="flex items-center justify-between">
      <Skeleton className="w-24 h-4" />
      <Skeleton className="w-20 h-4" />
    </div>
    <div className="flex items-center justify-center gap-8">
      <div className="flex flex-col items-center gap-2">
        <Skeleton variant="circular" className="w-16 h-16" />
        <Skeleton variant="text" className="w-20 h-4" />
      </div>
      <Skeleton className="w-12 h-8" />
      <div className="flex flex-col items-center gap-2">
        <Skeleton variant="circular" className="w-16 h-16" />
        <Skeleton variant="text" className="w-20 h-4" />
      </div>
    </div>
    <div className="pt-4 border-t border-white/5 flex justify-center">
      <Skeleton className="w-32 h-8" />
    </div>
  </div>
);

export const TableRowSkeleton: React.FC = () => (
  <div className="flex items-center gap-4 px-6 py-6 border-b border-white/5">
    <Skeleton className="w-8 h-8 shrink-0" />
    <div className="flex items-center gap-4 flex-1">
      <Skeleton variant="circular" className="w-10 h-10 shrink-0" />
      <div className="space-y-2 flex-1">
        <Skeleton variant="text" className="w-1/2 h-4" />
        <Skeleton variant="text" className="w-1/4 h-3" />
      </div>
    </div>
    <Skeleton className="w-20 h-6 shrink-0" />
    <Skeleton className="w-16 h-8 shrink-0 hidden md:block" />
    <Skeleton className="w-16 h-8 shrink-0 hidden md:block" />
  </div>
);

export const CardSkeleton: React.FC = () => (
  <div className="glass-card p-6 md:p-10 space-y-6 relative overflow-hidden">
    <Skeleton className="w-14 h-14 rounded-xl" />
    <Skeleton variant="text" className="w-2/3 h-8" />
    <Skeleton variant="text" className="h-4" />
    <Skeleton variant="text" className="h-4" />
    <Skeleton variant="text" className="w-5/6 h-4" />
  </div>
);

export const GridSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
    {Array.from({ length: count }).map((_, i) => (
      <CardSkeleton key={i} />
    ))}
  </div>
);

export const ListSkeleton: React.FC = () => (
  <div className="bg-black/40 border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="p-4 md:p-6 flex items-center gap-6">
        <Skeleton className="w-4 h-4 hidden md:block shrink-0" />
        <Skeleton variant="circular" className="w-12 h-12 md:w-16 md:h-16 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" className="w-1/3 h-5" />
          <Skeleton variant="text" className="w-1/4 h-3" />
        </div>
        <div className="flex gap-4 min-w-[200px] justify-end">
          <Skeleton className="w-20 h-10 rounded-lg hidden sm:block shrink-0" />
          <Skeleton className="w-20 h-10 rounded-lg hidden sm:block shrink-0" />
        </div>
      </div>
    ))}
  </div>
);
