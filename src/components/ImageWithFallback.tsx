import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackText?: string;
  fallbackIcon?: React.ReactNode;
}

export const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({ 
  src, 
  alt, 
  className, 
  fallbackText = 'IMAGE BROKEN', 
  fallbackIcon = <AlertCircle size={24} className="text-red-500" />,
  ...props 
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (hasError || !src) {
    return (
      <div className={`flex flex-col items-center justify-center bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-2 text-center text-xs font-bold leading-tight ${className}`}>
        {fallbackIcon}
        <span className="mt-1">{!src ? 'NO IMAGE' : fallbackText}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
      referrerPolicy="no-referrer"
      {...props}
    />
  );
};
