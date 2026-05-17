import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, storage, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp, collection, query, where, getDocs, increment } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { updateEmail } from 'firebase/auth';
import { toast } from 'react-hot-toast';
import { Team } from '../types';
import { motion } from 'framer-motion';
import { Shield, User, Camera, Save, Loader2, AlertCircle, CheckCircle, Users, Mail, Send, RefreshCw, Lock, History, Clock } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { FALLBACK_IMAGE, RANKS, getRankBonus, uploadExternalImageToStorage } from '../lib/utils';
import { useSearchParams, Link } from 'react-router-dom';
import { Transaction } from '../types';
import { orderBy, limit, onSnapshot } from 'firebase/firestore';

const Profile: React.FC = () => {
  const { user, isAdmin, isModerator, settings, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  
  // Use a stable current user ID for lookups
  const currentUid = auth.currentUser?.uid;
  const targetId = searchParams.get('id') || (isAdmin ? null : currentUid || user?.id);

  const [team, setTeam] = useState<Team | null>(null);
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pendingRegistration, setPendingRegistration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [upgradingRank, setUpgradingRank] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFields, setErrorFields] = useState<number[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    teamName: '',
    leaderName: '',
    email: '',
    phoneNumber: '',
    logoUrl: '',
    leaderCardUrl: '',
    gameId: '',
    serverId: '',
    players: ['', '', '', '', '', '', '']
  });

  const [files, setFiles] = useState<{ logo?: File, card?: File }>({});
  const [previews, setPreviews] = useState<{ logo?: string, card?: string }>({});

  useEffect(() => {
    let unsubscribeTransactions: any = () => {};

    const fetchTeam = async () => {
      // Don't start fetching until auth state is known
      if (authLoading) return;

      if (!targetId) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      setError(null);

      try {
        let teamDoc;
        const currentUser = auth.currentUser;
        
        if (isAdmin && searchParams.get('id')) {
          // Admin viewing specific team via search param
          teamDoc = await getDoc(doc(db, 'teams', targetId));
          if (teamDoc.exists()) {
            setUserTeams([{ id: teamDoc.id, ...teamDoc.data() } as Team]);
          }
        } else {
          // Regular user or admin's personal view: search by ownerId
          const teamsQuery = query(collection(db, 'teams'), where('ownerId', '==', targetId));
          const querySnap = await getDocs(teamsQuery);
          if (!querySnap.empty) {
            const allTeams = querySnap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
            setUserTeams(allTeams);
            const activeTeamId = selectedTeamId || allTeams[0].id;
            teamDoc = querySnap.docs.find(d => d.id === activeTeamId) || querySnap.docs[0];
          } else {
            // Fallback for legacy teams that used userId as Document ID
            const fallbackDoc = await getDoc(doc(db, 'teams', targetId));
            if (fallbackDoc.exists()) {
              teamDoc = fallbackDoc;
              setUserTeams([{ id: fallbackDoc.id, ...fallbackDoc.data() } as Team]);
            } else {
              // Check if they have a pending registration
              try {
                const regOwnerId = targetId || currentUser?.uid;
                if (regOwnerId) {
                  const regQuery = query(collection(db, 'registrations'), where('ownerId', '==', regOwnerId));
                  const regSnap = await getDocs(regQuery);
                  if (!regSnap.empty) {
                    const isPending = regSnap.docs.some(d => d.data().status === 'pending');
                    setPendingRegistration(isPending);
                  }
                }
              } catch(e) {
                console.warn("Could not fetch registrations:", e);
              }
            }
          }
        }

        let userSnap: any = { exists: () => false, data: () => ({}), ref: doc(db, 'users', 'temporary') };
        try {
          const lookupUid = targetId || currentUser?.uid;
          if (lookupUid) {
            userSnap = await getDoc(doc(db, 'users', lookupUid));
          }
        } catch(e) {
          console.warn("Could not fetch user document");
        }
        
        if (teamDoc && teamDoc.exists()) {
          const teamData = { id: teamDoc.id, ...teamDoc.data() } as Team;
          setTeam(teamData);

          // Setup transaction listener
          const currentUser = auth.currentUser;
          const isOwnerOfViewed = currentUser && (teamDoc.id === currentUser.uid || teamData.ownerId === currentUser.uid);
          
          let transQuery;
          if ((isAdmin || isModerator) && currentUser) {
            transQuery = query(
              collection(db, 'transactions'),
              where('teamId', '==', teamDoc.id),
              orderBy('timestamp', 'desc'),
              limit(10)
            );
          } else if (isOwnerOfViewed && currentUser) {
            transQuery = query(
              collection(db, 'transactions'),
              where('allowedViewerUids', 'array-contains', currentUser.uid),
              orderBy('timestamp', 'desc'),
              limit(10)
            );
          } else {
            // Not authorized to view these transactions
            setTransactions([]);
            return;
          }

          unsubscribeTransactions = onSnapshot(transQuery, (snapshot) => {
            setTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
          }, (err) => {
            // Log only if truly authorized but failed (e.g. rule mismatch)
            // If logged out, onSnapshot will naturally fail but we shouldn't spam errors
            if (auth.currentUser) {
              console.error("Trans history error:", err);
            }
          });
          
          let recordEmail = '';
          const ownerId = teamData.ownerId || teamDoc.id;
          let ownerSnap: any = { exists: () => false, data: () => ({}) };
          try {
            ownerSnap = await getDoc(doc(db, 'users', ownerId));
          } catch (e) {
             console.warn("Could not fetch team owner user doc");
          }
          if (ownerSnap.exists()) {
             recordEmail = ownerSnap.data().email || '';
          }

          setFormData({
            teamName: teamData.teamName,
            leaderName: teamData.leaderName,
            email: recordEmail || (targetId === user?.id ? auth.currentUser?.email : '') || '',
            phoneNumber: teamData.phoneNumber || (ownerSnap.exists() && ownerSnap.data().phoneNumber ? ownerSnap.data().phoneNumber : ''),
            logoUrl: teamData.logoUrl || '',
            leaderCardUrl: teamData.leaderCardUrl || '',
            gameId: teamData.gameId || '',
            serverId: teamData.serverId || '',
            players: teamData.players.length >= 7 ? teamData.players.slice(0, 7) : [...teamData.players, ...Array(7 - teamData.players.length).fill('')]
          });
        } else if (userSnap.exists()) {
          // Team doesn't exist, but we have user data (maybe they want to update their number/UID before creating a team)
          setFormData(prev => ({
            ...prev,
            email: userSnap.data().email || (targetId === user?.id ? auth.currentUser?.email : '') || '',
            phoneNumber: userSnap.data().phoneNumber || '',
            gameId: userSnap.data().gameId || '',
            serverId: userSnap.data().serverId || ''
          }));
        }
      } catch (err) {
        console.error("Error fetching team:", err);
        setError("Failed to load team data.");
      } finally {
        setLoading(false);
      }
    };

    fetchTeam();
    return () => unsubscribeTransactions();
  }, [targetId, isAdmin, searchParams, selectedTeamId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    const name = e.target.name;

    if ((name === 'logoUrl' || name === 'leaderCardUrl') && value.includes('drive.google.com')) {
      const match1 = value.match(/\/d\/([a-zA-Z0-9_-]+)/);
      const match2 = value.match(/id=([a-zA-Z0-9_-]+)/);
      const id = (match1 && match1[1]) ? match1[1] : (match2 && match2[1] ? match2[1] : null);
      if (id) {
        value = `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
      }
    }
    setFormData({ ...formData, [e.target.name]: value });
    setError(null);
    setSuccess(null);
  };

  const handlePlayerChange = (index: number, value: string) => {
    const numericValue = value.replace(/\D/g, '');
    const newPlayers = [...formData.players];
    newPlayers[index] = numericValue;
    setFormData({ ...formData, players: newPlayers });
    setError(null);
    setSuccess(null);
    if (errorFields.length > 0) setErrorFields([]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'card') => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError(`${type.toUpperCase()} file is too large. Max 2MB allowed.`);
        return;
      }
      setFiles({ ...files, [type]: file });
      setPreviews({ ...previews, [type]: URL.createObjectURL(file) });
      setError(null);
      setSuccess(null);
    }
  };

  const uploadFile = async (file: File, path: string): Promise<string> => {
    const options = {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
    };
    const compressedFile = await imageCompression(file, options);
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, compressedFile);
    
    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        null,
        (error) => reject(error),
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      toast.error("Profile editing is currently disabled.");
      return;
    }
    if (!targetId) return;
    setSaving(true);
    const saveToast = toast.loading("Saving changes...");
    setError(null);
    setSuccess(null);
    setEmailSuccess(null);

    try {
      const cleanPhone = (formData.phoneNumber || '').replace(/\D/g, '');
      if (cleanPhone.length !== 11) {
        throw new Error("WhatsApp number must be exactly 11 digits.");
      }

      // ---UID Uniqueness Check Optimization ---
      const playersRaw = formData.players;
      const currentPlayers = playersRaw.filter(p => p.trim() !== '');
      const originalPlayers = team?.players || [];
      
      // Basic internal duplicate check (fast)
      const duplicates: number[] = [];
      const seen = new Map<string, number>();
      playersRaw.forEach((uid, idx) => {
        if (!uid.trim()) return;
        if (seen.has(uid)) {
          duplicates.push(seen.get(uid)!);
          duplicates.push(idx);
        } else {
          seen.set(uid, idx);
        }
      });

      if (duplicates.length > 0) {
        setErrorFields([...new Set(duplicates)]);
        throw new Error(`Duplicate player UID ${playersRaw[duplicates[0]]} found in your roster.`);
      }

      // Only run expensive Firestore uniqueness checks if the roster actually changed
      const playersChanged = JSON.stringify([...currentPlayers].sort()) !== JSON.stringify([...originalPlayers].sort());
      const actualUserId = (isAdmin && team?.ownerId) ? team.ownerId : targetId;

      // --- Parallel Data Fetching & Processing ---
      const [uniquenessResult, uploadedImages, userSnap] = await Promise.all([
        // 1. Uniqueness check (only if roster changed)
        (async () => {
          if (!playersChanged || currentPlayers.length === 0) return null;
          return await Promise.all([
            getDocs(query(collection(db, 'teams'), where('players', 'array-contains-any', currentPlayers))),
            getDocs(query(collection(db, 'registrations'), where('status', '==', 'pending'), where('players', 'array-contains-any', currentPlayers)))
          ]);
        })(),
        // 2. Image uploads (with change detection)
        Promise.all([
          (async () => {
            if (files.logo) return await uploadFile(files.logo, `teams/${targetId}/logo_${Date.now()}`);
            // Only re-process external URL if it is DIFFERENT from what we currently have saved
            if (formData.logoUrl && formData.logoUrl !== team?.logoUrl && !formData.logoUrl.includes('firebasestorage.googleapis.com')) {
              return await uploadExternalImageToStorage(formData.logoUrl, `teams/${targetId}/logos`);
            }
            return formData.logoUrl;
          })(),
          (async () => {
            if (files.card) return await uploadFile(files.card, `teams/${targetId}/card_${Date.now()}`);
            // Only re-process external URL if it is DIFFERENT from what we currently have saved
            if (formData.leaderCardUrl && formData.leaderCardUrl !== team?.leaderCardUrl && !formData.leaderCardUrl.includes('firebasestorage.googleapis.com')) {
              return await uploadExternalImageToStorage(formData.leaderCardUrl, `teams/${targetId}/cards`);
            }
            return formData.leaderCardUrl;
          })()
        ]),
        // 3. Fetch user doc for sync
        getDoc(doc(db, 'users', actualUserId))
      ]);

      // --- Process Uniqueness Results ---
      if (uniquenessResult) {
        const [teamsSnap, regsSnap] = uniquenessResult;
        const conflict = teamsSnap.docs.find(d => (team ? d.id !== team.id : d.id !== targetId));
        if (conflict) {
          const matchedUid = currentPlayers.find(uid => (conflict.data().players as string[]).includes(uid));
          const conflictIdx = playersRaw.findIndex(u => u === matchedUid);
          if (conflictIdx !== -1) setErrorFields([conflictIdx]);
          throw new Error(`Player UID ${matchedUid} is already on active team "${conflict.data().teamName}".`);
        }

        if (!regsSnap.empty) {
          const matchedUid = currentPlayers.find(uid => (regsSnap.docs[0].data().players as string[]).includes(uid));
          const conflictIdx = playersRaw.findIndex(u => u === matchedUid);
          if (conflictIdx !== -1) setErrorFields([conflictIdx]);
          throw new Error(`Player UID ${matchedUid} is in a pending registration for team "${regsSnap.docs[0].data().teamName}".`);
        }
      }

      const [logoUrl, leaderCardUrl] = uploadedImages;

      // --- Final Write Batch ---
      const batch = writeBatch(db);
      
      const teamIdToUpdate = team?.id;
      if (teamIdToUpdate) {
        const teamRef = doc(db, 'teams', teamIdToUpdate);
        batch.update(teamRef, {
          teamName: formData.teamName,
          leaderName: formData.leaderName,
          phoneNumber: formData.phoneNumber,
          logoUrl,
          leaderCardUrl,
          gameId: formData.gameId,
          serverId: formData.serverId,
          players: currentPlayers,
          updatedAt: serverTimestamp()
        });
      }

      if (userSnap.exists()) {
        const userUpdate: any = {
          teamName: formData.teamName,
          leaderName: formData.leaderName,
          displayName: formData.leaderName,
          phoneNumber: formData.phoneNumber,
          logoUrl,
          gameId: formData.gameId,
          serverId: formData.serverId,
          updatedAt: serverTimestamp()
        };
        if (isAdmin) userUpdate.email = formData.email;
        batch.update(userSnap.ref, userUpdate);
      }

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `batch-save/user-team`);
      }
      
      toast.success("Profile updated successfully!", { id: saveToast });
      setSuccess("Profile updated successfully!");
      setFormData(prev => ({ ...prev, logoUrl, leaderCardUrl }));
      setFiles({});
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error(err.message || "Failed to update profile.", { id: saveToast });
      setError(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleEmailUpdate = async () => {
    if (!auth.currentUser || !formData.email || formData.email === auth.currentUser.email) return;
    
    setEmailLoading(true);
    setError(null);
    setEmailSuccess(null);

    try {
      await updateEmail(auth.currentUser, formData.email.trim());
      setEmailSuccess(`Email successfully updated to ${formData.email}.`);
    } catch (err: any) {
      console.error("Email update error:", err);
      if (err.code === 'auth/requires-recent-login') {
        setError("This sensitive operation requires a recent login. Please log out and log back in, then try again.");
      } else if (err.code === 'auth/invalid-credential') {
        setError("Your session is invalid or expired. Please log out and log back in to update your email.");
      } else if (err.code === 'auth/email-already-in-use') {
        setError("This email is already in use by another account.");
      } else {
        setError(err.message || "Failed to initiate email update.");
      }
    } finally {
      setEmailLoading(false);
    }
  };

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      toast.error("Profile editing is currently disabled.");
      return;
    }
    const actualUserId = targetId || user?.id;
    if (!actualUserId) return;
    
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const cleanPhone = (formData.phoneNumber || '').replace(/\D/g, '');
      if (cleanPhone.length !== 11) {
        setError("WhatsApp number must be exactly 11 digits.");
        setSaving(false);
        return;
      }

      try {
        await setDoc(doc(db, 'users', actualUserId), {
          phoneNumber: formData.phoneNumber,
          email: formData.email || auth.currentUser?.email || '',
          gameId: formData.gameId || '',
          serverId: formData.serverId || '',
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${actualUserId}`);
      }
      setSuccess("Profile updated successfully!");
    } catch (err: any) {
      console.error("Personal save error:", err);
      setError(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const getUpgradeCost = (currentRank: string) => {
    const rankIndex = RANKS.indexOf(currentRank);
    if (rankIndex === -1) return 500;
    return 500 * Math.pow(2, rankIndex);
  };

  const currentUpgradeCost = team ? getUpgradeCost(team.rank || 'E') : 500;

  const handleUpgradeRank = async () => {
    if (!team || !team.id || !targetId) return;
    const currentRank = team.rank || 'E';
    const rankIndex = RANKS.indexOf(currentRank);
    if (rankIndex === -1 || rankIndex >= RANKS.length - 1) return;
    
    const upgradeCost = getUpgradeCost(currentRank);
    
    if (team.points < upgradeCost) {
      setError(`Insufficient points to upgrade rank (requires ${upgradeCost} points).`);
      return;
    }
    
    setUpgradingRank(true);
    setError(null);
    setSuccess(null);
    
    try {
      if (!auth.currentUser) throw new Error("Not logged in");
      
      const nextRank = RANKS[rankIndex + 1];
      const batch = writeBatch(db);

      const targetTeamRef = doc(db, 'teams', team.id);
      batch.update(targetTeamRef, {
        points: increment(-upgradeCost),
        rank: nextRank
      });
      
      const ownerToUpdate = auth.currentUser.uid;
      const userRef = doc(db, 'users', ownerToUpdate);
      batch.update(userRef, {
        points: increment(-upgradeCost)
      });
      
      const transRef = doc(collection(db, 'transactions'));
      batch.set(transRef, {
        teamId: team.id,
        ownerId: ownerToUpdate,
        type: 'shop',
        points: -upgradeCost,
        diamonds: 0,
        reason: `Upgraded Rank to ${nextRank}`,
        timestamp: serverTimestamp()
      });
      
      await batch.commit();

      setTeam({ ...team, points: team.points - upgradeCost, rank: nextRank });
      setSuccess(`Rank upgraded to ${nextRank}!`);
    } catch (err: any) {
      console.error("Rank upgrade error:", err);
      setError(err.message || "Failed to upgrade rank.");
    } finally {
      setUpgradingRank(false);
    }
  };

  const handleReload = async () => {
    if (!auth.currentUser) return;
    setEmailLoading(true);
    try {
      await auth.currentUser.reload();
      // Update form data if email changed in auth
      if (auth.currentUser.email) {
        setFormData(prev => ({ ...prev, email: auth.currentUser?.email || prev.email }));
        setEmailSuccess(null); // Clear success message once verified/reloaded
      }
    } catch (err) {
      console.error("Reload error:", err);
    } finally {
      setEmailLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-neon-blue" size={48} />
      </div>
    );
  }

  const isLocked = !isAdmin && !isModerator && settings?.profileEditsEnabled === false;

  if (!team && !loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-8 p-10 text-center">
        {isAdmin ? (
          <div className="glass-card p-12 max-w-2xl w-full border-neon-blue/30 space-y-6">
            <div className="w-20 h-20 bg-neon-blue/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-neon-blue/40">
              <Shield className="text-neon-blue" size={40} />
            </div>
            <h1 className="text-4xl font-black italic uppercase italic tracking-tighter">ADMIN <span className="text-neon-blue">DASHBOARD</span></h1>
            <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">
              WELCOME BACK, COMMANDER. YOU ARE IN CONTROL OF THE MGB GUILD SYSTEM.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6">
              <Link to="/admin" className="px-6 py-4 bg-neon-blue text-black font-black uppercase tracking-widest rounded-xl hover:brightness-110 transition-all flex items-center justify-center gap-2">
                <Shield size={18} />
                MANAGE GUILD
              </Link>
              <Link to="/registration" className="px-6 py-4 bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                <Users size={18} />
                NEW REGISTRATION
              </Link>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-lg glass-card p-10 border-neon-blue/30 space-y-6 relative overflow-hidden">
            {pendingRegistration && (
              <div className="absolute top-0 left-0 w-full bg-yellow-500/20 border-b border-yellow-500/50 p-2 text-center">
                <span className="text-[10px] font-black uppercase text-yellow-500 tracking-widest flex items-center justify-center gap-2">
                  <Loader2 size={12} className="animate-spin" />
                  YOUR TEAM REGISTRATION IS PENDING APPROVAL
                </span>
              </div>
            )}
            <div className={`mx-auto w-16 h-16 bg-neon-blue/20 rounded-full flex items-center justify-center border border-neon-blue/40 mb-4 ${pendingRegistration ? 'mt-6' : ''}`}>
              <User size={32} className="text-neon-blue" />
            </div>
            <h2 className="text-2xl font-black italic uppercase">PLAYER <span className="text-neon-blue">PROFILE</span></h2>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
              {pendingRegistration 
                ? "You will be able to manage your full team profile once an admin approves it." 
                : "You do not have a registered team."}
              <br/><br/>You can update your personal information below.
            </p>

            {isLocked && (
              <div className="mt-4 bg-yellow-500/10 border border-yellow-500/50 text-yellow-500 p-4 rounded-xl flex items-center gap-3">
                <Lock size={20} />
                <p className="text-sm font-bold uppercase">PROFILE EDITING IS DISABLED BY ADMIN.</p>
              </div>
            )}
            
            <form onSubmit={handleSavePersonal} className="space-y-6 text-left mt-6">
              <fieldset disabled={isLocked} className="space-y-6 disabled:opacity-50">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Player UID (Game ID)</label>
                    <input
                      type="text"
                      name="gameId"
                      inputMode="numeric"
                      value={formData.gameId || ''}
                      onChange={handleInputChange}
                      placeholder="e.g. 12345678"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 focus:outline-none focus:border-neon-blue transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Server ID</label>
                    <input
                      type="text"
                      name="serverId"
                      inputMode="numeric"
                      value={formData.serverId || ''}
                      onChange={handleInputChange}
                      placeholder="e.g. 1234"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 focus:outline-none focus:border-neon-blue transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">WhatsApp / Phone Number</label>
                  <input
                    type="text"
                    name="phoneNumber"
                    value={formData.phoneNumber || ''}
                    onChange={handleInputChange}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 focus:outline-none focus:border-neon-blue transition-all"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-xl flex items-center gap-3">
                    <AlertCircle size={20} />
                    <p className="text-sm font-bold uppercase">{error}</p>
                  </div>
                )}
                {success && (
                  <div className="bg-green-500/10 border border-green-500/50 text-green-500 p-4 rounded-xl flex items-center gap-3">
                    <CheckCircle size={20} />
                    <p className="text-sm font-bold uppercase">{success}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving || isLocked}
                  className="w-full bg-neon-blue text-black font-black uppercase tracking-widest py-4 rounded-xl hover:neon-glow-blue transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                {saving ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <Save size={20} />
                    UPDATE PROFILE
                  </>
                )}
              </button>
              </fieldset>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="py-6 md:py-10 max-w-4xl mx-auto space-y-8 md:space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 px-1">
        <div className="space-y-1 text-center md:text-left w-full md:w-auto">
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-black italic uppercase tracking-tighter">
            {isAdmin ? 'MANAGE' : 'TEAM'} <span className="gaming-text-stroke">{isAdmin ? 'TEAM' : 'PROFILE'}</span>
          </h1>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] md:text-xs">
            {isAdmin ? `EDITING: ${team?.teamName}` : 'Manage your guild identifiers and roster'}
          </p>
        </div>
        
        {isAdmin && (
          <div className="flex gap-2 w-full md:w-auto justify-center md:justify-end">
            <Link to="/admin" className="text-[10px] font-black uppercase tracking-widest text-neon-blue border border-neon-blue/30 px-4 py-3 rounded-lg hover:bg-neon-blue/10 transition-all flex items-center gap-2 flex-1 md:flex-none justify-center">
              <Shield size={14} />
              ADMIN
            </Link>
            {searchParams.get('id') && (
              <Link to="/admin" className="text-[10px] font-black uppercase tracking-widest text-white border border-white/30 px-4 py-3 rounded-lg hover:bg-white/10 transition-all flex-1 md:flex-none text-center">
                BACK
              </Link>
            )}
          </div>
        )}
      </div>

      {userTeams.length > 1 && (
        <div className="glass-card p-4 flex flex-col md:flex-row items-center gap-4 border-neon-blue/20">
          <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest whitespace-nowrap">Selected Team</label>
          <select 
            className="w-full md:w-auto bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm font-bold focus:border-neon-blue outline-none transition-colors"
            value={team?.id || ''}
            onChange={(e) => setSelectedTeamId(e.target.value)}
          >
            {userTeams.map(t => (
              <option key={t.id} value={t.id}>{t.teamName}</option>
            ))}
          </select>
        </div>
      )}

      {transactions.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <History className="text-neon-blue" size={20} />
            <h2 className="text-xl font-black uppercase italic tracking-tighter">ACTION <span className="text-neon-blue">HISTORY</span></h2>
          </div>
          <div className="grid gap-3">
            {transactions.map((t, idx) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="glass-card p-4 flex items-center justify-between border-l-2 border-neon-blue/30"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    t.type === 'win' || t.type === 'bonus' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 
                    t.type === 'penalty' || t.type === 'expense' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                    'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                  }`}>
                    {t.type === 'win' || t.type === 'bonus' ? '+' : '-'}
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-white">{t.reason}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock size={10} className="text-gray-500" />
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        {t.timestamp ? ((t.timestamp as any).toMillis ? new Date((t.timestamp as any).toMillis()).toLocaleString() : new Date(t.timestamp).toLocaleString()) : 'TBD'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {t.points !== 0 && (
                    <p className={`text-xs font-black italic ${t.points > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {t.points > 0 ? '+' : ''}{t.points} PTS
                    </p>
                  )}
                  {t.diamonds !== 0 && (
                    <p className={`text-[10px] font-black italic ${t.diamonds > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                      {t.diamonds > 0 ? '+' : ''}{t.diamonds} DIA
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-500 rounded-xl flex items-center gap-3 font-bold uppercase tracking-widest text-xs">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {success && (
          <div className="p-4 bg-green-500/10 border border-green-500/30 text-green-500 rounded-xl flex items-center gap-3 font-bold uppercase tracking-widest text-xs">
            <CheckCircle size={20} />
            {success}
          </div>
        )}

        {isLocked && (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 rounded-xl flex items-center gap-3 font-bold uppercase tracking-widest text-xs">
            <Lock size={20} />
            PROFILE EDITING IS CURRENTLY DISABLED BY ADMIN
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 md:gap-8">
          <div className="glass-card p-6 md:p-8 space-y-6">
            <h3 className="text-lg md:text-xl font-black flex items-center gap-2">
              <Shield className="text-neon-blue" size={20} />
              IDENTITY
            </h3>
            
            <fieldset disabled={isLocked} className="space-y-4 disabled:opacity-50 group-disabled">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Team Name</label>
                <input
                  type="text"
                  name="teamName"
                  value={formData.teamName}
                  onChange={handleInputChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 px-4 focus:outline-none focus:border-neon-blue transition-all text-sm"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Leader Name</label>
                <input
                  type="text"
                  name="leaderName"
                  value={formData.leaderName}
                  onChange={handleInputChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 focus:outline-none focus:border-neon-blue transition-all"
                  placeholder="Leader IGN"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">WhatsApp / Phone Number</label>
                <input
                  type="text"
                  name="phoneNumber"
                  value={formData.phoneNumber || ''}
                  onChange={handleInputChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 focus:outline-none focus:border-neon-blue transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">MLBB Game ID</label>
                  <input
                    type="text"
                    name="gameId"
                    inputMode="numeric"
                    value={formData.gameId}
                    onChange={handleInputChange}
                    placeholder="e.g. 12345678"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 focus:outline-none focus:border-neon-blue transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Server ID</label>
                  <input
                    type="text"
                    name="serverId"
                    inputMode="numeric"
                    value={formData.serverId}
                    onChange={handleInputChange}
                    placeholder="e.g. 1234"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 focus:outline-none focus:border-neon-blue transition-all"
                  />
                </div>
              </div>
            </fieldset>
          </div>

          <div className="glass-card p-6 md:p-8 space-y-6">
            <h3 className="text-lg md:text-xl font-black flex items-center gap-2">
              <Mail className="text-neon-blue" size={20} />
              ACCOUNT
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Email Address</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    disabled={(!isAdmin && targetId !== user?.id) || isLocked}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3.5 px-4 focus:outline-none focus:border-neon-blue transition-all disabled:opacity-50 text-sm"
                  />
                  {targetId === user?.id && formData.email !== auth.currentUser?.email && !isLocked && (
                    <button
                      type="button"
                      onClick={handleEmailUpdate}
                      disabled={emailLoading}
                      className="px-6 bg-neon-blue/10 border border-neon-blue/30 text-neon-blue font-black rounded-xl hover:bg-neon-blue/20 transition-all flex items-center gap-2 whitespace-nowrap"
                    >
                      {emailLoading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                      VERIFY
                    </button>
                  )}
                  {targetId === user?.id && emailSuccess && (
                    <button
                      type="button"
                      onClick={handleReload}
                      disabled={emailLoading}
                      className="px-4 bg-white/5 border border-white/10 text-gray-400 rounded-xl hover:text-neon-blue hover:border-neon-blue transition-all"
                      title="Sync verified email"
                    >
                      {emailLoading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                    </button>
                  )}
                </div>
                {emailSuccess && (
                  <p className="text-[10px] font-black text-green-500 mt-2 uppercase tracking-widest">{emailSuccess}</p>
                )}
                {targetId === user?.id && (
                  <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                    CHANGING EMAIL REQUIRES VERIFICATION LINK SENT TO NEW ADDRESS
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="glass-card p-8 space-y-6">
            <h3 className="text-xl font-black flex items-center gap-2">
              <Camera className="text-neon-blue" />
              ASSETS
            </h3>

            <fieldset disabled={isLocked} className="grid grid-cols-1 sm:grid-cols-2 gap-4 disabled:opacity-50 group-disabled">
              <div className="space-y-4 text-center">
                <div className="relative group mx-auto w-24 h-24 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                  {(previews.logo || formData.logoUrl) ? (
                    <ImageWithFallback src={previews.logo || formData.logoUrl} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20">
                      <Shield size={32} />
                    </div>
                  )}
                  {isAdmin && (
                    <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                      <Camera className="text-white" />
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'logo')} />
                    </label>
                  )}
                </div>
                <div className="flex flex-col gap-2 relative z-10 w-full px-4">
                  <span className="text-[8px] font-black uppercase text-gray-500 text-center">TEAM LOGO</span>
                  <input
                    type="url"
                    name="logoUrl"
                    value={formData.logoUrl}
                    onChange={handleInputChange}
                    placeholder="URL"
                    className="w-full bg-black/40 border border-white/5 rounded py-2 px-3 focus:outline-none focus:border-neon-blue transition-all text-xs"
                  />
                  {isAdmin && formData.logoUrl && formData.logoUrl.match(/(discord|fbcdn|fb)/i) && (
                    <div className="text-[10px] text-yellow-500 flex items-center gap-1 mt-1 text-left leading-tight">
                      <AlertCircle size={10} className="shrink-0" />
                      Link might expire. Please upload directly.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 text-center">
                <div className="relative group mx-auto w-24 h-24 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                  {(previews.card || formData.leaderCardUrl) ? (
                    <ImageWithFallback src={previews.card || formData.leaderCardUrl} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20">
                      <User size={32} />
                    </div>
                  )}
                  {isAdmin && (
                    <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                      <Camera className="text-white" />
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'card')} />
                    </label>
                  )}
                </div>
                <div className="flex flex-col gap-2 relative z-10 w-full px-4">
                  <span className="text-[8px] font-black uppercase text-gray-500 text-center">LEADER CARD</span>
                  <input
                    type="url"
                    name="leaderCardUrl"
                    value={formData.leaderCardUrl}
                    onChange={handleInputChange}
                    placeholder="URL"
                    className="w-full bg-black/40 border border-white/5 rounded py-2 px-3 focus:outline-none focus:border-neon-blue transition-all text-xs"
                  />
                  {isAdmin && formData.leaderCardUrl && formData.leaderCardUrl.match(/(discord|fbcdn|fb)/i) && (
                    <div className="text-[10px] text-yellow-500 flex items-center gap-1 mt-1 text-left leading-tight">
                      <AlertCircle size={10} className="shrink-0" />
                      Link might expire. Please upload directly.
                    </div>
                  )}
                </div>
              </div>
            </fieldset>
          </div>

          <div className="glass-card p-6 md:p-8 space-y-6">
            <h3 className="text-lg md:text-xl font-black flex items-center gap-2">
              <Shield className="text-neon-blue" size={20} />
              ECONOMY & RANK
            </h3>
            
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/40 border border-white/5 rounded-xl p-4 text-center">
                  <div className="text-[10px] font-black uppercase text-gray-500 mb-1">CURRENT POINTS</div>
                  <div className="text-xl font-black text-neon-blue">{team?.points || 0}</div>
                </div>
                <div className="bg-black/40 border border-white/5 rounded-xl p-4 text-center">
                  <div className="text-[10px] font-black uppercase text-gray-500 mb-1">DIAMONDS</div>
                  <div className="text-xl font-black text-blue-400">{team?.diamonds || 0}</div>
                </div>
              </div>
              
              <div className="bg-neon-blue/10 border border-neon-blue/30 rounded-xl p-5 text-center space-y-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#4ade80]">Team Rank</div>
                <div className="text-5xl font-black italic gaming-text-stroke-sm text-yellow-500">{team?.rank || 'E'}</div>
                <div className="text-[10px] font-bold uppercase text-gray-400">
                  Bonus per win: <span className="text-neon-blue font-black">+{getRankBonus(team?.rank || 'E')} pts/dia</span>
                </div>
                
                {targetId === user?.id && RANKS.indexOf(team?.rank || 'E') < RANKS.length - 1 && (
                  <button
                    type="button"
                    onClick={handleUpgradeRank}
                    disabled={upgradingRank || (team?.points || 0) < currentUpgradeCost}
                    className="w-full mt-4 bg-[#fde047] text-black hover:bg-yellow-500 px-4 py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {upgradingRank ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <>
                        <Shield size={16} />
                        UPGRADE RANK (COST: {currentUpgradeCost} PTS)
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 md:p-8 space-y-6">
          <h3 className="text-lg md:text-xl font-black flex items-center gap-2">
            <Users className="text-neon-blue" size={20} />
            ROSTER
          </h3>

          <fieldset disabled={isLocked} className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 disabled:opacity-50">
            {formData.players.map((player, index) => (
              <div key={index} className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                  {index < 5 ? `Player ${index + 1} UID` : `Sub Player ${index - 4} UID (Optional)`}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={player}
                  onChange={(e) => handlePlayerChange(index, e.target.value)}
                  className={`w-full bg-white/5 border rounded-xl py-3 px-4 focus:outline-none transition-all ${
                    errorFields.includes(index)
                      ? 'border-neon-red/50 bg-neon-red/5 text-neon-red placeholder:text-neon-red/40'
                      : 'border-white/10 focus:border-neon-blue'
                  }`}
                  placeholder={index < 5 ? "UID (Numbers Only)" : "UID (Sub - Optional)"}
                />
              </div>
            ))}
          </fieldset>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={saving || isLocked}
            className="group relative bg-neon-blue hover:bg-neon-blue/80 disabled:opacity-50 text-black font-black px-12 py-4 rounded-xl flex items-center justify-center gap-3 transition-all w-full md:w-auto shadow-[0_0_20px_rgba(0,229,255,0.2)]"
          >
            {saving ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              <>
                <Save size={24} />
                SAVE CHANGES
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Profile;
