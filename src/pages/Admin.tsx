import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc, 
  setDoc,
  deleteDoc, 
  writeBatch, 
  serverTimestamp, 
  orderBy,
  where,
  getDoc,
  getDocs
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { signInWithCustomToken } from 'firebase/auth';
import { FALLBACK_IMAGE, uploadExternalImageToStorage } from '../lib/utils';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { createNotification } from '../lib/notificationUtils';
import { askGemini, SystemData } from '../services/geminiService';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', errInfo.error);
  // Do not throw in async callbacks as it crashes the UI
  toast.error(`Permission Error [${operationType}]: ${errInfo.error}`);
}
import { Registration, Team, MatchResultType, AppSetting, Transaction, LiveLink } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, X, Shield, Users, Sword, Swords, TrendingUp, History, Filter, Eye, AlertCircle, AlertTriangle, Download, Settings, Lock, Unlock, User as UserIcon, Plus, Minus, Bot, Send, Trash, Loader2, Calendar, KeyRound, Search, CheckCircle2, FileText, Copy, Youtube, Image, Diamond } from 'lucide-react';
import { recordMatchResult } from '../lib/utils';
import { FormBuilder } from '../components/FormBuilder';
import SchedulesAdmin from '../components/SchedulesAdmin';
import SeasonsAdmin from '../components/SeasonsAdmin';
import ChallengesAdmin from '../components/ChallengesAdmin';
import toast from 'react-hot-toast';


const CLEARABLE_SECTIONS = [
  { id: 'teams', name: 'Teams', col: 'teams', desc: 'All registered teams' },
  { id: 'users', name: 'Users', col: 'users', desc: 'All user accounts' },
  { id: 'registrations', name: 'Registrations', col: 'registrations', desc: 'All pending and past applications' },
  { id: 'transactions', name: 'Transactions', col: 'transactions', desc: 'Logs of points and diamonds' },
  { id: 'matches', name: 'Match Records', col: 'matches', desc: 'Past match results' },
  { id: 'challenges', name: 'Challenges', col: 'challenges', desc: 'Challenge requests' },
  { id: 'schedules', name: 'Schedules', col: 'schedules', desc: 'Scheduled matches' },
  { id: 'seasons', name: 'Seasons', col: 'seasons', desc: 'Season configurations' },
  { id: 'soloPlayers', name: 'Solo Players', col: 'soloPlayers', desc: 'Mercenary directory profiles' },
  { id: 'live_links', name: 'Live Links', col: 'live_links', desc: 'All live broadcast links' }
];

import { useAuth } from '../context/AuthContext';

const SYSTEM_BLUEPRINT_DESCRIPTION = `
# MLBB GUILD BANGLADESH (MGB) - SYSTEM BLUEPRINT

This application is a comprehensive management system for Mobile Legends: Bang Bang guilds in Bangladesh. It handles everything from registration to tournament scheduling and team rewards.

## CORE ARCHITECTURE
- **Frontend**: React 18 with Vite, Tailwind CSS for styling, Framer Motion for animations.
- **Backend/Database**: Firebase (Firestore, Auth, Storage).
- **Server**: Express.js proxy for administrative tasks (user creation, bulk deletion, AI helper).

## USER ROLES & PERMISSIONS
1. **ADMIN**: Full control over all database collections, settings, and auth accounts. Can approve/reject teams, adjust resources, and manage seasons.
2. **MODERATOR**: Staff members with limited access (e.g., only managing matches or registrations). Access is defined by the Admin in settings.
3. **TEAM/PLAYER**: Regular users who manage their own team profiles, participate in match challenges, and shop for perks.

## KEY MODULES
- **REGISTRATION**: Teams submit registration with leader ID card and roster. Admins review and approve to create team profiles.
- **CHALLENGES**: Scrimmage system allowing teams to request matches with others. Includes auto-expiry and balance checks.
- **SCHEDULE**: Official tournament bracket/schedule where matches are listed with countdown timers.
- **LEADERBOARD**: Real-time ranking based on points earned from matches and challenges.
- **SHOP/ECONOMY**: Dual currency system (Points & Diamonds). Teams earn through matches and spend on card upgrades or shop items.
- **SOLO PLAYERS/MERCENARIES**: A directory for unattached players seeking teams or teams seeking substitutions.
- **ADMIN AI**: Integrated Gemini AI helper that can perform database operations via natural language commands.
- **SECURITY**: Hardened Firestore rules with master-gate validation ensures data integrity even if client SDK is bypassed.

## DB SCHEMAS (FIRESTORE)
- \`users\`: Authentication data, roles, and resource balances.
- \`teams\`: Team profile, roster, points, diamonds, and owner links.
- \`registrations\`: Application data for new teams.
- \`matches\`: History of recorded match outcomes.
- \`schedules\`: Active tournament match slots.
- \`challenges\`: Pending and resolved scrimmage requests.
- \`transactions\`: Audit log of all point/diamond changes.
- \`settings/global\`: System-wide configuration, feature flags, and staff list.
- \`seasons\`: Management of tournament timelines.
- \`soloPlayers\`: Directory of mercenary profiles.
- \`live_links\`: Live match broadcast links.
- \`notifications\`: User-specific alert system.

## DESIGN AESTHETIC
- **UI/UX**: Dark theme with Neon Blue (Primary) and Neon Red (Alert) accents. Cyberpunk/Gaming aesthetic.
- **Responsiveness**: Fully optimized for Desktop and Mobile (Responsive sidebars and navigation).
`;

const Countdown: React.FC<{ endTime: string }> = ({ endTime }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculate = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('PENDING...');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    calculate();
    const t = setInterval(calculate, 1000);
    return () => clearInterval(t);
  }, [endTime]);

  return <>{timeLeft}</>;
};

const Admin: React.FC = () => {
  const { isAdmin: isAuthAdmin, isModerator, moderatorPermissions, loading: authLoading, firebaseUser } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('registrations');
  const [logoSearchTerm, setLogoSearchTerm] = useState('');
  const [logoTargetType, setLogoTargetType] = useState<'teams' | 'users'>('teams');

  useEffect(() => {
    if (authLoading) return;
    if (isModerator && !isAuthAdmin) {
      const allowed = [
        'registrations', 'matches', 'teams', 'users', 'pass-reqs', 'transactions', 'seasons', 'schedules', 'ai', 'form-builder'
      ].filter(id => moderatorPermissions.includes(id));
      
      if (allowed.length > 0 && !moderatorPermissions.includes(activeTab)) {
        setActiveTab(allowed[0]);
      }
    }
  }, [isModerator, isAuthAdmin, moderatorPermissions, authLoading]);
  const [regFilter, setRegFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [authUsers, setAuthUsers] = useState<any[]>([]);
  const [loadingAuthUsers, setLoadingAuthUsers] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<AppSetting | null>(null);
  const [editSettings, setEditSettings] = useState<Partial<AppSetting>>({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // ID Card Modal
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  
  // Confirm Rejection state
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);
  const [confirmDeleteRegId, setConfirmDeleteRegId] = useState<string | null>(null);
  const [confirmLiveDeleteId, setConfirmLiveDeleteId] = useState<string | null>(null);
  const [deleteConfirmTeam, setDeleteConfirmTeam] = useState<{id: string, name: string} | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<{id: string, email: string} | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetSection, setResetSection] = useState<'challenges' | 'transactions' | 'registrations' | 'stats' | 'schedules' | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [sectionsToKeep, setSectionsToKeep] = useState<string[]>([]);
  const [isSiteResetting, setIsSiteResetting] = useState(false);
  const [showSiteResetConfirm, setShowSiteResetConfirm] = useState(false);
  const [siteResetSuccessMessage, setSiteResetSuccessMessage] = useState<string | null>(null);
  const [siteResetProgress, setSiteResetProgress] = useState<string>('');
  const [allSchedules, setAllSchedules] = useState<any[]>([]);
  const [liveLinks, setLiveLinks] = useState<LiveLink[]>([]);
  const [impersonating, setImpersonating] = useState(false);
  const [newLiveLink, setNewLiveLink] = useState({ 
    title: '', 
    url: '', 
    description: '', 
    order: 0,
    team1Id: '',
    team2Id: ''
  });
  
  const [nukeStep, setNukeStep] = useState(0);
  const [nukeInput, setNukeInput] = useState('');
  const [nukeResult, setNukeResult] = useState('');

  const [passwordRequests, setPasswordRequests] = useState<any[]>([]);
  const [modSearchEmail, setModSearchEmail] = useState('');
  const [recruiterSearch, setRecruiterSearch] = useState('');
  const [modAdding, setModAdding] = useState(false);
  const [modPermissionsEditing, setModPermissionsEditing] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [showManualAdd, setShowManualAdd] = useState(false);
  
  // Notification state
  const [pushNotification, setPushNotification] = useState({
    title: '',
    body: '',
    clickAction: '',
    targetUids: [] as string[]
  });
  const [sendingPush, setSendingPush] = useState(false);
  const [notificationTargetType, setNotificationTargetType] = useState<'all' | 'selected'>('all');
  
  const [manualTeam, setManualTeam] = useState({
    teamName: '',
    leaderName: '',
    leaderEmail: '',
    password: '',
    player1: '',
    player2: '',
    player3: '',
    player4: '',
    player5: '',
    player6: '',
    player7: '',
    logoUrl: ''
  });

  // Match result form
  const [matchData, setMatchData] = useState({
    teamA: '',
    teamB: '',
    winner: '',
    type: 'win' as MatchResultType,
    scheduleId: ''
  });

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthAdmin && !isModerator) return;

    // Timeout to prevent infinite loading screen
    const timer = setTimeout(() => setLoading(false), 500);

    const qReg = query(collection(db, 'registrations'), orderBy('timestamp', 'desc'));
    const qTeams = query(collection(db, 'teams'), orderBy('points', 'desc'));
    const qUsers = query(collection(db, 'users'), orderBy('email', 'asc'));
    const qTrans = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'));
    const qPassReq = query(collection(db, 'passwordRequests'), orderBy('createdAt', 'desc'));
    const qSchedules = query(collection(db, 'schedules'), orderBy('startTime', 'desc'));
    const qSeasons = query(collection(db, 'seasons'));
    const qLiveLinks = query(collection(db, 'live_links'), orderBy('order', 'asc'));

    const unsubSeasons = onSnapshot(qSeasons, (snap) => {
       setSeasons(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubLiveLinks = onSnapshot(qLiveLinks, (snap) => {
       setLiveLinks(snap.docs.map(d => ({ id: d.id, ...d.data() } as LiveLink)));
    });

    const unsubSchedules = onSnapshot(qSchedules, (snap) => {
       setAllSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubReg = (isAuthAdmin || moderatorPermissions.includes('registrations')) ? onSnapshot(qReg, (snap) => {
      setRegistrations(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Registration));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'registrations');
      setLoading(false);
    }) : () => { if (activeTab === 'registrations') setLoading(false); };

    const unsubTeams = (isAuthAdmin || moderatorPermissions.includes('teams') || moderatorPermissions.includes('matches') || moderatorPermissions.includes('schedules') || moderatorPermissions.includes('challenges')) ? onSnapshot(qTeams, (snap) => {
      setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Team));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'teams');
      setLoading(false);
    }) : () => { if (activeTab === 'teams' || activeTab === 'matches' || activeTab === 'challenges' || activeTab === 'schedules') setLoading(false); };

    const unsubUsers = (isAuthAdmin || moderatorPermissions.includes('users')) ? onSnapshot(qUsers, (snap) => {
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
      setLoading(false);
    }) : () => { if (activeTab === 'users') setLoading(false); };

    const unsubTrans = (isAuthAdmin || moderatorPermissions.includes('transactions') || moderatorPermissions.includes('matches')) ? onSnapshot(qTrans, (snap) => {
      setTransactions(snap.docs.map(d => {
        const data = d.data();
        return { 
          id: d.id, 
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : data.timestamp 
        } as Transaction;
      }));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'transactions');
      setLoading(false);
    }) : () => { if (activeTab === 'transactions' || activeTab === 'matches') setLoading(false); };

    const unsubPassReq = (isAuthAdmin || moderatorPermissions.includes('pass-reqs')) ? onSnapshot(qPassReq, (snap) => {
      setPasswordRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'passwordRequests');
      setLoading(false);
    }) : () => { if (activeTab === 'pass-reqs') setLoading(false); };

    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as AppSetting;
        setSettings(data);
        // Only initialize editSettings if it's empty or the ID is different
        setEditSettings(prev => {
          if (!prev.id || Object.keys(prev).length <= 1) return data;
          return prev;
        });
      } else {
        const defaultSettings: AppSetting = { 
          id: 'global', 
          challengePhaseLocked: false, 
          allowOldTeamRegistration: true, 
          registrationEnabled: true,
          guildName: 'MGB OFFICIAL',
          discordLink: '',
          facebookLink: '',
          youtubeLink: '',
          messengerLink: '',
          announcement: '',
          maintenanceMode: false,
          rulesUrl: '',
          bettingEnabled: false,
          showHeroSection: true,
          showScheduleSection: true,
          showFeaturesSection: true,
          showAboutSection: true,
          showShop: true,
          features: [
            { title: 'TOURNAMENTS', icon: 'Trophy', desc: 'Weekly matches with massive prize pools and points system.', enabled: true },
            { title: 'LEADERBOARD', icon: 'Zap', desc: 'Real-time ranking of the best guilds across Bangladesh.', enabled: true },
            { title: 'REWARDS', icon: 'Shield', desc: 'Earn Diamonds to upgrade your team cards and unlock perks.', enabled: true }
          ]
        };
        setSettings(defaultSettings);
        setEditSettings(defaultSettings);
      }
      setLoading(false);
    }, (err) => {
      console.error("Settings Subscription Error:", err);
      setLoading(false);
    });

    return () => { clearTimeout(timer); unsubReg(); unsubTeams(); unsubUsers(); unsubSettings(); unsubTrans(); unsubPassReq(); unsubSeasons(); unsubSchedules(); unsubLiveLinks(); };
  }, [isAuthAdmin, isModerator, moderatorPermissions, authLoading]);

  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const saveGlobalSettings = async () => {
    setIsSavingSettings(true);
    try {
      const settingsRef = doc(db, 'settings', 'global');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, ...payload } = editSettings;
      
      // Ensure we don't save undefined values
      const cleanPayload = Object.fromEntries(
        Object.entries(payload).filter(([_, v]) => v !== undefined)
      );

      await setDoc(settingsRef, cleanPayload, { merge: true });
      toast.success("All settings saved successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save settings: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSavingSettings(false);
    }
  };

  const toggleSetting = async (key: keyof Omit<AppSetting, 'id'>) => {
    if (!settings) return;
    
    // Default to true for visibility toggles and registration features if undefined
    const keysThatDefaultToTrue = [
      'registrationEnabled',
      'showHeroSection',
      'showScheduleSection',
      'showFeaturesSection',
      'showAboutSection',
      'showShop',
      'showLeaderboard',
      'showChallenges',
      'showDiamonds',
      'showSoloPlayers',
      'allowSoloRegistration',
      'allowOldTeamRegistration',
      'profileEditsEnabled'
    ];

    const currentValue = settings[key] === undefined 
      ? (keysThatDefaultToTrue.includes(key as string) || key.toString().startsWith('show') ? true : false)
      : settings[key];
      
    const newValue = !currentValue;

    try {
      const settingsRef = doc(db, 'settings', 'global');
      await updateDoc(settingsRef, {
        [key]: newValue
      });
      setEditSettings(prev => ({ ...prev, [key]: newValue }));
      toast.success(`${key.replace(/([A-Z])/g, ' $1').toUpperCase()} updated.`);
    } catch (err) {
      console.error(err);
      await setDoc(doc(db, 'settings', 'global'), {
        [key]: newValue
      }, { merge: true });
      setEditSettings(prev => ({ ...prev, [key]: newValue }));
      toast.success(`${key.replace(/([A-Z])/g, ' $1').toUpperCase()} updated (created).`);
    }
  };

  const toggleMaintenance = async () => {
    if (!settings) return;
    const isActivating = !settings.maintenanceMode;
    
    try {
      const settingsRef = doc(db, 'settings', 'global');
      if (isActivating) {
        const totalMinutes = (parseInt(maintHours) * 60) + parseInt(maintMins);
        if (totalMinutes <= 0) {
          toast.error("Please specify a duration for maintenance.");
          return;
        }
        const endTime = new Date(Date.now() + totalMinutes * 60000);
        const data = {
          maintenanceMode: true,
          maintenanceEndTime: endTime.toISOString()
        };
        try {
          await updateDoc(settingsRef, data);
        } catch (e) {
          await setDoc(settingsRef, data, { merge: true });
        }
        toast.success(`Maintenance enabled for ${maintHours}h ${maintMins}m`);
      } else {
        const data = {
          maintenanceMode: false,
          maintenanceEndTime: null
        };
        try {
          await updateDoc(settingsRef, data);
        } catch (e) {
          await setDoc(settingsRef, data, { merge: true });
        }
        toast.success("Maintenance disabled.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to update maintenance mode.");
    }
  };

  const handleSendPushNotification = async () => {
    if (!pushNotification.title || !pushNotification.body) {
      toast.error('Title and Body are required');
      return;
    }

    setSendingPush(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch('/api/admin/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...pushNotification,
          targetUids: notificationTargetType === 'all' ? [] : pushNotification.targetUids
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send notification');

      toast.success(`Successfully sent to ${data.sentCount} devices!`);
      setPushNotification({ title: '', body: '', clickAction: '', targetUids: [] });
    } catch (err: any) {
      console.error('[Admin] Push failed:', err);
      toast.error(err.message);
    } finally {
      setSendingPush(false);
    }
  };

  const handleApprove = async (reg: Registration) => {
    if (processingId) return;
    setProcessingId(reg.id);
    try {
      // Final uniqueness check before approval
      const players = (reg.players || []).filter(p => typeof p === 'string' && p.trim() !== '');
      if (players.length > 0) {
        // 1. Check existing approved teams
        const teamsQuery = query(collection(db, 'teams'), where('players', 'array-contains-any', players));
        const teamsSnapshot = await getDocs(teamsQuery);
        if (!teamsSnapshot.empty) {
          const conflictingTeam = teamsSnapshot.docs[0].data();
          const matchedUid = players.find(uid => (conflictingTeam.players as string[]).includes(uid));
          toast.error(`Approval Cancelled: Player UID ${matchedUid} is already assigned to active team "${conflictingTeam.teamName}".`);
          setProcessingId(null);
          return;
        }

        // 2. Check other pending registrations (excluding current)
        const regQuery = query(
          collection(db, 'registrations'), 
          where('status', '==', 'pending'),
          where('players', 'array-contains-any', players)
        );
        const regSnapshot = await getDocs(regQuery);
        const conflictRegDoc = regSnapshot.docs.find(d => d.id !== reg.id);
        
        if (conflictRegDoc) {
          const conflictingRegData = conflictRegDoc.data();
          const teamName = conflictingRegData.teamName;
          const matchedUid = players.find(uid => (conflictingRegData.players as string[]).includes(uid));
          toast.error(`Approval Cancelled: Player UID ${matchedUid} matches another pending registration for team "${teamName}".`);
          setProcessingId(null);
          return;
        }
      }

      const batch = writeBatch(db);
      
      // 1. Create Team
      // Use registration ID as team ID to allow multiple teams per owner (especially for admin)
      const teamId = reg.id; 
      const teamRef = doc(db, 'teams', teamId);
      
      const newTeam: Omit<Team, 'id'> = {
        teamName: reg.teamName,
        leaderName: reg.leaderName,
        ownerId: reg.ownerId || reg.userId || '', // Save the creator as owner
        seasonId: reg.seasonId || settings?.currentSeasonId || '',
        points: 100, // Registration bonus
        diamonds: 100, // Registration bonus
        streak: 0,
        upgradeLevel: 1,
        rank: 'E',
        matchesThisSeason: 0,
        players: reg.players,
        registrationStatus: 'approved',
        uniqueId: reg.uniqueId || Math.random().toString(36).substring(2, 9).toUpperCase(),
        createdAt: new Date().toISOString(),
        logoUrl: reg.logoUrl || '',
        leaderCardUrl: reg.leaderCardUrl || '',
        phoneNumber: reg.phoneNumber || '',
        gameId: reg.gameId || '',
        serverId: reg.serverId || '',
        customData: reg.customData || {}
      };

      batch.set(teamRef, newTeam);

      // 2. Link User doc if it exists and it's NOT an admin
      const isAdminRegistration = reg.leaderEmail?.toLowerCase() === 'mlbbguildbangladesh@gmail.com' || reg.userId === auth.currentUser?.uid;
      
      if (reg.userId && !isAdminRegistration) {
        const userRef = doc(db, 'users', reg.userId);
        batch.set(userRef, {
          teamId: teamId, // Store current active team ID
          teamName: reg.teamName,
          leaderName: reg.leaderName,
          logoUrl: reg.logoUrl || '',
          email: reg.leaderEmail,
          phoneNumber: reg.phoneNumber || '',
          gameId: reg.gameId || '',
          serverId: reg.serverId || '',
          points: 100,
          diamonds: 100
        }, { merge: true });
      }

      // 3. Add Transaction
      const transRef = doc(collection(db, 'transactions'));
      batch.set(transRef, {
        teamId,
        ownerId: reg.ownerId || reg.userId || '',
        type: 'bonus',
        points: 100,
        diamonds: 100,
        reason: 'Registration Bonus',
        timestamp: serverTimestamp(),
        performedByEmail: auth.currentUser?.email || 'System',
        allowedViewerUids: [reg.ownerId || reg.userId || '', ...(reg.players || [])].filter(Boolean)
      });

      // 4. Mark Registration as Approved
      batch.update(doc(db, 'registrations', reg.id), { status: 'approved' });

      await batch.commit();
      toast.success(`Approved ${reg.teamName}!`);

      // Notify User
      const userId = reg.ownerId || reg.userId;
      if (userId) {
        await createNotification(
          userId,
          'Congratulations!',
          `Your team registration for ${reg.teamName} has been approved! Check your profile for bonus Points & Diamonds. Welcome to the league!`,
          'system',
          '/team'
        );
      }
    } catch (err: any) {
      console.error('Approve failure:', err);
      let errorMessage = "Failed to approve team.";
      if (err.message) {
        try {
          // If it's our JSON error format, parse and show better info
          const parsed = JSON.parse(err.message);
          errorMessage += `\nError: ${parsed.error}`;
        } catch {
          errorMessage += `\n${err.message}`;
        }
      }
      toast.error(errorMessage);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (processingId) return;
    const reg = registrations.find(r => r.id === id);
    setProcessingId(id);
    try {
      await updateDoc(doc(db, 'registrations', id), { status: 'rejected' });
      
      // Notify User
      const userId = reg?.ownerId || reg?.userId;
      if (userId) {
        await createNotification(
          userId,
          'Registration Rejected',
          `Your team registration for ${reg?.teamName || 'your team'} was rejected. Please contact an admin for details.`,
          'system',
          '/registration'
        );
      }

      setConfirmRejectId(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to reject registration.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteRegistration = async (id: string) => {
    if (processingId) return;
    setProcessingId(id);
    try {
      await deleteDoc(doc(db, 'registrations', id));
      setConfirmDeleteRegId(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete registration.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleQuickLogoUpdate = async (id: string, type: 'teams' | 'users', newUrl: string) => {
    if (processingId) return;
    setProcessingId(id);
    try {
      let finalUrl = newUrl;
      if (finalUrl.includes('drive.google.com')) {
        const match1 = finalUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        const match2 = finalUrl.match(/id=([a-zA-Z0-9_-]+)/);
        const driveId = (match1 && match1[1]) ? match1[1] : (match2 && match2[1] ? match2[1] : null);
        if (driveId) {
          finalUrl = `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`;
        }
      }

      await updateDoc(doc(db, type, id), {
        logoUrl: finalUrl,
        updatedAt: serverTimestamp()
      });
      toast.success('Logo updated successfully!');
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `${type}/${id}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleManualCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (processingId) return;

    if (!manualTeam.leaderEmail.includes('@') || manualTeam.password.length < 6) {
      toast.error("Please provide a valid email and a password of at least 6 characters.");
      return;
    }

    setProcessingId('manual-create');
    setManualErrorFields([]);
    try {
      let finalLogoUrl = manualTeam.logoUrl;
      if (finalLogoUrl) {
         try {
           finalLogoUrl = await Promise.race([
             uploadExternalImageToStorage(finalLogoUrl, 'teams/logos'),
             new Promise<string>((resolve) => setTimeout(() => resolve(finalLogoUrl as string), 5000))
           ]);
         } catch(e) {
           finalLogoUrl = manualTeam.logoUrl;
         }
      }

      // --- UID Uniqueness Check ---
      const playersRaw = [manualTeam.player1, manualTeam.player2, manualTeam.player3, manualTeam.player4, manualTeam.player5, manualTeam.player6 || '', manualTeam.player7 || ''];
      const playersList = playersRaw.filter(p => p.trim() !== '');
      
      if (playersList.length > 0) {
        // 1. Check existing approved teams
        const teamsQuery = query(collection(db, 'teams'), where('players', 'array-contains-any', playersList));
        const teamsSnapshot = await getDocs(teamsQuery);
        
        if (!teamsSnapshot.empty) {
          const conflictingTeamData = teamsSnapshot.docs[0].data();
          const teamName = conflictingTeamData.teamName;
          const matchedUid = playersList.find(uid => (conflictingTeamData.players as string[]).includes(uid));
          
          const conflictIdx = playersRaw.findIndex(u => u === matchedUid);
          if (conflictIdx !== -1) {
            setManualErrorFields([conflictIdx]);
            setManualErrorMap({ [conflictIdx]: `In Team: ${teamName}` });
          }

          toast.error(`Conflict Detected: Player UID ${matchedUid} is already registered on the active team "${teamName}".`);
          setProcessingId(null);
          return;
        }

        // 2. Check pending registrations
        const regQuery = query(
          collection(db, 'registrations'), 
          where('status', '==', 'pending'),
          where('players', 'array-contains-any', playersList)
        );
        const regSnapshot = await getDocs(regQuery);
        
        if (!regSnapshot.empty) {
          const conflictingRegData = regSnapshot.docs[0].data();
          const teamName = conflictingRegData.teamName;
          const matchedUid = playersList.find(uid => (conflictingRegData.players as string[]).includes(uid));
          
          const conflictIdx = playersRaw.findIndex(u => u === matchedUid);
          if (conflictIdx !== -1) {
            setManualErrorFields([conflictIdx]);
            setManualErrorMap({ [conflictIdx]: `Pending Reg: ${teamName}` });
          }

          toast.error(`Conflict Detected: Player UID ${matchedUid} is already in a pending registration for team "${teamName}".`);
          setProcessingId(null);
          return;
        }
      }
      // --- End Check ---

      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("No admin session found");

      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          email: manualTeam.leaderEmail,
          password: manualTeam.password,
          teamName: manualTeam.teamName,
          leaderName: manualTeam.leaderName,
          logoUrl: manualTeam.logoUrl,
          seasonId: settings?.currentSeasonId || '',
          players: [manualTeam.player1, manualTeam.player2, manualTeam.player3, manualTeam.player4, manualTeam.player5, manualTeam.player6, manualTeam.player7].filter(p => p && p.trim() !== '')
        })
      });

      const responseText = await response.text();
      let data;
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (e) {
        throw new Error(`Invalid response from server: ${responseText || 'Empty response'}`);
      }
      if (!response.ok) throw new Error(data.error || "Failed to create user");

      // Success
      toast.success(`Team and User account for ${manualTeam.teamName} successfully created!`);
      
      setManualTeam({
        teamName: '', leaderName: '', leaderEmail: '', password: '',
        player1: '', player2: '', player3: '', player4: '', player5: '', player6: '', player7: '',
        logoUrl: ''
      });
      setShowManualAdd(false);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to manual create: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const submitMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchData.teamA || !matchData.teamB || (['win', 'walkout'].includes(matchData.type) && !matchData.winner)) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      await recordMatchResult(
        matchData.teamA, 
        matchData.teamB, 
        matchData.winner as any, 
        matchData.type,
        undefined,
        undefined,
        false,
        0,
        matchData.scheduleId
      );
      toast.success("Match recorded successfully!");
      setMatchData({ teamA: '', teamB: '', winner: '', type: 'win', scheduleId: '' });
    } catch (err) {
      console.error(err);
      toast.error("Failed to record match.");
    }
  };

  // Handle robust download for cross-origin URLs
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadImage = async (url: string, filename: string) => {
    if (isDownloading) return;
    setIsDownloading(true);

    try {
      // Method 1: Try fetching (Works with CORS enabled)
      const response = await fetch(url, { mode: 'cors' });
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn('Direct fetch failed (CORS likely), trying alternative...', err);
      
      // Method 2: Fallback - Open in new tab for manual save
      // We also try to copy link to clipboard to help the user
      try {
        await navigator.clipboard.writeText(url);
        toast.error("Direct download blocked by cross-origin security. The link has been copied to your clipboard and the image will open in a new tab. Please right-click it and select 'Save Image As'.");
      } catch (clipErr) {
        toast.error("Direct download blocked. The image will open in a new tab. Please right-click it and select 'Save Image As'.");
      }
      
      window.open(url, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  const adjustResources = async (teamId: string, pointDelta: number, diamondDelta: number, reason: string = 'Admin Adjustment') => {
    if (processingId) return;
    setProcessingId(teamId);
    try {
      const teamRef = doc(db, 'teams', teamId);
      const teamSnap = await getDoc(teamRef);
      if (!teamSnap.exists()) return;
      
      const teamData = teamSnap.data() as Team;
      const newPoints = Math.max(0, (teamData.points || 0) + pointDelta);
      const newDiamonds = Math.max(0, (teamData.diamonds || 0) + diamondDelta);
      
      const batch = writeBatch(db);
      batch.update(teamRef, {
        points: newPoints,
        diamonds: newDiamonds
      });

      // Sync to user doc
      const ownerId = teamData.ownerId || teamId;
      const userRef = doc(db, 'users', ownerId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        batch.update(userRef, {
          points: newPoints,
          diamonds: newDiamonds
        });
      }
      
      const transRef = doc(collection(db, 'transactions'));
      batch.set(transRef, {
        teamId,
        ownerId: teamData.ownerId || teamId,
        type: (pointDelta > 0 || diamondDelta > 0) ? 'bonus' : 'expense',
        points: pointDelta,
        diamonds: diamondDelta,
        reason,
        timestamp: serverTimestamp(),
        performedByEmail: auth.currentUser?.email || 'System',
        allowedViewerUids: [teamData.ownerId || teamId, ...(teamData.players || [])].filter(Boolean)
      });
      
      await batch.commit();

      // Notify owner
      await createNotification(
        ownerId,
        'Resource Adjustment',
        `An admin has adjusted your team resources: ${pointDelta > 0 ? '+' : ''}${pointDelta} Pts, ${diamondDelta > 0 ? '+' : ''}${diamondDelta} Dia. Reason: ${reason}`,
        'system',
        '/team'
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to adjust resources.");
    } finally {
      setProcessingId(null);
    }
  };

  const adjustRecruitmentSlots = async (teamId: string, delta: number) => {
    if (processingId) return;
    setProcessingId(teamId);
    try {
      const teamRef = doc(db, 'teams', teamId);
      const teamSnap = await getDoc(teamRef);
      if (!teamSnap.exists()) return;
      
      const teamData = teamSnap.data() as Team;
      const currentSlots = teamData.recruitmentSlots || 0;
      const newSlots = Math.max(0, currentSlots + delta);
      
      await updateDoc(teamRef, {
        recruitmentSlots: newSlots
      });
      
      toast.success(`Recruitment slots updated for ${teamData.teamName}`);
      
      const ownerId = teamData.ownerId || teamId;
      await createNotification(
        ownerId,
        'Recruitment Slots Updated',
        `An admin has updated your recruitment slots to ${newSlots}. You can now recruit players in the Recruitment Hub.`,
        'system',
        '/solos'
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to adjust recruitment slots.");
    } finally {
      setProcessingId(null);
    }
  };

  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [manualErrorFields, setManualErrorFields] = useState<number[]>([]);
  const [editingErrorFields, setEditingErrorFields] = useState<number[]>([]);
  const [manualErrorMap, setManualErrorMap] = useState<Record<number, string>>({});
  const [editingErrorMap, setEditingErrorMap] = useState<Record<number, string>>({});
  const [maintHours, setMaintHours] = useState('0');
  const [maintMins, setMaintMins] = useState('0');

  const handleModAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modAdding || !settings) return;
    
    const targetUser = allUsers.find(u => u.email?.toLowerCase().trim() === modSearchEmail.toLowerCase().trim());
    if (!targetUser) {
      toast.error("User not found with this email.");
      return;
    }

    if (settings.moderators?.some(m => m.uid === targetUser.id)) {
      toast.error("User is already a moderator.");
      return;
    }

    if ((settings.moderators?.length || 0) >= 3) {
      toast.error("Moderator limit reached (Max 3).");
      return;
    }

    setModAdding(true);
    try {
      const newModerators = [
        ...(settings.moderators || []),
        { uid: targetUser.id, email: targetUser.email, permissions: ['matches'] }
      ];
      
      const newPermMap = { ...(settings.moderatorPermissions || {}) };
      newPermMap[targetUser.id] = ['matches'];

      await setDoc(doc(db, 'settings', 'global'), {
        moderators: newModerators,
        moderatorPermissions: newPermMap
      }, { merge: true });
      setModSearchEmail('');
      toast.success(`${targetUser.displayName || targetUser.email} is now a moderator!`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add moderator.");
    } finally {
      setModAdding(false);
    }
  };

  const handleModRemove = async (uid: string) => {
    if (!settings) return;
    try {
      const newModerators = settings.moderators?.filter(m => m.uid !== uid) || [];
      const newPermMap = { ...(settings.moderatorPermissions || {}) };
      delete newPermMap[uid];

      await setDoc(doc(db, 'settings', 'global'), {
        moderators: newModerators,
        moderatorPermissions: newPermMap
      }, { merge: true });
      toast.success("Moderator removed.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove moderator.");
    }
  };

  const handleModPermissionToggle = async (uid: string, permissionId: string) => {
    if (!settings) return;
    try {
      let updatedPerms: string[] = [];
      const newModerators = settings.moderators?.map(m => {
        if (m.uid === uid) {
          const hasPerm = m.permissions.includes(permissionId);
          updatedPerms = hasPerm 
            ? m.permissions.filter(p => p !== permissionId)
            : [...m.permissions, permissionId];
          return {
            ...m,
            permissions: updatedPerms
          };
        }
        return m;
      }) || [];

      const newPermMap = { ...(settings.moderatorPermissions || {}) };
      newPermMap[uid] = updatedPerms;

      await setDoc(doc(db, 'settings', 'global'), {
        moderators: newModerators,
        moderatorPermissions: newPermMap
      }, { merge: true });
    } catch (err) {
      console.error(err);
      toast.error("Failed to update permissions.");
    }
  };

  const addAuthorizedRecruiter = async (uid: string) => {
    if (!settings) return;
    const current = settings.authorizedRecruiters || [];
    if (current.includes(uid)) return;
    
    try {
      const settingsRef = doc(db, 'settings', 'global');
      await updateDoc(settingsRef, {
        authorizedRecruiters: [...current, uid]
      });
      toast.success("Recruiter authorized!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to authorize recruiter.");
    }
  };

  const removeAuthorizedRecruiter = async (uid: string) => {
    if (!settings) return;
    const current = settings.authorizedRecruiters || [];
    
    try {
      const settingsRef = doc(db, 'settings', 'global');
      await updateDoc(settingsRef, {
        authorizedRecruiters: current.filter(id => id !== uid)
      });
      toast.success("Authorization revoked.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to revoke authorization.");
    }
  };

  const handleResolvePassReq = async (reqId: string, email: string) => {
    const userToEdit = allUsers.find(u => u.email && u.email.toLowerCase().trim() === email.toLowerCase().trim());
    if (userToEdit) {
      setEditingUser(userToEdit);
      try {
        await deleteDoc(doc(db, 'passwordRequests', reqId));
      } catch (e) {
        console.error('Failed to cleanup password request', e);
      }
    } else {
      if (window.confirm(`Cannot find a registered user with email: ${email}.\nDo you want to delete this invalid request?`)) {
        try {
          await deleteDoc(doc(db, 'passwordRequests', reqId));
        } catch (e) {
          console.error('Failed to delete invalid password request', e);
          toast.error('Failed to delete request.');
        }
      }
    }
  };

  const handleImpersonate = async (uid: string) => {
    if (!settings?.maintenanceMode) {
      toast.error("Maintenance mode must be active to impersonate users.");
      return;
    }

    if (!window.confirm("ARE YOU SURE? You will be logged out of your current staff session and logged in as this user to test their experience during maintenance.")) {
      return;
    }

    setImpersonating(true);
    setProcessingId(uid);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ uid })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.loading("Switching identity...", { duration: 2000 });
      await signInWithCustomToken(auth, data.token);
      toast.success("Impersonation successful!");
      window.location.href = '/';
    } catch (err: any) {
      console.error(err);
      toast.error("Impersonation failed: " + err.message);
    } finally {
      setImpersonating(false);
      setProcessingId(null);
    }
  };

  const handleDeleteTeam = async () => {
    if (!deleteConfirmTeam || processingId) return;
    
    const { id, name } = deleteConfirmTeam;
    setProcessingId(id);
    
    try {
      const teamRef = doc(db, 'teams', id);
      await deleteDoc(teamRef);
      toast.success(`${name} deleted successfully.`);
      setDeleteConfirmTeam(null);
    } catch (err) {
      console.error('Delete attempt failed:', err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `teams/${id}`);
      } catch (finalErr: any) {
        toast.error("Permission Denied: You do not have authority to delete this team.");
        throw finalErr;
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirmUser || processingId) return;
    
    const { id, email } = deleteConfirmUser;
    setProcessingId(id);
    
    try {
      if (id) {
        try {
          const authUser = auth.currentUser;
          if (authUser) {
             const token = await authUser.getIdToken();
             const res = await fetch('/api/admin/delete-user', {
               method: 'POST',
               headers: {
                 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${token}`
               },
               body: JSON.stringify({ uid: id })
             });
             const data = await res.json();
             if (!res.ok) {
                throw new Error(data.error || 'Failed to delete user auth');
             }
             if (data.warning) {
                toast.success(data.warning);
             } else {
                toast.success(`User ${email} deleted successfully.`);
             }
          }
        } catch (apiErr: any) {
           console.error('API delete user error:', apiErr);
           toast.error('Error deleting user: ' + apiErr.message);
        }
      }
      setDeleteConfirmUser(null);
      if (activeTab === 'users') {
          fetchAuthUsers();
      }
    } catch (err) {
      console.error('Delete user failed:', err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `users/${id}`);
      } catch (finalErr: any) {
        toast.error("Permission Denied: You do not have authority to delete this user.");
        throw finalErr;
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleReset = async () => {
    if (!resetSection) return;
    setIsResetting(true);
    try {
      if (resetSection === 'stats') {
        const operations = [
          ...teams.map(team => ({ ref: doc(db, 'teams', team.id), data: { points: 100, diamonds: 100 } })),
          ...allUsers.map(user => ({ ref: doc(db, 'users', user.id), data: { points: 100, diamonds: 100 } }))
        ];

        // Chunk into 500 ops per batch
        const chunks = [];
        for (let i = 0; i < operations.length; i += 500) {
          chunks.push(operations.slice(i, i + 500));
        }

        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach(op => batch.update(op.ref, op.data));
          await batch.commit();
        }
        
        toast.success(`All ${operations.length} records have been reset to 100!`);
      } else {
        const colRef = collection(db, resetSection);
        const snapshot = await getDocs(colRef);
        
        // Firestore batch limit is 500
        const chunks = [];
        for (let i = 0; i < snapshot.docs.length; i += 500) {
          chunks.push(snapshot.docs.slice(i, i + 500));
        }

        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }
        toast.success(`${resetSection} have been cleared successfully!`);
      }
      setShowResetModal(false);
    } catch (err) {
      console.error(err);
      toast.error("Reset failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsResetting(false);
      setResetSection(null);
    }
  };



  const handleSiteReset = async () => {
    setIsSiteResetting(true);
    setSiteResetProgress('Starting site reset...');
    setSiteResetSuccessMessage(null);
    
    try {
      const sectionsToDelete = CLEARABLE_SECTIONS.filter(s => !sectionsToKeep.includes(s.id));
      
      for (const section of sectionsToDelete) {
        setSiteResetProgress('Clearing ' + section.name + '...');
        const colRef = collection(db, section.col);
        const snapshot = await getDocs(colRef);
        
        const chunks = [];
        for (let i = 0; i < snapshot.docs.length; i += 500) {
          chunks.push(snapshot.docs.slice(i, i + 500));
        }

        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }
      }
      
      setSiteResetSuccessMessage('Site has been successfully reset! Preserved sections were kept intact.');
      setSectionsToKeep([]);
      setShowSiteResetConfirm(false);
    } catch (err) {
      console.error(err);
      setSiteResetSuccessMessage('Site reset failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSiteResetting(false);
      setSiteResetProgress('');
    }
  };

  const fetchAuthUsers = async () => {
    setLoadingAuthUsers(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/list-auth-users', {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await response.json();
      if (response.ok) {
        setAuthUsers(data.users || []);
      } else {
        console.error('Failed to fetch auth users:', data.error);
        if(!data.error?.includes('Identity Toolkit API')) {
          toast.error('Failed to fetch Auth Accounts: \n\n' + data.error);
        }
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingAuthUsers(false);
    }
  };

  const syncAuthChanges = async () => {
    if (!editingUser || processingId) return;
    setProcessingId('auth-sync');
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/update-user-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          uid: editingUser.id,
          email: editingUser.email,
          password: editingUser.newPassword
        })
      });

      const responseText = await response.text();
      let data;
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (e) {
        throw new Error(`Invalid response from server: ${responseText || 'Empty response'}`);
      }
      if (!response.ok) throw new Error(data.error || "Sync failed");

      if (data.warning) {
          toast.success("Warning: " + data.warning);
      } else {
          toast.success("Auth account updated successfully without verification!");
      }
      setEditingUser({ ...editingUser, newPassword: '' });
    } catch (err: any) {
      toast.error("Auth Sync Error: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setProcessingId(editingUser.id);
    try {
      let finalLogoUrl = editingUser.logoUrl || '';
      if (finalLogoUrl) {
         try {
           finalLogoUrl = await Promise.race([
             uploadExternalImageToStorage(finalLogoUrl, 'users/logos'),
             new Promise<string>((resolve) => setTimeout(() => resolve(finalLogoUrl), 5000))
           ]);
         } catch(e) {
           finalLogoUrl = editingUser.logoUrl || '';
         }
      }

      const userRef = doc(db, 'users', editingUser.id);
      
      const payload: any = {
        email: editingUser.email,
        teamName: editingUser.teamName || '',
        leaderName: editingUser.leaderName || '',
        displayName: editingUser.displayName || editingUser.leaderName || '',
        points: Number(editingUser.points || 0),
        diamonds: Number(editingUser.diamonds || 0),
        role: editingUser.role || 'team',
        logoUrl: finalLogoUrl,
        phoneNumber: editingUser.phoneNumber || ''
      };

      await updateDoc(userRef, payload);

      // Also update team doc if it exists to sync fields
      if (editingUser.teamId) {
        const teamRef = doc(db, 'teams', editingUser.teamId);
        await updateDoc(teamRef, {
          teamName: payload.teamName,
          leaderName: payload.leaderName,
          logoUrl: payload.logoUrl
        }).catch(err => console.warn("Team sync failed (might not exist):", err));
      }

      toast.success("User document updated successfully!");
      setEditingUser(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update user.");
    } finally {
      setProcessingId(null);
    }
  };

  const adjustTeamSeason = async (teamId: string, seasonId: string) => {
    if (processingId) return;
    setProcessingId(teamId);
    try {
      await updateDoc(doc(db, 'teams', teamId), { seasonId });
      toast.success(seasonId ? "Team added to current season!" : "Team removed from season.");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to update season status.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleUpdateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeam) return;

    if (processingId) return;
    setProcessingId(editingTeam.id);
    setEditingErrorFields([]);

    try {
      const teamRef = doc(db, 'teams', editingTeam.id);
      const teamSnap = await getDoc(teamRef);
      const oldData = teamSnap.data() as Team;

      // --- UID Uniqueness Check ---
      const playersRaw = editingTeam.players || [];
      const players = playersRaw.filter(p => p.trim() !== '');
      
      if (players.length > 0) {
        // 1. Check existing approved teams, excluding current team
        const teamsQuery = query(collection(db, 'teams'), where('players', 'array-contains-any', players));
        const teamsSnapshot = await getDocs(teamsQuery);
        
        // Filter out current team if it's in the results
        const conflict = teamsSnapshot.docs.find(d => d.id !== editingTeam.id);
        
        if (conflict) {
          const conflictingTeamData = conflict.data();
          const teamName = conflictingTeamData.teamName;
          const matchedUid = players.find(uid => (conflictingTeamData.players as string[]).includes(uid));
          
          const conflictIdx = playersRaw.findIndex(u => u === matchedUid);
          if (conflictIdx !== -1) {
            setEditingErrorFields([conflictIdx]);
            setEditingErrorMap({ [conflictIdx]: `In Team: ${teamName}` });
          }

          toast.error(`Update Conflict: Player UID ${matchedUid} is already registered on team "${teamName}".`);
          setProcessingId(null);
          return;
        }

        // 2. Check pending registrations
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
          if (conflictIdx !== -1) {
            setEditingErrorFields([conflictIdx]);
            setEditingErrorMap({ [conflictIdx]: `Pending Reg: ${teamName}` });
          }

          toast.error(`Update Conflict: Player UID ${matchedUid} is already in a pending registration for team "${teamName}".`);
          setProcessingId(null);
          return;
        }
      }
      // --- End Check ---
      
      let finalLogoUrl = editingTeam.logoUrl || '';
      if (finalLogoUrl) {
         try {
           finalLogoUrl = await Promise.race([
             uploadExternalImageToStorage(finalLogoUrl, 'teams/logos'),
             new Promise<string>((resolve) => setTimeout(() => resolve(finalLogoUrl), 5000))
           ]);
         } catch(e) {
           finalLogoUrl = editingTeam.logoUrl || '';
         }
      }

      await updateDoc(teamRef, {
        teamName: editingTeam.teamName,
        leaderName: editingTeam.leaderName,
        points: Number(editingTeam.points),
        diamonds: Number(editingTeam.diamonds),
        upgradeLevel: Number(editingTeam.upgradeLevel),
        streak: Number(editingTeam.streak || 0),
        logoUrl: finalLogoUrl,
        phoneNumber: editingTeam.phoneNumber || '',
        seasonId: editingTeam.seasonId || '',
        players: players
      });

      // Log transaction if points or diamonds changed
      const pointDelta = Number(editingTeam.points) - (oldData.points || 0);
      const diamondDelta = Number(editingTeam.diamonds) - (oldData.diamonds || 0);

      if (pointDelta !== 0 || diamondDelta !== 0) {
        const transRef = doc(collection(db, 'transactions'));
        await setDoc(transRef, {
          teamId: editingTeam.id,
          ownerId: editingTeam.ownerId || editingTeam.id,
          type: (pointDelta > 0 || diamondDelta > 0) ? 'bonus' : 'expense',
          points: pointDelta,
          diamonds: diamondDelta,
          reason: 'Admin Manual Edit',
          timestamp: serverTimestamp(),
          allowedViewerUids: [editingTeam.ownerId || editingTeam.id, ...(editingTeam.players || [])].filter(Boolean)
        });
      }

      // Sync to user doc if it exists
      if (editingTeam.ownerId) {
        const userRef = doc(db, 'users', editingTeam.ownerId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          await updateDoc(userRef, {
            teamName: editingTeam.teamName,
            leaderName: editingTeam.leaderName,
            displayName: editingTeam.leaderName,
            logoUrl: finalLogoUrl,
            points: Number(editingTeam.points),
            diamonds: Number(editingTeam.diamonds)
          });
        }
      }

      toast.success("Team Updated!");
      setEditingTeam(null);
    } catch (err) {
      console.error('Update attempt failed:', err);
      handleFirestoreError(err, OperationType.UPDATE, `teams/${editingTeam.id}`);
    } finally {
      setProcessingId(null);
    }
  };

  const getYoutubeThumbnail = (url: string) => {
    try {
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
      const match = url.match(regExp);
      if (match && match[2].length === 11) {
        return `https://img.youtube.com/vi/${match[2]}/hqdefault.jpg`;
      }
    } catch (e) {
      console.error("Thumbnail extraction error", e);
    }
    return null;
  };

  const handleAddLiveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLiveLink.title || !newLiveLink.url) {
      toast.error("Title and URL are required");
      return;
    }
    setProcessingId('add-live-link');
    try {
      const team1 = teams.find(t => t.id === newLiveLink.team1Id);
      const team2 = teams.find(t => t.id === newLiveLink.team2Id);
      const thumbnailUrl = getYoutubeThumbnail(newLiveLink.url);

      await addDoc(collection(db, 'live_links'), {
        title: newLiveLink.title,
        url: newLiveLink.url,
        thumbnailUrl: thumbnailUrl || null,
        description: newLiveLink.description || '',
        order: Number(newLiveLink.order),
        team1Id: newLiveLink.team1Id || null,
        team2Id: newLiveLink.team2Id || null,
        team1Name: team1?.teamName || null,
        team2Name: team2?.teamName || null,
        team1Logo: team1?.logoUrl || null,
        team2Logo: team2?.logoUrl || null,
        createdAt: serverTimestamp()
      });
      setNewLiveLink({ 
        title: '', 
        url: '', 
        description: '', 
        order: liveLinks.length + 1,
        team1Id: '',
        team2Id: ''
      });
      toast.success("Live link added!");
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.CREATE, 'live_links');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteLiveLink = async (id: string) => {
    if (processingId) return;
    setProcessingId(id);
    try {
      await deleteDoc(doc(db, 'live_links', id));
      toast.success("Live link deleted");
      setConfirmLiveDeleteId(null);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `live_links/${id}`);
    } finally {
      setProcessingId(null);
    }
  };

  useEffect(() => {
    const email = auth.currentUser?.email;
    console.log("Admin Dashboard Access Diagnostics:", {
      email: email,
      uid: auth.currentUser?.uid,
      emailVerified: auth.currentUser?.emailVerified,
      isCorrectAdmin: email?.toLowerCase() === 'mlbbguildbangladesh@gmail.com'
    });
    
    if (email && email.toLowerCase() !== 'mlbbguildbangladesh@gmail.com' && !isModerator) {
      toast.error("Warning: You are authenticated as " + email + ". Firestore operations will likely fail because this is not a designated admin email.");
    }
  }, []);

  const [aiMessages, setAiMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'users' || activeTab === 'pass-reqs') {
      fetchAuthUsers();
    }
  }, [activeTab]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [aiMessages]);

  const sendAiCommand = async () => {
    if (!aiInput.trim() || isAiLoading) return;
    
    const userMessage = { role: 'user' as const, content: aiInput };
    setAiMessages(prev => [...prev, userMessage]);
    setAiInput('');
    setIsAiLoading(true);

    try {
      const history = aiMessages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      const context: SystemData = {
        teamsCount: teams.length,
        pendingRegistrationsCount: registrations.filter(r => r.status === 'pending').length,
        totalMatches: registrations.length + allSchedules.length, // Rough estimate
        schedules: allSchedules,
        recentLogs: transactions.slice(0, 20),
        settings: settings,
        moderatorsCount: allUsers.filter(u => u.isAdmin || u.isModerator).length
      };

      const responseText = await askGemini(userMessage.content, context, history);
      
      setAiMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
    } catch (err: any) {
      console.error(err);
      setAiMessages(prev => [...prev, { role: 'assistant', content: `Neural buffer overflow: ${err.message}` }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  if (!isAuthAdmin && !isModerator) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Shield size={64} className="text-neon-red animate-pulse" />
        <h2 className="text-2xl font-black text-neon-red">ACCESS DENIED</h2>
        <p className="text-gray-500">You do not have administrative privileges.</p>
        <Link to="/" className="text-neon-blue underline font-bold">Return Home</Link>
      </div>
    );
  }

  return (
    <div className="py-10 space-y-10">
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-black italic">CONTROL <span className="text-neon-blue">PANEL</span></h1>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Admin Management Dashboard</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Navigation Sidebar */}
        <div className="w-full lg:w-48 xl:w-56 flex-shrink-0 flex gap-2 lg:flex-col overflow-x-auto lg:overflow-y-auto pb-2 lg:pb-0 no-scrollbar px-4 lg:px-0 -mx-4 lg:mx-0 border-b lg:border-b-0 border-white/10 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] z-10 bg-[#0a0a0a] lg:bg-transparent">
          {[
            { id: 'registrations', icon: Shield, name: 'Regs' },
            { id: 'challenges', icon: Swords, name: 'Challenges' },
            { id: 'matches', icon: Sword, name: 'Record' },
            { id: 'teams', icon: Users, name: 'Teams' },
            { id: 'recruit', icon: Plus, name: 'Recruit' },
            { id: 'users', icon: UserIcon, name: 'Users' },
            { id: 'pass-reqs', icon: KeyRound, name: 'Pass Req' },
            { id: 'transactions', icon: History, name: 'Logs' },
            { id: 'seasons', icon: Calendar, name: 'Seasons' },
            { id: 'logo-update', icon: Image, name: 'Logos' },
            { id: 'live-links', icon: Youtube, name: 'Live' },
            { id: 'push-notifications', icon: Send, name: 'Push' },
            { id: 'settings', icon: Settings, name: 'Config' },
            { id: 'blueprint', icon: FileText, name: 'Blueprint' },
            { id: 'form-builder', icon: Filter, name: 'Forms' },
            { id: 'schedules', icon: Calendar, name: 'Schedule' },
            { id: 'ai', icon: Bot, name: 'AI' },
            { id: 'moderators', icon: Shield, name: 'Staff', adminOnly: true },
            { id: 'reset', icon: AlertTriangle, name: 'Reset', adminOnly: true }
          ].filter(tab => {
            if (isAuthAdmin) return true;
            if (isModerator) {
              if (tab.adminOnly) return false;
              return moderatorPermissions.includes(tab.id);
            }
            return false;
          }).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-3 px-4 py-3 font-black transition-all border-b-2 lg:border-b-0 lg:border-l-2 whitespace-nowrap text-[10px] sm:text-xs rounded-t-lg lg:rounded-t-none lg:rounded-r-lg lg:text-left ${
                activeTab === tab.id ? 'border-neon-blue lg:border-neon-blue text-neon-blue bg-neon-blue/5 lg:bg-white/5' : 'border-transparent text-gray-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon size={16} className="shrink-0" />
              <span>{tab.name.toUpperCase()}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 w-full min-w-0">
          <div className="mb-4 flex items-center justify-between bg-black/40 p-3 rounded-lg border border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">System Admin Session</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400">Authenticated as:</span>
              <span className="text-[10px] font-black text-neon-blue uppercase">{auth.currentUser?.email || "NOT SIGNED IN"}</span>
            </div>
          </div>
          <AnimatePresence mode="wait">
        {activeTab === 'registrations' && (
          <motion.div
            key="reg"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="flex gap-4 p-1 bg-white/5 rounded-xl border border-white/10 w-fit">
              {(['pending', 'approved', 'rejected'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setRegFilter(f)}
                  className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    regFilter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {registrations.filter(r => r.status === regFilter).length === 0 ? (
              <div className="glass-card p-20 text-center text-gray-500">No {regFilter} registrations found.</div>
            ) : (
              <div className="grid gap-6">
                {registrations.filter(r => r.status === regFilter).map(reg => (
                  <div key={reg.id} className="glass-card p-6 flex flex-col md:flex-row gap-8 items-start justify-between gaming-border-blue relative overflow-hidden">
                    {processingId === reg.id && (
                      <div className="absolute inset-0 bg-black/60 z-20 flex items-center justify-center backdrop-blur-[2px]">
                        <div className="w-8 h-8 border-4 border-neon-blue border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    <div className="flex gap-6">
                      <div className="w-20 h-20 rounded-xl bg-white/5 overflow-hidden flex-shrink-0 border border-white/10">
                        {reg.logoUrl ? <ImageWithFallback src={reg.logoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/20 font-black text-2xl">?</div>}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="text-2xl font-black text-neon-blue">{reg.teamName}</h3>
                          {reg.type === 'old' && <span className="px-2 py-0.5 bg-yellow-400/10 text-yellow-400 text-[8px] font-black tracking-widest rounded border border-yellow-400/20 uppercase">Legacy Team</span>}
                        </div>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Leader: {reg.leaderName}</p>
                        {reg.uniqueId && (
                           <p className="text-xs font-black text-yellow-500 uppercase tracking-widest mt-1">Ticket Number: {reg.uniqueId}</p>
                        )}
                        <div className="flex flex-col gap-1 mt-1">
                          <p className="text-xs text-gray-500">{reg.leaderEmail}</p>
                          {reg.phoneNumber && (
                            <p className="text-xs font-bold text-neon-blue">PH: {reg.phoneNumber}</p>
                          )}
                        </div>
                        {reg.customData && Object.keys(reg.customData).length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {Object.entries(reg.customData).map(([key, value]) => {
                               const field = settings?.formFields?.find(f => f.id === key);
                               const label = field?.label || key;
                               const isUrl = typeof value === 'string' && value.startsWith('http');
                               return (
                                 <span key={key} className="px-2 py-0.5 bg-neon-blue/10 border border-neon-blue/20 rounded text-[10px] font-bold text-neon-blue uppercase">
                                   {label}: 
                                   <span className="text-white ml-1">
                                     {isUrl ? (
                                       <a href={value as string} target="_blank" rel="noreferrer" className="underline hover:text-neon-blue">
                                         {field?.type === 'image' ? 'View Image' : 'View File'}
                                       </a>
                                     ) : (
                                       value as string
                                     )}
                                   </span>
                                 </span>
                               );
                            })}
                          </div>
                        )}
                        <div className="flex gap-2 flex-wrap mt-2">
                          {reg.players.map((p, i) => (
                            <span key={`${reg.id}-p-${i}`} className="px-2 py-0.5 bg-white/5 rounded text-[10px] font-bold text-gray-500">{p}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4 flex-wrap">
                      {reg.leaderCardUrl && (
                        <button 
                          onClick={() => setSelectedCard(reg.leaderCardUrl)}
                          className="px-4 py-2 bg-white/5 rounded-lg text-xs font-bold hover:bg-white/10 transition-all flex items-center gap-2 border border-white/10"
                        >
                          <Eye size={14} /> VIEW ID CARD
                        </button>
                      )}
                      
                      {reg.status === 'pending' && (
                        <>
                          <button onClick={() => handleApprove(reg)} className="px-6 py-2 bg-neon-blue text-black rounded-lg text-sm font-black flex items-center gap-2 shadow-[0_0_15px_rgba(0,229,255,0.2)] hover:brightness-110 active:scale-95 transition-all">
                            <Check size={18} /> APPROVE
                          </button>
                          
                          <button 
                            onClick={() => setConfirmRejectId(reg.id)}
                            className="px-6 py-2 bg-neon-red/20 text-neon-red rounded-lg text-sm font-black flex items-center gap-2 border border-neon-red/20 hover:bg-neon-red/30 transition-all"
                          >
                            <X size={18} /> REJECT
                          </button>
                        </>
                      )}

                      <button 
                        onClick={() => setConfirmDeleteRegId(reg.id)}
                        className="px-4 py-2 bg-neon-red/10 text-neon-red rounded-lg text-xs font-black flex items-center gap-2 border border-neon-red/10 hover:bg-neon-red/20 transition-all font-mono"
                      >
                        DELETE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'challenges' && (
          <motion.div
            key="challenges-tab"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <ChallengesAdmin />
          </motion.div>
        )}

        {activeTab === 'matches' && (
          <motion.div
            key="match"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto space-y-8"
          >
            {/* Pending Result Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-neon-red shadow-[0_0_10px_rgba(255,46,99,0.5)]" />
                <h2 className="text-xl font-black italic tracking-widest uppercase">Awaiting <span className="text-neon-red">Results</span></h2>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {allSchedules
                  .filter(m => {
                    const matchTime = new Date(`${m.date}T${m.time}`).getTime();
                    return Date.now() > matchTime && m.status === 'upcoming';
                  })
                  .map(m => (
                    <div key={m.id} className="glass-card p-4 border border-neon-red/20 flex items-center justify-between group">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-white">{m.team1Name}</span>
                          <span className="text-[10px] font-black text-gray-600">VS</span>
                          <span className="text-xs font-black text-white">{m.team2Name}</span>
                        </div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                          {new Date(`${m.date}T${m.time}`).toLocaleString()}
                        </p>
                      </div>
                      <button 
                        onClick={() => setMatchData({
                          teamA: m.team1Id,
                          teamB: m.team2Id,
                          winner: '',
                          type: 'win',
                          scheduleId: m.id
                        })}
                        className="px-3 py-1.5 bg-neon-red/10 hover:bg-neon-red text-neon-red hover:text-white border border-neon-red/20 rounded text-[10px] font-black uppercase transition-all"
                      >
                        Record
                      </button>
                    </div>
                  ))
                }
                {allSchedules.filter(m => {
                  const matchTime = new Date(`${m.date}T${m.time}`).getTime();
                  return Date.now() > matchTime && m.status === 'upcoming';
                }).length === 0 && (
                  <div className="md:col-span-2 glass-card p-6 text-center text-[10px] font-black text-gray-600 uppercase tracking-widest border-dashed border-white/5">
                    No matches currently awaiting result entry
                  </div>
                )}
              </div>
            </div>

            <div className="glass-card p-10 space-y-8 gaming-border-blue relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-neon-blue/5 -mr-16 -mt-16 rounded-full blur-3xl" />
              <div className="text-center space-y-2 relative z-10">
                <h2 className="text-3xl font-black italic">MANUAL <span className="text-neon-blue">SUBMISSION</span></h2>
                <p className="text-gray-500 text-sm font-bold uppercase tracking-widest italic leading-tight">Record official tournament outcomes here</p>
              </div>

              <form onSubmit={submitMatch} className="space-y-6 relative z-10">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-gray-500">Team A (Blue Side)</label>
                  <select
                    required
                    value={matchData.teamA}
                    onChange={(e) => setMatchData({...matchData, teamA: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 focus:ring-1 focus:ring-neon-blue outline-none"
                  >
                    <option value="" className="bg-black">Select Team</option>
                    {teams.map(t => <option key={t.id} value={t.id} className="bg-black">{t.teamName}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-gray-500">Team B (Red Side)</label>
                  <select
                    required
                    value={matchData.teamB}
                    onChange={(e) => setMatchData({...matchData, teamB: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 focus:ring-1 focus:ring-neon-red outline-none"
                  >
                    <option value="" className="bg-black">Select Team</option>
                    {teams.map(t => <option key={t.id} value={t.id} className="bg-black">{t.teamName}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-gray-500">Result Type</label>
                  <select
                    value={matchData.type}
                    onChange={(e) => setMatchData({...matchData, type: e.target.value as any})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 outline-none"
                  >
                    <option value="win" className="bg-black">Match Win</option>
                    <option value="walkout" className="bg-black">Walkout (Penalty)</option>
                    <option value="rematch" className="bg-black">Rematch (No points)</option>
                  </select>
                </div>
                {['win', 'walkout'].includes(matchData.type) && (
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase text-gray-500">
                      {matchData.type === 'win' ? 'Winner' : 'Team that performed Walkout'}
                    </label>
                    <select
                      required
                      value={matchData.winner}
                      onChange={(e) => setMatchData({...matchData, winner: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 outline-none"
                    >
                      <option value="" className="bg-black">Select Team</option>
                      {teams.filter(t => t.id === matchData.teamA || t.id === matchData.teamB).map(t => (
                        <option key={t.id} value={t.id} className="bg-black">{t.teamName}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <button className="w-full bg-neon-blue text-black font-black py-4 rounded-xl neon-glow-blue hover:brightness-110 active:scale-95 transition-all mt-4">
                CONFIRM MATCH RESULT
              </button>
            </form>
          </div>
        </motion.div>
        )}

        {activeTab === 'teams' && (
          <motion.div
            key="teams-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black italic">ACTIVE <span className="text-neon-blue">GUILD</span></h2>
              <button 
                onClick={() => setShowManualAdd(!showManualAdd)}
                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-black hover:bg-white/10"
              >
                {showManualAdd ? 'CANCEL' : 'MANUAL ADD TEAM'}
              </button>
            </div>

            {showManualAdd && (
              <motion.form 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                onSubmit={handleManualCreate} 
                className="glass-card p-6 space-y-4 gaming-border-blue"
              >
                <div className="grid md:grid-cols-2 gap-4">
                  <input placeholder="Team Name" className="bg-white/5 border border-white/10 rounded-lg p-2" value={manualTeam.teamName} onChange={e => setManualTeam({...manualTeam, teamName: e.target.value})} required />
                  <input placeholder="Leader Name" className="bg-white/5 border border-white/10 rounded-lg p-2" value={manualTeam.leaderName} onChange={e => setManualTeam({...manualTeam, leaderName: e.target.value})} required />
                  <input placeholder="Leader Email" className="bg-white/5 border border-white/10 rounded-lg p-2" value={manualTeam.leaderEmail} onChange={e => setManualTeam({...manualTeam, leaderEmail: e.target.value})} required />
                  <input type="password" placeholder="Account Password" title="Min 6 characters" className="bg-white/5 border border-white/10 rounded-lg p-2" value={manualTeam.password} onChange={e => setManualTeam({...manualTeam, password: e.target.value})} required />
                  <input placeholder="Logo URL" className="bg-white/5 border border-white/10 rounded-lg p-2" value={manualTeam.logoUrl} onChange={e => {
                    let value = e.target.value;
                    if (value.includes('drive.google.com')) {
                      const match1 = value.match(/\/d\/([a-zA-Z0-9_-]+)/);
                      const match2 = value.match(/id=([a-zA-Z0-9_-]+)/);
                      const id = (match1 && match1[1]) ? match1[1] : (match2 && match2[1] ? match2[1] : null);
                      if (id) {
                        value = `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
                      }
                    }
                    setManualTeam({...manualTeam, logoUrl: value})
                  }} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((num, idx) => (
                    <div key={num} className="flex flex-col gap-1 w-full">
                      <input 
                        placeholder={num <= 5 ? `Player ${num} UID` : `Sub ${num - 5} UID (Optional)`} 
                        className={`bg-white/5 border rounded-lg p-2 text-xs transition-all w-full ${
                          manualErrorFields.includes(idx)
                            ? 'border-neon-red bg-neon-red/5 text-neon-red placeholder:text-neon-red/40'
                            : 'border-white/10'
                        }`}
                        inputMode="numeric" 
                        value={(manualTeam as any)[`player${num}`]} 
                        onChange={e => {
                          setManualTeam({...manualTeam, [`player${num}`]: e.target.value.replace(/\D/g, '')});
                          if (manualErrorFields.length > 0) setManualErrorFields([]);
                          if (Object.keys(manualErrorMap).length > 0) setManualErrorMap({});
                        }} 
                        required={num === 1}
                      />
                      {manualErrorMap[idx] && (
                        <span className="text-[9px] text-neon-red font-black uppercase tracking-wider">{manualErrorMap[idx]}</span>
                      )}
                    </div>
                  ))}
                </div>
                <button type="submit" className="w-full py-3 bg-neon-blue text-black font-black rounded-lg">CREATE TEAM MANUALLY</button>
              </motion.form>
            )}

            <div className="grid md:grid-cols-3 gap-6">
              {teams.map(team => (
              <div key={team.id} className="glass-card p-6 space-y-4 border border-white/5 hover:border-white/20 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-white/5 overflow-hidden">
                    {team.logoUrl && <ImageWithFallback src={team.logoUrl} className="w-full h-full object-cover" />}
                  </div>
                  <div>
                    <h3 className="font-black text-lg">{team.teamName}</h3>
                    <div className="flex gap-2 items-center">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{team.uniqueId}</p>
                      {team.seasonId && (
                        <span className="px-1.5 rounded bg-white/10 text-white text-[10px] font-black tracking-widest uppercase">
                          {seasons.find(s => s.id === team.seasonId)?.name || 'Season'}
                        </span>
                      )}
                    </div>
                    {team.phoneNumber && <p className="text-[10px] font-bold text-neon-blue uppercase mt-1">{team.phoneNumber}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/5 p-3 rounded-lg text-center relative group">
                    <p className="text-[10px] font-black text-gray-500 uppercase">Points</p>
                    <p className="text-xl font-black text-neon-blue">{team.points}</p>
                    <div className="absolute inset-0 flex items-center justify-between px-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 rounded-lg">
                      <button 
                        onClick={() => adjustResources(team.id, -10, 0, 'Admin deduction')}
                        className="p-1 hover:text-neon-red text-gray-400 transition-colors"
                      >
                        <Minus size={16} />
                      </button>
                      <button 
                        onClick={() => adjustResources(team.id, 10, 0, 'Admin gift')}
                        className="p-1 hover:text-neon-blue text-gray-400 transition-colors"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-lg text-center relative group">
                    <p className="text-[10px] font-black text-gray-500 uppercase">Diamonds</p>
                    <p className="text-xl font-black text-neon-cyan">{team.diamonds}</p>
                    <div className="absolute inset-0 flex items-center justify-between px-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 rounded-lg">
                      <button 
                        onClick={() => adjustResources(team.id, 0, -10, 'Admin deduction')}
                        className="p-1 hover:text-neon-red text-gray-400 transition-colors"
                      >
                        <Minus size={16} />
                      </button>
                      <button 
                        onClick={() => adjustResources(team.id, 0, 10, 'Admin gift')}
                        className="p-1 hover:text-neon-cyan text-gray-400 transition-colors"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                {team.customData && Object.keys(team.customData).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(team.customData).map(([key, value]) => {
                       const field = settings?.formFields?.find(f => f.id === key);
                       const label = field?.label || key;
                       const isUrl = typeof value === 'string' && value.startsWith('http');
                       return (
                         <span key={key} className="px-2 py-0.5 bg-neon-blue/10 border border-neon-blue/20 rounded text-[10px] font-bold text-neon-blue uppercase">
                           {label}: 
                           <span className="text-white ml-1">
                             {isUrl ? (
                               <a href={value as string} target="_blank" rel="noreferrer" className="underline hover:text-neon-blue">
                                 {field?.type === 'image' ? 'View Image' : 'View File'}
                               </a>
                             ) : (
                               value as string
                             )}
                           </span>
                         </span>
                       );
                    })}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Link 
                      to={`/profile?id=${team.id}`}
                      className="flex-1 py-2 px-3 rounded-lg bg-white/5 text-[10px] font-black hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                    >
                      <UserIcon size={12} className="text-neon-blue" />
                      VIEW
                    </Link>
                    <button 
                      onClick={() => setEditingTeam(team)}
                      className="flex-1 py-2 px-3 rounded-lg bg-neon-blue/10 text-neon-blue text-[10px] font-black hover:bg-neon-blue/20 transition-all flex items-center justify-center gap-2"
                    >
                      <Settings size={12} />
                      EDIT
                    </button>
                    <button 
                      onClick={() => setDeleteConfirmTeam({ id: team.id, name: team.teamName })}
                      className="flex-1 py-2 px-3 rounded-lg bg-neon-red/10 text-neon-red text-[10px] font-black hover:bg-neon-red/20 transition-all font-mono"
                    >
                      DELETE
                    </button>
                  </div>
                  {settings?.currentSeasonId && (
                    <div className="flex flex-wrap gap-2">
                      {team.seasonId === settings.currentSeasonId ? (
                        <button
                          onClick={() => adjustTeamSeason(team.id, '')}
                          disabled={!!processingId}
                          className="flex-1 py-2 px-3 rounded-lg bg-neon-red/10 text-neon-red text-[10px] font-black hover:bg-neon-red/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Minus size={12} />
                          REMOVE FROM ACTIVE SEASON
                        </button>
                      ) : (
                        <button
                          onClick={() => adjustTeamSeason(team.id, settings.currentSeasonId!)}
                          disabled={!!processingId}
                          className="flex-1 py-2 px-3 rounded-lg bg-neon-cyan/10 text-neon-cyan text-[10px] font-black hover:bg-neon-cyan/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Plus size={12} />
                          ADD TO CURRENT SEASON
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            </div>
          </motion.div>
        )}

        {activeTab === 'recruit' && (
          <motion.div
            key="recruit-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black italic">RECRUITMENT <span className="text-neon-blue">MANAGEMENT</span></h2>
              <div className="flex items-center gap-4">
                <button 
                  onClick={async () => {
                    if (window.confirm("Grant 2 recruitment slots to all approved teams?")) {
                      const batch = writeBatch(db);
                      teams.forEach(t => {
                        batch.update(doc(db, 'teams', t.id), { recruitmentSlots: 2 });
                      });
                      await batch.commit();
                      toast.success("Bulk update complete!");
                    }
                  }}
                  className="px-4 py-2 bg-neon-blue/10 border border-neon-blue/20 rounded-lg text-[10px] font-black text-neon-blue hover:bg-neon-blue hover:text-black transition-all uppercase tracking-widest"
                >
                  Bulk Grant (2 Slots)
                </button>
                <div className="text-right">
                  <p className="text-[10px] font-black text-neon-blue uppercase tracking-widest">Active Approved Teams</p>
                  <p className="text-xs font-bold text-gray-500 uppercase">{teams.length} Teams Registered</p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {teams.map(team => (
                <div key={team.id} className="glass-card p-6 space-y-6 border border-white/5 hover:border-neon-blue/20 transition-all group overflow-hidden relative">
                   <div className="absolute top-0 right-0 w-24 h-24 bg-neon-blue/5 -mr-12 -mt-12 rounded-full blur-2xl group-hover:bg-neon-blue/10 transition-all text-right" />
                  
                  <div className="flex items-center gap-4 relative z-10">
                    <div className="w-16 h-16 rounded-xl bg-white/5 overflow-hidden border border-white/10 shrink-0">
                      {team.logoUrl ? <ImageWithFallback src={team.logoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/10 font-bold italic">LOGO</div>}
                    </div>
                    <div>
                      <h3 className="font-black text-xl text-white group-hover:text-neon-blue transition-colors truncate max-w-[150px]">{team.teamName}</h3>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Leader: {team.leaderName}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-[8px] font-black px-1.5 py-0.5 bg-white/5 rounded text-gray-400 uppercase">{team.uniqueId}</span>
                        <span className="text-[8px] font-black px-1.5 py-0.5 bg-neon-blue/10 rounded text-neon-blue uppercase">{team.points} Pts</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 relative z-10">
                    <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3">
                      <div className="flex justify-between items-center">
                         <div className="flex items-center gap-2">
                           <Users size={14} className="text-neon-blue" />
                           <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Recruitment Slots</span>
                         </div>
                         <div className="px-3 py-1 bg-neon-blue/10 rounded-full border border-neon-blue/20">
                           <span className="text-xl font-mono font-black text-neon-blue">{team.recruitmentSlots || 0}</span>
                         </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2">
                         <button 
                           onClick={() => adjustRecruitmentSlots(team.id, 1)}
                           disabled={processingId === team.id}
                           className="py-2.5 bg-white/5 hover:bg-neon-blue/20 hover:text-neon-blue border border-white/10 hover:border-neon-blue/30 rounded-lg text-xs font-black transition-all flex flex-col items-center justify-center gap-1 group/btn"
                         >
                           <Plus size={14} className="group-hover/btn:scale-125 transition-transform" />
                           <span>ONE</span>
                         </button>
                         <button 
                           onClick={() => adjustRecruitmentSlots(team.id, 2)}
                           disabled={processingId === team.id}
                           className="py-2.5 bg-white/5 hover:bg-neon-blue/20 hover:text-neon-blue border border-white/10 hover:border-neon-blue/30 rounded-lg text-xs font-black transition-all flex flex-col items-center justify-center gap-1 group/btn"
                         >
                           <Users size={14} className="group-hover/btn:scale-110 transition-transform" />
                           <span>TWO</span>
                         </button>
                         <button 
                           onClick={() => adjustRecruitmentSlots(team.id, 5 - (team.recruitmentSlots || 0))}
                           disabled={processingId === team.id || (team.recruitmentSlots || 0) >= 10}
                           className="py-2.5 bg-neon-blue/10 hover:bg-neon-blue text-neon-blue hover:text-black border border-neon-blue/20 rounded-lg text-xs font-black transition-all flex flex-col items-center justify-center gap-1 group/btn"
                         >
                           <Shield size={14} className="group-hover/btn:animate-pulse" />
                           <span>FULL</span>
                         </button>
                      </div>

                      {(team.recruitmentSlots || 0) > 0 && (
                        <button 
                          onClick={() => adjustRecruitmentSlots(team.id, -(team.recruitmentSlots || 0))}
                          disabled={processingId === team.id}
                          className="w-full py-2 bg-neon-red/10 hover:bg-neon-red text-neon-red hover:text-white border border-neon-red/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                        >
                          Revoke All Access
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[9px] font-bold text-gray-500 italic uppercase">
                      <AlertCircle size={10} />
                      {team.recruitmentSlots ? `Enables leader to recruit ${team.recruitmentSlots} players` : "Recruitment access currently restricted"}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {teams.length === 0 && (
              <div className="glass-card p-20 text-center space-y-4">
                <Users size={48} className="mx-auto text-gray-700" />
                <p className="text-gray-500 font-bold uppercase tracking-widest">No active teams to manage recruitment</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'transactions' && (
          <motion.div
            key="transactions"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
              <h2 className="text-2xl font-black italic">TRANSACTION <span className="text-neon-blue">HISTORY</span></h2>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{transactions.length} Records Found</p>
            </div>

            {/* Mobile View: Cards */}
            <div className="md:hidden space-y-4">
              {transactions.map((t) => {
                const team = teams.find(team => team.id === t.teamId);
                return (
                  <div key={t.id} className="glass-card p-4 space-y-3 gaming-border-blue text-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                          {team?.logoUrl ? <ImageWithFallback src={team.logoUrl} className="w-full h-full object-cover" /> : <Users size={14} />}
                        </div>
                        <div>
                          <p className="font-bold text-white">{team?.teamName || 'Unknown Team'}</p>
                          <p className="text-[10px] font-mono text-gray-500">{new Date(t.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest ${
                        t.type === 'win' || t.type === 'bonus' ? 'bg-neon-blue/10 text-neon-blue' :
                        t.type === 'loss' || t.type === 'expense' ? 'bg-neon-red/10 text-neon-red' :
                        t.type === 'shop' ? 'bg-neon-cyan/10 text-neon-cyan' :
                        'bg-yellow-400/10 text-yellow-400'
                      }`}>
                        {t.type}
                      </span>
                    </div>

                    <div className="flex justify-between items-end border-t border-white/5 pt-3">
                      <div className="text-xs text-gray-400 leading-tight pr-4">
                        <p className="text-[10px] font-black text-gray-600 uppercase mb-1">Reason</p>
                        {t.reason}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-black text-gray-600 uppercase mb-1">Amount</p>
                        <div className="flex flex-col items-end gap-0.5">
                          {t.points !== 0 && (
                            <span className={`text-xs font-black ${t.points > 0 ? 'text-neon-blue' : 'text-neon-red'}`}>
                              {t.points > 0 ? '+' : ''}{t.points} PTS
                            </span>
                          )}
                          {t.diamonds !== 0 && (
                            <span className={`text-xs font-black ${t.diamonds > 0 ? 'text-neon-cyan' : 'text-neon-red'}`}>
                              {t.diamonds > 0 ? '+' : ''}{t.diamonds} DIA
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {transactions.length === 0 && (
                <div className="glass-card p-10 text-center text-gray-500">No history found.</div>
              )}
            </div>

            {/* Desktop View: Table */}
            <div className="hidden md:block glass-card overflow-hidden">
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                   <thead>
                     <tr className="bg-white/5 border-b border-white/10">
                       <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Timestamp</th>
                       <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Team</th>
                       <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</th>
                       <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount</th>
                       <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Reason</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-white/5">
                     {transactions.map((t) => {
                       const team = teams.find(team => team.id === t.teamId);
                       return (
                         <tr key={t.id} className="hover:bg-white/5 transition-colors">
                           <td className="px-6 py-4 text-[10px] font-mono text-gray-500">
                             {new Date(t.timestamp).toLocaleString()}
                           </td>
                           <td className="px-6 py-4">
                             <div className="flex items-center gap-2">
                               <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                                 {team?.logoUrl ? <ImageWithFallback src={team.logoUrl} className="w-full h-full object-cover" /> : <Users size={12} />}
                               </div>
                               <span className="text-sm font-bold">{team?.teamName || 'Unknown Team'}</span>
                             </div>
                           </td>
                           <td className="px-6 py-4">
                             <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest ${
                               t.type === 'win' || t.type === 'bonus' ? 'bg-neon-blue/10 text-neon-blue' :
                               t.type === 'loss' || t.type === 'expense' ? 'bg-neon-red/10 text-neon-red' :
                               t.type === 'shop' ? 'bg-neon-cyan/10 text-neon-cyan' :
                               'bg-yellow-400/10 text-yellow-400'
                             }`}>
                               {t.type}
                             </span>
                           </td>
                           <td className="px-6 py-4">
                             <div className="flex flex-col gap-0.5">
                               {t.points !== 0 && (
                                 <span className={`text-xs font-black ${t.points > 0 ? 'text-neon-blue' : 'text-neon-red'}`}>
                                   {t.points > 0 ? '+' : ''}{t.points} PTS
                                 </span>
                               )}
                               {t.diamonds !== 0 && (
                                 <span className={`text-xs font-black ${t.diamonds > 0 ? 'text-neon-cyan' : 'text-neon-red'}`}>
                                   {t.diamonds > 0 ? '+' : ''}{t.diamonds} DIA
                                 </span>
                               )}
                             </div>
                           </td>
                           <td className="px-6 py-4 text-xs text-gray-400 max-w-[200px] truncate">
                             {t.reason}
                           </td>
                         </tr>
                       );
                     })}
                   </tbody>
                 </table>
               </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'users' && (
          <motion.div
            key="users-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
              <h2 className="text-2xl font-black italic text-neon-blue">REGISTERED <span className="text-white">ACCOUNTS</span></h2>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{allUsers.length} total users</p>
            </div>

            {/* Mobile View: Cards */}
            <div className="md:hidden space-y-4">
              {allUsers.map((u) => (
                <div key={u.id} className="glass-card p-4 space-y-4 gaming-border-blue">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10 overflow-hidden">
                        {u.logoUrl ? <ImageWithFallback src={u.logoUrl} className="w-full h-full object-cover" /> : <UserIcon size={24} />}
                      </div>
                      <div>
                        <p className="text-base font-black text-white">{u.displayName || u.leaderName || 'Unknown'}</p>
                        <p className="text-[10px] text-gray-500 font-mono italic">{u.email}</p>
                        {u.phoneNumber && <p className="text-[10px] font-black text-neon-blue mt-1 uppercase">PH: {u.phoneNumber}</p>}
                        <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold">PASS: <span className="font-mono text-neon-blue normal-case">{u.visiblePassword || '●●●●●●'}</span></p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-widest ${
                      u.role === 'admin' ? 'bg-neon-red/10 text-neon-red border border-neon-red/20' : 'bg-white/10 text-white'
                    }`}>
                      {u.role || 'team'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-3 border-y border-white/5">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-neon-blue uppercase leading-none">{u.teamName || 'NO TEAM'}</p>
                      <p className="text-[8px] font-bold text-gray-600 uppercase tracking-tight">Active Team</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-right">
                        <p className="text-[10px] font-black text-neon-blue leading-none">{u.points || 0}</p>
                        <p className="text-[8px] font-bold text-gray-600 uppercase">Points</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-neon-cyan leading-none">{u.diamonds || 0}</p>
                        <p className="text-[8px] font-bold text-gray-600 uppercase">Diamonds</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {settings?.maintenanceMode && (
                      <button 
                        onClick={() => handleImpersonate(u.id)}
                        disabled={!!processingId}
                        className="flex-1 py-2 bg-neon-purple/10 hover:bg-neon-purple/20 rounded-lg text-neon-purple transition-colors flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest border border-neon-purple/20"
                      >
                         <Lock size={14} /> LOGIN
                      </button>
                    )}
                    <Link 
                      to={`/profile?id=${u.teamId || u.id}`}
                      className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-neon-blue transition-colors flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest"
                    >
                      <Eye size={14} /> VIEW
                    </Link>
                    <button 
                      onClick={() => setEditingUser(u)}
                      className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-neon-blue transition-colors flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest"
                    >
                      <Settings size={14} /> EDIT
                    </button>
                    <button 
                      onClick={() => setDeleteConfirmUser({ id: u.id, email: u.email })}
                      className="p-2 bg-neon-red/10 hover:bg-neon-red/20 rounded-lg text-neon-red transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop View: Table */}
            <div className="hidden md:block glass-card overflow-hidden">
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                   <thead>
                     <tr className="bg-white/5 border-b border-white/10">
                       <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">User Info</th>
                       <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Team Role</th>
                       <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Stats</th>
                       <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-white/5">
                     {allUsers.map((u) => (
                       <tr key={u.id} className="hover:bg-white/5 transition-colors">
                         <td className="px-6 py-4">
                           <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 overflow-hidden">
                               {u.logoUrl ? <ImageWithFallback src={u.logoUrl} className="w-full h-full object-cover" /> : <UserIcon size={20} />}
                             </div>
                             <div>
                               <p className="text-sm font-bold text-white">{u.displayName || u.leaderName || 'Unknown'}</p>
                               <p className="text-[10px] text-gray-500 font-mono">{u.email}</p>
                               {u.phoneNumber && <p className="text-[9px] font-black text-neon-blue mt-1 uppercase">PH: {u.phoneNumber}</p>}
                               <p className="text-[9px] text-gray-400 mt-1 uppercase font-bold">PASS: <span className="font-mono text-neon-blue normal-case">{u.visiblePassword || '●●●●●●'}</span></p>
                             </div>
                           </div>
                         </td>
                         <td className="px-6 py-4">
                           <div className="space-y-1">
                             <p className="text-xs font-black text-neon-blue">{u.teamName || 'NO TEAM'}</p>
                             <span className={`px-2 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-widest ${
                               u.role === 'admin' ? 'bg-neon-red/10 text-neon-red border border-neon-red/20' : 'bg-white/10 text-white'
                             }`}>
                               {u.role || 'team'}
                             </span>
                           </div>
                         </td>
                         <td className="px-6 py-4">
                            <div className="flex gap-4">
                              <div>
                                <p className="text-[8px] font-black text-gray-500 uppercase">Points</p>
                                <p className="text-xs font-black text-neon-blue">{u.points || 0}</p>
                              </div>
                              <div>
                                <p className="text-[8px] font-black text-gray-500 uppercase">Diamonds</p>
                                <p className="text-xs font-black text-neon-cyan">{u.diamonds || 0}</p>
                              </div>
                            </div>
                         </td>
                         <td className="px-6 py-4">
                           <div className="flex gap-2 text-blue-500">
                             {settings?.maintenanceMode && (
                                <button 
                                  onClick={() => handleImpersonate(u.id)}
                                  disabled={!!processingId}
                                  className="p-2 bg-neon-purple/10 hover:bg-neon-purple/20 rounded-lg text-neon-purple transition-colors border border-neon-purple/20"
                                  title="Login as user"
                                >
                                  {processingId === u.id ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                                </button>
                              )}
                             <Link 
                               to={`/profile?id=${u.teamId || u.id}`}
                               className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-neon-blue transition-colors"
                             >
                               <Eye size={16} />
                             </Link>
                             <button 
                               onClick={() => setEditingUser(u)}
                               className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-neon-blue transition-colors"
                             >
                               <Settings size={16} />
                             </button>
                             <button 
                               onClick={() => setDeleteConfirmUser({ id: u.id, email: u.email })}
                               className="p-2 bg-neon-red/10 hover:bg-neon-red/20 rounded-lg text-neon-red transition-colors"
                             >
                               <X size={16} />
                             </button>
                           </div>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>

            <div className="pt-8 mt-8 border-t border-white/10">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-6">
                <h2 className="text-2xl font-black italic text-neon-blue">FIREBASE AUTH <span className="text-white">ACCOUNTS</span></h2>
                <div className="flex items-center gap-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{authUsers.length} total auth accounts</p>
                  <button onClick={fetchAuthUsers} disabled={loadingAuthUsers} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50">
                     {loadingAuthUsers ? 'LOADING...' : 'REFRESH'}
                  </button>
                </div>
              </div>

              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10">
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Email</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Display Name</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Created At</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {authUsers.map((u) => (
                        <tr key={u.uid} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-sm items-center flex gap-2 font-mono text-white">{u.email}</p>
                            <p className="text-[9px] text-gray-500 font-mono mt-1">UID: {u.uid}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-gray-300">{u.displayName}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs font-mono text-gray-400">{new Date(u.creationTime).toLocaleString()}</p>
                          </td>
                          <td className="px-6 py-4">
                             <button 
                               onClick={() => setDeleteConfirmUser({ id: u.uid, email: u.email })}
                               className="p-2 bg-neon-red/10 hover:bg-neon-red/20 rounded-lg text-neon-red transition-colors"
                             >
                               <X size={16} />
                             </button>
                          </td>
                        </tr>
                      ))}
                      {authUsers.length === 0 && !loadingAuthUsers && (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-sm font-bold text-gray-500 uppercase tracking-widest">
                             No Auth Accounts Found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'pass-reqs' && (
          <motion.div
            key="pass-reqs-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
              <h2 className="text-2xl font-black italic text-neon-blue">PASSWORD <span className="text-white">REQUESTS</span></h2>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{passwordRequests.length} total reqs</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {passwordRequests.map(req => {
                const targetUser = allUsers.find(u => u.email && u.email.toLowerCase().trim() === req.email.toLowerCase().trim());
                return (
                  <div key={req.id} className="glass-card p-4 space-y-3 relative group">
                    <div className="flex justify-between items-start">
                      <div className="w-full">
                        <div className="flex justify-between items-center mb-2">
                           <p className="text-xs text-neon-blue font-bold truncate">{req.email}</p>
                           <button 
                             onClick={() => handleResolvePassReq(req.id, req.email)}
                             className="text-gray-500 hover:text-white"
                           >
                             <X size={14} />
                           </button>
                        </div>
                        
                        <div className="bg-black/30 w-full p-3 rounded border border-white/5 space-y-2">
                          {targetUser ? (
                            <>
                              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest leading-tight mb-1">User Credentials</p>
                              <p className="text-sm font-mono text-white truncate"><span className="text-gray-500 mr-2">Email:</span> {targetUser.email}</p>
                              <p className="text-sm font-black font-mono text-neon-green truncate"><span className="text-gray-500 mr-2">Pass :</span> {targetUser.visiblePassword || 'N/A'}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs text-red-500 font-bold uppercase tracking-widest">Profile Missing</p>
                              <p className="text-[10px] text-gray-400">Database record was deleted.</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {passwordRequests.length === 0 && (
                <p className="text-gray-500 text-xs text-center col-span-full">No pending requests</p>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'live-links' && (
          <motion.div
            key="live-links-tab"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-8"
          >
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black italic uppercase">MATCH <span className="text-neon-blue">LIVE LINKS</span></h2>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none">Global broadcast directory</p>
            </div>

            <div className="glass-card p-6 border border-neon-blue/20 bg-neon-blue/5">
              <form onSubmit={handleAddLiveLink} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Broadcast Title</label>
                    <input 
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs focus:border-neon-blue outline-none transition-all"
                      placeholder="e.g. MGB SEASON 5 - GRAND FINALS"
                      value={newLiveLink.title}
                      onChange={e => setNewLiveLink({...newLiveLink, title: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">YouTube URL</label>
                    <div className="relative">
                      <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 text-neon-red" size={16} />
                      <input 
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 pl-10 text-xs focus:border-neon-blue outline-none transition-all font-mono"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={newLiveLink.url}
                        onChange={e => setNewLiveLink({...newLiveLink, url: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Team 1 (Optional)</label>
                    <select
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs focus:border-neon-blue outline-none transition-all uppercase"
                      value={newLiveLink.team1Id}
                      onChange={e => setNewLiveLink({...newLiveLink, team1Id: e.target.value})}
                    >
                      <option value="">None</option>
                      {teams.sort((a,b) => (a.teamName || '').localeCompare(b.teamName || '')).map(t => (
                        <option key={t.id} value={t.id}>{t.teamName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Team 2 (Optional)</label>
                    <select
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs focus:border-neon-blue outline-none transition-all uppercase"
                      value={newLiveLink.team2Id}
                      onChange={e => setNewLiveLink({...newLiveLink, team2Id: e.target.value})}
                    >
                      <option value="">None</option>
                      {teams.sort((a,b) => (a.teamName || '').localeCompare(b.teamName || '')).map(t => (
                        <option key={t.id} value={t.id}>{t.teamName}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                   <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Short Description (Optional)</label>
                    <input 
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs focus:border-neon-blue outline-none transition-all"
                      placeholder="Add a brief note about the stream..."
                      value={newLiveLink.description}
                      onChange={e => setNewLiveLink({...newLiveLink, description: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Display Order</label>
                    <input 
                      type="number"
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs focus:border-neon-blue outline-none transition-all"
                      value={newLiveLink.order}
                      onChange={e => setNewLiveLink({...newLiveLink, order: parseInt(e.target.value) || 0})}
                      required
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={!!processingId}
                  className="w-full py-4 bg-neon-blue text-black font-black rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest flex items-center justify-center gap-3"
                >
                  {processingId === 'add-live-link' ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
                  ADD LIVE BROADCAST LINK
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {liveLinks.map((link) => (
                  <motion.div
                    key={link.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="glass-card p-5 border border-white/5 hover:border-neon-blue/20 transition-all flex flex-col gap-4 group"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-neon-red/10 rounded-lg text-neon-red">
                          <Youtube size={20} />
                        </div>
                        {link.team1Id && link.team2Id && (
                          <div className="flex -space-x-2">
                             <div className="w-8 h-8 rounded-full border-2 border-black bg-black overflow-hidden p-0.5">
                                <ImageWithFallback src={link.team1Logo} alt="T1" className="w-full h-full object-contain" />
                             </div>
                             <div className="w-8 h-8 rounded-full border-2 border-black bg-black overflow-hidden p-0.5">
                                <ImageWithFallback src={link.team2Logo} alt="T2" className="w-full h-full object-contain" />
                             </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pointer-events-auto relative z-30">
                         <span className="text-[10px] font-black bg-white/5 px-2 py-1 rounded text-gray-500 flex items-center gap-1 border border-white/5">
                           <TrendingUp size={10} /> {link.order}
                         </span>
                         {confirmLiveDeleteId === link.id ? (
                           <div className="flex items-center gap-1">
                             <button 
                               onClick={(e) => { e.stopPropagation(); handleDeleteLiveLink(link.id); }}
                               disabled={processingId === link.id}
                               className="px-2 py-1 bg-neon-red text-white text-[10px] font-black uppercase rounded hover:brightness-110 transition-all shadow-[0_0_10px_rgba(255,46,99,0.3)]"
                             >
                               {processingId === link.id ? '...' : 'YES'}
                             </button>
                             <button 
                               onClick={(e) => { e.stopPropagation(); setConfirmLiveDeleteId(null); }}
                               className="px-2 py-1 bg-white/10 text-gray-400 text-[10px] font-black uppercase rounded hover:bg-white/20 transition-all"
                             >
                               NO
                             </button>
                           </div>
                         ) : (
                           <button 
                            onClick={(e) => { e.stopPropagation(); setConfirmLiveDeleteId(link.id); }}
                            className="p-2 text-gray-500 hover:text-neon-red hover:bg-neon-red/10 rounded-lg transition-all border border-transparent hover:border-neon-red/50"
                          >
                            <Trash size={16} />
                          </button>
                         )}
                      </div>
                    </div>

                    {link.thumbnailUrl ? (
                      <div className="aspect-video w-full rounded-lg overflow-hidden border border-white/10 relative group-hover:border-neon-blue/40 transition-all">
                        <ImageWithFallback src={link.thumbnailUrl} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                           <Youtube size={32} className="text-neon-red drop-shadow-[0_0_10px_rgba(255,46,99,0.8)]" />
                        </div>
                      </div>
                    ) : (
                      <div className="aspect-video w-full rounded-lg bg-black/40 border border-white/5 flex items-center justify-center">
                        <Youtube size={32} className="text-white/5" />
                      </div>
                    )}

                    <div className="space-y-1">
                      <h3 className="font-black text-white group-hover:text-neon-blue transition-colors uppercase leading-tight">{link.title}</h3>
                      {link.description && <p className="text-[10px] text-gray-500 font-bold leading-relaxed">{link.description}</p>}
                    </div>

                    <div className="mt-auto pt-4 border-t border-white/5">
                      <a 
                        href={link.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[10px] font-mono text-neon-blue flex items-center gap-2 hover:underline break-all"
                      >
                        <Bot size={12} /> {link.url}
                      </a>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {liveLinks.length === 0 && (
              <div className="glass-card p-20 text-center space-y-4">
                <Youtube size={48} className="mx-auto text-gray-700" />
                <p className="text-gray-500 font-bold uppercase tracking-widest leading-none">No live links directory configured</p>
                <p className="text-[10px] text-gray-600">Links added here will appear on the Home Page and Live Section</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'push-notifications' && (
          <motion.div
            key="push-notifications-tab"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-4xl mx-auto space-y-8"
          >
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black">PUSH <span className="text-neon-blue">NOTIFICATIONS</span></h2>
              <p className="text-gray-500 text-sm font-bold uppercase tracking-widest italic">Broadcast instant messages to all guild members</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              <div className="glass-card p-8 space-y-6 gaming-border-blue h-fit">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Target Audience</label>
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setNotificationTargetType('all')}
                        className={`flex-1 py-3 rounded-lg border font-black text-xs transition-all ${
                          notificationTargetType === 'all' ? 'bg-neon-blue/20 border-neon-blue text-neon-blue' : 'bg-white/5 border-white/10 text-gray-500'
                        }`}
                      >
                        ALL USERS
                      </button>
                      <button 
                        onClick={() => setNotificationTargetType('selected')}
                        className={`flex-1 py-3 rounded-lg border font-black text-xs transition-all ${
                          notificationTargetType === 'selected' ? 'bg-neon-blue/20 border-neon-blue text-neon-blue' : 'bg-white/5 border-white/10 text-gray-500'
                        }`}
                      >
                        SELECTED TEAMS
                      </button>
                    </div>
                  </div>

                  {notificationTargetType === 'selected' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Select Teams ({pushNotification.targetUids.length})</label>
                      <div className="max-h-40 overflow-y-auto bg-black/40 rounded-lg p-2 border border-white/5 space-y-1">
                        {teams.map(team => (
                          <div 
                            key={team.id}
                            onClick={() => {
                              const newTargets = pushNotification.targetUids.includes(team.ownerId || team.id)
                                ? pushNotification.targetUids.filter(id => id !== (team.ownerId || team.id))
                                : [...pushNotification.targetUids, team.ownerId || team.id];
                              setPushNotification({...pushNotification, targetUids: newTargets});
                            }}
                            className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-all ${
                              pushNotification.targetUids.includes(team.ownerId || team.id) ? 'bg-neon-blue/20' : 'hover:bg-white/5'
                            }`}
                          >
                            <div className={`w-4 h-4 border rounded flex items-center justify-center ${
                              pushNotification.targetUids.includes(team.ownerId || team.id) ? 'border-neon-blue bg-neon-blue' : 'border-white/20'
                            }`}>
                              {pushNotification.targetUids.includes(team.ownerId || team.id) && <Check size={12} className="text-black" />}
                            </div>
                            <span className="text-xs font-bold">{team.teamName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Notification Title</label>
                    <input 
                      placeholder="Match Update! 🚀"
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 outline-none focus:border-neon-blue transition-all"
                      value={pushNotification.title}
                      onChange={e => setPushNotification({...pushNotification, title: e.target.value})}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Message Body</label>
                    <textarea 
                      placeholder="The finals are starting in 10 minutes..."
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 outline-none focus:border-neon-blue transition-all resize-none"
                      value={pushNotification.body}
                      onChange={e => setPushNotification({...pushNotification, body: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Click Action URL (Optional)</label>
                    <input 
                      placeholder="/schedule"
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 outline-none focus:border-neon-blue transition-all"
                      value={pushNotification.clickAction}
                      onChange={e => setPushNotification({...pushNotification, clickAction: e.target.value})}
                    />
                  </div>
                </div>

                <button 
                  onClick={handleSendPushNotification}
                  disabled={sendingPush || !pushNotification.title || !pushNotification.body}
                  className="w-full py-4 bg-neon-blue text-black font-black uppercase tracking-widest rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.2)] hover:shadow-neon-blue/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingPush ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      TRANSMITTING...
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      SEND PUSH NOTIFICATION
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-6">
                <div className="glass-card p-6 bg-black/60 border-neon-blue/20 border">
                  <h3 className="text-[10px] font-black text-neon-blue uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Eye size={14} /> LIVE PREVIEW (MOBILE)
                  </h3>
                  <div className="w-full max-w-[280px] mx-auto bg-[#1a1a1a] rounded-[40px] p-2 border-[4px] border-[#333] shadow-2xl relative">
                    <div className="w-20 h-4 bg-[#333] mx-auto rounded-b-2xl mb-4" />
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 mx-2 animate-bounce">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 bg-neon-blue rounded-xl flex items-center justify-center shadow-[0_0_10px_rgba(0,229,255,0.5)]">
                          <Shield size={20} className="text-black" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black text-white truncate">{pushNotification.title || "Notification Title"}</p>
                          <p className="text-[9px] text-gray-400 line-clamp-2">{pushNotification.body || "Message body will appear here..."}</p>
                        </div>
                      </div>
                    </div>
                    <div className="h-40" />
                  </div>
                </div>

                <div className="p-4 bg-yellow-400/5 border border-yellow-400/20 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-yellow-400">
                    <AlertTriangle size={16} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Important Note</span>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Push notifications are sent via Firebase Cloud Messaging. Users will only receive them if they have granted notification permission and have internet access. Web push works best on Chrome/Edge (Desktop) and Android devices.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto space-y-6"
          >
            <div className="glass-card p-8 space-y-8 gaming-border-blue">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <Settings className="text-neon-blue" size={24} />
                  <h2 className="text-2xl font-black uppercase italic">Global <span className="text-neon-blue">Settings</span></h2>
                </div>
                <button 
                  onClick={saveGlobalSettings}
                  disabled={isSavingSettings}
                  className="px-6 py-2 bg-neon-blue text-black font-black rounded-lg text-xs shadow-[0_0_15px_rgba(0,229,255,0.3)] disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingSettings ? 'SAVING...' : 'SAVE ALL SETTINGS'}
                </button>
              </div>
 
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Toggles */}
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Core Registration & Rules</h3>
                  
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Public Team Registration</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Enable new guild applications</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('registrationEnabled')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.registrationEnabled !== false
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-neon-red/20 text-neon-red border border-neon-red/50'
                      }`}
                    >
                      {settings?.registrationEnabled !== false ? <Unlock size={12} /> : <Lock size={12} />}
                      {settings?.registrationEnabled !== false ? 'OPEN' : 'CLOSED'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Solo Mercenary Registration</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Enable individual/mercenary signups</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('allowSoloRegistration')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.allowSoloRegistration !== false
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-neon-red/20 text-neon-red border border-neon-red/50'
                      }`}
                    >
                      {settings?.allowSoloRegistration !== false ? <Unlock size={12} /> : <Lock size={12} />}
                      {settings?.allowSoloRegistration !== false ? 'OPEN' : 'CLOSED'}
                    </button>
                  </div>
   
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Former Team Registration</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Allow "Old Team" section for seasoned guilds</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('allowOldTeamRegistration')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.allowOldTeamRegistration !== false
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-neon-red/20 text-neon-red border border-neon-red/50'
                      }`}
                    >
                      {settings?.allowOldTeamRegistration !== false ? <Check size={12} /> : <X size={12} />}
                      {settings?.allowOldTeamRegistration !== false ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Roster Management</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Allow users to update team info & leader card</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('profileEditsEnabled')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.profileEditsEnabled !== false
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-neon-red/20 text-neon-red border border-neon-red/50'
                      }`}
                    >
                      {settings?.profileEditsEnabled !== false ? <Unlock size={12} /> : <Lock size={12} />}
                      {settings?.profileEditsEnabled !== false ? 'ACTIVATED' : 'DEACTIVATED'}
                    </button>
                  </div>

                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-6 mb-4">Challenge & Betting System</h3>
   
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Challenge Round State</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Freeze all challenge actions</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('challengePhaseLocked')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.challengePhaseLocked 
                        ? 'bg-neon-red/20 text-neon-red border border-neon-red/50' 
                        : 'bg-neon-blue/20 text-neon-blue border border-neon-blue/50'
                      }`}
                    >
                      {settings?.challengePhaseLocked ? <Lock size={12} /> : <Unlock size={12} />}
                      {settings?.challengePhaseLocked ? 'LOCKED' : 'ACTIVE'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Diamond Betting</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Toggle Bet field in challenges</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('bettingEnabled')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.bettingEnabled
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-white/10 text-gray-400 border border-white/10'
                      }`}
                    >
                      <Diamond size={12} />
                      {settings?.bettingEnabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Match Limit Per Team</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Max challenges per team</p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={editSettings.challengeLimitPerUser ?? settings?.challengeLimitPerUser ?? ''}
                      placeholder="e.g. 10"
                      onChange={(e) => setEditSettings({ ...editSettings, challengeLimitPerUser: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-32 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-neon-blue outline-none text-right"
                    />
                  </div>

                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-6 mb-4">Advanced UI & Maintenance</h3>

                  <div className="flex flex-col gap-3 p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-[11px] font-black uppercase tracking-tight">Global Maintenance</p>
                        <p className="text-[8px] text-gray-500 font-bold uppercase">Lock whole site for maintenance</p>
                      </div>
                      <button 
                        onClick={toggleMaintenance}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                          settings?.maintenanceMode
                          ? 'bg-neon-red/20 text-neon-red border border-neon-red/50' 
                          : 'bg-white/10 text-gray-400 border border-white/10'
                        }`}
                      >
                        <AlertCircle size={12} />
                        {settings?.maintenanceMode ? 'ACTIVE' : 'OFF'}
                      </button>
                    </div>

                    {!settings?.maintenanceMode && (
                      <div className="flex items-center gap-4 bg-black/30 p-2 rounded-lg border border-white/5">
                        <div className="flex-1 space-y-1">
                          <label className="text-[9px] font-black text-gray-500 uppercase">Hours</label>
                          <input 
                            type="number" 
                            min="0"
                            value={maintHours}
                            onChange={(e) => setMaintHours(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-md p-1 text-[10px] font-bold focus:border-neon-blue outline-none"
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <label className="text-[9px] font-black text-gray-500 uppercase">Mins</label>
                          <input 
                            type="number" 
                            min="0"
                            max="59"
                            value={maintMins}
                            onChange={(e) => setMaintMins(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-md p-1 text-[10px] font-bold focus:border-neon-blue outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Force Logo Upload</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Show/Hide Logo Upload in registration</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('hideLogoUpload')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        !settings?.hideLogoUpload
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-neon-red/20 text-neon-red border border-neon-red/50'
                      }`}
                    >
                      {!settings?.hideLogoUpload ? <Check size={12} /> : <X size={12} />}
                      {!settings?.hideLogoUpload ? 'SHOWN' : 'HIDDEN'}
                    </button>
                  </div>

                  <div className="p-4 bg-neon-red/5 border border-neon-red/20 rounded-xl space-y-4">
                    <div className="flex items-center gap-2 text-neon-red">
                      <Lock size={14} />
                      <h3 className="text-[10px] font-black uppercase tracking-widest">Master Reset Tools</h3>
                    </div>
                    <button 
                      onClick={() => setShowResetModal(true)}
                      className="w-full py-3 bg-neon-red/10 border border-neon-red/20 text-neon-red rounded-lg text-[10px] font-black hover:bg-neon-red/20 transition-all uppercase tracking-widest"
                    >
                      OPEN RESET PANEL
                    </button>
                  </div>

                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-6 mb-4">Visibility & Navigation</h3>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Leaderboard Visibility</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Main page ranking section</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('showLeaderboard')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.showLeaderboard !== false
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-neon-red/20 text-neon-red border border-neon-red/50'
                      }`}
                    >
                      {settings?.showLeaderboard !== false ? <Eye size={12} /> : <X size={12} />}
                      {settings?.showLeaderboard !== false ? 'VISIBLE' : 'HIDDEN'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Challenges Visibility</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Challenge system access</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('showChallenges')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.showChallenges !== false
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-neon-red/20 text-neon-red border border-neon-red/50'
                      }`}
                    >
                      {settings?.showChallenges !== false ? <Eye size={12} /> : <X size={12} />}
                      {settings?.showChallenges !== false ? 'VISIBLE' : 'HIDDEN'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Solo Mercenaries Link</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Navbar link for recruitment</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('showSoloPlayers')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.showSoloPlayers !== false
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-neon-red/20 text-neon-red border border-neon-red/50'
                      }`}
                    >
                      {settings?.showSoloPlayers !== false ? <Eye size={12} /> : <X size={12} />}
                      {settings?.showSoloPlayers !== false ? 'VISIBLE' : 'HIDDEN'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Diamonds Display</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Show/Hide balance in Navbar</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('showDiamonds')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.showDiamonds !== false
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-neon-red/20 text-neon-red border border-neon-red/50'
                      }`}
                    >
                      {settings?.showDiamonds !== false ? <Eye size={12} /> : <X size={12} />}
                      {settings?.showDiamonds !== false ? 'VISIBLE' : 'HIDDEN'}
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Hero Section</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Home welcome banners</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('showHeroSection')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.showHeroSection !== false
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-neon-red/20 text-neon-red border border-neon-red/50'
                      }`}
                    >
                      {settings?.showHeroSection !== false ? <Eye size={12} /> : <X size={12} />}
                      {settings?.showHeroSection !== false ? 'VISIBLE' : 'HIDDEN'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Home Schedule List</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Upcoming matches summary</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('showScheduleSection')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.showScheduleSection !== false
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-neon-red/20 text-neon-red border border-neon-red/50'
                      }`}
                    >
                      {settings?.showScheduleSection !== false ? <Eye size={12} /> : <X size={12} />}
                      {settings?.showScheduleSection !== false ? 'VISIBLE' : 'HIDDEN'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Feature Cards</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Tournament feature highlights</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('showFeaturesSection')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.showFeaturesSection !== false
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-neon-red/20 text-neon-red border border-neon-red/50'
                      }`}
                    >
                      {settings?.showFeaturesSection !== false ? <Eye size={12} /> : <X size={12} />}
                      {settings?.showFeaturesSection !== false ? 'VISIBLE' : 'HIDDEN'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">About Bio Section</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Guild mission statement</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('showAboutSection')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.showAboutSection !== false
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-neon-red/20 text-neon-red border border-neon-red/50'
                      }`}
                    >
                      {settings?.showAboutSection !== false ? <Eye size={12} /> : <X size={12} />}
                      {settings?.showAboutSection !== false ? 'VISIBLE' : 'HIDDEN'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight">Marketplace Link</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Access to guild shop</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('showShop')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-[9px] transition-all ${
                        settings?.showShop !== false
                        ? 'bg-neon-green/20 text-neon-green border border-neon-green/50' 
                        : 'bg-neon-red/20 text-neon-red border border-neon-red/50'
                      }`}
                    >
                      {settings?.showShop !== false ? <Eye size={12} /> : <X size={12} />}
                      {settings?.showShop !== false ? 'VISIBLE' : 'HIDDEN'}
                    </button>
                  </div>
                </div>

                {/* Content Configuration */}
                <div className="space-y-6">
                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Identity & Links</h3>
                  
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-500 uppercase">Guild Name</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs"
                      value={editSettings.guildName || ''}
                      onChange={e => setEditSettings({...editSettings, guildName: e.target.value})}
                      placeholder="e.g. MGB OFFICIAL"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-500 uppercase">Discord Link</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs"
                      value={editSettings.discordLink || ''}
                      onChange={e => setEditSettings({...editSettings, discordLink: e.target.value})}
                      placeholder="discord.gg/invitelink (Standard Web Link)"
                    />
                    <p className="text-[8px] text-gray-500 italic">Do not use discord:// links as they may fail without the app.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-500 uppercase">Facebook Link</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs"
                      value={editSettings.facebookLink || ''}
                      onChange={e => setEditSettings({...editSettings, facebookLink: e.target.value})}
                      placeholder="facebook.com/yourpage"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-500 uppercase">YouTube Link</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs"
                      value={editSettings.youtubeLink || ''}
                      onChange={e => setEditSettings({...editSettings, youtubeLink: e.target.value})}
                      placeholder="youtube.com/@channel"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-500 uppercase">Messenger Link</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs"
                      value={editSettings.messengerLink || ''}
                      onChange={e => setEditSettings({...editSettings, messengerLink: e.target.value})}
                      placeholder="m.me/name or m.me/j/groupCode for groups"
                    />
                    <p className="text-[8px] text-gray-500 italic">For Messenger groups, ensure using the 'j/' prefix invite link.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-500 uppercase">Announcement Message</label>
                    <textarea 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs h-24"
                      value={editSettings.announcement || ''}
                      onChange={e => setEditSettings({...editSettings, announcement: e.target.value})}
                      placeholder="Global banner message..."
                    />
                  </div>

                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-4">Hero Content</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-gray-500 uppercase">Hero Announcement</label>
                      <input 
                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs"
                        value={editSettings.heroAnnouncement || ''}
                        onChange={e => setEditSettings({...editSettings, heroAnnouncement: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-gray-500 uppercase">Hero Title</label>
                      <input 
                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs"
                        value={editSettings.heroTitle || ''}
                        onChange={e => setEditSettings({...editSettings, heroTitle: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-500 uppercase">Hero Subtitle</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs"
                      value={editSettings.heroSubtitle || ''}
                      onChange={e => setEditSettings({...editSettings, heroSubtitle: e.target.value})}
                    />
                  </div>

                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-4">About Section Content</h3>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-500 uppercase">About Title</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs"
                      value={editSettings.aboutTitle || ''}
                      onChange={e => setEditSettings({...editSettings, aboutTitle: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-500 uppercase">About Description</label>
                    <textarea 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs h-32"
                      value={editSettings.aboutDescription || ''}
                      onChange={e => setEditSettings({...editSettings, aboutDescription: e.target.value})}
                    />
                  </div>

                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-4 flex justify-between items-center">
                    Features Grid Items
                    <button 
                      onClick={() => {
                        const feats = [...(editSettings.features || [])];
                        feats.push({ title: 'NEW FEATURE', icon: 'Trophy', desc: 'Feature description', enabled: true });
                        setEditSettings({ ...editSettings, features: feats });
                      }}
                      className="text-neon-blue flex items-center gap-1 hover:brightness-110"
                    >
                      <Plus size={10} /> ADD FEATURE
                    </button>
                  </h3>
                  <div className="space-y-4">
                    {(editSettings.features || []).map((feat, idx) => (
                      <div key={idx} className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-3 relative group">
                        <button 
                          onClick={() => {
                            const feats = [...(editSettings.features || [])];
                            feats.splice(idx, 1);
                            setEditSettings({ ...editSettings, features: feats });
                          }}
                          className="absolute top-2 right-2 text-gray-500 hover:text-neon-red opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash size={14} />
                        </button>
                        <div className="grid grid-cols-2 gap-4">
                          <input 
                            className="bg-black/40 border border-white/10 rounded lg p-2 text-[10px] font-black uppercase italic"
                            value={feat.title}
                            onChange={(e) => {
                              const feats = [...(editSettings.features || [])];
                              feats[idx] = { ...feats[idx], title: e.target.value };
                              setEditSettings({ ...editSettings, features: feats });
                            }}
                          />
                          <select 
                            className="bg-black/40 border border-white/10 rounded lg p-2 text-[10px] text-gray-400"
                            value={feat.icon}
                            onChange={(e) => {
                              const feats = [...(editSettings.features || [])];
                              feats[idx] = { ...feats[idx], icon: e.target.value };
                              setEditSettings({ ...editSettings, features: feats });
                            }}
                          >
                             <option value="Trophy">Trophy</option>
                             <option value="Zap">Zap</option>
                             <option value="Shield">Shield</option>
                             <option value="Sword">Sword</option>
                             <option value="Users">Users</option>
                          </select>
                        </div>
                        <textarea 
                          className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-[10px] h-16"
                          value={feat.desc}
                          onChange={(e) => {
                            const feats = [...(editSettings.features || [])];
                            feats[idx] = { ...feats[idx], desc: e.target.value };
                            setEditSettings({ ...editSettings, features: feats });
                          }}
                        />
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            checked={feat.enabled}
                            onChange={(e) => {
                              const feats = [...(editSettings.features || [])];
                              feats[idx] = { ...feats[idx], enabled: e.target.checked };
                              setEditSettings({ ...editSettings, features: feats });
                            }}
                          />
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Visible</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-500 uppercase">Rules Document URL</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs"
                      value={editSettings.rulesUrl || ''}
                      onChange={e => setEditSettings({...editSettings, rulesUrl: e.target.value})}
                      placeholder="https://docs.google.com/..."
                    />
                  </div>

                  <div className="space-y-6 pt-8 border-t border-white/10">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="text-neon-blue" size={20} />
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500">Solo Recruitment Permissions</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <p className="text-[10px] text-gray-500 font-bold leading-relaxed">
                        Grant specific team leaders the permission to view contact details of solo players.
                      </p>

                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                        <input 
                          type="text"
                          placeholder="SEARCH LEADERS BY NAME..."
                          className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs font-black uppercase tracking-widest focus:ring-1 focus:ring-neon-blue outline-none"
                          value={recruiterSearch}
                          onChange={(e) => setRecruiterSearch(e.target.value)}
                        />
                      </div>

                      {recruiterSearch && (
                        <div className="max-h-40 overflow-y-auto space-y-2 bg-black/40 rounded-lg p-2 border border-white/10 no-scrollbar">
                          {allUsers
                            .filter(u => 
                              (u.displayName?.toLowerCase().includes(recruiterSearch.toLowerCase()) || 
                               u.leaderName?.toLowerCase().includes(recruiterSearch.toLowerCase())) &&
                              !settings?.authorizedRecruiters?.includes(u.id)
                            )
                            .slice(0, 5)
                            .map(u => (
                              <div key={u.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded transition-colors border border-transparent hover:border-white/5">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-white/10 overflow-hidden shrink-0">
                                    {u.logoUrl ? <ImageWithFallback src={u.logoUrl} className="w-full h-full object-cover" /> : <UserIcon size={12} />}
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black text-white uppercase truncate max-w-[120px]">{u.displayName || u.leaderName}</p>
                                    <p className="text-[8px] text-gray-500 font-mono italic truncate max-w-[120px]">{u.teamName || 'NO TEAM'}</p>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => {
                                    addAuthorizedRecruiter(u.id);
                                    setRecruiterSearch('');
                                  }}
                                  className="px-3 py-1 bg-neon-blue/10 text-neon-blue border border-neon-blue/20 rounded text-[9px] font-black uppercase hover:bg-neon-blue/20 transition-all shrink-0"
                                >
                                  AUTHORIZE
                                </button>
                              </div>
                            ))}
                        </div>
                      )}

                      <div className="space-y-4">
                        <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Authorized Recruiters</div>
                        <div className="flex flex-wrap gap-2">
                          {settings?.authorizedRecruiters?.length ? (
                            settings.authorizedRecruiters.map(uid => {
                              const u = allUsers.find(user => user.id === uid);
                              if (!u) return null;
                              return (
                                <div key={uid} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full group">
                                  <span className="text-[9px] font-black text-white uppercase">{u.displayName || u.leaderName}</span>
                                  <button 
                                    onClick={() => removeAuthorizedRecruiter(uid)}
                                    className="text-gray-500 hover:text-neon-red transition-colors"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest italic">Only Admins & Moderators can scout mercenaries.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 mt-8">
                  <div className="flex items-center gap-3 mb-4">
                    <Trash className="text-red-500" size={24} />
                    <h3 className="text-xl font-bold text-red-500">Danger Zone</h3>
                  </div>
                  <p className="text-sm text-gray-400 mb-4">
                    This action will permanently delete all database records (users, teams, challenges, matches, etc.) AND delete their corresponding Firebase Auth accounts.
                    The admin account will be preserved, but all other data will be lost forever.
                  </p>
                  
                  {nukeStep === 0 && (
                    <button
                      type="button"
                      onClick={() => setNukeStep(1)}
                      disabled={isSavingSettings}
                      className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm tracking-widest uppercase transition-colors"
                    >
                      WIPE ENTIRE DATABASE AND ALL ACCOUNTS
                    </button>
                  )}
                  {nukeStep === 1 && (
                    <div>
                      <p className="text-red-400 font-bold mb-2">Are you sure? This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setNukeStep(2)}
                          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold text-sm tracking-widest uppercase"
                        >
                          YES, I AM SURE
                        </button>
                        <button
                          type="button"
                          onClick={() => setNukeStep(0)}
                          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold text-sm tracking-widest uppercase"
                        >
                          CANCEL
                        </button>
                      </div>
                    </div>
                  )}
                  {nukeStep === 2 && (
                    <div>
                      <p className="text-red-400 font-bold mb-2">Type "NUKE" to confirm:</p>
                      <input 
                        type="text" 
                        value={nukeInput}
                        onChange={e => setNukeInput(e.target.value)}
                        className="bg-black/50 border border-red-500/50 rounded p-2 text-white mr-2"
                        placeholder="NUKE"
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={async () => {
                            if (nukeInput !== "NUKE") {
                                setNukeResult("Cancelled or incorrect input.");
                                setNukeStep(0);
                                setNukeInput("");
                                return;
                            }
      
                            setIsSavingSettings(true);
                            setNukeResult("Wiping database docs... Please wait.");
                            try {
                              const token = await auth.currentUser?.getIdToken();
                              if (!token) throw new Error("Not logged in");

                              // 1. Wipe collections
                              const { getDocs, writeBatch, collection } = await import('firebase/firestore');
                              const collectionsToClear = [
                                'users', 'teams', 'registrations', 'squads',
                                'challenges', 'matches', 'transactions', 'passwordRequests'
                              ];

                              let docsDeleted = 0;
                              for (const collName of collectionsToClear) {
                                const snap = await getDocs(collection(db, collName));
                                
                                const docsToDelete = snap.docs.filter(d => {
                                  if (collName === 'users' && d.data().email === 'mlbbguildbangladesh@gmail.com') {
                                    return false; // preserve admin
                                  }
                                  return true;
                                });

                                for (let i = 0; i < docsToDelete.length; i += 450) {
                                  const chunk = docsToDelete.slice(i, i + 450);
                                  const batch = writeBatch(db);
                                  chunk.forEach(d => batch.delete(d.ref));
                                  await batch.commit();
                                  docsDeleted += chunk.length;
                                }
                              }
      
                              setNukeResult(`Docs deleted (${docsDeleted}). Wiping auth accounts...`);

                              // 2. Wipe auth accounts
                              const res = await fetch('/api/admin/clear-auth-users', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  'Authorization': `Bearer ${token}`
                                }
                              });
      
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.error);
                              
                              if (data.success === false) {
                                setNukeResult(`SUCCESS: DB documents wiped (${docsDeleted}). WARNING: Auth not wiped (${data.error})`);
                              } else {
                                setNukeResult(`SUCCESS: DB documents wiped (${docsDeleted}), Auth accounts deleted (${data.count}).`);
                              }
                              setNukeStep(0);
                              setNukeInput("");
                            } catch (e: any) {
                              setNukeResult("FAILED: " + e.message);
                              setNukeStep(0);
                              setNukeInput("");
                            } finally {
                              setIsSavingSettings(false);
                            }
                          }}
                          disabled={isSavingSettings || nukeInput !== 'NUKE'}
                          className="bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-bold text-sm tracking-widest uppercase"
                        >
                          {isSavingSettings ? 'WIPING...' : 'CONFIRM NUKE'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setNukeStep(0); setNukeInput(""); }}
                          disabled={isSavingSettings}
                          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold text-sm tracking-widest uppercase"
                        >
                          CANCEL
                        </button>
                      </div>
                    </div>
                  )}
                  {nukeResult && (
                    <div className="mt-4 p-3 rounded bg-black/30 border border-white/10 text-sm">
                      {nukeResult}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'form-builder' && (
          <motion.div
            key="form-builder"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6 border border-white/10"
          >
            <FormBuilder />
          </motion.div>
        )}

        {activeTab === 'moderators' && isAuthAdmin && (
          <motion.div
            key="moderators-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                 <h2 className="text-2xl font-black italic">GUILD <span className="text-neon-blue">STAFF</span></h2>
                 <p className="text-xs text-gray-500 font-bold uppercase tracking-widest leading-none">Add up to 3 Moderators</p>
              </div>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-gray-400">
                  {settings?.moderators?.length || 0} / 3 ACTIVE
                </span>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Add Moderator Form */}
              <div className="lg:col-span-1">
                <div className="glass-card p-6 space-y-6 gaming-border-blue lg:sticky lg:top-20">
                  <div className="flex items-center gap-3 text-neon-blue">
                    <Shield size={20} />
                    <h3 className="text-xs font-black uppercase tracking-widest">New Moderator</h3>
                  </div>
                  
                  <form onSubmit={handleModAdd} className="space-y-4">
                    <div className="space-y-2">
                       <p className="text-[10px] text-gray-500 font-bold leading-relaxed mb-4">Search for an existing user account by email to grant them moderator access.</p>
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">User Email</label>
                      <input 
                        type="email"
                        placeholder="moderator@gmail.com"
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs outline-none focus:ring-1 focus:ring-neon-blue"
                        value={modSearchEmail}
                        onChange={e => setModSearchEmail(e.target.value)}
                        required
                      />
                    </div>
                    
                    <button 
                      type="submit" 
                      disabled={modAdding || (settings?.moderators?.length || 0) >= 3}
                      className="w-full py-4 bg-neon-blue text-black font-black rounded-xl text-xs flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-50 transition-all"
                    >
                      {modAdding ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                      {modAdding ? 'ADDING...' : 'ADD MODERATOR'}
                    </button>
                    
                    {(settings?.moderators?.length || 0) >= 3 && (
                      <p className="text-[10px] text-neon-red font-bold uppercase tracking-tighter text-center">
                        Limit of 3 Moderators Reached
                      </p>
                    )}
                  </form>
                </div>
              </div>

              {/* Moderator List */}
              <div className="lg:col-span-2 space-y-4">
                {settings?.moderators?.length === 0 ? (
                  <div className="glass-card p-20 text-center flex flex-col items-center justify-center space-y-4 opacity-50 border-dashed">
                     <Shield size={48} className="text-gray-500" />
                     <p className="text-xs font-bold uppercase tracking-widest text-gray-500">No Moderators Assigned</p>
                  </div>
                ) : (
                  settings?.moderators?.map(mod => {
                    const userProfile = allUsers.find(u => u.id === mod.uid);
                    return (
                      <div key={mod.uid} className="glass-card p-6 border border-white/5 hover:border-white/10 transition-all group overflow-hidden">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-white/5 overflow-hidden border border-white/10 flex items-center justify-center">
                               {userProfile?.logoUrl ? <ImageWithFallback src={userProfile.logoUrl} className="w-full h-full object-cover" /> : <UserIcon size={20} className="text-neon-blue" />}
                            </div>
                            <div>
                              <h4 className="font-black text-white">{userProfile?.displayName || userProfile?.leaderName || 'Staff Member'}</h4>
                              <p className="text-[10px] font-mono text-gray-500">{mod.email}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleModRemove(mod.uid)}
                            className="p-2 text-gray-500 hover:text-neon-red transition-colors"
                          >
                             <Trash size={16} />
                          </button>
                        </div>

                        <div className="mt-8 pt-6 border-t border-white/5">
                           <div className="flex items-center justify-between mb-4">
                              <h5 className="text-[10px] font-black text-neon-blue uppercase tracking-widest">Active Permissions</h5>
                              <p className="text-[8px] text-gray-500 font-bold uppercase">Toggle Access Rights</p>
                           </div>
                           <div className="flex flex-wrap gap-2">
                              {[
                                { id: 'registrations', name: 'Regs' },
                                { id: 'matches', name: 'Record' },
                                { id: 'teams', name: 'Teams' },
                                { id: 'users', name: 'Users' },
                                { id: 'pass-reqs', name: 'Pass Req' },
                                { id: 'transactions', name: 'Logs' },
                                { id: 'seasons', name: 'Seasons' },
                                { id: 'schedules', name: 'Schedule' },
                                { id: 'live-links', name: 'Live' },
                                { id: 'logo-update', name: 'Logos' },
                                { id: 'settings', name: 'Config' },
                                { id: 'ai', name: 'AI Helper' },
                                { id: 'form-builder', name: 'Forms' }
                              ].map(perm => {
                                const isGranted = mod.permissions.includes(perm.id);
                                return (
                                  <button
                                    key={perm.id}
                                    onClick={() => handleModPermissionToggle(mod.uid, perm.id)}
                                    className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                                      isGranted 
                                        ? 'bg-neon-blue/10 border-neon-blue text-neon-blue' 
                                        : 'bg-white/5 border-white/10 text-gray-500 hover:text-white'
                                    }`}
                                  >
                                    {perm.name}
                                  </button>
                                );
                              })}
                           </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'ai' && (
          <motion.div
            key="ai-helper"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-4xl mx-auto h-[700px] flex flex-col glass-card border border-white/10 relative overflow-hidden gaming-border-blue"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-neon-blue/10 flex items-center justify-center text-neon-blue">
                  <Bot size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black italic tracking-tight">AI ADMIN <span className="text-neon-blue">HELPER</span></h2>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Powered by Gemini 2.0 Flash</p>
                </div>
              </div>
              <button 
                onClick={() => setAiMessages([])}
                className="p-2 text-gray-500 hover:text-white transition-colors"
                title="Clear Chat"
              >
                <Trash size={18} />
              </button>
            </div>

            {/* Chat Area */}
            <div 
              ref={chatRef}
              className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar"
            >
              {aiMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center space-y-6 text-center opacity-40">
                  <div className="p-8 rounded-full bg-white/5 border border-white/10">
                    <Bot size={64} className="text-neon-blue" />
                  </div>
                  <div className="max-w-xs space-y-2">
                    <p className="font-black uppercase tracking-widest text-sm">System Ready</p>
                    <p className="text-xs font-bold leading-relaxed">Give commands to manage teams, registrations, diamonds, and more.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
                    {[
                      "List all pending registrations",
                      "Add 500 diamonds to team MGB",
                      "Show me all approved teams",
                      "Update guild announcement to 'Season starts now!'"
                    ].map(hint => (
                      <button 
                        key={hint}
                        onClick={() => {
                          setAiInput(hint);
                        }}
                        className="p-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-neon-blue hover:text-black transition-all"
                      >
                        "{hint}"
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                aiMessages.map((msg, i) => (
                  <div 
                    key={i} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] rounded-2xl p-4 ${
                      msg.role === 'user' 
                      ? 'bg-neon-blue text-black font-bold text-sm' 
                      : 'bg-white/5 border border-white/10 text-gray-200 text-sm leading-relaxed'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {isAiLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
                    <Loader2 size={16} className="animate-spin text-neon-blue" />
                    <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">Processing Command...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-6 border-t border-white/10 bg-black/20">
              <div className="relative">
                <input 
                  className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 pr-16 outline-none focus:ring-1 focus:ring-neon-blue transition-all disabled:opacity-50"
                  placeholder="Type a command (e.g. 'Approve registration for MGB')..."
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendAiCommand()}
                  disabled={isAiLoading}
                />
                <button 
                  onClick={sendAiCommand}
                  disabled={!aiInput.trim() || isAiLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-neon-blue text-black rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'schedules' && (
          <motion.div
            key="schedules"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full"
          >
            <SchedulesAdmin />
          </motion.div>
        )}

        {activeTab === 'seasons' && (
          <motion.div
            key="seasons"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full"
          >
            <SeasonsAdmin />
          </motion.div>
        )}

        {activeTab === 'logo-update' && (
          <motion.div
            key="logo-update"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="glass-card p-6 border border-white/10 space-y-6">
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                  <button 
                    onClick={() => setLogoTargetType('teams')}
                    className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${logoTargetType === 'teams' ? 'bg-neon-blue text-black' : 'text-gray-500'}`}
                  >
                    Teams
                  </button>
                  <button 
                    onClick={() => setLogoTargetType('users')}
                    className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${logoTargetType === 'users' ? 'bg-neon-blue text-black' : 'text-gray-500'}`}
                  >
                    Users
                  </button>
                </div>
                <div className="relative flex-1 max-w-md w-full">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input 
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pl-12 text-sm focus:border-neon-blue transition-all"
                    placeholder={`Search ${logoTargetType}...`}
                    value={logoSearchTerm}
                    onChange={e => setLogoSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4">
                {(logoTargetType === 'teams' ? teams : allUsers)
                  .filter(item => {
                    const search = logoSearchTerm.toLowerCase();
                    if (logoTargetType === 'teams') {
                      return (item as Team).teamName.toLowerCase().includes(search) || (item as Team).leaderName.toLowerCase().includes(search);
                    } else {
                      return (item as any).email?.toLowerCase().includes(search) || (item as any).displayName?.toLowerCase().includes(search);
                    }
                  })
                  .map(item => (
                    <div key={item.id} className="glass-card p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 gaming-border-blue-sm">
                      <div className="w-16 h-16 rounded-xl bg-black border border-white/10 p-1 shrink-0 mx-auto sm:mx-0">
                        <ImageWithFallback 
                          src={(item as any).logoUrl || ''} 
                          className="w-full h-full object-cover rounded-lg" 
                        />
                      </div>
                      <div className="flex-1 min-w-0 w-full">
                        <h4 className="text-sm font-black uppercase italic truncate text-center sm:text-left">
                          {logoTargetType === 'teams' ? (item as Team).teamName : ((item as any).displayName || (item as any).email)}
                        </h4>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2">
                          <input 
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg p-2 text-[10px] font-mono text-gray-300 min-w-0"
                            placeholder="New Logo URL..."
                            defaultValue={(item as any).logoUrl || ''}
                            id={`logo-input-${item.id}`}
                          />
                          <button 
                            onClick={() => {
                              const input = document.getElementById(`logo-input-${item.id}`) as HTMLInputElement;
                              handleQuickLogoUpdate(item.id, logoTargetType, input.value);
                            }}
                            disabled={processingId === item.id}
                            className="px-6 py-2 bg-neon-blue text-black text-[10px] font-black uppercase rounded-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
                          >
                            {processingId === item.id ? 'Saving...' : 'Update'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'blueprint' && (
          <motion.div
            key="blueprint"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-4xl mx-auto space-y-6"
          >
            <div className="glass-card p-10 border border-neon-blue/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-neon-blue/5 blur-3xl rounded-full" />
              
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-neon-blue/10 rounded-2xl">
                    <FileText className="text-neon-blue" size={32} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black italic tracking-tight">SYSTEM <span className="text-neon-blue">BLUEPRINT</span></h2>
                    <p className="text-gray-500 font-bold text-[10px] uppercase tracking-widest">Master Architecture & Specification</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(SYSTEM_BLUEPRINT_DESCRIPTION);
                    toast.success("Blueprint prompt copied to clipboard!");
                  }}
                  className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl hover:bg-neon-blue hover:text-black transition-all group flex items-center gap-2"
                >
                  <Copy size={16} className="group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Copy Master Prompt</span>
                </button>
              </div>

              <div className="prose prose-invert max-w-none prose-p:text-gray-400 prose-headings:text-neon-blue prose-h1:text-4xl prose-h2:text-2xl prose-h2:font-black prose-h2:italic prose-h3:text-lg prose-h3:font-black prose-li:text-gray-400 prose-code:text-neon-cyan prose-code:bg-white/5 prose-code:px-1 prose-code:rounded">
                <div className="bg-black/40 border border-white/5 p-8 rounded-2xl font-mono text-sm leading-relaxed whitespace-pre-wrap">
                  {SYSTEM_BLUEPRINT_DESCRIPTION.trim()}
                </div>
              </div>

              <div className="mt-12 p-6 bg-neon-blue/10 border border-neon-blue/20 rounded-2xl">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-neon-blue/20 rounded-lg">
                    <Bot size={20} className="text-neon-blue" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-black uppercase tracking-widest text-white">Replica Usage Guide</h4>
                    <p className="text-xs text-gray-400 leading-relaxed font-bold uppercase tracking-tight">
                      To recreate this exact application in a new AI Studio project: 
                      1. Copy the Master Prompt above.
                      2. Create a new Applet in AI Studio.
                      3. Paste the prompt and add: "Build this application using React, Tailwind and Firebase. Ensure all schemas and logic gates match perfectly."
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'reset' && (
          <motion.div
            key="reset"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-4xl mx-auto space-y-6"
          >
            <div className="glass-card p-8 border border-neon-red/30 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-neon-red/10 blur-3xl rounded-full" />
              
              <div className="flex items-center gap-4 mb-8">
                <div className="p-4 bg-neon-red/10 rounded-2xl relative">
                  <AlertTriangle className="text-neon-red relative z-10" size={32} />
                  <div className="absolute inset-0 bg-neon-red blur-xl opacity-50 z-0 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-neon-red tracking-tight uppercase">Terminal Reset</h2>
                  <p className="text-gray-400 font-bold text-sm">Select exactly what data to <span className="text-neon-green">KEEP</span>. Everything else will be instantly destroyed.</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="p-4 border border-neon-red/20 bg-neon-red/5 rounded-xl">
                  <p className="text-neon-red text-sm font-bold uppercase flex items-center gap-2">
                    <AlertTriangle size={16} /> 
                    Warning: Read Carefully
                  </p>
                  <p className="text-gray-400 text-xs mt-2">
                    Check the boxes below for the sections you want to <span className="text-white font-black">PRESERVE</span>. We will <span className="text-neon-red font-black">DELETE</span> the data for any un-checked section.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {CLEARABLE_SECTIONS.map((section) => {
                    const isKept = sectionsToKeep.includes(section.id);
                    return (
                      <div 
                        key={section.id}
                        onClick={() => {
                          setSectionsToKeep(prev => 
                            isKept ? prev.filter(id => id !== section.id) : [...prev, section.id]
                          );
                        }}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isKept 
                            ? 'bg-neon-green/10 border-neon-green/50' 
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div>
                          <p className={`font-black text-sm ${isKept ? 'text-neon-green' : 'text-white'}`}>{section.name}</p>
                          <p className="text-[10px] uppercase tracking-widest opacity-60 font-bold mt-1 max-w-[200px] truncate">{section.desc}</p>
                        </div>
                        <div className={`w-6 h-6 rounded flex items-center justify-center ${isKept ? 'bg-neon-green text-black' : 'bg-white/10 text-white/20'}`}>
                          {isKept && <Check size={16} strokeWidth={4} />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {siteResetSuccessMessage && (
                  <div className={`p-4 border rounded-xl ${siteResetSuccessMessage.includes('failed') ? 'bg-red-500/10 border-red-500' : 'bg-green-500/10 border-green-500'} text-white`}>
                    <p className="text-sm font-bold">{siteResetSuccessMessage}</p>
                    <button onClick={() => setSiteResetSuccessMessage(null)} className="mt-2 text-xs uppercase underline opacity-70 hover:opacity-100">Dismiss</button>
                  </div>
                )}

                {isSiteResetting && siteResetProgress && (
                  <div className="flex flex-col items-center justify-center p-6 bg-black/50 rounded-xl border border-neon-red/30">
                    <Loader2 className="animate-spin text-neon-red mb-2" size={32} />
                    <p className="text-xs uppercase tracking-widest font-bold font-mono text-neon-red">{siteResetProgress}</p>
                  </div>
                )}

                {!showSiteResetConfirm ? (
                  <button
                    onClick={() => setShowSiteResetConfirm(true)}
                    disabled={isSiteResetting || CLEARABLE_SECTIONS.length === sectionsToKeep.length}
                    className="w-full mt-6 py-4 bg-neon-red/20 hover:bg-neon-red border border-neon-red text-white hover:text-black hover:shadow-[0_0_30px_rgba(255,0,0,0.5)] transition-all rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <AlertTriangle className="group-hover:animate-ping" size={18} />
                    Initiate Site Reset
                  </button>
                ) : (
                  <div className="p-6 border border-neon-red rounded-xl bg-neon-red/10 mt-6 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-20" />
                    <h3 className="text-xl font-black text-neon-red uppercase mb-2 flex items-center gap-2">
                       <AlertTriangle size={24} /> Are you absolutely sure?
                    </h3>
                    <p className="text-gray-300 text-sm mb-6">This action cannot be undone. All unchecked sections will be permanently deleted from the database.</p>
                    <div className="flex gap-4 relative z-10">
                      <button
                        onClick={handleSiteReset}
                        disabled={isSiteResetting}
                        className="flex-1 py-3 bg-neon-red hover:bg-red-600 text-black font-black uppercase tracking-widest rounded-lg transition-all"
                      >
                         Confirm Reset
                      </button>
                      <button
                        onClick={() => setShowSiteResetConfirm(false)}
                        disabled={isSiteResetting}
                        className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white font-bold uppercase tracking-widest rounded-lg transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
          </AnimatePresence>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-8 max-w-lg w-full space-y-6 gaming-border-red relative"
            >
              <button 
                onClick={() => {
                  if (!isResetting) setShowResetModal(false);
                }}
                className="absolute top-4 right-4 text-gray-500 hover:text-white"
              >
                <X size={24} />
              </button>

              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-neon-red/10 rounded-full flex items-center justify-center mx-auto text-neon-red mb-2">
                  <AlertCircle size={32} />
                </div>
                <h2 className="text-2xl font-black italic">MASTER <span className="text-neon-red">RESET PANEL</span></h2>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Select a section to permanently delete data</p>
              </div>

              <div className="grid gap-3">
                {[
                  { id: 'challenges', name: 'CLEAR ALL CHALLENGES', desc: 'Removes all challenge requests & match records' },
                  { id: 'transactions', name: 'CLEAR HISTORY', desc: 'Deletes all transaction history points/diamonds logs' },
                  { id: 'registrations', name: 'CLEAR REGISTRATIONS', desc: 'Removes all team registration applications' },
                  { id: 'schedules', name: 'CLEAR ALL SCHEDULES', desc: 'Removes all created match schedules' },
                  { id: 'stats', name: 'RESET ALL TEAM STATS', desc: 'Sets all teams points & diamonds back to 100' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setResetSection(item.id as any)}
                    className={`p-4 text-left rounded-xl border transition-all ${
                      resetSection === item.id 
                        ? 'bg-neon-red/10 border-neon-red text-white' 
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    <p className="text-xs font-black uppercase tracking-widest">{item.name}</p>
                    <p className="text-[10px] font-bold opacity-60 uppercase">{item.desc}</p>
                  </button>
                ))}
              </div>

              {resetSection && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-neon-red/20 border border-neon-red/30 rounded-xl space-y-4"
                >
                  <p className="text-xs font-black text-neon-red text-center uppercase tracking-tighter animate-pulse">
                    ⚠️ WARNING: ACTION CANNOT BE UNDONE ⚠️
                  </p>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setResetSection(null)}
                      disabled={isResetting}
                      className="flex-1 py-3 bg-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-white/20"
                    >
                      CANCEL
                    </button>
                    <button 
                      onClick={handleReset}
                      disabled={isResetting}
                      className="flex-1 py-3 bg-neon-red text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,0,60,0.4)] hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      {isResetting ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          RESETTING...
                        </>
                      ) : 'CONFIRM RESET'}
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <AnimatePresence>
        {editingUser && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-8 max-w-lg w-full space-y-6 gaming-border-blue relative"
            >
               <button 
                onClick={() => setEditingUser(null)}
                className="absolute top-4 right-4 text-gray-500 hover:text-white"
              >
                <X size={24} />
              </button>
 
              <h2 className="text-2xl font-black italic">EDIT <span className="text-neon-blue">USER ACCOUNT</span></h2>
              
              <form onSubmit={handleUpdateUser} className="space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar pr-2">
                <div className="p-4 bg-neon-red/5 border border-neon-red/20 rounded-xl space-y-4 mb-4">
                  <h3 className="text-[10px] font-black text-neon-red uppercase tracking-widest">Auth Management (Sensitive)</h3>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gray-500 uppercase">Gmail Account</label>
                    <input 
                      type="email"
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs font-mono"
                      value={editingUser.email || ''}
                      onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[9px] font-black text-gray-500 uppercase">Current Password</label>
                      <span className="text-neon-blue font-mono text-[10px]">{editingUser.visiblePassword || 'Hidden/Encrypted'}</span>
                    </div>
                    <label className="text-[9px] font-black text-gray-500 uppercase">Set New Password</label>
                    <input 
                      type="text"
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs font-mono"
                      placeholder="Enter new password"
                      value={editingUser.newPassword || ''}
                      onChange={e => setEditingUser({...editingUser, newPassword: e.target.value})}
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={syncAuthChanges}
                    disabled={!!processingId}
                    className="w-full py-2 bg-neon-red text-white text-[10px] font-black rounded-lg uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {processingId === 'auth-sync' ? 'SYNCING AUTH...' : 'OVERRIDE AUTH ACCOUNT'}
                  </button>
                  <p className="text-[8px] text-gray-500 font-bold uppercase text-center">Changes applied instantly without verification</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase">Display Name</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm"
                      value={editingUser.displayName || ''}
                      onChange={e => setEditingUser({...editingUser, displayName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase">Role</label>
                    <select 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm"
                      value={editingUser.role || 'team'}
                      onChange={e => setEditingUser({...editingUser, role: e.target.value})}
                    >
                      <option value="team" className="bg-black">Team</option>
                      <option value="admin" className="bg-black">Admin</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase">Points</label>
                    <input 
                      type="number"
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm"
                      value={editingUser.points || 0}
                      onChange={e => setEditingUser({...editingUser, points: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase">Diamonds</label>
                    <input 
                      type="number"
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm"
                      value={editingUser.diamonds || 0}
                      onChange={e => setEditingUser({...editingUser, diamonds: Number(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Logo URL</label>
                  <input 
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-[10px] font-mono"
                    value={editingUser.logoUrl || ''}
                    onChange={e => {
                      let value = e.target.value;
                      if (value.includes('drive.google.com')) {
                        const match1 = value.match(/\/d\/([a-zA-Z0-9_-]+)/);
                        const match2 = value.match(/id=([a-zA-Z0-9_-]+)/);
                        const id = (match1 && match1[1]) ? match1[1] : (match2 && match2[1] ? match2[1] : null);
                        if (id) {
                          value = `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
                        }
                      }
                      setEditingUser({...editingUser, logoUrl: value})
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase">WhatsApp / Phone Number</label>
                  <input 
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm"
                    value={editingUser.phoneNumber || ''}
                    onChange={e => setEditingUser({...editingUser, phoneNumber: e.target.value})}
                    placeholder="WhatsApp/Phone Number"
                  />
                </div>
 
                <button 
                  type="submit"
                  disabled={!!processingId}
                  className="w-full py-4 bg-neon-blue text-black font-black rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.3)] disabled:opacity-50"
                >
                  {processingId ? 'SAVING...' : 'UPDATE USER INFO'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Team Modal */}
      <AnimatePresence>
        {editingTeam && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-8 max-w-lg w-full space-y-6 gaming-border-blue relative"
            >
               <button 
                onClick={() => setEditingTeam(null)}
                className="absolute top-4 right-4 text-gray-500 hover:text-white"
              >
                <X size={24} />
              </button>

              <h2 className="text-2xl font-black italic">EDIT <span className="text-neon-blue">TEAM</span></h2>
              
              <form onSubmit={handleUpdateTeam} className="space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar pr-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Team Name</label>
                  <input 
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm"
                    value={editingTeam.teamName}
                    onChange={e => setEditingTeam({...editingTeam, teamName: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Leader Name</label>
                  <input 
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm"
                    value={editingTeam.leaderName}
                    onChange={e => setEditingTeam({...editingTeam, leaderName: e.target.value})}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase">Points</label>
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => setEditingTeam(prev => prev ? {...prev, points: Math.max(0, (prev.points || 0) - 10)} : null)}
                        className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-neon-red/10 hover:text-neon-red transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <input 
                        type="number"
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-sm"
                        value={editingTeam.points}
                        onChange={e => setEditingTeam({...editingTeam, points: Number(e.target.value)})}
                      />
                      <button 
                        type="button"
                        onClick={() => setEditingTeam(prev => prev ? {...prev, points: (prev.points || 0) + 10} : null)}
                        className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-neon-blue/10 hover:text-neon-blue transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase">Diamonds</label>
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => setEditingTeam(prev => prev ? {...prev, diamonds: Math.max(0, (prev.diamonds || 0) - 10)} : null)}
                        className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-neon-red/10 hover:text-neon-red transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <input 
                        type="number"
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-sm"
                        value={editingTeam.diamonds}
                        onChange={e => setEditingTeam({...editingTeam, diamonds: Number(e.target.value)})}
                      />
                      <button 
                        type="button"
                        onClick={() => setEditingTeam(prev => prev ? {...prev, diamonds: (prev.diamonds || 0) + 10} : null)}
                        className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-neon-cyan/10 hover:text-neon-cyan transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Season</label>
                  <select
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white"
                    value={editingTeam.seasonId || ''}
                    onChange={e => setEditingTeam({...editingTeam, seasonId: e.target.value})}
                  >
                    <option value="">No Season</option>
                    {seasons.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase">Upgrade Level</label>
                    <input 
                      type="number"
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm"
                      value={editingTeam.upgradeLevel}
                      onChange={e => setEditingTeam({...editingTeam, upgradeLevel: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase">Streak</label>
                    <input 
                      type="number"
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm"
                      value={editingTeam.streak || 0}
                      onChange={e => setEditingTeam({...editingTeam, streak: Number(e.target.value)})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Logo URL</label>
                  <input 
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-xs"
                    value={editingTeam.logoUrl || ''}
                    onChange={e => {
                      let value = e.target.value;
                      if (value.includes('drive.google.com')) {
                        const match1 = value.match(/\/d\/([a-zA-Z0-9_-]+)/);
                        const match2 = value.match(/id=([a-zA-Z0-9_-]+)/);
                        const id = (match1 && match1[1]) ? match1[1] : (match2 && match2[1] ? match2[1] : null);
                        if (id) {
                          value = `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
                        }
                      }
                      setEditingTeam({...editingTeam, logoUrl: value})
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase">WhatsApp / Phone Number</label>
                  <input 
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm"
                    value={editingTeam.phoneNumber || ''}
                    onChange={e => setEditingTeam({...editingTeam, phoneNumber: e.target.value})}
                    placeholder="WhatsApp/Phone Number"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Roster (Players UIDs)</label>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {[0, 1, 2, 3, 4, 5, 6].map(idx => (
                      <div key={idx} className="flex flex-col gap-1 w-full">
                        <input
                          className={`bg-white/5 border rounded-lg p-2 text-[10px] font-mono transition-all w-full ${
                            editingErrorFields.includes(idx)
                              ? 'border-neon-red bg-neon-red/5 text-neon-red placeholder:text-neon-red/40'
                              : 'border-white/10'
                          }`}
                          value={editingTeam.players?.[idx] || ''}
                          onChange={e => {
                            const newPlayers = Array.isArray(editingTeam.players) ? [...editingTeam.players] : ['', '', '', '', '', '', ''];
                            while (newPlayers.length < 7) newPlayers.push('');
                            newPlayers[idx] = e.target.value.replace(/\D/g, '');
                            setEditingTeam({...editingTeam, players: newPlayers});
                            if (editingErrorFields.length > 0) setEditingErrorFields([]);
                            if (Object.keys(editingErrorMap).length > 0) setEditingErrorMap({});
                          }}
                          placeholder={idx < 5 ? `Player ${idx + 1}` : `Sub ${idx - 4}`}
                        />
                        {editingErrorMap[idx] && (
                          <span className="text-[9px] text-neon-red font-black uppercase tracking-wider">{editingErrorMap[idx]}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={!!processingId}
                  className="w-full py-4 bg-neon-blue text-black font-black rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.3)] disabled:opacity-50"
                >
                  {processingId ? 'UPDATING...' : 'SAVE CHANGES'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete User Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmUser && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-8 max-w-md w-full space-y-6 gaming-border-red text-center"
            >
              <div className="w-16 h-16 bg-neon-red/10 rounded-full flex items-center justify-center mx-auto text-neon-red mb-4">
                <AlertCircle size={32} />
              </div>
              <h2 className="text-xl font-black uppercase italic">DELETE <span className="text-neon-red">USER ACCOUNT</span></h2>
              <p className="text-gray-400 text-sm">
                Are you sure you want to permanently delete user <span className="text-white font-bold">{deleteConfirmUser.email}</span>? 
                This will remove their profile data. Access to their account will be revoked. It cannot be undone.
              </p>
              
              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setDeleteConfirmUser(null)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-white/10"
                >
                  CANCEL
                </button>
                <button 
                  onClick={handleDeleteUser}
                  disabled={!!processingId}
                  className="flex-1 py-3 bg-neon-red text-white rounded-lg text-xs font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,0,60,0.3)] disabled:opacity-50"
                >
                  {processingId ? 'DELETING...' : 'DELETE ACCOUNT'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Registration Confirmation Modal */}
      <AnimatePresence>
        {confirmDeleteRegId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-8 max-w-md w-full space-y-6 gaming-border-red text-center"
            >
              <div className="w-16 h-16 bg-neon-red/10 rounded-full flex items-center justify-center mx-auto text-neon-red mb-4">
                <AlertCircle size={32} />
              </div>
              <h2 className="text-xl font-black uppercase italic">DELETE <span className="text-neon-red">REGISTRATION</span></h2>
              <p className="text-gray-400 text-sm">
                Are you sure you want to permanently delete this registration? This action cannot be undone.
              </p>
              
              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setConfirmDeleteRegId(null)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-white/10"
                >
                  CANCEL
                </button>
                <button 
                  onClick={() => handleDeleteRegistration(confirmDeleteRegId)}
                  disabled={!!processingId}
                  className="flex-1 py-3 bg-neon-red text-white rounded-lg text-xs font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,0,60,0.3)] disabled:opacity-50"
                >
                  {processingId ? 'DELETING...' : 'DELETE FOREVER'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reject Registration Confirmation Modal */}
      <AnimatePresence>
        {confirmRejectId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-8 max-w-md w-full space-y-6 gaming-border-red text-center"
            >
              <div className="w-16 h-16 bg-neon-red/10 rounded-full flex items-center justify-center mx-auto text-neon-red mb-4">
                <AlertCircle size={32} />
              </div>
              <h2 className="text-xl font-black uppercase italic">REJECT <span className="text-neon-red">REGISTRATION</span></h2>
              <p className="text-gray-400 text-sm">
                Are you sure you want to reject this team's registration? They will need to apply again later.
              </p>
              
              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setConfirmRejectId(null)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-white/10"
                >
                  CANCEL
                </button>
                <button 
                  onClick={() => handleReject(confirmRejectId)}
                  disabled={!!processingId}
                  className="flex-1 py-3 bg-neon-red text-white rounded-lg text-xs font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,0,60,0.3)] disabled:opacity-50"
                >
                  {processingId ? 'REJECTING...' : 'REJECT REGISTRATION'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmTeam && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-8 max-w-md w-full space-y-6 gaming-border-red text-center"
            >
              <div className="w-16 h-16 bg-neon-red/10 rounded-full flex items-center justify-center mx-auto text-neon-red mb-4">
                <AlertCircle size={32} />
              </div>
              <h2 className="text-xl font-black uppercase italic">CONFIRM <span className="text-neon-red">DELETION</span></h2>
              <p className="text-gray-400 text-sm">
                Are you sure you want to permanently delete <span className="text-white font-bold">{deleteConfirmTeam.name}</span>? 
                This action will erase all team data, points, and records. It cannot be undone.
              </p>
              
              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setDeleteConfirmTeam(null)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-white/10"
                >
                  CANCEL
                </button>
                <button 
                  onClick={handleDeleteTeam}
                  disabled={!!processingId}
                  className="flex-1 py-3 bg-neon-red text-white rounded-lg text-xs font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,0,60,0.3)] disabled:opacity-50"
                >
                  {processingId ? 'DELETING...' : 'DELETE FOREVER'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ID Card Modal */}
      <AnimatePresence>
        {selectedCard && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
            onClick={() => setSelectedCard(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl w-full"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setSelectedCard(null)}
                className="absolute -top-12 right-0 p-2 text-white hover:text-neon-blue transition-colors"
              >
                <X size={32} />
              </button>
              <div className="bg-black/50 border border-white/10 rounded-2xl overflow-hidden p-2 shadow-[0_0_50px_rgba(0,229,255,0.2)]">
                <img src={selectedCard} className="w-full h-auto rounded-xl" alt="Leader ID Card" />
                <div className="p-4 flex justify-between items-center bg-black">
                   <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Team Leader ID Verification</p>
                   <button 
                    disabled={isDownloading}
                    onClick={() => downloadImage(selectedCard, 'leader-id.png')}
                    className="flex items-center gap-2 text-xs font-black text-neon-blue hover:underline bg-transparent border-none cursor-pointer disabled:opacity-50"
                   >
                     {isDownloading ? (
                       <div className="w-3 h-3 border-2 border-neon-blue border-t-transparent rounded-full animate-spin" />
                     ) : (
                       <Download size={14} />
                     )}
                     {isDownloading ? 'PREPARING...' : 'DOWNLOAD ORIGINAL'}
                   </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Admin;
