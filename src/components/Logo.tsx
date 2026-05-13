import React from 'react';

interface LogoProps {
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ className = "" }) => {
  return (
    <div className={`flex items-center font-black tracking-tighter italic ${className}`} style={{ fontSize: 'inherit' }}>
      <span className="text-white">M</span>
      <span className="text-neon-blue">G</span>
      <span className="text-white">B</span>
    </div>
  );
};
