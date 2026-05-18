import React, { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

interface CountdownTimerProps {
  date: string;
  time: string;
  compact?: boolean;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({ date, time, compact = false }) => {
  const [timeLeft, setTimeLeft] = useState<{ h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      try {
        // Parse "YYYY-MM-DD" and "HH:MM AM/PM"
        const [year, month, day] = date.split('-').map(Number);
        
        // Simple time parser for "10:00 PM" or "22:00"
        let hours = 0;
        let minutes = 0;
        
        if (time.toLowerCase().includes('am') || time.toLowerCase().includes('pm')) {
          const [timePart, modifier] = time.split(' ');
          let [h, m] = timePart.split(':').map(Number);
          if (m === undefined) m = 0;
          if (h === 12) h = 0;
          if (modifier.toLowerCase() === 'pm') h += 12;
          hours = h;
          minutes = m;
        } else {
          const [h, m] = time.split(':').map(Number);
          hours = h || 0;
          minutes = m || 0;
        }

        const targetDate = new Date(year, month - 1, day, hours, minutes);
        const now = new Date();
        const difference = targetDate.getTime() - now.getTime();

        if (difference > 0) {
          const hours = Math.floor(difference / (1000 * 60 * 60));
          if (hours >= 24) {
            setTimeLeft({
              h: hours,
              m: Math.floor((difference / 1000 / 60) % 60),
              s: Math.floor((difference / 1000) % 60)
            });
          } else {
            setTimeLeft({
              h: hours,
              m: Math.floor((difference / 1000 / 60) % 60),
              s: Math.floor((difference / 1000) % 60)
            });
          }
        } else {
          setTimeLeft(null);
        }
      } catch (e) {
        setTimeLeft(null);
      }
    };

    const timer = setInterval(calculateTimeLeft, 1000);
    calculateTimeLeft();
    return () => clearInterval(timer);
  }, [date, time]);

  if (!timeLeft) return null;

  if (compact) {
    const days = Math.floor(timeLeft.h / 24);
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-neon-red/10 border border-neon-red/30 rounded-md animate-pulse">
        <Timer size={10} className="text-neon-red" />
        <span className="text-[10px] font-black text-neon-red tracking-tighter">
          {days > 0 ? `${days} DAY${days > 1 ? 'S' : ''}` : `${timeLeft.h}H ${timeLeft.m}M ${timeLeft.s}S`}
        </span>
      </div>
    );
  }

  const days = Math.floor(timeLeft.h / 24);

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-neon-red/10 border border-neon-red/20 rounded-xl animate-pulse">
      <Timer size={16} className="text-neon-red" />
      <div className="flex gap-2 text-neon-red font-black items-center">
        {days > 0 ? (
          <div className="flex flex-col items-center min-w-[50px]">
            <span className="text-lg leading-none">{days}</span>
            <span className="text-[8px] uppercase">{days === 1 ? 'DAY' : 'DAYS'}</span>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center min-w-[30px]">
              <span className="text-lg leading-none">{timeLeft.h.toString().padStart(2, '0')}</span>
              <span className="text-[8px] uppercase">HRS</span>
            </div>
            <span className="text-lg leading-none">:</span>
            <div className="flex flex-col items-center min-w-[30px]">
              <span className="text-lg leading-none">{timeLeft.m.toString().padStart(2, '0')}</span>
              <span className="text-[8px] uppercase">MIN</span>
            </div>
            <span className="text-lg leading-none">:</span>
            <div className="flex flex-col items-center min-w-[30px]">
              <span className="text-lg leading-none">{timeLeft.s.toString().padStart(2, '0')}</span>
              <span className="text-[8px] uppercase">SEC</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CountdownTimer;
