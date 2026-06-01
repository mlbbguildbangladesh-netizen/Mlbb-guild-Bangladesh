import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  onSnapshot, 
  deleteDoc, 
  updateDoc, 
  writeBatch,
  query, 
  where, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Trophy, 
  Users, 
  Plus, 
  Check, 
  Search, 
  Calendar, 
  Award, 
  Flame, 
  Target, 
  Clock, 
  Shield, 
  Trash2, 
  Ban, 
  RefreshCw, 
  FileImage, 
  ChevronRight, 
  AlertCircle, 
  HelpCircle, 
  User, 
  Star, 
  Upload, 
  CheckCircle2, 
  Lock, 
  Sliders,
  Gem,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { showConfirmToast } from '../lib/toastUtils';
import { Navigate } from 'react-router-dom';
import { TrainingTeam, TrainingPlayer, TrainingMatch, BannedUid, SoloPlayer } from '../types';

const ROLES = ['Tank', 'Fighter', 'Assassin', 'Mage', 'Marksman', 'Support'];

export default function TrainingGround() {
  const { user, isAdmin, isModerator, settings } = useAuth();
  
  // States
  const [activeTab, setActiveTab] = useState<'hub' | 'leaderboard' | 'register' | 'submit' | 'history' | 'admin'>('hub');
  const [teams, setTeams] = useState<TrainingTeam[]>([]);
  const [players, setPlayers] = useState<TrainingPlayer[]>([]);
  const [matches, setMatches] = useState<TrainingMatch[]>([]);
  const [bannedUids, setBannedUids] = useState<BannedUid[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  // Registration Form State
  const [regTeamName, setRegTeamName] = useState('');
  const [regCaptainName, setRegCaptainName] = useState('');
  const [regLogoUrl, setRegLogoUrl] = useState('');
  const [regPlayers, setRegPlayers] = useState<Array<{ uid: string; inGameName: string; mainRole: string; currentKd: number; rating: number; isSynced?: boolean }>>(
    Array(5).fill(null).map(() => ({ uid: '', inGameName: '', mainRole: 'Marksman', currentKd: 0, rating: 0 }))
  );
  const [registering, setRegistering] = useState(false);

  // Match Submission Form State
  const [subOpponentId, setSubOpponentId] = useState('');
  const [subMatchNum, setSubMatchNum] = useState<number>(1);
  const [subWin, setSubWin] = useState<boolean>(true);
  const [subMvpUid, setSubMvpUid] = useState<string>('');
  const [subKds, setSubKds] = useState<Record<string, string>>({}); // uid -> string representation of KD
  const [subNotes, setSubNotes] = useState('');
  const [subScreenshot, setSubScreenshot] = useState<string>('');
  const [submittingMatch, setSubmittingMatch] = useState(false);

  // Profile Popups
  const [selectedTeamProfile, setSelectedTeamProfile] = useState<TrainingTeam | null>(null);
  const [selectedPlayerProfile, setSelectedPlayerProfile] = useState<TrainingPlayer | null>(null);

  // Admin section details
  const [bannedUidInput, setBannedUidInput] = useState('');
  const [bannedReason, setBannedReason] = useState('Duplicate Profile Identity detected.');
  const [adminSelectedTeamId, setAdminSelectedTeamId] = useState('');

  const [tournamentTeams, setTournamentTeams] = useState<any[]>([]); // Using any to avoid type import cycle or just Team from types
  const [soloPlayersList, setSoloPlayersList] = useState<SoloPlayer[]>([]);

  // Real-time synchronization
  if (settings?.showTrainingGround === false && !isAdmin && !isModerator) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    setLoading(true);
    const unsubTeams = onSnapshot(collection(db, 'trainingTeams'), (snap) => {
      setTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TrainingTeam)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'trainingTeams'));

    const unsubTournamentTeams = onSnapshot(collection(db, 'teams'), (snap) => {
      setTournamentTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubSoloPlayers = onSnapshot(collection(db, 'soloPlayers'), (snap) => {
      setSoloPlayersList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SoloPlayer)));
    });

    const unsubPlayers = onSnapshot(collection(db, 'trainingPlayers'), (snap) => {
      setPlayers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TrainingPlayer)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'trainingPlayers'));

    const unsubMatches = onSnapshot(query(collection(db, 'trainingMatches'), orderBy('createdAt', 'desc')), (snap) => {
      setMatches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TrainingMatch)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'trainingMatches'));

    const unsubBans = onSnapshot(collection(db, 'bannedUids'), (snap) => {
      setBannedUids(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BannedUid)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'bannedUids'));

    const timer = setTimeout(() => {
      setLoading(false);
    }, 1500);

    return () => {
      unsubTeams();
      unsubTournamentTeams();
      unsubSoloPlayers();
      unsubPlayers();
      unsubMatches();
      unsubBans();
      clearTimeout(timer);
    };
  }, []);

  // Get current user's team if they are registered (or an admin selected team)
  const myTeam = useMemo(() => {
    if (!user) return null;
    if (isAdmin && adminSelectedTeamId) {
      return teams.find(t => t.id === adminSelectedTeamId && t.status === 'approved') || null;
    }
    return teams.find(t => t.captainUid === user.id && t.status === 'approved') || null;
  }, [teams, user, isAdmin, adminSelectedTeamId]);

  // General computed statistics
  const todayDateStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  // High lighting top performers of the day
  const dailyMVPs = useMemo(() => {
    // Current daily match logs
    const todayMatches = matches.filter(m => m.date === todayDateStr && !m.isFlagged);
    const mvpCounts: Record<string, { name: string; count: number; teamName: string; uid: string }> = {};
    todayMatches.forEach(m => {
      if (m.mvpUid) {
        if (!mvpCounts[m.mvpUid]) {
          mvpCounts[m.mvpUid] = { name: m.mvpName || 'Legend', count: 0, teamName: m.teamName, uid: m.mvpUid };
        }
        mvpCounts[m.mvpUid].count += 1;
      }
    });
    return Object.values(mvpCounts).sort((a, b) => b.count - a.count);
  }, [matches, todayDateStr]);

  const dailyBestKdPlayer = useMemo(() => {
    // Collect all matching player stats for today
    const todayMatches = matches.filter(m => m.date === todayDateStr && !m.isFlagged);
    const kds: Record<string, { name: string; totalKd: number; count: number; teamName: string; uid: string }> = {};
    todayMatches.forEach(m => {
      Object.entries(m.playerKds || {}).forEach(([uid, kd]) => {
        const val = Number(kd) || 0;
        if (!kds[uid]) {
          // find player name
          const playerObj = players.find(p => p.uid === uid);
          const name = playerObj?.inGameName || m.mvpName || 'Mercenary';
          kds[uid] = { name, totalKd: 0, count: 0, teamName: m.teamName, uid };
        }
        kds[uid].totalKd += val;
        kds[uid].count += 1;
      });
    });
    return Object.values(kds)
      .map(p => ({ ...p, avgKd: p.count > 0 ? Number((p.totalKd / p.count).toFixed(2)) : 0 }))
      .sort((a, b) => b.avgKd - a.avgKd)[0] || null;
  }, [matches, todayDateStr, players]);

  const topTrainingTeam = useMemo(() => {
    const approvedTeams = teams.filter(t => t.status === 'approved');
    if (approvedTeams.length === 0) return null;
    return approvedTeams.sort((a, b) => {
      if ((b.stats?.points || 0) !== (a.stats?.points || 0)) {
        return (b.stats?.points || 0) - (a.stats?.points || 0);
      }
      return (b.stats?.winRate || 0) - (a.stats?.winRate || 0);
    })[0];
  }, [teams]);

  // Recount / Recalculate stats function (available to Admin and automatically triggered inside actions)
  const recalculateLeaderboards = async (optionalMatchList?: TrainingMatch[]) => {
    setRecalculating(true);
    const activeMatches = (optionalMatchList || matches).filter(m => !m.isFlagged);
    const currentTeams = [...teams];
    const currentPlayers = [...players];

    try {
      const batch = writeBatch(db);

      // 1. Recalculate Player Stats
      for (const player of currentPlayers) {
        const playerMatches = activeMatches.filter(m => m.teamId === player.teamId && m.playerKds[player.uid] !== undefined);
        const wins = playerMatches.filter(m => m.win).length;
        const losses = playerMatches.filter(m => !m.win).length;
        const totalMatches = playerMatches.length;
        const mvpCount = playerMatches.filter(m => m.mvpUid === player.uid).length;
        const totalKd = playerMatches.reduce((acc, curr) => acc + (Number(curr.playerKds[player.uid]) || 0), 0);
        const avgKd = totalMatches > 0 ? Number((totalKd / totalMatches).toFixed(2)) : 0;
        const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

        // Points criteria: Win = 10, MVP = +5, KD >= 3.0 gets +2
        let points = wins * 10;
        points += mvpCount * 5;
        // high KD bonus inside matches
        playerMatches.forEach(m => {
          const matchKd = Number(m.playerKds[player.uid]) || 0;
          if (matchKd >= 3.0) {
            points += 2;
          }
        });

        const updatedStats = {
          totalMatches,
          wins,
          losses,
          mvps: mvpCount,
          totalKd: Number(totalKd.toFixed(2)),
          avgKd,
          winRate,
          points
        };

        const playerRef = doc(db, 'trainingPlayers', player.uid);
        batch.update(playerRef, { stats: updatedStats, updatedAt: serverTimestamp() });
      }

      // 2. Recalculate Team Stats
      for (const team of currentTeams) {
        const teamMatches = activeMatches.filter(m => m.teamId === team.id);
        const wins = teamMatches.filter(m => m.win).length;
        const losses = teamMatches.filter(m => !m.win).length;
        const totalMatches = teamMatches.length;
        
        // Sum total player points in matches
        // Team score is built from: Wins (10) + MVP Count (5) + High KD counts of team players
        let points = wins * 10;
        let mvpCount = 0;
        let totalKd = 0;
        let kdMatchesCount = 0;

        teamMatches.forEach(m => {
          mvpCount += 1; // Since each match has 1 MVP on the reporting team
          points += 5; // MVP Bonus belongs to reporting squad
          
          Object.values(m.playerKds || {}).forEach(kd => {
            const kdVal = Number(kd) || 0;
            totalKd += kdVal;
            kdMatchesCount += 1;
            if (kdVal >= 3.0) points += 2; // High KD Bonus
          });
        });

        const teamPlayers = currentPlayers.filter(p => p.teamId === team.id);
        const teamAvgKd = kdMatchesCount > 0 ? Number((totalKd / kdMatchesCount).toFixed(2)) : 0;
        const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

        const updatedStats = {
          totalMatches,
          wins,
          losses,
          points,
          mvpCount: wins > 0 ? totalMatches : 0, // reporting MVP is always 1 per match
          totalKd: Number(totalKd.toFixed(2)),
          avgKd: teamAvgKd,
          winRate
        };

        const teamRef = doc(db, 'trainingTeams', team.id);
        batch.update(teamRef, { stats: updatedStats });
      }

      await batch.commit();
      toast.success("Leaderboard database recalculated successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to recalculate statistics.");
    } finally {
      setRecalculating(false);
    }
  };

  // Helper inside form to check individual player and auto-import Solo details
  const resolvePlayerUid = async (index: number, uidValue: string) => {
    if (!uidValue.trim()) return;

    // Check if duplicate on this very form
    const isDuplicateForm = regPlayers.some((p, idx) => idx !== index && p.uid.toLowerCase() === uidValue.toLowerCase().trim());
    if (isDuplicateForm) {
      toast.error("Cannot add the same player UID multiple times in one team roster!");
      return;
    }

    // Check bans first
    const isBanned = bannedUids.some(b => b.uid.toLowerCase() === uidValue.toLowerCase().trim());
    if (isBanned) {
      toast.error("ERROR: This Player UID is BANNED from MGB Training Ground registrations!");
      const updated = [...regPlayers];
      updated[index] = { uid: '', inGameName: '', mainRole: 'Marksman', currentKd: 0, rating: 0, isSynced: false };
      setRegPlayers(updated);
      return;
    }

    // Check if player already registered in another approved team
    const existingPlayer = players.find(p => p.uid.toLowerCase() === uidValue.toLowerCase().trim());
    if (existingPlayer) {
      const parentTeam = teams.find(t => t.id === existingPlayer.teamId);
      if (parentTeam && parentTeam.status === 'approved') {
        toast.error(`UID already associated with active squad: "${parentTeam.teamName}"`);
        return;
      }
    }

    try {
      // Look up in soloPlayers collection
      const soloSnap = await getDoc(doc(db, 'soloPlayers', uidValue.trim()));
      if (soloSnap.exists()) {
        const data = soloSnap.data() as SoloPlayer;
        const updated = [...regPlayers];
        updated[index] = {
          uid: uidValue.trim(),
          inGameName: data.name || '',
          mainRole: data.mainRole || 'Marksman',
          currentKd: 0,
          rating: data.rating || 0,
          isSynced: true
        };
        setRegPlayers(updated);
        toast.success(`Connected! Solo player bio imported: "${data.name}"`);
      } else {
        // Just let them type it manually
        const updated = [...regPlayers];
        updated[index] = {
          ...updated[index],
          uid: uidValue.trim(),
          isSynced: false
        };
        setRegPlayers(updated);
        toast.success(`UID is available for manual esports entry.`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error querying Solo player index.");
    }
  };

  // Resize and compress screenshot image to store cleanly inside firestore (under 100KB)
  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 500;
        const MAX_HEIGHT = 500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6); // 60% compression factor
          setSubScreenshot(compressedBase64);
          toast.success("Screenshot compressed and staged for upload!");
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSelectTournamentTeam = (teamId: string) => {
    if (!teamId) {
      setRegTeamName('');
      setRegCaptainName('');
      setRegLogoUrl('');
      setRegPlayers(Array(5).fill(null).map(() => ({ uid: '', inGameName: '', mainRole: 'Marksman', currentKd: 0, rating: 0, isSynced: false })));
      return;
    }
    const team = tournamentTeams.find(t => t.id === teamId);
    if (team) {
      setRegTeamName(team.teamName);
      setRegCaptainName(team.leaderName);
      setRegLogoUrl(team.logoUrl || '');

      const newPlayers = Array(5).fill(null).map(() => ({ uid: '', inGameName: '', mainRole: 'Marksman', currentKd: 0, rating: 0, isSynced: false }));

      // Auto fill players
      (team.players || []).forEach((uid: string, index: number) => {
        if (index < 5) {
          newPlayers[index].uid = uid;

          // Try to find IGN in soloPlayersList
          // Note: In soloPlayers, gameId is used as UID usually.
          const soloPlayer = soloPlayersList.find(p => p.id === uid || p.gameId === uid || p.userId === uid);
          if (soloPlayer) {
            newPlayers[index].inGameName = soloPlayer.name;
            newPlayers[index].isSynced = true; // Optionally highlight that we synced this
            if (soloPlayer.mainRole && ROLES.includes(soloPlayer.mainRole)) {
               newPlayers[index].mainRole = soloPlayer.mainRole;
            }
          }
        }
      });
      setRegPlayers(newPlayers);
    }
  };

  // Listen to individual uid changes in the form to auto-fill solo players
  const handleRegPlayerUidChange = (index: number, newUid: string) => {
    const updated = [...regPlayers];
    updated[index].uid = newUid;

    const soloPlayer = soloPlayersList.find(p => p.id === newUid || p.gameId === newUid || p.userId === newUid);
    if (soloPlayer) {
      updated[index].inGameName = soloPlayer.name;
      updated[index].isSynced = true;
      if (soloPlayer.mainRole && ROLES.includes(soloPlayer.mainRole)) {
         updated[index].mainRole = soloPlayer.mainRole;
      }
    } else {
      updated[index].isSynced = false;
    }
    setRegPlayers(updated);
  };

  // Submit Team Registration
  const handleRegisterTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Please login to submit registrations.");
    if (!regTeamName.trim()) return toast.error("Please specify Team Name.");
    if (!regCaptainName.trim()) return toast.error("Please specify Captain Name.");

    // Filter out invalid/empty players
    const activeRoster = regPlayers.filter(p => p.uid.trim() && p.inGameName.trim());
    if (activeRoster.length < 5) {
      return toast.error("Your squad must contain at least 5 completed player rosters.");
    }

    setRegistering(true);
    try {
      const teamId = regTeamName.trim().replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + '-' + Math.floor(Math.random() * 1000);
      const uniqueId = 'MGB-TG-' + Math.floor(1000 + Math.random() * 9000);

      const teamData: TrainingTeam = {
        id: teamId,
        teamName: regTeamName.trim(),
        logoUrl: regLogoUrl.trim() || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=150',
        uniqueId,
        captainName: regCaptainName.trim(),
        captainUid: user.id,
        status: 'pending',
        players: activeRoster.map(p => ({
          uid: p.uid.trim(),
          inGameName: p.inGameName.trim(),
          mainRole: p.mainRole,
          currentKd: Number(p.currentKd) || 0,
          rating: Number(p.rating) || 0
        })),
        stats: {
          totalMatches: 0,
          wins: 0,
          losses: 0,
          points: 0,
          mvpCount: 0,
          totalKd: 0,
          avgKd: 0,
          winRate: 0
        },
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'trainingTeams', teamId), teamData);

      // We do not save players into trainingPlayers until Admin APPROVES. This is key!
      
      toast.success("Squad registration filed! Reach out to moderators for immediate activation.");
      setActiveTab('hub');
      setRegTeamName('');
      setRegCaptainName('');
      setRegLogoUrl('');
      setRegPlayers(Array(5).fill(null).map(() => ({ uid: '', inGameName: '', mainRole: 'Marksman', currentKd: 0, rating: 0 })));
    } catch (err) {
      console.error(err);
      toast.error("Could not register squad.");
    } finally {
      setRegistering(false);
    }
  };

  // Submit Daily Match
  const handleSubmitMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Verification required.");
    if (!myTeam) return toast.error("Active Training squad required to submit scores.");
    if (!subOpponentId) return toast.error("Please pick your Opponent team.");
    if (!subMvpUid) return toast.error("Please choose a match MVP.");
    if (!subScreenshot) return toast.error("Screenshot verification file is mandatory.");

    // Validate Daily 4-Match Limit
    const todayMatches = matches.filter(m => m.teamId === myTeam.id && m.date === todayDateStr);
    if (todayMatches.length >= 4) {
      return toast.error("CRITICAL OVERREACH: You have exhausted your daily quota of 4 practice sessions!");
    }

    // Auto-detect duplicate match submission
    const isDuplicate = todayMatches.some(m => m.matchNumber === subMatchNum);
    if (isDuplicate) {
      return toast.error(`A score report for Match #${subMatchNum} has already been recorded today!`);
    }

    // Ensure player KDs are complete
    const playerKdsCompiled: Record<string, number> = {};
    for (const player of myTeam.players) {
      const kdValue = Number(subKds[player.uid]);
      if (isNaN(kdValue) || subKds[player.uid] === undefined || subKds[player.uid] === '') {
        return toast.error(`Missing KD score entry for player: ${player.inGameName}`);
      }
      playerKdsCompiled[player.uid] = kdValue;
    }

    setSubmittingMatch(true);

    try {
      const matchId = `match-${myTeam.id}-${todayDateStr}-n${subMatchNum}`;
      const mvpPlayerObj = myTeam.players.find(p => p.uid === subMvpUid);
      const pointsAwarded = (subWin ? 10 : 0) + 5 + (Object.values(playerKdsCompiled).filter(kd => kd >= 3.0).length * 2);

      const matchData: TrainingMatch = {
        id: matchId,
        teamId: myTeam.id,
        teamName: myTeam.teamName,
        opponentTeamId: subOpponentId,
        opponentTeamName: teams.find(t => t.id === subOpponentId)?.teamName || 'Opponent Roster',
        matchNumber: subMatchNum,
        win: subWin,
        mvpUid: subMvpUid,
        mvpName: mvpPlayerObj?.inGameName || 'Squad Member',
        playerKds: playerKdsCompiled,
        screenshotUrl: subScreenshot,
        notes: subNotes.trim(),
        date: todayDateStr,
        pointsAwarded,
        isFlagged: false,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'trainingMatches', matchId), matchData);
      
      toast.success("Practice results submitted and locked!");
      setActiveTab('hub');
      
      // Cleanup
      setSubOpponentId('');
      setSubMatchNum(1);
      setSubWin(true);
      setSubMvpUid('');
      setSubKds({});
      setSubNotes('');
      setSubScreenshot('');

      // Auto recalculate stats locally
      setTimeout(() => {
        recalculateLeaderboards([...matches, matchData]);
      }, 1000);

    } catch (err) {
      console.error(err);
      toast.error("Score submission aborted.");
    } finally {
      setSubmittingMatch(false);
    }
  };

  // Administrative actions
  const handleApproveTeam = async (team: TrainingTeam) => {
    try {
      const batch = writeBatch(db);
      
      // 1. Approve Team status
      const teamRef = doc(db, 'trainingTeams', team.id);
      batch.update(teamRef, { status: 'approved' });

      // 2. Load players into the global trainingPlayers index
      for (const player of team.players) {
        const playerRef = doc(db, 'trainingPlayers', player.uid);
        const playerData: TrainingPlayer = {
          id: player.uid,
          uid: player.uid,
          inGameName: player.inGameName,
          teamId: team.id,
          teamName: team.teamName,
          mainRole: player.mainRole,
          currentKd: player.currentKd || 0,
          rating: player.rating || 0,
          stats: {
            totalMatches: 0,
            wins: 0,
            losses: 0,
            mvps: 0,
            totalKd: 0,
            avgKd: 0,
            winRate: 0,
            points: 0
          },
          updatedAt: new Date().toISOString()
        };
        batch.set(playerRef, playerData);
      }

      await batch.commit();
      toast.success(`Tactical Unit "${team.teamName}" APPROVED & DEPLOYED!`);
    } catch (err) {
      console.error(err);
      toast.error("Approval aborted.");
    }
  };

  const handleRejectTeam = async (teamId: string) => {
    const confirm = await showConfirmToast({
      title: "Reject Team Application",
      message: "Are you sure you want to REJECT and delete this team application?",
      type: "danger",
      confirmLabel: "Reject"
    });
    if (!confirm) return;
    try {
      await deleteDoc(doc(db, 'trainingTeams', teamId));
      toast.error(`Team registration terminated.`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleFlagMatch = async (matchId: string, flag: boolean) => {
    try {
      await updateDoc(doc(db, 'trainingMatches', matchId), {
        isFlagged: flag,
        flagReason: flag ? "Flagged by System Administrator for inspection." : ""
      });
      toast.success(flag ? "Match FLAGGED (Fake Report removed from stats)!" : "Match restored!");
      setTimeout(() => {
        recalculateLeaderboards();
      }, 500);
    } catch (err) {
       console.error(err);
    }
  };

  const handleBanUid = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUid = bannedUidInput.trim();
    if (!cleanUid) return;

    try {
      await setDoc(doc(db, 'bannedUids', cleanUid), {
        id: cleanUid,
        uid: cleanUid,
        reason: bannedReason,
        bannedBy: user?.displayName || 'Administrator',
        createdAt: new Date().toISOString()
      });
      setBannedUidInput('');
      toast.error(`Player UID: ${cleanUid} blacklisted from joining.`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to blacklist UID.");
    }
  };

  const handleLiftBan = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'bannedUids', uid));
      toast.success(`Restrictions lifted on UID: ${uid}`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetLeaderboard = async () => {
    const confirm = await showConfirmToast({
      title: "Reset Leaderboard",
      message: "CRITICAL INTERVENTION: This will wipe all practice scores (Match History) to start a completely fresh training cycle. Roster registrations stay intact. Proceed?",
      type: "danger",
      confirmLabel: "Wipe History"
    });
    if (!confirm) return;
    
    setRecalculating(true);
    try {
      // 1. Delete all match history reports
      const matchSnaps = await getDocs(collection(db, 'trainingMatches'));
      const batch = writeBatch(db);
      matchSnaps.docs.forEach((d) => {
        batch.delete(doc(db, 'trainingMatches', d.id));
      });

      // 2. Reset Team stats
      const teamSnaps = await getDocs(collection(db, 'trainingTeams'));
      teamSnaps.docs.forEach((d) => {
        batch.update(doc(db, 'trainingTeams', d.id), {
          stats: {
            totalMatches: 0,
            wins: 0,
            losses: 0,
            points: 0,
            mvpCount: 0,
            totalKd: 0,
            avgKd: 0,
            winRate: 0
          }
        });
      });

      // 3. Reset Player stats
      const playerSnaps = await getDocs(collection(db, 'trainingPlayers'));
      playerSnaps.docs.forEach((d) => {
        batch.update(doc(db, 'trainingPlayers', d.id), {
          stats: {
            totalMatches: 0,
            wins: 0,
            losses: 0,
            mvps: 0,
            totalKd: 0,
            avgKd: 0,
            winRate: 0,
            points: 0
          }
        });
      });

      await batch.commit();
      toast.success("Leaderboard and stats fully reset!");
    } catch (err) {
      console.error(err);
      toast.error("Reset aborted.");
    } finally {
      setRecalculating(false);
    }
  };

  const handleRateTeam = async (team: TrainingTeam, rating: number) => {
    if (!user) {
      toast.error("Please sign in to rate teams.");
      return;
    }
    try {
      const teamRef = doc(db, 'trainingTeams', team.id);
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

  // Sort helper for Team standings
  const sortedTeams = useMemo(() => {
    return teams
      .filter(t => t.status === 'approved')
      .sort((a, b) => {
        if ((b.stats?.points || 0) !== (a.stats?.points || 0)) {
          return (b.stats?.points || 0) - (a.stats?.points || 0);
        }
        return (b.stats?.winRate || 0) - (a.stats?.winRate || 0);
      });
  }, [teams]);

  // Sort helper for Player standings
  const sortedPlayers = useMemo(() => {
    return players.sort((a, b) => {
      if ((b.stats?.points || 0) !== (a.stats?.points || 0)) {
        return (b.stats?.points || 0) - (a.stats?.points || 0);
      }
      return (b.stats?.avgKd || 0) - (a.stats?.avgKd || 0);
    });
  }, [players]);

  const registeredUidsCount = players.length;

  return (
    <div className="space-y-8 pb-20">
      {/* 1. HERO HEADER */}
      <section className="relative px-6 py-12 rounded-3xl overflow-hidden border border-white/5 bg-black/40">
        <div className="absolute inset-0 bg-gradient-to-r from-[#FF2E63]/10 to-[#00E5FF]/10 opacity-70" />
        <div className="absolute top-0 right-0 p-4 font-mono text-[9px] text-gray-500 tracking-widest hidden md:block">
          MGB TERMINAL v4.22 // TRAINING GROUND ACTIVE
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#00E5FF]/10 border border-[#00E5FF]/20 animate-pulse">
            <Flame className="text-[#00E5FF] shrink-0" size={14} />
            <span className="text-[10px] font-black tracking-[0.3em] text-[#00E5FF] uppercase">TEAM SCRIMS & TRAINING GROUND</span>
          </div>

          <h1 className="text-4xl md:text-7xl font-black italic tracking-tighter uppercase leading-none text-white font-sans">
            MGB <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF2E63] to-[#FE5F55] drop-shadow-[0_0_20px_rgba(255,46,99,0.3)]">TRAINING</span> GROUND
          </h1>

          <p className="max-w-2xl mx-auto text-xs text-gray-400 font-bold uppercase tracking-wider leading-relaxed">
            Register your tactical squad, register scrim practice matches (max 4 practice logs daily), auto-track MVPs, and watch player bio-statistics calibrate live!
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {myTeam && (
              <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase text-[#00E5FF] flex items-center gap-2">
                <CheckCircle2 size={12} className="text-[#00E5FF]" />
                REPRESENTING: {myTeam.teamName} [ACTIVE Roster]
              </div>
            )}
            <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase text-gray-400">
              Approved Guilds: <span className="text-white font-extrabold">{teams.filter(t => t.status === 'approved').length}</span>
            </div>
            <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase text-gray-400">
              Tracked Competitors: <span className="text-white font-extrabold">{registeredUidsCount}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. SUB NAVIGATION */}
      <div className="flex border-b border-white/10 overflow-x-auto whitespace-nowrap scrollbar-none scroll-smooth">
        {[
          { id: 'hub', label: 'Dashboard', icon: Trophy },
          { id: 'leaderboard', label: 'Leaderboard', icon: Target },
          { id: 'register', label: 'Roster Register', icon: Users },
          { id: 'submit', label: 'Record practice', icon: Plus },
          { id: 'history', label: 'Scrim History', icon: Calendar },
          isAdmin || isModerator ? { id: 'admin', label: 'Admin Terminal', icon: Sliders } : null
        ].filter(Boolean).map((tab) => {
          const TabIcon = tab!.icon;
          return (
            <button
              key={tab!.id}
              onClick={() => setActiveTab(tab!.id as any)}
              className={`flex-1 py-4 px-6 font-black uppercase text-xs tracking-widest transition-all duration-300 flex items-center justify-center gap-2 border-b-2 ${
                activeTab === tab!.id 
                  ? 'text-[#FFA400] border-[#FFA400] bg-white/5 shadow-[rgba(255,164,0,0.15)] shadow-inner' 
                  : 'text-gray-500 hover:text-white hover:bg-white/5 border-transparent'
              }`}
            >
              <TabIcon size={16} />
              {tab!.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.25 }}
        >
          {/* ==================== HUB TAB ==================== */}
          {activeTab === 'hub' && (
            <div className="space-y-8">
              {/* Top highlights cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Showcase 1: MVP OF THE DAY */}
                <div className="relative glass-card bg-black/60 border border-white/10 rounded-2xl p-6 overflow-hidden flex flex-col justify-between group hover:border-[#FFA400]/30 transition-all">
                  <div className="absolute inset-0 bg-gradient-to-b from-[#FFA400]/5 to-transparent pointer-events-none" />
                  <div className="flex justify-between items-start">
                    <div className="p-3 bg-[#FFA400]/10 border border-[#FFA400]/20 rounded-full text-[#FFA400]">
                      <Award size={20} className="animate-spin-slow" />
                    </div>
                    <span className="text-[9px] font-mono text-[#FFA400] font-black uppercase tracking-widest bg-[#FFA400]/5 px-2.5 py-1 rounded-full border border-[#FFA400]/20">MVP LOG TOUT</span>
                  </div>

                  <div className="space-y-2 mt-6">
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">SCRIMS MVP OF THE DAY</p>
                    <h3 className="text-2xl font-black italic text-white tracking-tight uppercase group-hover:text-[#FFA400] transition-colors truncate">
                      {dailyMVPs[0] ? dailyMVPs[0].name : 'System Scanning'}
                    </h3>
                    <p className="text-xs text-gray-400 font-bold uppercase truncate">
                      {dailyMVPs[0] ? `Team Name: ${dailyMVPs[0].teamName}` : 'Report matches to claim daily MVP crown'}
                    </p>
                  </div>

                  <div className="border-t border-white/5 mt-6 pt-4 flex justify-between items-center text-[10px] font-black uppercase text-gray-500">
                    <span>ACCUMULATED MVPS TODAY</span>
                    <span className="text-white text-lg font-black">{dailyMVPs[0] ? `${dailyMVPs[0].count} MATCHES` : '0'}</span>
                  </div>
                </div>

                {/* Showcase 2: THE APEX FRAGGER (Best KD) */}
                <div className="relative glass-card bg-black/60 border border-white/10 rounded-2xl p-6 overflow-hidden flex flex-col justify-between group hover:border-red-500/30 transition-all">
                  <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 to-transparent pointer-events-none" />
                  <div className="flex justify-between items-start">
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-full text-red-500">
                      <Target size={20} />
                    </div>
                    <span className="text-[9px] font-mono text-red-500 font-black uppercase tracking-widest bg-red-500/5 px-2.5 py-1 rounded-full border border-red-500/20">APEX FRAGGER</span>
                  </div>

                  <div className="space-y-2 mt-6">
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">HIGHEST PRACTICE KD TODAY</p>
                    <h3 className="text-2xl font-black italic text-white tracking-tight uppercase group-hover:text-red-500 transition-colors truncate">
                      {dailyBestKdPlayer ? dailyBestKdPlayer.name : 'System Scanning'}
                    </h3>
                    <p className="text-xs text-gray-400 font-bold uppercase truncate">
                      {dailyBestKdPlayer ? `Team Name: ${dailyBestKdPlayer.teamName}` : 'Submit practice scores to evaluate'}
                    </p>
                  </div>

                  <div className="border-t border-white/5 mt-6 pt-4 flex justify-between items-center text-[10px] font-black uppercase text-gray-500">
                    <span>AVERAGE SCORING KD</span>
                    <span className="text-[#00E5FF] text-lg font-black">{dailyBestKdPlayer ? `${dailyBestKdPlayer.avgKd} KD` : '0.00'}</span>
                  </div>
                </div>

                {/* Showcase 3: COMMANDER TEAM OF THE WEEK */}
                <div className="relative glass-card bg-black/60 border border-white/10 rounded-2xl p-6 overflow-hidden flex flex-col justify-between group hover:border-green-500/30 transition-all">
                  <div className="absolute inset-0 bg-gradient-to-b from-green-500/5 to-transparent pointer-events-none" />
                  <div className="flex justify-between items-start">
                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-full text-green-500">
                      <Shield size={20} />
                    </div>
                    <span className="text-[9px] font-mono text-green-500 font-black uppercase tracking-widest bg-green-500/5 px-2.5 py-1 rounded-full border border-green-500/20">TOP TRAINING TEAM</span>
                  </div>

                  <div className="space-y-2 mt-6">
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">TOP TRAINING TEAM SQUAD MGB</p>
                    <h3 className="text-2xl font-black italic text-white tracking-tight uppercase group-hover:text-green-500 transition-colors truncate">
                      {topTrainingTeam ? topTrainingTeam.teamName : 'System Scanning'}
                    </h3>
                    <p className="text-xs text-gray-400 font-bold uppercase truncate">
                      {topTrainingTeam ? `ID Code: ${topTrainingTeam.uniqueId}` : 'No squads are currently approved.'}
                    </p>
                  </div>

                  <div className="border-t border-white/5 mt-6 pt-4 flex justify-between items-center text-[10px] font-black uppercase text-gray-500">
                    <span>ACCUMULATED SScrim Gained POINTS</span>
                    <span className="text-[#FFA400] text-lg font-black">{topTrainingTeam ? `${topTrainingTeam.stats?.points || 0} PTS` : '0'}</span>
                  </div>
                </div>

              </div>

              {/* Lobby Details Scrim rules */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
                
                {/* Interactive Scoring Guild Rules */}
                <div className="glass-card bg-black/40 border border-white/5 rounded-2xl p-6 space-y-6">
                  <div className="flex items-center gap-3">
                    <HelpCircle size={22} className="text-[#FFA400]" />
                    <h2 className="text-xl font-black italic uppercase tracking-tight">TRAINING SCORING COEFFICIENT</h2>
                  </div>

                  <div className="space-y-4 font-bold text-xs uppercase tracking-wide text-gray-300">
                    <div className="flex items-center justify-between p-3.5 bg-white/5 border border-white/10 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span>Practice Match Win</span>
                      </div>
                      <span className="text-green-500 font-black font-mono">+10 Points</span>
                    </div>

                    <div className="flex items-center justify-between p-3.5 bg-white/5 border border-white/10 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-gray-500" />
                        <span>Practice Match Loss</span>
                      </div>
                      <span className="text-gray-500 font-black font-mono">0 Points</span>
                    </div>

                    <div className="flex items-center justify-between p-3.5 bg-white/5 border border-white/10 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                        <span>Match MVP Player Award</span>
                      </div>
                      <span className="text-yellow-500 font-black font-mono">+5 Bonus Points</span>
                    </div>

                    <div className="flex items-center justify-between p-3.5 bg-white/5 border border-white/10 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-[#00E5FF] animate-pulse" />
                        <span>High Match-KD Reward (KD &gt;= 3.0)</span>
                      </div>
                      <span className="text-[#00E5FF] font-black font-mono">+2 Points / Player</span>
                    </div>
                  </div>

                  <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl text-[10px] text-red-400 uppercase font-black tracking-widest leading-relaxed">
                    🚨 IMPORTANT RULES: Max 4 practice submissions daily. Teams found reporting fake matches with spoofed screenshots face instantaneous termination and global blacklist of player UIDs!
                  </div>
                </div>

                {/* Team Quick Profile Widget */}
                <div className="glass-card bg-black/40 border border-white/5 rounded-2xl p-6 space-y-6 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Users size={22} className="text-[#00E5FF]" />
                      <h2 className="text-xl font-black italic uppercase tracking-tight">YOUR SQUAD BIOMETRICS</h2>
                    </div>

                    {user ? (
                      myTeam ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-4 p-4 bg-[#00E5FF]/5 border border-[#00E5FF]/10 rounded-2xl">
                            <img 
                              src={myTeam.logoUrl} 
                              alt="Logo" 
                              onClick={() => setSelectedTeamProfile(myTeam)}
                              className="w-14 h-14 rounded-xl object-cover shrink-0 border border-white/15 cursor-pointer hover:border-[#00E5FF]/50 transition-all" 
                            />
                            <div>
                              <h3 className="text-lg font-black italic uppercase tracking-tight text-white">{myTeam.teamName}</h3>
                              <p className="text-[10px] font-mono text-[#00E5FF] uppercase tracking-widest">UID CODE: {myTeam.uniqueId} [APPROVED]</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white/5 px-4 py-3 border border-white/5 rounded-xl">
                              <span className="text-[9px] text-gray-500 block">TOTAL PRACTICE</span>
                              <span className="text-lg font-extrabold text-white">{myTeam.stats?.totalMatches || 0} Matches</span>
                            </div>
                            <div className="bg-white/5 px-4 py-3 border border-white/5 rounded-xl">
                              <span className="text-[9px] text-gray-500 block">WIN RATIO</span>
                              <span className="text-lg font-extrabold text-[#00E5FF]">{myTeam.stats?.winRate || 0}%</span>
                            </div>
                            <div className="bg-white/5 px-4 py-3 border border-white/5 rounded-xl">
                              <span className="text-[9px] text-gray-500 block">ACCUMULATED SCORE</span>
                              <span className="text-lg font-extrabold text-yellow-500">{myTeam.stats?.points || 0} POINTS</span>
                            </div>
                            <div className="bg-white/5 px-4 py-3 border border-white/5 rounded-xl">
                              <span className="text-[9px] text-gray-500 block">SQUAD AVG KD</span>
                              <span className="text-lg font-extrabold text-red-500">{myTeam.stats?.avgKd || 0}</span>
                            </div>
                          </div>

                          <button 
                            onClick={() => setSelectedTeamProfile(myTeam)}
                            className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest border border-white/10 rounded-xl transition-all"
                          >
                            OPEN BIOMETRICS PROFILE ROSTER
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4 py-8 text-center">
                          <Users size={32} className="mx-auto text-gray-700" />
                          <p className="text-xs text-gray-400 font-bold uppercase uppercase">You are currently not managing any active training squad roster.</p>
                          <button 
                            onClick={() => setActiveTab('register')}
                            className="mx-auto px-5 py-2.5 bg-[#FFA400] text-black font-black text-[10px] uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg"
                          >
                            REGISTER NEW SCRIMS SQUAD
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="py-12 text-center space-y-4">
                        <Lock size={32} className="mx-auto text-gray-700 animate-pulse" />
                        <p className="text-xs text-gray-400 font-bold uppercase">SIGN IN TO ACCESS YOUR SQUAD BIOMETRICS LOG</p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/5 pt-4 text-center">
                    <span className="text-[9px] font-mono text-gray-600 block">MGB TOURNAMENT SYSTEM COMPATIBLE</span>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ==================== LEADERBOARDS TAB ==================== */}
          {activeTab === 'leaderboard' && (
            <div className="space-y-12">
              
              {/* Leaderboard controls (e.g. recalculate/sync) */}
              <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl">
                <div className="space-y-1">
                  <h3 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-2">
                    <Target size={16} className="text-[#00E5FF]" />
                    LIVE SCRIMS RANKINGS ENGINE
                  </h3>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    Automatically calibrated every time a team scrim profile is filed
                  </p>
                </div>
                
                <button
                  onClick={() => recalculateLeaderboards()}
                  disabled={recalculating}
                  className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 font-black text-[10px] uppercase tracking-widest text-[#00E5FF] flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  <RefreshCw size={12} className={recalculating ? 'animate-spin' : ''} />
                  {recalculating ? 'SYCHRONIZING ENGINE...' : 'FORCE REGRADE STANDINGS'}
                </button>
              </div>

              {/* Grid split of Roster stands vs Players stands */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                
                {/* Left: Squad Standings */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <Trophy size={20} className="text-yellow-500" />
                    <h3 className="text-lg font-black italic uppercase tracking-tight text-white">SQUAD TRAINING SCOREBOARD</h3>
                  </div>

                  <div className="glass-card bg-black/40 border border-white/5 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/5 text-[9px] font-black uppercase tracking-widest text-gray-500">
                            <th className="py-4 px-4 text-center">RANK</th>
                            <th className="py-4 px-4">SQUAD</th>
                            <th className="py-4 px-4 text-center"> scrims</th>
                            <th className="py-4 px-4 text-center">W / L</th>
                            <th className="py-4 px-4 text-center">ratio</th>
                            <th className="py-4 px-4 text-right">SCORE</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-bold uppercase tracking-wide">
                          {sortedTeams.map((team, index) => {
                            const isTop = index === 0;
                            const isSecond = index === 1;
                            const isThird = index === 2;

                            return (
                              <tr 
                                key={team.id}
                                onClick={() => setSelectedTeamProfile(team)}
                                className={`hover:bg-white/5 cursor-pointer transition-colors ${isTop ? 'bg-yellow-500/5 text-yellow-500' : ''}`}
                              >
                                <td className="py-4 px-4 text-center">
                                  {isTop ? (
                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500 text-black font-black italic shadow-[0_0_15px_rgba(255,164,0,0.4)]">1st</span>
                                  ) : isSecond ? (
                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 text-black font-black italic">2nd</span>
                                  ) : isThird ? (
                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#CD7F32] text-black font-black italic">3rd</span>
                                  ) : (
                                    <span className="text-gray-500 font-mono font-black">#{index + 1}</span>
                                  )}
                                </td>
                                <td className="py-4 px-4 flex items-center gap-3">
                                  <img 
                                    src={team.logoUrl} 
                                    alt="Logo" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTeamProfile(team);
                                    }}
                                    className="w-8 h-8 rounded-lg object-cover border border-white/10 cursor-pointer hover:border-[#00E5FF]/50 transition-all" 
                                  />
                                  <div 
                                    className="cursor-pointer group"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTeamProfile(team);
                                    }}
                                  >
                                    <span className={`transition-colors group-hover:text-[#00E5FF] ${isTop ? 'text-white' : 'text-gray-200'}`}>{team.teamName}</span>
                                    <span className="block text-[8px] font-mono text-gray-500 tracking-widest mt-0.5 group-hover:text-[#00E5FF]/70 transition-colors">ID: {team.uniqueId}</span>
                                  </div>
                                </td>
                                <td className="py-4 px-4 text-center text-white">{team.stats?.totalMatches || 0}</td>
                                <td className="py-4 px-4 text-center">
                                  <span className="text-green-500 font-mono">{team.stats?.wins || 0}</span>
                                  <span className="text-gray-500 px-1 font-mono">/</span>
                                  <span className="text-red-500 font-mono">{team.stats?.losses || 0}</span>
                                </td>
                                <td className="py-4 px-4 text-center text-[#00E5FF] font-mono">{team.stats?.winRate || 0}%</td>
                                <td className="py-4 px-4 text-right">
                                  <span className={`text-sm font-black font-mono ${isTop ? 'text-yellow-500 shadow-yellow-500 shadow-3xl' : 'text-[#FFA400]'}`}>
                                    {team.stats?.points || 0} Pts
                                  </span>
                                </td>
                              </tr>
                            );
                          })}

                          {sortedTeams.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-12 text-center text-gray-500 font-black uppercase text-[10px]">
                                No scrim squads found. Register yours today!
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right: Player Standings */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <Award size={20} className="text-[#00E5FF]" />
                    <h3 className="text-lg font-black italic uppercase tracking-tight text-white">PLAYER COMBAT STATS LEADERBOARD</h3>
                  </div>

                  <div className="glass-card bg-black/40 border border-white/5 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/5 text-[9px] font-black uppercase tracking-widest text-gray-500">
                            <th className="py-4 px-4 text-center">RANK</th>
                            <th className="py-4 px-4">PLAYER</th>
                            <th className="py-4 px-4 text-center">ROLE</th>
                            <th className="py-4 px-4 text-center">AVG KD</th>
                            <th className="py-4 px-4 text-center">MVPS</th>
                            <th className="py-4 px-4 text-right">SCORE</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-bold uppercase tracking-wide">
                          {sortedPlayers.map((player, index) => {
                            const isTop = index === 0;
                            const isSecond = index === 1;
                            const isThird = index === 2;

                            return (
                              <tr 
                                key={player.uid}
                                onClick={() => setSelectedPlayerProfile(player)}
                                className={`hover:bg-white/5 cursor-pointer transition-colors ${isTop ? 'bg-red-500/5 text-red-500' : ''}`}
                              >
                                <td className="py-4 px-4 text-center">
                                  {isTop ? (
                                    <span className="text-red-500 font-extrabold shadow-red-500 shadow-3xl flex items-center justify-center gap-1">🏆 1st</span>
                                  ) : isSecond ? (
                                    <span className="text-slate-300 font-semibold">2nd</span>
                                  ) : isThird ? (
                                    <span className="text-[#CD7F32] font-semibold">3rd</span>
                                  ) : (
                                    <span className="text-gray-500 font-mono">#{index + 1}</span>
                                  )}
                                </td>
                                <td className="py-4 px-4">
                                  <div className="flex flex-col">
                                    <span className={isTop ? 'text-white' : 'text-gray-200'}>{player.inGameName}</span>
                                    <span className="text-[8px] font-mono text-gray-500 tracking-widest">{player.teamName} [UID: {player.uid}]</span>
                                  </div>
                                </td>
                                <td className="py-4 px-4 text-center">
                                  <span className="px-2.5 py-0.5 rounded-full text-[8px] bg-white/5 border border-white/10 text-gray-300">
                                    {player.mainRole}
                                  </span>
                                </td>
                                <td className="py-4 px-4 text-center text-[#00E5FF] font-mono">{player.stats?.avgKd || '0.00'}</td>
                                <td className="py-4 px-4 text-center text-yellow-500 font-mono">{player.stats?.mvps || 0}</td>
                                <td className="py-4 px-4 text-right">
                                  <span className="text-[#FFA400] font-mono font-black">{player.stats?.points || 0} Pts</span>
                                </td>
                              </tr>
                            );
                          })}

                          {sortedPlayers.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-12 text-center text-gray-500 font-black uppercase text-[10px]">
                                No practice session logs recorded. Standings are sterile.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ==================== SQUAD REGISTER TAB ==================== */}
          {activeTab === 'register' && (
            <div className="max-w-3xl mx-auto glass-card bg-black/40 border border-white/5 rounded-3xl p-8 space-y-8">
              <div className="text-center space-y-2">
                <Users size={36} className="mx-auto text-[#00E5FF]" />
                <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">SQUAD ENLISTMENT INVENTORY</h2>
                <p className="text-xs text-gray-500 uppercase tracking-widest">
                  Create practice squads. Members are indexed via game UID for statistics tracking
                </p>
              </div>

              {user ? (
                <form onSubmit={handleRegisterTeam} className="space-y-6">
                  
                  {/* Select Tournament Team Auto-fill */}
                  <div className="p-4 bg-[#00E5FF]/10 border border-[#00E5FF]/20 rounded-xl space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#00E5FF] block flex items-center gap-2">
                     <Users size={14} /> IMPORT FROM REGISTERED TOURNAMENT TEAM
                    </label>
                    <select
                      onChange={(e) => handleSelectTournamentTeam(e.target.value)}
                      className="w-full bg-[#1a1d23] border border-white/10 rounded-xl px-4 py-3 text-xs text-white font-black select-custom focus:outline-none focus:border-[#00E5FF] transition-all font-mono"
                    >
                      <option value="" className="bg-black">-- SELECT TOURNAMENT SQUAD (OPTIONAL) --</option>
                      {tournamentTeams
                        .filter(t => t.registrationStatus === 'approved')
                        .sort((a, b) => a.teamName.localeCompare(b.teamName))
                        .map(t => (
                          <option key={t.id} className="bg-black text-white font-sans font-black" value={t.id}>{t.teamName} [{t.uniqueId}]</option>
                        ))
                      }
                    </select>
                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mt-2 block">
                      Selecting a squad will automatically fill available player profiles using the database matching their UIDs.
                    </p>
                  </div>

                  {/* Basic team details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">TEAM SQUAD NAME</label>
                      <input 
                        type="text" 
                        required
                        placeholder="ENTER SQUAD NAME..."
                        value={regTeamName}
                        onChange={(e) => setRegTeamName(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-xs text-white placeholder-gray-500 uppercase font-black focus:outline-none focus:border-[#00E5FF] transition-all"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">CAPTAIN / IN-GAME LEADER NAME</label>
                      <input 
                        type="text" 
                        required
                        placeholder="ENTER CAPTAIN'S GAME NAME..."
                        value={regCaptainName}
                        onChange={(e) => setRegCaptainName(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-xs text-white placeholder-gray-500 uppercase font-black focus:outline-none focus:border-[#00E5FF] transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">TEAM SQUAD LOGO URL (OPTIONAL)</label>
                    <input 
                      type="url" 
                      placeholder="HTTPS://..."
                      value={regLogoUrl}
                      onChange={(e) => setRegLogoUrl(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00E5FF] transition-all"
                    />
                  </div>

                  {/* Player list */}
                  <div className="space-y-4 pt-4 border-t border-white/10">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-black uppercase tracking-wider text-white">SQUAD ROSTER (5 TO 7 PLAYERS)</h3>
                      <span className="text-[9px] font-mono text-gray-500 block uppercase">connecting via player UID</span>
                    </div>

                    <div className="space-y-4">
                      {regPlayers.map((player, index) => {
                        return (
                          <div key={index} className="p-4 bg-white/5 border border-white/10 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                            
                            <div className="space-y-2 col-span-1">
                              <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 block">UID [PLAYER #{index + 1}]</label>
                              <div className="flex gap-2">
                                <input 
                                  type="text"
                                  required={index < 5}
                                  placeholder="E.G. 1294819..."
                                  value={player.uid}
                                  className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-mono font-black placeholder-gray-600 focus:outline-none focus:border-[#00E5FF] transition-all"
                                  onChange={(e) => handleRegPlayerUidChange(index, e.target.value)}
                                  onBlur={(e) => resolvePlayerUid(index, e.target.value)}
                                />
                                {player.uid && (
                                  <button
                                    type="button"
                                    onClick={() => resolvePlayerUid(index, player.uid)}
                                    className="px-2.5 py-1 bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/20 rounded-xl text-[#00E5FF] text-[10px] font-black uppercase tracking-widest flex items-center justify-center shrink-0"
                                    title="Connect Solo Profile"
                                  >
                                    SYNC
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="space-y-2 col-span-1">
                              <label className="text-[9px] font-black uppercase tracking-widest text-[#FFA400] block flex items-center justify-between">
                                <span>IN-GAME NAME</span>
                                {player.isSynced && (
                                  <span className="text-[#00E5FF] text-[8px] font-black bg-[#00E5FF]/5 border border-[#00E5FF]/20 px-1.5 py-0.5 rounded">AUTO MATCHED</span>
                                )}
                              </label>
                              <input 
                                type="text"
                                required={index < 5}
                                placeholder="ENTER IGN..."
                                value={player.inGameName}
                                className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-gray-650 uppercase font-black focus:outline-none focus:border-[#00E5FF] transition-all"
                                onChange={(e) => {
                                  const updated = [...regPlayers];
                                  updated[index].inGameName = e.target.value;
                                  setRegPlayers(updated);
                                }}
                              />
                            </div>

                            <div className="space-y-2 col-span-1">
                              <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 block">GAME MATCH ROLE</label>
                              <select
                                value={player.mainRole}
                                className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white font-black select-custom focus:outline-none focus:border-[#00E5FF] transition-all"
                                onChange={(e) => {
                                  const updated = [...regPlayers];
                                  updated[index].mainRole = e.target.value;
                                  setRegPlayers(updated);
                                }}
                              >
                                {ROLES.map(role => <option key={role} className="bg-black text-white" value={role}>{role}</option>)}
                              </select>
                            </div>

                          </div>
                        );
                      })}
                    </div>

                    {regPlayers.length < 7 && (
                      <button
                        type="button"
                        onClick={() => setRegPlayers([...regPlayers, { uid: '', inGameName: '', mainRole: 'Marksman', currentKd: 0, rating: 0 }])}
                        className="py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 border-dashed rounded-2xl text-[10px] text-white font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                      >
                        <Plus size={14} className="text-[#00E5FF]" /> Add Auxiliary Player (Roster Max 7 Player slots)
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={registering}
                    className="w-full py-4 bg-[#00E5FF] text-black font-black uppercase text-xs tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-[0_0_25px_rgba(0,229,255,0.3)] flex items-center justify-center gap-2"
                  >
                    {registering ? 'FILING ENLISTMENT LOGS...' : 'FILE SCRIMS SQUAD ENLISTMENT APPLICATION'}
                  </button>

                </form>
              ) : (
                <div className="py-16 text-center space-y-6">
                  <Lock size={48} className="mx-auto text-gray-750 animate-pulse" />
                  <h3 className="text-lg font-black uppercase tracking-wider italic text-gray-600">Secure Interface Blocked</h3>
                  <p className="text-xs text-gray-500 uppercase max-w-sm mx-auto leading-relaxed">
                    You must establish connection logs by logging in to register squads or compete in practice scrims list.
                  </p>
                </div>
              )}

            </div>
          )}

          {/* ==================== Record practice MATCH TAB ==================== */}
          {activeTab === 'submit' && (
            <div className="max-w-2xl mx-auto glass-card bg-black/40 border border-white/5 rounded-3xl p-8 space-y-8">
              
              <div className="text-center space-y-2">
                <Plus size={36} className="mx-auto text-[#FFA400]" />
                <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">RECORD SCRIMS SCORE LOG</h2>
                <p className="text-xs text-gray-500 uppercase tracking-widest">
                  File daily completed scrim combat records. Captain authorization required.
                </p>
              </div>

              {user ? (
                (myTeam || isAdmin) ? (
                  <div className="space-y-6">
                    {isAdmin && (
                      <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-yellow-500 block flex items-center gap-2">
                         <Shield size={14} /> ADMIN OVERRIDE: DESIGNATE SUBMITTING TEAM
                        </label>
                        <select
                          value={adminSelectedTeamId}
                          onChange={(e) => setAdminSelectedTeamId(e.target.value)}
                          className="w-full bg-[#1a1d23] border border-white/10 rounded-xl px-4 py-3 text-xs text-white font-black select-custom focus:outline-none focus:border-yellow-500 transition-all font-mono"
                        >
                          <option value="" className="bg-black">-- SELECT APPROVED SQUAD TO ACT ON BEHALF OF --</option>
                          {teams.filter(t => t.status === 'approved')
                            .sort((a, b) => a.teamName.localeCompare(b.teamName))
                            .map(t => (
                            <option key={t.id} className="bg-black text-white font-sans font-black" value={t.id}>{t.teamName} [{t.uniqueId}]</option>
                          ))}
                        </select>
                        <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mt-2 block">
                          This overrides the form logic, making you the captain of the chosen team for this submission sequence.
                        </p>
                      </div>
                    )}
                    
                    {myTeam ? (
                      <form onSubmit={handleSubmitMatch} className="space-y-6">
                    
                    {/* Basic scrim properties */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Opponent Selection */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[#FFA400] block">OPPONENT PRACTICE SQUAD</label>
                        <select
                          required
                          value={subOpponentId}
                          onChange={(e) => setSubOpponentId(e.target.value)}
                          className="w-full bg-[#1a1d23] border border-white/10 rounded-xl px-4 py-3.5 text-xs text-white font-black select-custom focus:outline-none focus:border-[#FFA400] transition-all"
                        >
                          <option value="" className="bg-black">SELECT OPPONENT...</option>
                          {teams
                            .filter(t => t.id !== myTeam.id && t.status === 'approved')
                            .sort((a, b) => a.teamName.localeCompare(b.teamName))
                            .map(t => <option key={t.id} className="bg-black text-white font-black" value={t.id}>{t.teamName}</option>)
                          }
                        </select>
                      </div>

                      {/* Scrim index number of the day */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">DAILY PRACTICE TRACK (MATCH 1-4)</label>
                        <select
                          required
                          value={subMatchNum}
                          onChange={(e) => setSubMatchNum(Number(e.target.value))}
                          className="w-full bg-[#1a1d23] border border-white/10 rounded-xl px-4 py-3.5 text-xs text-white font-black select-custom focus:outline-none focus:border-[#FFA400] transition-all font-mono"
                        >
                          {[1, 2, 3, 4].map(num => (
                            <option key={num} className="bg-black text-white" value={num}>MATCH #{num} OF THE DAY</option>
                          ))}
                        </select>
                      </div>

                    </div>

                    {/* Win/Loss layout */}
                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-widest text-white">MATCH RESULTS STANDING</span>
                      <div className="flex gap-4">
                        <button
                          type="button"
                          onClick={() => setSubWin(true)}
                          className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                            subWin 
                              ? 'bg-green-500/15 border-green-500 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.15)]' 
                              : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'
                          }`}
                        >
                          VICTORY
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubWin(false)}
                          className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                            !subWin 
                              ? 'bg-red-500/15 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.15)]' 
                              : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'
                          }`}
                        >
                          DEFEAT
                        </button>
                      </div>
                    </div>

                    {/* MVP selection option */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[#FFA400] block">DESIGNATED MATCH MVP SQUAD MEMBER</label>
                      <select
                        required
                        value={subMvpUid}
                        onChange={(e) => setSubMvpUid(e.target.value)}
                        className="w-full bg-[#1a1d23] border border-white/10 rounded-xl px-4 py-3.5 text-xs text-white font-black select-custom focus:outline-none focus:border-[#FFA400] transition-all"
                      >
                        <option value="" className="bg-black">SELECT SQUAD MVP...</option>
                        {myTeam.players.map(p => (
                          <option key={p.uid} className="bg-black text-white font-black" value={p.uid}>{p.inGameName} [UID: {p.uid}]</option>
                        ))}
                      </select>
                    </div>

                    {/* Each player match KD */}
                    <div className="space-y-4 pt-4 border-t border-white/10">
                      <h3 className="text-xs font-black uppercase tracking-wider text-white">SQUAD KD ASSIGNMENT MATRIX</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {myTeam.players.map(p => {
                          return (
                            <div key={p.uid} className="p-3.5 bg-black/60 border border-white/10 rounded-2xl flex items-center justify-between gap-4">
                              <span className="text-xs font-black uppercase truncate text-gray-200">{p.inGameName}</span>
                              <input 
                                type="number"
                                step="0.01"
                                min="0"
                                required
                                placeholder="E.G. 3.45"
                                value={subKds[p.uid] || ''}
                                className="w-28 bg-[#1a1d23] border border-white/10 rounded-xl py-2 px-3 text-xs text-[#00E5FF] font-mono font-black text-center focus:outline-none focus:border-[#FFA400]"
                                onChange={(e) => {
                                  setSubKds({
                                    ...subKds,
                                    [p.uid]: e.target.value
                                  });
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Screenshot uploader */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">VERIFICATION CAPTURE (MATCH RESULT SCREENSHOT)</label>
                      <div className="relative group border-2 border-white/10 hover:border-[#FFA400]/40 border-dashed rounded-2xl p-6 text-center cursor-pointer bg-white/5 hover:bg-white/10 transition-all">
                        <input 
                          type="file" 
                          accept="image/*"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                          onChange={handleScreenshotChange}
                        />
                        {subScreenshot ? (
                          <div className="space-y-3">
                            <img src={subScreenshot} alt="Upload Staged" className="max-h-48 mx-auto rounded-lg border border-white/10 object-contain shadow-md" />
                            <p className="text-[9px] font-black uppercase text-green-500 tracking-widest">Screenshot verification staged!</p>
                          </div>
                        ) : (
                          <div className="space-y-3 text-gray-400 font-black">
                            <Upload className="mx-auto text-gray-500" size={28} />
                            <div className="text-[10px] uppercase tracking-wider">Drag screenshot here or click to explore logs</div>
                            <p className="text-[8px] text-gray-500 font-mono">JPG / PNG files supported</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Scrim comments */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">COMMENTS & LOG NOTES (OPTIONAL)</label>
                      <textarea 
                        rows={2}
                        placeholder="E.G. HIGH TENSION GAMEPLAY, SQUAD CLUTCHED 5th DRAKED SHIELDS..."
                        value={subNotes}
                        onChange={(e) => setSubNotes(e.target.value)}
                        className="w-full bg-[#1a1d23] border border-white/10 rounded-xl p-4 text-xs text-white placeholder-gray-550 uppercase font-black focus:outline-none focus:border-[#FFA400]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submittingMatch}
                      className="w-full py-4 bg-[#FFA400] text-black font-black uppercase text-xs tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-[0_0_25px_rgba(255,164,0,0.3)] flex items-center justify-center gap-2"
                    >
                      {submittingMatch ? 'TRANSMITTING TARGET LOGS...' : 'FILE COMPLETED LOG ENTRY ON DATABASE'}
                    </button>

                  </form>
                    ) : (
                      <div className="py-16 text-center space-y-6">
                        <Shield size={48} className="mx-auto text-yellow-500/50 animate-pulse" />
                        <h3 className="text-lg font-black uppercase tracking-wider italic text-gray-600">Admin Mode Active</h3>
                        <p className="text-xs text-gray-500 uppercase max-w-sm mx-auto leading-relaxed">
                          Please designate a submitting team from the dropdown above to continue filing logs.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-16 text-center space-y-6">
                    <Lock size={48} className="mx-auto text-gray-750" />
                    <h3 className="text-lg font-black uppercase tracking-wider italic text-gray-600">Access Restricted</h3>
                    <p className="text-xs text-gray-500 uppercase max-w-sm mx-auto leading-relaxed">
                      Your registered squad must first be approved by administrators to submit scrim logs and earn practice scoreboard coordinates.
                    </p>
                  </div>
                )
              ) : (
                <div className="py-16 text-center space-y-6">
                  <Lock size={48} className="mx-auto text-gray-750" />
                  <h3 className="text-lg font-black uppercase tracking-wider italic text-gray-650">Secure Interface Blocked</h3>
                  <p className="text-xs text-gray-500 uppercase max-w-sm mx-auto">
                    Please log into the station console to interact with score reporting frameworks.
                  </p>
                </div>
              )}

            </div>
          )}

          {/* ==================== SCRIM HISTORY TAB ==================== */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-black italic uppercase text-white">PRACTICE HISTORIC SCRIMS LOGS</h3>
                <span className="text-[10px] font-mono text-[#00E5FF] uppercase font-black tracking-widest">
                  {matches.length}Scrim sessions registered
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {matches.map((match) => {
                  return (
                    <div 
                      key={match.id}
                      className={`glass-card p-6 bg-black/40 border rounded-2xl relative overflow-hidden group space-y-4 hover:border-white/10 transition-all ${
                        match.isFlagged ? 'border-red-500/20 bg-red-500/2' : 'border-white/5'
                      }`}
                    >
                      {match.isFlagged && (
                        <div className="absolute top-0 left-0 w-full bg-red-500/80 color-white text-center text-[9px] py-1 font-black uppercase tracking-widest z-30">
                          FAKE MATCH FLAG ENABLED — EXCLUDED FROM STANDINGS
                        </div>
                      )}

                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <span className="text-[9px] font-mono text-gray-500 tracking-widest block uppercase">
                            Scrim date: {match.date} • Match #{match.matchNumber} of the day
                          </span>
                          <h4 className="text-lg font-black tracking-tighter uppercase italic">
                            <span className="text-white">{match.teamName}</span>
                            <span className="text-gray-500 px-2">VS</span>
                            <span className="text-gray-400">{match.opponentTeamName}</span>
                          </h4>
                        </div>

                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase font-mono ${
                          match.win 
                            ? 'bg-green-500/10 border border-green-500/20 text-green-400' 
                            : 'bg-red-500/10 border border-red-500/20 text-red-400'
                        }`}>
                          {match.win ? 'VICTORY' : 'DEFEAT'}
                        </span>
                      </div>

                      {/* Middle KD breakdown */}
                      <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-3">
                        <div className="flex justify-between items-center text-[10px] font-black text-gray-500 uppercase">
                          <span>SQUAD ASSIGNED MATCH-KDs</span>
                          <span className="text-white">MVP: <span className="text-yellow-500 font-extrabold">{match.mvpName}</span></span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {Object.entries(match.playerKds || {}).map(([uid, kd]) => {
                            const playerObj = players.find(p => p.uid === uid);
                            const inGameName = playerObj?.inGameName || 'Member';
                            const isMvp = uid === match.mvpUid;

                            return (
                              <div key={uid} className={`bg-black/40 px-2.5 py-1.5 rounded-lg border text-[10px] flex flex-col justify-center items-center ${isMvp ? 'border-yellow-500/30' : 'border-white/5'}`}>
                                <span className="text-gray-400 font-black tracking-tight truncate max-w-full uppercase block text-center">
                                  {inGameName}
                                </span>
                                <span className={`font-mono text-xs font-black ${isMvp ? 'text-yellow-500' : 'text-[#00E5FF]'}`}>{kd} KD</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Screenshot explore and comments */}
                      {match.screenshotUrl && (
                        <div className="flex gap-4 items-start">
                          <img src={match.screenshotUrl} alt="Capture proof" className="w-16 h-16 rounded-lg object-cover shrink-0 border border-white/10" />
                          <div className="min-w-0">
                            <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest block">REPORT COMMENTS</span>
                            <p className="text-[11px] text-gray-450 uppercase leading-relaxed font-black truncate max-w-sm mt-1 select-all">{match.notes || 'No notes filed.'}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between items-center border-t border-white/5 pt-4 text-[9px] font-black uppercase text-gray-500">
                        <span>Calibration metrics Points Added</span>
                        <span className="text-yellow-500 font-mono text-xs">{match.pointsAwarded} PTS</span>
                      </div>
                    </div>
                  );
                })}

                {matches.length === 0 && (
                  <div className="col-span-full py-20 text-center glass-card space-y-4">
                    <Calendar size={48} className="mx-auto text-gray-800" />
                    <h3 className="text-xl font-black uppercase tracking-widest italic text-gray-600">practice archive dry</h3>
                    <p className="text-xs text-gray-500 uppercase">Submit practice scrim scores to populate directory log files</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== ADMIN TERMINAL TAB ==================== */}
          {activeTab === 'admin' && (isAdmin || isModerator) && (
            <div className="space-y-10">
              
              <div className="p-6 bg-[#FF2E63]/5 border border-[#FF2E63]/25 rounded-3xl space-y-2">
                <h2 className="text-2xl font-black italic uppercase text-[#FF2E63] tracking-tighter flex items-center gap-2">
                  <Sliders size={24} /> ADMIN COMMAND INTERACTION CENTER
                </h2>
                <p className="text-xs text-gray-400 uppercase tracking-widest leading-relaxed">
                  Calibrate rosters, verify reports, flag suspicious duplicate logs, ban bad actors, and restart calibration parameters.
                </p>
              </div>

              {/* Roster Application Approvals */}
              <div className="space-y-4">
                <h3 className="text-base font-black italic uppercase text-white flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#00E5FF]" /> PENDING SCRIMS SQUAD ENLISTMENT APPLICATIONS
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {teams
                    .filter(t => t.status === 'pending')
                    .map((team) => {
                      return (
                        <div key={team.id} className="glass-card p-6 border border-white/5 rounded-2xl bg-black/60 space-y-4">
                          <div className="flex gap-4 items-center">
                            <img src={team.logoUrl} alt="Logo" className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0" />
                            <div>
                              <h4 className="text-lg font-black uppercase text-white italic">{team.teamName}</h4>
                              <p className="text-[10px] text-gray-500 font-mono">Captain: {team.captainName} [UID: {team.captainUid}]</p>
                            </div>
                          </div>

                          <div className="border-y border-white/5 py-4 space-y-2">
                            <span className="text-[9px] text-gray-500 font-black block uppercase tracking-widest">PROPOSED ROSTER COMPOSITION</span>
                            <div className="flex flex-wrap gap-2">
                              {team.players.map(p => (
                                <span key={p.uid} className="bg-white/5 border border-white/10 font-black uppercase rounded px-2.5 py-1 text-[9px] text-gray-300">
                                  {p.inGameName} ({p.mainRole})
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex gap-4">
                            <button
                              onClick={() => handleApproveTeam(team)}
                              className="flex-1 py-3 bg-green-500 text-black font-black uppercase text-[10px] tracking-widest hover:brightness-110 rounded-xl transition-all"
                            >
                              APPROVE & DEPLOY SQUAD
                            </button>
                            <button
                              onClick={() => handleRejectTeam(team.id)}
                              className="px-4 py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-black uppercase text-[10px] tracking-widest border border-red-500/20 rounded-xl transition-all"
                            >
                              REJECT
                            </button>
                          </div>
                        </div>
                      );
                    })}

                  {teams.filter(t => t.status === 'pending').length === 0 && (
                    <div className="col-span-full py-12 text-center glass-card text-gray-650 font-black uppercase text-[10px] tracking-widest italic bg-black/10 border-dashed border-white/5">
                      No pending team applications. Channel is silent.
                    </div>
                  )}
                </div>
              </div>

              {/* Duplicate UID Blacklisting & Verification Audit */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* ID Duplicate Banning Portal */}
                <div className="glass-card bg-black/40 border border-white/5 rounded-2xl p-6 space-y-6">
                  <div className="flex items-center gap-3">
                    <Ban size={20} className="text-[#FF2E63]" />
                    <h3 className="text-md font-black italic uppercase text-white">DUPLICATE UID ACCESS LOCK SYSTEM</h3>
                  </div>

                  <form onSubmit={handleBanUid} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">PLAYER SPECIFIC UID TO BLOCK</label>
                      <input 
                        type="text" 
                        required
                        placeholder="ENTER UID TO BLOCK DUPLICATE ACTION..."
                        value={bannedUidInput}
                        onChange={(e) => setBannedUidInput(e.target.value)}
                        className="w-full bg-[#1a1d23] border border-white/10 rounded-xl px-4 py-3 text-xs text-white font-mono placeholder-gray-500 focus:outline-none focus:border-[#FF2E63]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">ADMIN ENFORCEMENT REASON RECOG</label>
                      <input 
                        type="text" 
                        required
                        placeholder="E.G. IDENTIFIED DUPLICATE RETAIN..."
                        value={bannedReason}
                        onChange={(e) => setBannedReason(e.target.value)}
                        className="w-full bg-[#1a1d23] border border-white/10 rounded-xl px-4 py-3 text-xs text-white uppercase focus:outline-none focus:border-[#FF2E63]"
                      />
                    </div>

                    <button 
                      type="submit"
                      className="w-full py-3 bg-[#FF2E63] text-white font-black uppercase text-[10px] tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-md"
                    >
                      ENFORCE GLOBAL BAN ON UID REGISTER
                    </button>
                  </form>

                  {/* Active blacklist ledger */}
                  <div className="space-y-3 pt-4 border-t border-white/5">
                    <span className="text-[9px] font-black text-gray-500 tracking-widest block uppercase">GLOBAL SYSTEM BLACKLIST LEDGER ({bannedUids.length})</span>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {bannedUids.map(b => (
                        <div key={b.uid} className="flex justify-between items-center p-3 bg-red-500/5 border border-red-500/10 rounded-xl">
                          <div>
                            <span className="font-mono text-xs text-red-400 font-black">{b.uid}</span>
                            <span className="block text-[8px] text-gray-500 uppercase tracking-tight mt-0.5">REASON: {b.reason || 'None provided'}</span>
                          </div>
                          <button 
                            onClick={() => handleLiftBan(b.uid)}
                            className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black uppercase text-[8px] tracking-widest px-2.5 py-1.5 rounded transition-all"
                          >
                            LIFT RESTRICTION
                          </button>
                        </div>
                      ))}
                      {bannedUids.length === 0 && (
                        <p className="text-[9px] text-gray-600 font-black uppercase text-center py-4">Security framework is empty.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Score Log Inspect/Fake deletion panel */}
                <div className="glass-card bg-black/40 border border-white/5 rounded-2xl p-6 space-y-6">
                  <div className="flex items-center gap-3">
                    <Sliders size={20} className="text-yellow-500" />
                    <h3 className="text-md font-black italic uppercase text-white">Scrims SUBMISSIONS AUDIT LOGGER</h3>
                  </div>

                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {matches.map(m => (
                      <div key={m.id} className="p-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <span className="text-[8px] text-gray-500 block font-mono">{m.date} • MATCH #{m.matchNumber}</span>
                          <span className="text-xs font-black uppercase truncate block text-white">{m.teamName} VS {m.opponentTeamName}</span>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleToggleFlagMatch(m.id, !m.isFlagged)}
                            className={`px-3 py-1.5 rounded text-[8px] font-black uppercase tracking-widest transition-all border ${
                              m.isFlagged 
                                ? 'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500 hover:text-black' 
                                : 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white'
                            }`}
                          >
                            {m.isFlagged ? 'RESTORE REPORTS' : 'REMOVE FAKE REPORT flag'}
                          </button>
                        </div>
                      </div>
                    ))}
                    {matches.length === 0 && (
                      <p className="text-[9px] text-gray-600 font-black uppercase text-center py-4">Matches are empty.</p>
                    )}
                  </div>

                  {/* Reset system metrics buttons */}
                  <div className="pt-4 border-t border-white/5 space-y-2">
                    <span className="text-[9px] font-black text-red-400 tracking-widest block uppercase">CRITICAL SYSTEM INTELLIGENCE RESET</span>
                    <button 
                      onClick={handleResetLeaderboard}
                      className="w-full py-3 bg-red-650/10 hover:bg-red-650 text-red-500 hover:text-white font-black uppercase text-[10px] tracking-widest border border-red-500/30 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw size={12} /> WIPE PRACTICE MATCH DATABASE & RESET LEADERBOARDS
                    </button>
                  </div>

                </div>

              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>

      {/* ==================== TEAM PROFILE POPUP MODAL ==================== */}
      {selectedTeamProfile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-[200]">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="max-w-xl w-full bg-[#0a0d14] border border-white/10 rounded-3xl p-6 relative space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar"
          >
            <button 
              onClick={() => setSelectedTeamProfile(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>

            {(() => {
              const rankIndex = sortedTeams.findIndex(t => t.id === selectedTeamProfile.id);
              const currentRank = rankIndex !== -1 ? rankIndex + 1 : 'N/A';
              const diamonds = selectedTeamProfile.stats?.diamonds || 0;
              const winStreak = selectedTeamProfile.stats?.winStreak || 0;
              
              const ratingsValues = Object.values(selectedTeamProfile.publicRatings || {});
              const averageRating = ratingsValues.length 
                ? (ratingsValues.reduce((a, b: any) => a + Number(b), 0) / ratingsValues.length).toFixed(1) 
                : '0.0';
              const totalRatingCount = ratingsValues.length;
              const userRating = user ? selectedTeamProfile.publicRatings?.[user.id] : 0;

              return (
                <>
                  <div className="flex flex-col md:flex-row gap-6 md:items-start text-center md:text-left">
                    <motion.img 
                      initial={{ rotate: -10, scale: 0.8 }}
                      animate={{ rotate: 0, scale: 1 }}
                      src={selectedTeamProfile.logoUrl} 
                      alt="Logo" 
                      className="w-24 h-24 mx-auto md:mx-0 rounded-2xl object-cover border-2 border-white/10 shadow-[0_0_25px_rgba(255,164,0,0.1)]" 
                    />
                    <div className="flex-1 space-y-3">
                      <div>
                         <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-2">
                           <span className="px-2 py-1 bg-[#FFA400]/20 text-[#FFA400] text-[10px] font-black uppercase rounded border border-[#FFA400]/30 shadow-[0_0_10px_rgba(255,164,0,0.3)]">
                             RANK #{currentRank}
                           </span>
                           <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase rounded border border-blue-500/30 flex items-center gap-1.5">
                              <Gem size={12} /> {diamonds} DIAMONDS
                           </span>
                           {winStreak > 0 && (
                             <span className="px-2 py-1 bg-red-500/20 text-red-400 text-[10px] font-black uppercase rounded border border-red-500/30 flex items-center gap-1.5">
                                <Flame size={12} /> {winStreak} WIN STREAK
                             </span>
                           )}
                         </div>
                        <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">{selectedTeamProfile.teamName}</h2>
                        <p className="text-[11px] font-mono text-[#00E5FF] uppercase tracking-widest mt-1">UID: {selectedTeamProfile.uniqueId} // CAPTAIN: {selectedTeamProfile.captainName}</p>
                      </div>

                      {/* Public Rating Display */}
                      <div className="bg-white/5 border border-white/10 rounded-xl p-3 inline-flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                           <div className="flex gap-1">
                             {[1, 2, 3, 4, 5].map((star) => (
                               <Star
                                 key={star}
                                 size={16}
                                 onClick={() => handleRateTeam(selectedTeamProfile, star)}
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

                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="text-[9px] text-gray-500 block uppercase font-mono mb-1">SCORES</span>
                      <span className="text-xl font-black text-white">{selectedTeamProfile.stats?.points ?? 0}</span>
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="text-[9px] text-gray-500 block uppercase font-mono mb-1">MATCHES</span>
                      <span className="text-xl font-black text-white">{selectedTeamProfile.stats?.totalMatches ?? 0}</span>
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="text-[9px] text-gray-500 block uppercase font-mono mb-1">WINS</span>
                      <span className="text-xl font-black text-white">{selectedTeamProfile.stats?.wins ?? 0}</span>
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="text-[9px] text-gray-500 block uppercase font-mono mb-1">RATIO</span>
                      <span className="text-xl font-black text-[#00E5FF]">{selectedTeamProfile.stats?.winRate ?? 0}%</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">ROSTER GRID SQUAD COMP</span>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {selectedTeamProfile.players.map((plr, idx) => {
                        return (
                          <div key={plr.uid} className="flex justify-between items-center p-3.5 bg-white/5 border border-white/15 rounded-xl">
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-[10px] text-gray-500 shrink-0">#{idx + 1}</span>
                              <div className="min-w-0 flex-1">
                                <span className="text-sm text-white font-extrabold uppercase block truncate">{plr.inGameName}</span>
                                <span className="block text-[9px] font-mono text-gray-500 truncate">UID: {plr.uid}</span>
                              </div>
                            </div>
                            <span className="px-3 py-1.5 bg-[#00E5FF]/10 text-white text-[9px] font-black uppercase rounded text-xs select-none shrink-0 ml-2">
                              {plr.mainRole}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}
          </motion.div>
        </div>
      )}

      {/* ==================== PLAYER BIOMETRICS POPUP MODAL ==================== */}
      {selectedPlayerProfile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-[200]">
          <div className="max-w-md w-full bg-[#0a0d14] border border-white/10 rounded-3xl p-6 relative space-y-6">
            <button 
              onClick={() => setSelectedPlayerProfile(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              Close Profile
            </button>

            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-[#00E5FF]/10 border border-[#00E5FF]/20 rounded-full flex items-center justify-center text-[#00E5FF] mx-auto">
                <User size={24} />
              </div>
              <h2 className="text-xl font-black italic uppercase tracking-tighter text-white">{selectedPlayerProfile.inGameName}</h2>
              <span className="inline-block px-3 py-1 bg-white/5 text-[#00E5FF] text-[9px] font-mono font-black uppercase tracking-widest rounded-full border border-white/10">
                Main role: {selectedPlayerProfile.mainRole}
              </span>
              <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">UID CODE: {selectedPlayerProfile.uid} // {selectedPlayerProfile.teamName}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center border-y border-white/10 py-4">
              <div>
                <span className="text-[8px] text-gray-500 block uppercase font-mono"> scrim played</span>
                <span className="text-lg font-black text-white">{selectedPlayerProfile.stats?.totalMatches || 0}</span>
              </div>
              <div>
                <span className="text-[8px] text-gray-500 block uppercase font-mono">AVERAGE KD</span>
                <span className="text-lg font-black text-[#00E5FF]">{selectedPlayerProfile.stats?.avgKd || '0.00'}</span>
              </div>
              <div>
                <span className="text-[8px] text-gray-500 block uppercase font-mono">SCORES</span>
                <span className="text-lg font-black text-yellow-500">{selectedPlayerProfile.stats?.points || 0}</span>
              </div>
            </div>

            <div className="space-y-4">
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">SQUAD COMBAT PERFORMANCE RECORD</span>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-white/5 border border-white/5 rounded-xl flex justify-between items-center text-xs uppercase font-black">
                  <span className="text-gray-500">VICTORIES</span>
                  <span className="text-green-400 font-mono">{selectedPlayerProfile.stats?.wins || 0}</span>
                </div>
                <div className="p-3 bg-white/5 border border-white/5 rounded-xl flex justify-between items-center text-xs uppercase font-black">
                  <span className="text-gray-500">DEFEATS</span>
                  <span className="text-red-400 font-mono">{selectedPlayerProfile.stats?.losses || 0}</span>
                </div>
                <div className="p-3 bg-white/5 border border-white/5 rounded-xl flex justify-between items-center text-xs uppercase font-black col-span-2">
                  <span className="text-gray-500">MVP OF THE GAME COUNT</span>
                  <span className="text-yellow-500 font-mono">{selectedPlayerProfile.stats?.mvps || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
