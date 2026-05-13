import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { createNotification, notifyAdmins } from '../lib/notificationUtils';
import { 
  Users, 
  UserPlus, 
  MessageSquare, 
  Facebook, 
  Clock, 
  Search, 
  Filter, 
  X, 
  Trash2, 
  Shield,
  Gamepad2,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Crosshair,
  List,
  Star
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc,
  writeBatch,
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { SoloPlayer, Team, RecruitmentRequest } from '../types';
import toast from 'react-hot-toast';

const ROLES = [
  'Tank',
  'Fighter',
  'Assassin',
  'Mage',
  'Marksman',
  'Support'
];

export default function SoloPlayers() {
  const { user, isAdmin, isModerator, settings } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [players, setPlayers] = useState<SoloPlayer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [requests, setRequests] = useState<RecruitmentRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'hire' | 'join' | 'all'>('hire');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'hire' || tab === 'join' || tab === 'all') {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const canRecruit = useMemo(() => {
    if (isAdmin || isModerator) return true;
    if (!user) return false;
    
    // Check if user is a team leader with available recruitment slots
    const myTeam = teams.find(t => t.ownerId === user.id);
    if (myTeam && (myTeam.recruitmentSlots || 0) > 0) return true;

    // Check global authorized recruiters list
    if (settings?.authorizedRecruiters?.includes(user.id)) return true;
    
    return false;
  }, [user, isAdmin, isModerator, settings?.authorizedRecruiters, teams]);

  const currentTeam = useMemo(() => teams.find(t => t.ownerId === user?.id), [teams, user]);

  useEffect(() => {
    const pQ = query(collection(db, 'soloPlayers'), orderBy('createdAt', 'desc'));
    const tQ = query(collection(db, 'teams'), orderBy('createdAt', 'desc'));
    const rQ = query(collection(db, 'recruitmentRequests'), orderBy('createdAt', 'desc'));

    const unsubP = onSnapshot(pQ, (snap) => setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() } as SoloPlayer))), e => handleFirestoreError(e, OperationType.LIST, 'soloPlayers'));
    const unsubT = onSnapshot(tQ, (snap) => setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Team))), e => handleFirestoreError(e, OperationType.LIST, 'teams'));
    const unsubR = onSnapshot(rQ, (snap) => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as RecruitmentRequest))), e => handleFirestoreError(e, OperationType.LIST, 'recruitmentRequests'));

    const timer = setTimeout(() => setLoading(false), 1000);

    return () => { unsubP(); unsubT(); unsubR(); clearTimeout(timer); };
  }, []);

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('All');

  const [formData, setFormData] = useState({
    name: '',
    gameId: '',
    whatsapp: '',
    fbLink: '',
    mainRole: '',
    subRoles: [] as string[],
    activeTime: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userSoloProfile = useMemo(() => players.find(p => p.userId === user?.id), [players, user]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Please login to register.");
    if (settings?.allowSoloRegistration === false && !isAdmin && !isModerator && !userSoloProfile) return toast.error("Registration is currently disabled.");
    if (!formData.mainRole) return toast.error("Please select a main role.");

    setIsSubmitting(true);
    try {
      const playerId = user.id;
      const dataToSave = {
        userId: user.id,
        ...formData,
        status: userSoloProfile?.status || 'active', // default
      };
      if (!userSoloProfile) {
        (dataToSave as any).createdAt = serverTimestamp();
      }
      await setDoc(doc(db, 'soloPlayers', playerId), dataToSave, { merge: true });
      
      // Notify Admin if new profile
      if (!userSoloProfile) {
        await notifyAdmins(
          'New Mercenary Registered',
          `Player "${formData.name}" has registered as a solo player.`,
          'system',
          '/solo-players',
          settings
        );
      }

      toast.success(userSoloProfile ? "Profile updated!" : "Profile registered successfully!");
      setShowRegisterModal(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this profile?")) return;
    try {
      await deleteDoc(doc(db, 'soloPlayers', id));
      toast.success("Profile deleted.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `soloPlayers/${id}`);
    }
  };

  const toggleStatus = async () => {
    if (!userSoloProfile) return;
    try {
      const newStatus = userSoloProfile.status === 'booked' ? 'active' : 'booked';
      await updateDoc(doc(db, 'soloPlayers', userSoloProfile.id), { status: newStatus });
      toast.success(`Status updated to ${newStatus.toUpperCase()}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `soloPlayers/${userSoloProfile.id}`);
    }
  };

  const createRequest = async (type: 'playerToTeam' | 'teamToPlayer', playerId: string, teamId: string) => {
    if (!user) return toast.error("Login required.");
    try {
       const reqRef = doc(collection(db, 'recruitmentRequests'));
       await setDoc(reqRef, {
         type,
         playerId,
         teamId,
         status: 'pending',
         createdAt: serverTimestamp()
       });
       
        // Notifications
        if (type === 'teamToPlayer') {
          const team = teams.find(t => t.id === teamId);
          await createNotification(
            playerId,
            'Recruitment Offer',
            `${team?.teamName || 'A team'} wants to hire you as a mercenary!`,
            'recruitment',
            '/solo-players?tab=hire'
          );
        } else {
          const team = teams.find(t => t.id === teamId);
          if (team?.ownerId) {
            await createNotification(
              team.ownerId,
              'New Recruitment Request',
              `${user.displayName || 'A player'} requested to join your team!`,
              'recruitment',
              '/solo-players?tab=join'
            );
          }
        }

       toast.success("Request sent!");
    } catch(err){
       handleFirestoreError(err, OperationType.CREATE, 'recruitmentRequests');
    }
  };

  const [showSlotModal, setShowSlotModal] = useState(false);
  const [pendingAcceptReq, setPendingAcceptReq] = useState<{req: RecruitmentRequest, team: Team} | null>(null);

  const cancelRequest = async (reqId: string) => {
    try {
      await deleteDoc(doc(db, 'recruitmentRequests', reqId));
      toast.success("Request cancelled.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `recruitmentRequests/${reqId}`);
    }
  };

  const assignPlayerToSlot = async (slotIndex: number) => {
    if (!pendingAcceptReq) return;
    const { req, team } = pendingAcceptReq;
    
    // Find the player
    const player = players.find(p => p.userId === req.playerId);
    if (!player) return;

    try {
      const res = await fetch('/api/recruitment/assign-slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqId: req.id, slotIndex })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to assign player");
      }

      await createNotification(
        player.userId,
        'Recruitment ACCEPTED',
        `Your request to join ${team.teamName} was accepted! You have been added to slot ${slotIndex + 1}.`,
        'recruitment',
        '/solo-players?tab=join'
      );

      toast.success(`Player assigned to Slot ${slotIndex + 1}`);
      setShowSlotModal(false);
      setPendingAcceptReq(null);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to assign player.");
    }
  };

  const updateRequestStatus = async (reqId: string, status: 'accepted' | 'rejected') => {
    try {
      const req = requests.find(r => r.id === reqId);
      if (!req) return;

      const team = teams.find(t => t.id === req.teamId);
      const player = players.find(p => p.userId === req.playerId);

      if (status === 'accepted') {
        if (req.type === 'playerToTeam' && team && (team.ownerId === user?.id || isAdmin || isModerator)) {
          // Team leader (or admin) accepting a player - show slot modal
          setPendingAcceptReq({ req, team });
          setShowSlotModal(true);
          return;
        }

        if (team && player) {
          // Direct acceptance (e.g. player accepting hire offer)
          if (req.type === 'teamToPlayer' && player.userId === user?.id) {
            try {
              const res = await fetch('/api/recruitment/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reqId, playerId: player.userId })
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Failed to accept offer');
            } catch (err: any) {
              toast.error(err.message);
              return;
            }
          }
        }
      } else {
        await updateDoc(doc(db, 'recruitmentRequests', reqId), { status });
      }
      
      // Notify the requester
      if (team) {
        if (req.type === 'playerToTeam') {
          // Player requested to join team, notify player of decision
          await createNotification(
            req.playerId,
            `Recruitment ${status.toUpperCase()}`,
            `Your request to join ${team?.teamName || 'the team'} was ${status}. ${status === 'accepted' ? 'You are now part of the roster!' : ''}`,
            'recruitment',
            '/solo-players?tab=join'
          );
        } else {
          // Team requested to hire player, notify team owner of decision
          if (team?.ownerId) {
            await createNotification(
              team.ownerId,
              `Hire Offer ${status.toUpperCase()}`,
              `${player?.name || 'The player'} ${status} your hire offer. ${status === 'accepted' ? 'They have been added to your roster!' : ''}`,
              'recruitment',
              '/solo-players?tab=hire'
            );
          }
        }
      }

      toast.success(`Request ${status}!`);
    } catch(err){
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `recruitmentRequests/${reqId}`);
    }
  };

  const handleSetRating = async (playerId: string, rating: number) => {
    try {
      const player = players.find(p => p.id === playerId);
      if (!player) return;

      await updateDoc(doc(db, 'soloPlayers', playerId), { rating });
      
      await createNotification(
        player.userId,
        'Profile Rated!',
        `Your profile was rated ${rating} stars by an admin. You can now send recruitment requests.`,
        'system',
        '/solo-players?tab=join'
      );

      toast.success("Rating updated!");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `soloPlayers/${playerId}`);
    }
  };

  const toggleSubRole = (role: string) => {
    if (formData.subRoles.includes(role)) {
      setFormData({ ...formData, subRoles: formData.subRoles.filter(r => r !== role) });
    } else {
      if (formData.subRoles.length >= 2) return toast.error("You can select up to 2 sub roles.");
      setFormData({ ...formData, subRoles: [...formData.subRoles, role] });
    }
  };

  const filteredPlayers = useMemo(() => {
    let list = players;
    if (activeTab === 'hire') {
      list = players.filter(p => p.status !== 'booked');
    }
    return list.filter(p => {
      const canView = canRecruit || p.userId === user?.id;
      const matchesSearch = searchTerm === '' || 
                            (canView && (p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                         p.gameId.toLowerCase().includes(searchTerm.toLowerCase())));
      const matchesRole = selectedRoleFilter === 'All' || 
                          p.mainRole === selectedRoleFilter || 
                          p.subRoles.includes(selectedRoleFilter);
      return matchesSearch && matchesRole;
    });
  }, [players, searchTerm, selectedRoleFilter, canRecruit, user, activeTab]);

  const filteredTeams = useMemo(() => {
    return teams.filter(t => t.registrationStatus === 'approved');
  }, [teams]);


  if (settings?.showSoloPlayers === false && !isAdmin && !isModerator) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <Shield size={64} className="text-gray-800" />
        <h2 className="text-2xl font-black italic uppercase tracking-tighter">DATA <span className="text-neon-red">ENCRYPTED</span></h2>
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs max-w-md mx-auto">
          The mercenary directory is currently restricted by high-level command.
        </p>
      </div>
    );
  }

  if (loading) {
     return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-neon-blue border-t-transparent rounded-full animate-spin neon-glow-blue" />
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] animate-pulse">Scanning Bio-Data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20">
      <section className="relative py-20 px-8 overflow-hidden rounded-3xl group">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-xl border border-white/10" />
        <div className="absolute inset-0 bg-gradient-to-br from-neon-blue/10 via-transparent to-neon-purple/10 opacity-50" />
        
        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-neon-blue/10 border border-neon-blue/20 mb-4">
            <Users size={14} className="text-neon-blue" />
            <span className="text-[10px] font-black tracking-[0.3em] text-neon-blue uppercase">Recruitment Hub</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter uppercase leading-none">
            RECRUITMENT <span className="text-neon-blue">CENTER</span>
          </h1>
          
          <p className="text-gray-400 font-bold uppercase tracking-widest text-xs max-w-2xl mx-auto leading-relaxed">
            Hire tactical units for your team or request to join established guilds. Manage requests and track active mercenaries here.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-8">
            {currentTeam && (
              <div className="flex flex-col items-center gap-2 px-6 py-4 bg-neon-blue/10 border border-neon-blue/20 rounded-xl">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-neon-blue" />
                   <span className="text-xl font-black text-neon-blue">{currentTeam.recruitmentSlots || 0}</span>
                </div>
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Available Recruitment Slots</span>
              </div>
            )}
            
            {!userSoloProfile && user && !isAdmin && !isModerator ? (
              settings?.allowSoloRegistration !== false ? (
                <button 
                  onClick={() => {
                    setFormData({
                      name: user.displayName || user.leaderName || '',
                      gameId: user.gameId || '',
                      whatsapp: user.phoneNumber || '',
                      fbLink: '',
                      mainRole: '',
                      subRoles: [],
                      activeTime: ''
                    });
                    setShowRegisterModal(true);
                  }}
                  className="group relative px-8 py-4 bg-neon-blue text-black font-black rounded-xl text-xs shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:scale-105 transition-all flex items-center gap-2"
                >
                  <UserPlus size={16} />
                  REGISTER AS PLAYER
                </button>
              ) : (
                <div className="flex items-center gap-3 px-6 py-4 bg-white/5 border border-white/10 rounded-xl text-xs font-black text-gray-500 uppercase italic">
                  <Shield size={16} className="opacity-50" />
                  REGISTRATION RESTRICTED
                </div>
              )
            ) : userSoloProfile ? (
              <div className="flex flex-wrap items-center justify-center gap-4">
                <div className="px-6 py-4 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase text-neon-blue flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  PROFILE ACTIVE
                </div>
                <button 
                  onClick={() => {
                    setFormData({
                      name: userSoloProfile.name,
                      gameId: userSoloProfile.gameId,
                      whatsapp: userSoloProfile.whatsapp,
                      fbLink: userSoloProfile.fbLink,
                      mainRole: userSoloProfile.mainRole,
                      subRoles: userSoloProfile.subRoles,
                      activeTime: userSoloProfile.activeTime
                    });
                    setShowRegisterModal(true);
                  }}
                  className="px-6 py-4 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase hover:bg-white/10 transition-all"
                >
                  EDIT PROFILE
                </button>
                <button
                  onClick={toggleStatus}
                  className={`px-6 py-4 rounded-xl text-xs font-black uppercase transition-all shadow-lg flex items-center gap-2 ${
                    userSoloProfile.status === 'booked' 
                      ? 'bg-neon-red/20 text-neon-red border border-neon-red/30 hover:bg-neon-red/30' 
                      : 'bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30'
                  }`}
                >
                  {userSoloProfile.status === 'booked' ? 'STATUS: BOOKED (HIDDEN)' : 'STATUS: ACTIVE (VISIBLE)'}
                </button>
              </div>
            ) : !user ? (
               <div className="flex items-center gap-3 px-6 py-4 bg-neon-red/10 border border-neon-red/20 rounded-xl text-xs font-black text-neon-red uppercase">
                 <AlertCircle size={16} />
                 LOGIN REQUIRED TO REGISTER
               </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* TABS */}
      <div className="flex border-b border-white/10">
        <button 
          onClick={() => setActiveTab('hire')} 
          className={`flex-1 py-4 font-black uppercase text-xs transition-colors flex items-center justify-center gap-2 ${activeTab === 'hire' ? 'text-neon-blue border-b-2 border-neon-blue bg-neon-blue/5' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
        >
          <Briefcase size={16}/> Hire Player
        </button>
        <button 
          onClick={() => setActiveTab('join')} 
          className={`flex-1 py-4 font-black uppercase text-xs transition-colors flex items-center justify-center gap-2 ${activeTab === 'join' ? 'text-neon-blue border-b-2 border-neon-blue bg-neon-blue/5' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
        >
          <Crosshair size={16}/> Join Team
        </button>
        <button 
          onClick={() => setActiveTab('all')} 
          className={`flex-1 py-4 font-black uppercase text-xs transition-colors flex items-center justify-center gap-2 ${activeTab === 'all' ? 'text-neon-blue border-b-2 border-neon-blue bg-neon-blue/5' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
        >
          <List size={16}/> All Players
        </button>
      </div>

      {activeTab === 'hire' || activeTab === 'all' ? (
        <>
          <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Filter size={18} className="text-neon-blue mr-2" />
              {['All', ...ROLES].map(role => (
                <button
                  key={role}
                  onClick={() => setSelectedRoleFilter(role)}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                    selectedRoleFilter === role 
                    ? 'bg-neon-blue text-black border-neon-blue' 
                    : 'bg-white/5 text-gray-500 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>

            <div className="relative group w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-neon-blue transition-colors" size={18} />
              <input 
                type="text"
                placeholder={canRecruit ? "SEARCH BY NAME OR UID..." : "SEARCH RESTRICTED..."}
                disabled={!canRecruit}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-xs font-black uppercase tracking-widest focus:outline-none focus:border-neon-blue/50 focus:bg-white/10 disabled:opacity-50 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredPlayers.map((player) => {
              return (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group relative glass-card p-8 space-y-6 hover:border-neon-blue/30 transition-all border-l-4 border-l-transparent hover:border-l-neon-blue flex flex-col"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-black italic tracking-tighter uppercase group-hover:text-neon-blue transition-colors">
                          {(canRecruit || player.userId === user?.id) ? player.name : 'HIDDEN IDENTITY'}
                        </h3>
                        {player.rating && player.rating > 0 && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-400/10 border border-yellow-400/20 rounded-full">
                            <Star size={10} className="text-yellow-400 fill-yellow-400" />
                            <span className="text-[9px] font-black text-yellow-400">{player.rating}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] font-black text-gray-500 tracking-widest uppercase flex items-center gap-2">
                        <Gamepad2 size={12} />
                        UID: {(canRecruit || player.userId === user?.id) ? player.gameId : '********'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(isAdmin || isModerator) && (
                        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              onClick={() => handleSetRating(player.id, star)}
                              className={`p-1 transition-all ${player.rating === star ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400/50'}`}
                            >
                              <Star size={14} className={player.rating && player.rating >= star ? 'fill-current' : ''} />
                            </button>
                          ))}
                        </div>
                      )}
                      {(isAdmin || isModerator || player.userId === user?.id) && (
                        <button 
                          onClick={() => handleDeleteProfile(player.id)}
                          className="p-2 text-gray-600 hover:text-neon-red transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 flex-grow">
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-neon-blue/10 border border-neon-blue/20 text-neon-blue text-[9px] font-black uppercase rounded">
                        MAIN: {player.mainRole}
                      </span>
                      {player.subRoles.map(role => (
                        <span key={role} className="px-3 py-1 bg-white/5 border border-white/10 text-gray-400 text-[9px] font-black uppercase rounded">
                          SUB: {role}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      <Clock size={14} className="text-neon-blue" />
                      ACTIVE: {player.activeTime || 'Flexible'}
                    </div>
                  </div>

                  {/* Contact Links & Hire Button */}
                  <div className="pt-4 border-t border-white/5 space-y-3">
                    {(canRecruit || player.userId === user?.id) ? (
                      <div className="grid grid-cols-2 gap-4">
                        <a 
                          href={`https://wa.me/${player.whatsapp.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="no-referrer"
                          className="flex items-center justify-center gap-2 py-3 bg-neon-green/10 border border-neon-green/20 text-neon-green rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-neon-green/20 transition-all"
                        >
                          <MessageSquare size={14} />
                          WHATSAPP
                        </a>
                        <a 
                          href={player.fbLink}
                          target="_blank"
                          rel="no-referrer"
                          className="flex items-center justify-center gap-2 py-3 bg-[#1877F2]/10 border border-[#1877F2]/20 text-[#1877F2] rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-[#1877F2]/20 transition-all"
                        >
                          <Facebook size={14} />
                          FACEBOOK
                        </a>
                      </div>
                    ) : (
                      <div className="p-4 bg-white/5 border border-white/5 rounded-xl border-dashed">
                        <div className="flex items-center gap-2 text-gray-500 mb-2">
                          <Shield size={12} className="text-neon-blue" />
                          <span className="text-[8px] font-black uppercase tracking-widest">ENCRYPTED DATA</span>
                        </div>
                        <p className="text-[9px] font-bold text-gray-500 uppercase leading-relaxed">
                          Scouting data restricted.
                        </p>
                      </div>
                    )}
                    
                    {currentTeam && activeTab === 'hire' && player.userId !== user?.id && (
                      (() => {
                        const hireReq = requests.find(r => r.teamId === currentTeam.id && r.playerId === player.userId && r.type === 'teamToPlayer' && r.status === 'pending');
                        const joinReq = requests.find(r => r.teamId === currentTeam.id && r.playerId === player.userId && r.type === 'playerToTeam' && r.status === 'pending');
                        
                        if (hireReq) {
                          return (
                            <div className="flex flex-col gap-2">
                              <div className="w-full py-3 bg-white/5 text-gray-500 rounded-lg text-[10px] font-black text-center uppercase tracking-widest border border-white/10">
                                OFFER PENDING
                              </div>
                              <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); cancelRequest(hireReq.id); }}
                                className="text-[9px] font-black text-neon-red hover:underline uppercase tracking-widest text-center"
                              >
                                Cancel Offer
                              </button>
                            </div>
                          );
                        }
                        
                        if (joinReq) {
                          return (
                            <div className="space-y-2">
                              <div className="w-full py-3 bg-neon-green/10 text-neon-green rounded-lg text-[10px] font-black text-center uppercase tracking-widest border border-neon-green/20">
                                REQUESTED TO JOIN
                              </div>
                              <div className="flex gap-2">
                                <button 
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); updateRequestStatus(joinReq.id, 'accepted'); }}
                                  className="flex-1 py-3 bg-neon-green text-black text-[9px] font-black rounded uppercase hover:brightness-110 transition-all font-black tracking-widest"
                                >
                                  Accept
                                </button>
                                <button 
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); updateRequestStatus(joinReq.id, 'rejected'); }}
                                  className="flex-1 py-3 bg-neon-red text-white text-[9px] font-black rounded uppercase hover:brightness-110 transition-all font-black tracking-widest"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); createRequest('teamToPlayer', player.userId, currentTeam.id); }}
                            className="w-full py-3 bg-neon-blue text-black rounded-lg text-[10px] font-black uppercase tracking-widest shadow-[0_0_15px_rgba(0,229,255,0.2)] hover:brightness-110 transition-all"
                          >
                            HIRE PLAYER
                          </button>
                        );
                      })()
                    )}

                    {/* Show decisions for solo player if team sent a request to them */}
                    {userSoloProfile && player.userId === user?.id && (
                       <div className="space-y-2 mt-4 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                         {requests
                           .filter(r => r.playerId === user.id && r.type === 'teamToPlayer' && r.status === 'pending')
                           .map(req => {
                             const team = teams.find(t => t.id === req.teamId);
                             return (
                               <div key={req.id} className="p-3 bg-neon-blue/10 border border-neon-blue/20 rounded-lg">
                                 <p className="text-[10px] text-white font-bold mb-2">Team <span className="text-neon-blue">{team?.teamName || 'Unknown'}</span> wants to hire you!</p>
                                 <div className="flex gap-2">
                                    <button type="button" onClick={(e) => { e.stopPropagation(); updateRequestStatus(req.id, 'accepted'); }} className="flex-1 py-1.5 bg-neon-green text-black text-[9px] font-black rounded uppercase hover:brightness-110 transition-all">Accept</button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); updateRequestStatus(req.id, 'rejected'); }} className="flex-1 py-1.5 bg-neon-red text-white text-[9px] font-black rounded uppercase hover:brightness-110 transition-all">Reject</button>
                                 </div>
                               </div>
                             )
                           })
                         }
                       </div>
                    )}
                  </div>
                </motion.div>
              );
            })}

            {filteredPlayers.length === 0 && (
              <div className="col-span-full py-20 glass-card text-center space-y-4">
                <Users size={48} className="mx-auto text-gray-800" />
                <h3 className="text-xl font-black uppercase tracking-widest italic text-gray-600">No mercenaries found</h3>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
           {/* JOIN TEAM TAB */}
           {filteredTeams.map(team => {
             // If I am the leader of THIS team, show incoming requests to join my team
             const amILeader = team.ownerId === user?.id;
             const pendingIncoming = requests.filter(r => r.teamId === team.id && r.type === 'playerToTeam' && r.status === 'pending');

             return (
               <motion.div
                  key={team.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group relative glass-card p-8 space-y-6 flex flex-col"
                >
                  <div className="flex items-center gap-4">
                     {team.logoUrl ? (
                        <div className="w-16 h-16 rounded-xl overflow-hidden border border-white/10 shrink-0">
                          <img src={team.logoUrl} alt={team.teamName} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                          <Shield className="text-gray-500 w-8 h-8" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-xl font-black italic uppercase text-white">{team.teamName}</h3>
                        <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">Ldr: {team.leaderName}</p>
                      </div>
                  </div>
                  
                  <div className="flex-grow space-y-4">
                    <div className="text-[10px] font-black uppercase text-gray-500 bg-white/5 p-3 rounded-lg border border-white/5">
                      Players: {team.players.length} / 5+
                    </div>

                    {amILeader && pendingIncoming.length > 0 && (
                      <div className="space-y-2 mt-4 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                         <div className="text-[9px] text-neon-blue font-black uppercase">Pending Join Requests:</div>
                         {pendingIncoming.map(req => {
                             const p = players.find(x => x.userId === req.playerId);
                             return (
                               <div key={req.id} className="p-3 bg-neon-blue/10 border border-neon-blue/20 rounded-lg">
                                 <p className="text-[10px] text-white font-bold mb-2 uppercase break-all">{p?.name || 'Unknown Player'}</p>
                                 <div className="flex gap-2">
                                    <button type="button" onClick={(e) => { e.stopPropagation(); updateRequestStatus(req.id, 'accepted'); }} className="flex-1 py-1.5 bg-neon-green text-black text-[9px] font-black rounded uppercase hover:brightness-110 transition-all">Accept</button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); updateRequestStatus(req.id, 'rejected'); }} className="flex-1 py-1.5 bg-neon-red text-white text-[9px] font-black rounded uppercase hover:brightness-110 transition-all">Reject</button>
                                 </div>
                               </div>
                             )
                         })}
                      </div>
                    )}
                  </div>

                  {!amILeader && userSoloProfile && (
                     <div className="pt-4 border-t border-white/5">
                        {userSoloProfile.rating && userSoloProfile.rating > 0 ? (
                          (() => {
                            const joinReq = requests.find(r => r.teamId === team.id && r.playerId === userSoloProfile.userId && r.type === 'playerToTeam' && r.status === 'pending');
                            const hireReq = requests.find(r => r.teamId === team.id && r.playerId === userSoloProfile.userId && r.type === 'teamToPlayer' && r.status === 'pending');
                            
                            if (joinReq) {
                              return (
                                <div className="flex flex-col gap-2">
                                  <div className="w-full py-3 bg-white/5 text-gray-500 rounded-lg text-[10px] font-black text-center uppercase tracking-widest border border-white/10">
                                     REQUEST PENDING
                                  </div>
                               <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); cancelRequest(joinReq.id); }}
                                className="text-[9px] font-black text-neon-red hover:underline uppercase tracking-widest text-center"
                              >
                                Cancel Request
                              </button>
                                </div>
                              );
                            }

                            if (hireReq) {
                              return (
                                <div className="space-y-2">
                                  <div className="w-full py-3 bg-neon-green/10 text-neon-green rounded-lg text-[10px] font-black text-center uppercase tracking-widest border border-neon-green/20">
                                    HIRE OFFER RECEIVED
                                  </div>
                                  <div className="flex gap-2">
                                    <button 
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); updateRequestStatus(hireReq.id, 'accepted'); }}
                                      className="flex-1 py-3 bg-neon-green text-black text-[9px] font-black rounded uppercase hover:brightness-110 transition-all font-black tracking-widest"
                                    >
                                      Accept
                                    </button>
                                    <button 
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); updateRequestStatus(hireReq.id, 'rejected'); }}
                                      className="flex-1 py-3 bg-neon-red text-white text-[9px] font-black rounded uppercase hover:brightness-110 transition-all font-black tracking-widest"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); createRequest('playerToTeam', userSoloProfile.userId, team.id); }}
                                className="w-full py-3 bg-neon-blue text-black rounded-lg text-[10px] font-black uppercase tracking-widest shadow-[0_0_15px_rgba(0,229,255,0.2)] hover:brightness-110 transition-all"
                              >
                                SEND JOIN REQUEST
                              </button>
                            );
                          })()
                        ) : (
                          <div className="p-3 bg-neon-red/10 border border-neon-red/20 rounded-lg">
                            <div className="flex items-center gap-2 text-neon-red mb-1">
                              <AlertCircle size={12} />
                              <span className="text-[8px] font-black uppercase tracking-widest">JOINING RESTRICTED</span>
                            </div>
                            <p className="text-[9px] font-bold text-gray-500 uppercase leading-relaxed">
                              You need an admin rating to send join requests.
                            </p>
                          </div>
                        )}
                     </div>
                  )}
               </motion.div>
             )
           })}

           {filteredTeams.length === 0 && (
              <div className="col-span-full py-20 glass-card text-center space-y-4">
                <Shield size={48} className="mx-auto text-gray-800" />
                <h3 className="text-xl font-black uppercase tracking-widest italic text-gray-600">No Teams Available</h3>
              </div>
            )}
        </div>
      )}


      {/* Registration Modal */}
      <AnimatePresence>
        {showSlotModal && pendingAcceptReq && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="absolute inset-0 bg-black/95 backdrop-blur-xl"
               onClick={() => { setShowSlotModal(false); setPendingAcceptReq(null); }}
             />
             <motion.div
               initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
               className="relative w-full max-w-xl glass-card p-10 space-y-8"
             >
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-black italic tracking-tighter uppercase">ASSIGN TO <span className="text-neon-blue">ROSTER SLOT</span></h2>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Select an deployment slot for the new tactical unit</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[...Array(10)].map((_, i) => {
                    const existingPlayerId = pendingAcceptReq.team.players?.[i];
                    return (
                      <button
                        key={i}
                        onClick={() => assignPlayerToSlot(i)}
                        className={`p-4 rounded-xl border transition-all text-left group relative overflow-hidden ${
                          existingPlayerId 
                          ? 'bg-neon-red/5 border-neon-red/20 hover:bg-neon-red/10' 
                          : 'bg-white/5 border-white/10 hover:border-neon-blue/50 hover:bg-neon-blue/5'
                        }`}
                      >
                        <div className="flex justify-between items-start relative z-10">
                          <span className="text-[10px] font-black text-gray-500 group-hover:text-neon-blue transition-colors">SLOT {i + 1}</span>
                          {existingPlayerId && <Trash2 size={12} className="text-neon-red" />}
                        </div>
                        <div className="mt-2 relative z-10">
                          <p className="text-xs font-black uppercase tracking-widest truncate">
                            {existingPlayerId || 'EMPTY SLOT'}
                          </p>
                          {existingPlayerId && (
                            <p className="text-[8px] font-bold text-neon-red uppercase mt-1 italic">WILL BE REPLACED</p>
                          )}
                        </div>
                        <div className="absolute top-0 right-0 w-12 h-12 bg-white/5 -mr-6 -mt-6 rounded-full blur-xl group-hover:bg-neon-blue/10 transition-all" />
                      </button>
                    )
                  })}
                </div>

                <button 
                  onClick={() => { setShowSlotModal(false); setPendingAcceptReq(null); }}
                  className="w-full py-4 text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 hover:text-white transition-colors"
                >
                  ABORT ASSIGNMENT
                </button>
             </motion.div>
          </div>
        )}

        {showRegisterModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="absolute inset-0 bg-black/90 backdrop-blur-md"
               onClick={() => setShowRegisterModal(false)}
             />
             
             <motion.div
               initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
               className="relative w-full max-w-2xl glass-card p-6 md:p-10 space-y-8 max-h-[90vh] overflow-y-auto"
             >
               <div className="flex justify-between items-center sticky top-0 bg-black/40 backdrop-blur-md z-10 -mx-6 md:-mx-10 px-6 md:px-10 pb-4 pt-2 border-b border-white/5 mb-4">
                 <div className="space-y-1">
                   <h2 className="text-2xl font-black italic tracking-tighter uppercase">
                     PLAYER <span className="text-neon-blue">SPECIFICATIONS</span>
                   </h2>
                   <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Update your tactical combat profile</p>
                 </div>
                 <button onClick={() => setShowRegisterModal(false)} className="p-2 text-gray-500 hover:text-white transition-colors">
                   <X size={24} />
                 </button>
               </div>

               <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
                 {/* ... Form inside modal is unchanged largely ... */}
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">Warrior Name</label>
                   <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="ENTER NAME..." className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-3.5 text-xs font-black uppercase tracking-wider focus:border-neon-blue focus:bg-black/60 transition-all outline-none" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">In-Game UID</label>
                   <input required type="text" inputMode="numeric" value={formData.gameId} onChange={e => setFormData({...formData, gameId: e.target.value.replace(/\D/g, '')})} placeholder="ENTER MLBB UID (NUMBERS ONLY)..." className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-3.5 text-xs font-black uppercase tracking-wider focus:border-neon-blue focus:bg-black/60 transition-all outline-none" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">WhatsApp Matrix</label>
                   <input required type="tel" value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} placeholder="e.g. 017XXXXXXXX" className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-3.5 text-xs font-black uppercase tracking-wider focus:border-neon-blue focus:bg-black/60 transition-all outline-none" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">FB Communications</label>
                   <input required type="url" value={formData.fbLink} onChange={e => setFormData({...formData, fbLink: e.target.value})} placeholder="FACEBOOK PROFILE URL..." className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-3.5 text-xs font-black uppercase tracking-wider focus:border-neon-blue focus:bg-black/60 transition-all outline-none" />
                 </div>
                 <div className="space-y-2 md:col-span-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">Main Tactical Role</label>
                   <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                     {ROLES.map(r => (
                       <button key={r} type="button" onClick={() => setFormData({...formData, mainRole: r})} className={`py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${formData.mainRole === r ? 'bg-neon-blue text-black border-neon-blue shadow-[0_0_15px_rgba(0,229,255,0.2)]' : 'bg-white/5 text-gray-500 border-white/10 hover:bg-white/10'}`}>{r}</button>
                     ))}
                   </div>
                 </div>
                 <div className="space-y-2 md:col-span-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">Sub Roles (Select Up To 2)</label>
                   <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                     {ROLES.filter(r => r !== formData.mainRole).map(r => (
                       <button key={`sub-${r}`} type="button" onClick={() => toggleSubRole(r)} className={`py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${formData.subRoles.includes(r) ? 'bg-white/20 text-white border-white/40' : 'bg-white/5 text-gray-500 border-white/10 hover:bg-white/10'}`}>{r}</button>
                     ))}
                   </div>
                 </div>
                 <div className="space-y-2 md:col-span-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">Active Deployment Time</label>
                   <input required type="text" value={formData.activeTime} onChange={e => setFormData({...formData, activeTime: e.target.value})} placeholder="e.g. 8:00 PM - 12:00 AM" className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-3.5 text-xs font-black uppercase tracking-wider focus:border-neon-blue focus:bg-black/60 transition-all outline-none" />
                 </div>
                 <div className="md:col-span-2 pt-4">
                   <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-neon-blue text-black font-black uppercase tracking-[0.2em] rounded-xl shadow-[0_0_30px_rgba(0,229,255,0.3)] hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                     {isSubmitting ? <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <><Shield size={18} />LEGALIZE PROFILE</>}
                   </button>
                 </div>
               </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
