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
  manualDiamonds?: { teamA: number, teamB: number }
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
  const matchRef = doc(collection(db, 'matches'));
  const timestamp = serverTimestamp();

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
        pointsA = 50; diamondsA = 20;
        pointsB = -20; diamondsB = -30;
        if (newStreakA > 0) {
          pointsA += 20; diamondsA += 20;
        }
        const rankBonus = getRankBonus(teamAData.rank);
        pointsA += rankBonus; diamondsA += rankBonus;
        newStreakA += 1;
        newStreakB = 0;
      } else if (winnerId === teamBId) {
        pointsB = 50; diamondsB = 20;
        pointsA = -20; diamondsA = -30;
        if (newStreakB > 0) {
          pointsB += 20; diamondsB += 20;
        }
        const rankBonus = getRankBonus(teamBData.rank);
        pointsB += rankBonus; diamondsB += rankBonus;
        newStreakB += 1;
        newStreakA = 0;
      }
    } else if (resultType === 'walkout') {
      if (winnerId === teamAId) { // Team A performed walkout
        pointsA = -20; diamondsA = -30;
        pointsB = 0; diamondsB = 0;
        newStreakA = 0;
      } else if (winnerId === teamBId) { // Team B performed walkout
        pointsB = -20; diamondsB = -30;
        pointsA = 0; diamondsA = 0;
        newStreakB = 0;
      }
    } else if (resultType === 'rematch') {
      pointsA = 0; pointsB = 0;
      diamondsA = 0; diamondsB = 0;
    }
  } else {
    // If manual values provided, update streaks accordingly if it's a win/loss
    if (resultType === 'win' || resultType === 'loss') {
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
  if (pointsA !== 0 || diamondsA !== 0) {
    const transARef = doc(collection(db, 'transactions'));
    batch.set(transARef, {
      teamId: teamAId,
      type: pointsA > 0 ? 'win' : 'loss',
      points: pointsA,
      diamonds: diamondsA,
      reason: `Match vs ${teamBData.teamName}`,
      timestamp,
      performedByEmail: auth.currentUser?.email || 'System'
    });
  }

  if (pointsB !== 0 || diamondsB !== 0) {
    const transBRef = doc(collection(db, 'transactions'));
    batch.set(transBRef, {
      teamId: teamBId,
      type: pointsB > 0 ? 'win' : 'loss',
      points: pointsB,
      diamonds: diamondsB,
      reason: `Match vs ${teamAData.teamName}`,
      timestamp,
      performedByEmail: auth.currentUser?.email || 'System'
    });
  }

  await batch.commit();

  return {
    pointsExchanged: { teamA: pointsA, teamB: pointsB },
    diamondsExchanged: { teamA: diamondsA, teamB: diamondsB }
  };
};

export const formatLink = (url?: string) => {
  if (!url) return '';
  let trimmed = url.trim();
  
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && 
      !trimmed.startsWith('discord://') && !trimmed.startsWith('messenger://')) {
    trimmed = `https://${trimmed}`;
  }

  return trimmed;
};

export const openExternalLink = (e: any, url?: string) => {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  if (!url) return;
  const formatted = formatLink(url);

  // Check if we are in an Android WebView environment
  const isAndroid = /Android/i.test(navigator.userAgent);
  
  if (isAndroid) {
    // For Discord, use intent URI to force open the app if installed, 
    // avoiding the website's automatic redirect to Play Store inside WebViews.
    if (formatted.includes('discord.gg') || formatted.includes('discord.com')) {
      try {
        const urlObj = new URL(formatted);
        const intentUrl = `intent://${urlObj.host}${urlObj.pathname}${urlObj.search}#Intent;package=com.discord;scheme=https;end;`;
        window.location.href = intentUrl;
        return;
      } catch (err) {
        // Fallback to normal behavior if URL parsing fails
      }
    }

    // Standard window.open with _system is the best 'breakout' for most APK wrappers.
    try {
      const win = window.open(formatted, '_system');
      if (!win) {
        window.location.href = formatted;
      }
    } catch (err) {
      window.location.href = formatted;
    }
  } else {
    // Standard desktop/mobile browser
    window.open(formatted, '_blank', 'noopener,noreferrer');
  }
};
