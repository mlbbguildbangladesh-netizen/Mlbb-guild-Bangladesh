import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, storage, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, updateDoc, writeBatch, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { updateEmail } from 'firebase/auth';
import { Team } from '../types';
import { motion } from 'framer-motion';
import { Shield, User, Camera, Save, Loader2, AlertCircle, CheckCircle, Users, Mail, Send, RefreshCw, Lock } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { FALLBACK_IMAGE, RANKS, getRankBonus, uploadExternalImageToStorage } from '../lib/utils';
import { useSearchParams, Link } from 'react-router-dom';

const Profile: React.FC = () => {
  const { user, isAdmin, settings } = useAuth();
  const [searchParams] = useSearchParams();
  const targetId = searchParams.get('id') || (isAdmin ? null : user?.id);

  const [team, setTeam] = useState<Team | null>(null);
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
    const fetchTeam = async () => {
      if (!targetId) {
        setLoading(false);
        return;
      }
      
      setLoading(true);

      try {
        let teamDoc;
        
        if (isAdmin && searchParams.get('id')) {
          // Admin viewing specific team via search param
          teamDoc = await getDoc(doc(db, 'teams', targetId));
        } else {
          // Regular user or admin's personal view: search by ownerId
          const teamsQuery = query(collection(db, 'teams'), where('ownerId', '==', targetId));
          const querySnap = await getDocs(teamsQuery);
          if (!querySnap.empty) {
            teamDoc = querySnap.docs[0];
          } else {
            // Fallback for legacy teams that used userId as Document ID
            const fallbackDoc = await getDoc(doc(db, 'teams', targetId));
            if (fallbackDoc.exists()) {
              teamDoc = fallbackDoc;
            } else {
              // Check if they have a pending registration
              try {
                const regQuery = query(collection(db, 'registrations'), where('ownerId', '==', targetId));
                const regSnap = await getDocs(regQuery);
                if (!regSnap.empty) {
                  const isPending = regSnap.docs.some(d => d.data().status === 'pending');
                  setPendingRegistration(isPending);
                }
              } catch(e) {
                console.warn("Could not fetch registrations:", e);
              }
            }
          }
        }

        let userSnap: any = { exists: () => false, data: () => ({}) };
        try {
          userSnap = await getDoc(doc(db, 'users', targetId || user?.id || ''));
        } catch(e) {
          console.warn("Could not fetch user document (might not be owner)");
        }
        
        if (teamDoc && teamDoc.exists()) {
          const teamData = { id: teamDoc.id, ...teamDoc.data() } as Team;
          setTeam(teamData);
          
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
          // Team doesn't exist, but we have user data (maybe they want to update their number before creating a team)
          setFormData(prev => ({
            ...prev,
            email: userSnap.data().email || (targetId === user?.id ? auth.currentUser?.email : '') || '',
            phoneNumber: userSnap.data().phoneNumber || ''
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
  }, [targetId, isAdmin, searchParams]);

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
    if (!targetId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    setEmailSuccess(null);

    try {
      const cleanPhone = (formData.phoneNumber || '').replace(/\D/g, '');
      if (cleanPhone.length !== 11) {
        setError("WhatsApp number must be exactly 11 digits.");
        setSaving(false);
        return;
      }

      // --- UID Uniqueness Check ---
      const playersRaw = formData.players;
      const players = playersRaw.filter(p => p.trim() !== '');
      
      // Internal duplicates check
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
        setError("Duplicate player UIDs found in your team roster.");
        setErrorFields([...new Set(duplicates)]);
        setSaving(false);
        return;
      }

      if (players.length > 0) {
        // 1. Check existing approved teams, excluding current team
        const teamsQuery = query(collection(db, 'teams'), where('players', 'array-contains-any', players));
        const teamsSnapshot = await getDocs(teamsQuery);
        
        // Filter out current team if it's in the results
        const conflict = teamsSnapshot.docs.find(d => (team ? d.id !== team.id : d.id !== targetId));
        
        if (conflict) {
          const conflictingTeamData = conflict.data();
          const teamName = conflictingTeamData.teamName;
          const matchedUid = players.find(uid => (conflictingTeamData.players as string[]).includes(uid));
          
          const conflictIdx = playersRaw.findIndex(u => u === matchedUid);
          if (conflictIdx !== -1) setErrorFields([conflictIdx]);

          setError(`This player (${matchedUid}) is already registered on ${teamName}.`);
          setSaving(false);
          return;
        }

        // 2. Check pending registrations (to prevent double-claiming players)
        const regQuery = query(
          collection(db, 'registrations'), 
          where('status', '==', 'pending'),
          where('players', 'array-contains-any', players)
        );
        const regSnapshot = await getDocs(regQuery);
        
        if (!regSnapshot.empty) {
          const conflictingRegData = regSnapshot.docs[0].data();
          const teamName = conflictingRegData.teamName;
          const matchedUid = players.find(uid => (conflictingRegData.players as string[]).includes(uid));
          
          const conflictIdx = playersRaw.findIndex(u => u === matchedUid);
          if (conflictIdx !== -1) setErrorFields([conflictIdx]);

          setError(`Player UID ${matchedUid} is already in a pending registration for team "${teamName}".`);
          setSaving(false);
          return;
        }
      }
      // --- End UID Uniqueness Check ---

      let logoUrl = formData.logoUrl;
      let leaderCardUrl = formData.leaderCardUrl;

      if (files.logo) {
        logoUrl = await uploadFile(files.logo, `teams/${targetId}/logo_${Date.now()}`);
      } else if (logoUrl && !files.logo) {
        logoUrl = await uploadExternalImageToStorage(logoUrl, `teams/${targetId}/logos`);
      }
      
      if (files.card) {
        leaderCardUrl = await uploadFile(files.card, `teams/${targetId}/card_${Date.now()}`);
      } else if (leaderCardUrl && !files.card) {
        leaderCardUrl = await uploadExternalImageToStorage(leaderCardUrl, `teams/${targetId}/cards`);
      }

      const batch = writeBatch(db);
      
      // Update Team doc
      const teamRef = doc(db, 'teams', targetId);
      batch.update(teamRef, {
        teamName: formData.teamName,
        leaderName: formData.leaderName,
        phoneNumber: formData.phoneNumber,
        logoUrl,
        leaderCardUrl,
        gameId: formData.gameId,
        serverId: formData.serverId,
        players: formData.players.filter(p => p.trim() !== '')
      });

      // Update User doc (if applicable)
      let actualUserId = targetId;
      if (isAdmin && team?.ownerId) {
        actualUserId = team.ownerId;
      }

      const userRef = doc(db, 'users', actualUserId);
      let userDoc;
      try {
        userDoc = await getDoc(userRef);
      } catch (err) {
        // Silently fail if user doc doesn't exist for this target
        console.warn("User doc not found for profile update:", actualUserId);
      }

      if (userDoc && userDoc.exists()) {
        const userUpdate: any = {
          teamName: formData.teamName,
          leaderName: formData.leaderName,
          displayName: formData.leaderName, // Sync display name with leader name
          phoneNumber: formData.phoneNumber,
          logoUrl,
          gameId: formData.gameId,
          serverId: formData.serverId
        };
        
        // Admin can directly update the email in the users document
        if (isAdmin) {
          userUpdate.email = formData.email;
        }

        batch.update(userRef, userUpdate);
      }

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `teams/${targetId} and users/${actualUserId}`);
      }

      setSuccess("Profile updated successfully!");
      setFormData(prev => ({ ...prev, logoUrl, leaderCardUrl }));
      setFiles({});
    } catch (err: any) {
      console.error("Save error:", err);
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

      await updateDoc(doc(db, 'users', actualUserId), {
        phoneNumber: formData.phoneNumber
      });
      setSuccess("Profile updated successfully!");
    } catch (err: any) {
      console.error("Personal save error:", err);
      setError(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpgradeRank = async () => {
    if (!team || !targetId) return;
    const currentRank = team.rank || 'E';
    const rankIndex = RANKS.indexOf(currentRank);
    if (rankIndex === -1 || rankIndex >= RANKS.length - 1) return;
    
    if (team.points < 500) {
      setError("Insufficient points to upgrade rank (requires 500 points).");
      return;
    }
    
    setUpgradingRank(true);
    setError(null);
    setSuccess(null);
    
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not logged in");
      
      const res = await fetch('/api/shop/upgrade-rank', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetId })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upgrade rank");
      
      const nextRank = RANKS[rankIndex + 1];
      setTeam({ ...team, points: team.points - 500, rank: nextRank });
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

  const isLocked = !isAdmin && settings?.playerEditsLocked === true;

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
                <p className="text-sm font-bold uppercase">PROFILE EDITING IS LOCKED BY ADMIN.</p>
              </div>
            )}
            
            <form onSubmit={handleSavePersonal} className="space-y-6 text-left mt-6">
              <fieldset disabled={isLocked} className="space-y-6 disabled:opacity-50">
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
            PROFILE EDITING IS CURRENTLY LOCKED BY ADMIN
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
                    disabled={upgradingRank || (team?.points || 0) < 500}
                    className="w-full mt-4 bg-[#fde047] text-black hover:bg-yellow-500 px-4 py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {upgradingRank ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <>
                        <Shield size={16} />
                        UPGRADE RANK (COST: 500 PTS)
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
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Player {index + 1} UID</label>
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
                  placeholder="UID (Numbers Only)"
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
