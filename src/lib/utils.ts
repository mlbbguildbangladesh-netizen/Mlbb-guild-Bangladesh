import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  increment,
  writeBatch,
  getDoc
} from 'firebase/firestore';
import { db, auth, storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { MatchResultType, Team, TransactionType } from '../types';

export const uploadExternalImageToStorage = async (url: string, pathPrefix: string): Promise<string> => {
  try {
    if (!url || typeof url !== 'string') return url;
    if (url.includes('firebasestorage.googleapis.com') || url.includes('googleusercontent.com')) return url;
    
    // Fetch via backend proxy to bypass CORS
    const res = await fetch('/api/proxy-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    if (!res.ok) throw new Error('Proxy failed to fetch image');
    
    let blob = await res.blob();
    // For Discord images, some content types might be application/octet-stream, force it to image/jpeg if needed
    if (blob.type === 'application/octet-stream') {
        blob = new Blob([blob], { type: 'image/jpeg' });
    }
    
    const safeName = url.split('/').pop()?.replace(/[^a-z0-9]/gi, '_').substring(0, 30) || 'ext_img';
    const filePath = `${pathPrefix}/${Date.now()}_${safeName}`;
    const storageRef = ref(storage, filePath);
    
    await uploadBytes(storageRef, blob);
    const newUrl = await getDownloadURL(storageRef);
    return newUrl;
  } catch (error) {
    console.warn("Failed to upload external image to storage, using original URL:", error);
    return url;
  }
};

export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

export const getRankBonus = (rank?: string) => {
  if (!rank) return 0;
  const index = RANKS.indexOf(rank);
  return index > 0 ? index * 10 : 0;
};

export const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%232a0000'/%3E%3Cpath d='M60 140l40-40 20 20 40-60v80H60z' fill='%23550000'/%3E%3Ccircle cx='80' cy='80' r='16' fill='%23550000'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23ff4444' font-family='sans-serif' font-weight='bold' font-size='24'%3EIMAGE%3C/text%3E%3Ctext x='50%25' y='65%25' dominant-baseline='middle' text-anchor='middle' fill='%23ff4444' font-family='sans-serif' font-weight='bold' font-size='24'%3EBROKEN%3C/text%3E%3C/svg%3E";

export const handleFirestoreError = (error: any, operation: string, path: string | null = null) => {
  const authInfo = {
    userId: auth.currentUser?.uid || 'anonymous',
    email: auth.currentUser?.email || 'N/A',
    emailVerified: auth.currentUser?.emailVerified || false,
    isAnonymous: auth.currentUser?.isAnonymous || true,
    providerInfo: auth.currentUser?.providerData.map(p => ({
      providerId: p.providerId,
      displayName: p.displayName || '',
      email: p.email || ''
    })) || []
  };

  const errorInfo = {
    error: error.message,
    operationType: operation,
    path: path,
    authInfo: authInfo
  };

  console.error("Firestore Error:", errorInfo);
  throw new Error(JSON.stringify(errorInfo));
};

export const recordMatchResult = async (
  teamAId: string, 
  teamBId: string, 
  winnerId: string | 'draw', 
  resultType: MatchResultType,
  manualPoints?: { teamA: number, teamB: number },
  manualDiamonds?: { teamA: number, teamB: number },
  isChallenge: boolean = false,
  betAmount: number = 0,
  scheduleId?: string
) => {
  const teamARef = doc(db, 'teams', teamAId);
  const teamBRef = doc(db, 'teams', teamBId);

  // Get current team data to prevent negative points/diamonds
  const [teamASnap, teamBSnap] = await Promise.all([
    getDoc(teamARef),
    getDoc(teamBRef)
  ]);

  if (!teamASnap.exists() || !teamBSnap.exists()) {
    throw new Error("One or both teams do not exist.");
  }

  const teamAData = teamASnap.data() as Team;
  const teamBData = teamBSnap.data() as Team;

  const batch = writeBatch(db);
  const timestamp = serverTimestamp();

  // Update schedule status if provided
  if (scheduleId) {
    const scheduleRef = doc(db, 'schedules', scheduleId);
    batch.update(scheduleRef, { 
      status: 'completed',
      completedAt: timestamp
    });
  }

  const matchRef = doc(collection(db, 'matches'));

  let pointsA = manualPoints?.teamA ?? 0;
  let diamondsA = manualDiamonds?.teamA ?? 0;
  let pointsB = manualPoints?.teamB ?? 0;
  let diamondsB = manualDiamonds?.teamB ?? 0;

  let newStreakA = teamAData.streak || 0;
  let newStreakB = teamBData.streak || 0;

  // Only auto-calculate if manual values are NOT provided
  if (!manualPoints && !manualDiamonds) {
    if (resultType === 'win') {
      if (winnerId === teamAId) {
        const rankBonus = getRankBonus(teamAData.rank);
        const streakBonus = (teamAData.streak || 0) * 20;
        pointsA = 50 + rankBonus + streakBonus; 
        diamondsA = 20 + rankBonus;
        
        pointsB = -20; 
        diamondsB = -30;

        newStreakA += 1;
        newStreakB = 0;
      } else if (winnerId === teamBId) {
        const rankBonus = getRankBonus(teamBData.rank);
        const streakBonus = (teamBData.streak || 0) * 20;
        pointsB = 50 + rankBonus + streakBonus; 
        diamondsB = 20 + rankBonus;

        pointsA = -20; 
        diamondsA = -30;

        newStreakB += 1;
        newStreakA = 0;
      }
    } else if (resultType === 'walkout') {
      if (winnerId === teamAId) { // Team A performed walkout
        pointsA = -20; 
        diamondsA = -30;
        pointsB = 0; diamondsB = 0;
        newStreakA = 0;
      } else if (winnerId === teamBId) { // Team B performed walkout
        pointsB = -20; 
        diamondsB = -30;
        pointsA = 0; diamondsA = 0;
        newStreakB = 0;
      }
    } else if (resultType === 'rematch' || resultType === 'cancelled') {
      pointsA = 0; pointsB = 0;
      diamondsA = 0; diamondsB = 0;
    }
  } else {
    // If manual values provided, update streaks accordingly if it's a win/loss
    if (resultType === 'win') {
      if (winnerId === teamAId) {
        newStreakA += 1;
        newStreakB = 0;
      } else if (winnerId === teamBId) {
        newStreakB += 1;
        newStreakA = 0;
      }
    } else if (resultType === 'walkout') {
      if (winnerId === teamAId) newStreakA = 0;
      if (winnerId === teamBId) newStreakB = 0;
    }
  }

  // Prevent negative balance
  const finalPointsA = Math.max(0, (teamAData.points || 0) + pointsA);
  const finalDiamondsA = Math.max(0, (teamAData.diamonds || 0) + diamondsA);
  const finalPointsB = Math.max(0, (teamBData.points || 0) + pointsB);
  const finalDiamondsB = Math.max(0, (teamBData.diamonds || 0) + diamondsB);

  // Update Team A
  batch.update(teamARef, {
    points: finalPointsA,
    diamonds: finalDiamondsA,
    streak: newStreakA,
  });

  // Sync to User A
  const ownerA = teamAData.ownerId || teamAId;
  batch.update(doc(db, 'users', ownerA), {
    points: finalPointsA,
    diamonds: finalDiamondsA
  });

  // Update Team B
  batch.update(teamBRef, {
    points: finalPointsB,
    diamonds: finalDiamondsB,
    streak: newStreakB,
  });

  // Sync to User B
  const ownerB = teamBData.ownerId || teamBId;
  batch.update(doc(db, 'users', ownerB), {
    points: finalPointsB,
    diamonds: finalDiamondsB
  });

  // Record Match
  batch.set(matchRef, {
    teamA: teamAId,
    teamB: teamBId,
    winnerId,
    resultType,
    date: timestamp,
    pointsExchanged: { teamA: pointsA, teamB: pointsB },
    diamondsExchanged: { teamA: diamondsA, teamB: diamondsB }
  });

  // Record Transactions
  const teamAMembers = teamAData.players || [];
  const teamBMembers = teamBData.players || [];
  const teamAAllowed = [...new Set([teamAData.ownerId || teamAId, ...teamAMembers])].filter(Boolean) as string[];
  const teamBAllowed = [...new Set([teamBData.ownerId || teamBId, ...teamBMembers])].filter(Boolean) as string[];

  if (pointsA !== 0 || diamondsA !== 0) {
    const transARef = doc(collection(db, 'transactions'));
    batch.set(transARef, {
      teamId: teamAId,
      ownerId: teamAData.ownerId || teamAId,
      type: pointsA > 0 ? 'win' : 'loss',
      points: pointsA,
      diamonds: diamondsA,
      reason: `Match vs ${teamBData.teamName}`,
      timestamp,
      performedByEmail: auth.currentUser?.email || 'System',
      allowedViewerUids: teamAAllowed
    });
  }

  if (pointsB !== 0 || diamondsB !== 0) {
    const transBRef = doc(collection(db, 'transactions'));
    batch.set(transBRef, {
      teamId: teamBId,
      ownerId: teamBData.ownerId || teamBId,
      type: pointsB > 0 ? 'win' : 'loss',
      points: pointsB,
      diamonds: diamondsB,
      reason: `Match vs ${teamAData.teamName}`,
      timestamp,
      performedByEmail: auth.currentUser?.email || 'System',
      allowedViewerUids: teamBAllowed
    });
  }

  await batch.commit();

  return {
    pointsExchanged: { teamA: pointsA, teamB: pointsB },
    diamondsExchanged: { teamA: diamondsA, teamB: diamondsB }
  };
};

export const formatRelativeTime = (timestamp: any): string => {
  if (!timestamp) return '';
  let date: Date;
  
  if (timestamp?.toDate) {
    date = timestamp.toDate();
  } else {
    date = new Date(timestamp);
  }
  
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  } else if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  } else {
    // Format full date if older than a week, like "Oct 23, 11:32 AM"
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  }
};

export const formatLink = (url?: string) => {
  let trimmed = url.trim();
  
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && 
      !trimmed.startsWith('discord://') && !trimmed.startsWith('messenger://')) {
    trimmed = `https://${trimmed}`;
  }

  return trimmed;
};

export const openExternalLink = (e: any, url?: string) => {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }
  
  if (!url) return;
  const formatted = formatLink(url);

  const isAndroid = /Android/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  if (isAndroid) {
    // Facebook Deep Linking for Android
    if (formatted.includes('facebook.com')) {
      try {
        const urlObj = new URL(formatted);
        const path = urlObj.pathname + urlObj.search;
        // Generic intent that allows choice between FB, FB Lite, or Browser
        const intentUrl = `intent://${urlObj.host}${path}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(formatted)};end;`;
        window.location.href = intentUrl;
        return;
      } catch (err) {
        // Fallback
      }
    }

    // WhatsApp Deep Linking for Android
    if (formatted.includes('wa.me/') || formatted.includes('whatsapp.com')) {
      try {
        // wa.me URL is usually enough, but intent can force app selection screen
        const urlObj = new URL(formatted);
        const intentUrl = `intent://${urlObj.host}${urlObj.pathname}${urlObj.search}#Intent;scheme=https;package=com.whatsapp;S.browser_fallback_url=${encodeURIComponent(formatted)};end;`;
        window.location.href = intentUrl;
        return;
      } catch (err) {
        // Fallback
      }
    }

    // Discord handling
    if (formatted.includes('discord.gg') || formatted.includes('discord.com')) {
      try {
        const urlObj = new URL(formatted);
        const intentUrl = `intent://${urlObj.host}${urlObj.pathname}${urlObj.search}#Intent;package=com.discord;scheme=https;end;`;
        window.location.href = intentUrl;
        return;
      } catch (err) {
        // Fallback
      }
    }

    // Default Android behavior
    try {
      const win = window.open(formatted, '_system');
      if (!win) {
        window.location.href = formatted;
      }
    } catch (err) {
      window.location.href = formatted;
    }
  } else if (isIOS) {
    // iOS handling - standard URLs usually trigger "Open in App" banners naturally
    window.location.href = formatted;
  } else {
    // Standard desktop/mobile browser
    window.open(formatted, '_blank', 'noopener,noreferrer');
  }
};
