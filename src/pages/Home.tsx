import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Shield, Zap, Youtube, Facebook, ArrowRight, Calendar, Clock, Users, Timer, Swords, Sword, UserPlus, MessageCircle, TrendingUp, Book, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Team, Challenge, ScheduleMatch, LiveLink } from '../types';
import CountdownTimer from '../components/CountdownTimer';
import { FALLBACK_IMAGE, openExternalLink } from '../lib/utils';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { LoadingIndicator } from '../components/LoadingComponents';

const Home: React.FC = () => {
  const { settings } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [schedules, setSchedules] = useState<ScheduleMatch[]>([]);
  const [liveLinks, setLiveLinks] = useState<LiveLink[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRulesModal, setShowRulesModal] = useState(false);

  useEffect(() => {
    // We can just stop loading immediately or after a short delay so the user isn't stuck.
    const timer = setTimeout(() => setLoading(false), 500);

    const teamsQuery = query(collection(db, 'teams'), where('registrationStatus', '==', 'approved'));
    const unsubscribeTeams = onSnapshot(teamsQuery, (snapshot) => {
      setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)));
      setLoading(false);
    }, (error) => {
      console.error("Teams listener error:", error);
    });

    const challengesQuery = collection(db, 'challenges');
    const unsubscribeChallenges = onSnapshot(challengesQuery, (snapshot) => {
      setChallenges(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Challenge)));
      setLoading(false);
    }, (error) => {
      console.error("Challenges listener error:", error);
    });

    const schedulesQuery = collection(db, 'schedules');
    const unsubscribeSchedules = onSnapshot(schedulesQuery, (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScheduleMatch)));
      setLoading(false);
    }, (error) => {
      console.error("Schedules listener error:", error);
    });

    // Fetch approved registrations for activity feed
    const registrationsQuery = query(collection(db, 'registrations'), where('status', '==', 'approved'));
    const unsubscribeRegistrations = onSnapshot(registrationsQuery, (snapshot) => {
      const regs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: 'registration',
          teamName: data.teamName,
          timestamp: data.timestamp,
          message: `Guild "${data.teamName}" has been successfully commissioned.`
        };
      });
      setActivities(prev => {
        const other = prev.filter(a => a.type !== 'registration');
        return [...other, ...regs].sort((a, b) => {
          const getT = (ts: any) => {
            if (!ts) return 0;
            if (ts.toMillis) return ts.toMillis();
            if (ts instanceof Date) return ts.getTime();
            const d = new Date(ts);
            return isNaN(d.getTime()) ? 0 : d.getTime();
          };
          return getT(b.timestamp) - getT(a.timestamp);
        }).slice(0, 5);
      });
      setLoading(false);
    }, (error) => {
      // Use the official error handler for consistent reporting
      try {
        handleFirestoreError(error, OperationType.LIST, 'registrations');
      } catch (e) {
        console.error("Registrations activity error:", e);
      }
    });

    const liveLinksQuery = query(collection(db, 'live_links'), orderBy('order', 'asc'));
    const unsubscribeLiveLinks = onSnapshot(liveLinksQuery, (snapshot) => {
      setLiveLinks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiveLink)));
      setLoading(false);
    }, (error) => {
      console.error("Live links error:", error);
    });

    return () => {
      clearTimeout(timer);
      unsubscribeTeams();
      unsubscribeChallenges();
      unsubscribeSchedules();
      unsubscribeRegistrations();
      unsubscribeLiveLinks();
    };
  }, []);

  const recentEvents = useMemo(() => {
    const events: any[] = [];
    
    // Process Schedules as activities
    schedules.forEach(s => {
      if (s.createdAt) {
        events.push({
          id: s.id,
          type: 'match',
          team1: s.team1Name,
          team2: s.team2Name,
          timestamp: s.createdAt,
          message: `${s.matchType === 'challenge' ? 'BATTLE DEPLOYED' : 'OFFICIAL FIXTURE'}: ${s.team1Name} VS ${s.team2Name}`
        });
      }
    });

    // Merge with fetched activities
    const combined = [...events, ...activities];
    
    return combined.sort((a, b) => {
      const getT = (ts: any) => {
        if (!ts) return 0;
        if (ts.toMillis) return ts.toMillis();
        if (ts instanceof Date) return ts.getTime();
        const d = new Date(ts);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      };
      return getT(b.timestamp) - getT(a.timestamp);
    }).slice(0, 10);
  }, [schedules, activities]);

  const scheduledMatches = useMemo(() => {
    const matches: { teams: [Team, Team], time: string, date: string, bet: string, firstPickTeamId: string, firstPickName?: string }[] = [];
    const processed = new Set<string>();

    challenges.forEach(c1 => {
      const team1 = teams.find(t => t.id === c1.fromTeamId);
      if (!team1) return;

      (c1.targetTeamIds || []).forEach(targetId => {
        const team2 = teams.find(t => t.id === targetId);
        if (!team2) return;

        const c2 = challenges.find(c => c.fromTeamId === targetId);

        if (c2 && (c2.targetTeamIds || []).includes(c1.fromTeamId)) {
          const matchKey = [c1.fromTeamId, targetId].sort().join('-');
          if (!processed.has(matchKey)) {
            const details1 = c1.challengeDetails?.[targetId];
            const details2 = c2.challengeDetails?.[c1.fromTeamId];
            
            const time = details2?.preferredTime || details1?.preferredTime || details1?.time || details2?.time || 'TBD';
            const date = details2?.preferredDate || details1?.preferredDate || details1?.date || details2?.date || 'TBD';
            const bet = details1?.bet || details2?.bet || '0';

            let firstPickTeamId = '';
            if (details1?.sideSelection === '1st') firstPickTeamId = c1.fromTeamId;
            else if (details1?.sideSelection === '2nd') firstPickTeamId = targetId;
            else if (details2?.sideSelection === '1st') firstPickTeamId = targetId;
            else if (details2?.sideSelection === '2nd') firstPickTeamId = c1.fromTeamId;

            let firstPickName = '';
            if (firstPickTeamId === c1.fromTeamId) firstPickName = team1.teamName;
            else if (firstPickTeamId === targetId) firstPickName = team2.teamName;

            matches.push({ teams: [team1, team2], time, date, bet, firstPickTeamId, firstPickName });
            processed.add(matchKey);
          }
        }
      });
    });

    schedules.filter(s => s.status !== 'cancelled').forEach(s => {
      const team1 = teams.find(t => t.id === s.team1Id) || { id: s.team1Id || '', teamName: s.team1Name, logoUrl: '' } as Team;
      const team2 = teams.find(t => t.id === s.team2Id) || { id: s.team2Id || '', teamName: s.team2Name, logoUrl: '' } as Team;
      matches.push({
        teams: [team1, team2],
        time: s.time,
        date: s.date,
        bet: '0',
        firstPickTeamId: s.firstPick === s.team1Name ? s.team1Id || s.team1Name : s.firstPick === s.team2Name ? s.team2Id || s.team2Name : s.firstPick,
        firstPickName: s.firstPick
      });
    });

    return matches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [challenges, teams, schedules]);
  
  const guildName = settings?.guildName || 'MGB OFFICIAL';
  const heroTitle = settings?.heroTitle || guildName;
  const guildNameParts = heroTitle.split(' ');
  const lastPart = guildNameParts.length > 1 ? guildNameParts.pop() : '';
  const firstPart = guildNameParts.join(' ');

  const defaultFeatures = [
    { title: 'TOURNAMENTS', icon: 'Trophy', desc: 'Weekly matches with massive prize pools and points system.', enabled: true },
    { title: 'LEADERBOARD', icon: 'Zap', desc: 'Real-time ranking of the best guilds across Bangladesh.', enabled: true },
    { title: 'REWARDS', icon: 'Shield', desc: 'Earn Diamonds to upgrade your team cards and unlock perks.', enabled: true }
  ];

  const features = settings?.features || defaultFeatures;

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Trophy': return Trophy;
      case 'Zap': return Zap;
      case 'Shield': return Shield;
      case 'Sword': return Sword;
      case 'Users': return Users;
      case 'UserPlus': return UserPlus;
      default: return Trophy;
    }
  };

  const finalFeatures = useMemo(() => {
    const list = [...features];
    if (settings?.showSoloPlayers !== false && !list.find(f => f.title === 'SOLO PLAYERS')) {
      list.push({
        title: 'SOLO MERCENARIES',
        icon: 'UserPlus',
        desc: 'No team? No problem. Register as a solo unit and get scouted by top guilds.',
        enabled: true
      });
    }
    return list;
  }, [features, settings?.showSoloPlayers]);

  const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const getYouTubeThumbnail = (url: string) => {
    const id = getYouTubeId(url);
    if (!id) return null;
    return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <LoadingIndicator message="Calibrating Arena..." />
      </div>
    );
  }

  return (
    <div className="space-y-12 md:space-y-24 py-6 md:py-10">
      
      {/* Main Rules Trigger */}
      <div className="flex justify-center -mt-2 relative z-30 px-4">
        <button
          onClick={() => setShowRulesModal(true)}
          className="group flex items-center justify-center gap-3 p-3 sm:px-6 bg-black/60 border border-neon-purple/50 rounded-2xl hover:bg-neon-purple/20 transition-all duration-300 shadow-[0_0_20px_rgba(157,78,221,0.2)] hover:shadow-[0_0_30px_rgba(157,78,221,0.4)] backdrop-blur-md"
        >
          <Book size={24} className="text-neon-purple group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-500" />
          <div className="flex flex-col items-start text-left">
            <span className="text-white font-black tracking-widest uppercase text-xs group-hover:text-neon-purple transition-colors">
              Community Rules
            </span>
            <span className="text-gray-400 text-[8px] font-bold uppercase tracking-wider">Tap to View</span>
          </div>
        </button>
      </div>

      {/* Hero Section */}
      {settings?.showHeroSection !== false && (
        <section className="relative min-h-[60vh] md:min-h-[70vh] py-16 md:py-24 flex items-center justify-center text-center overflow-hidden rounded-3xl">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-10" />
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=2070')] bg-cover bg-center opacity-40 scale-110 hover:scale-100 transition-transform duration-1000" />
          
          {teams.filter(t => t.logoUrl).length > 0 && (
            <div className="absolute top-4 left-0 right-0 z-[15] w-full overflow-hidden mask-edges">
               <div className="flex w-max animate-logo-scroll gap-4 sm:gap-6 px-2">
                 {[...Array(6)].flatMap(() => teams.filter(t => t.logoUrl)).map((team, idx) => (
                   <div key={`${team.id}-${idx}`} title={team.teamName} className="flex-none flex items-center justify-center opacity-60 hover:opacity-100 hover:scale-110 transition-all duration-300">
                     <ImageWithFallback
                       src={team.logoUrl}
                       alt={team.teamName}
                       className="w-12 h-12 md:w-16 md:h-16 rounded-full border border-white/20 object-contain bg-black/80 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                     />
                   </div>
                 ))}
               </div>
            </div>
          )}

          <div className="relative z-20 max-w-4xl px-6 space-y-4 md:space-y-6 pt-16 mt-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="inline-block px-3 py-1 md:px-4 md:py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-neon-blue text-xs md:text-sm font-bold tracking-widest uppercase italic"
            >
              {settings?.heroAnnouncement || settings?.announcement || 'THE BATTLEFIELD AWAITS'}
            </motion.div>
            
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-4xl sm:text-5xl md:text-9xl font-black italic uppercase leading-[1.1] md:leading-[0.9] tracking-tighter px-2"
            >
              {firstPart} <br className="hidden md:block" />
              <span className="gaming-text-stroke block md:inline mt-2 md:mt-0">{lastPart || 'BANGLADESH'}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.5 }}
              className="text-gray-400 text-sm md:text-xl max-w-2xl mx-auto font-medium px-4"
            >
              {settings?.heroSubtitle || 'The ultimate competitive platform for local MLBB legends. Dominate the arena, earn points, and claim your Diamonds.'}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6 pt-6 md:pt-8 w-full sm:w-auto"
            >
              <Link 
                to="/registration"
                className="btn-skew group relative px-8 py-3 md:px-10 md:py-4 bg-neon-blue text-black font-black text-sm md:text-lg shadow-[0_0_20px_rgba(0,229,255,0.5)] overflow-hidden w-full sm:w-auto"
              >
                JOIN TOURNAMENT
              </Link>
              <Link 
                to="/leaderboard"
                className="btn-skew group px-8 py-3 md:px-10 md:py-4 border border-white/20 text-white font-black text-sm md:text-lg hover:bg-white/10 transition-all font-mono italic w-full sm:w-auto"
              >
                LEADERBOARD <ArrowRight className="inline-block ml-2 group-hover:translate-x-2 transition-transform" />
              </Link>
            </motion.div>
          </div>
        </section>
      )}

      {/* Improved Live Broadcast Section */}
      {liveLinks.length > 0 && (
        <section className="space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-2 h-8 bg-neon-red shadow-[0_0_15px_rgba(255,0,60,0.6)]" />
                <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter italic">
                  LIVE <span className="text-neon-red">ACTION</span>
                </h2>
              </div>
              <p className="text-gray-500 text-xs md:text-sm font-bold uppercase tracking-widest pl-5">
                Catch the latest tactical deployments and tournament archives
              </p>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 bg-neon-red/10 border border-neon-red/20 rounded-full self-start md:self-auto">
              <div className="w-2.5 h-2.5 rounded-full bg-neon-red animate-pulse shadow-[0_0_8px_rgba(255,0,60,0.8)]" />
              <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-neon-red">On Air / Recent</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {liveLinks.map((link, idx) => {
              const youtubeThumbnail = getYouTubeThumbnail(link.url);
              const thumbnailUrl = link.thumbnailUrl || youtubeThumbnail;
              
              return (
                <motion.div
                  key={link.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <a
                    href="#"
                    onClick={(e) => openExternalLink(e, link.url)}
                    className="group relative block transition-all duration-500"
                  >
                    {/* Hover Glow Effect */}
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-neon-red to-neon-purple rounded-[2rem] opacity-0 group-hover:opacity-30 blur-xl transition-all duration-500" />
                    
                    {/* Main Card */}
                    <div className="relative glass-card overflow-hidden border border-white/5 group-hover:border-neon-red/40 rounded-[1.5rem] bg-black/40 backdrop-blur-sm shadow-2xl transition-all duration-500">
                      
                      {/* Thumbnail Container */}
                      <div className="aspect-video relative overflow-hidden bg-white/5">
                         {thumbnailUrl ? (
                           <div className="absolute inset-0">
                             <ImageWithFallback 
                               src={thumbnailUrl} 
                               alt={link.title} 
                               className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-60 group-hover:opacity-80" 
                             />
                           </div>
                         ) : (
                           <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-black">
                             <Youtube size={48} className="text-white/10" />
                           </div>
                         )}

                         {/* Team VS Overlay (Only if teams are set) */}
                         {link.team1Id && link.team2Id && (
                           <div className="absolute inset-0 flex items-center justify-between px-4 md:px-8 z-10">
                              <div className="flex flex-col items-center gap-2 w-1/3">
                                <div className="w-10 h-10 md:w-14 md:h-14 rounded-full overflow-hidden border-2 border-white/20 p-1 bg-black/60 shadow-xl group-hover:scale-110 transition-transform">
                                  <ImageWithFallback src={link.team1Logo} alt={link.team1Name || 'Team 1'} className="w-full h-full object-contain" />
                                </div>
                                <span className="text-[9px] md:text-[10px] font-black text-white/90 uppercase text-center truncate w-full drop-shadow-md">{link.team1Name}</span>
                              </div>
                              <div className="w-1/3 flex flex-col items-center justify-center">
                                <div className="text-neon-red font-black italic text-xl md:text-2xl drop-shadow-[0_0_15px_rgba(255,0,60,0.8)]">VS</div>
                              </div>
                              <div className="flex flex-col items-center gap-2 w-1/3">
                                <div className="w-10 h-10 md:w-14 md:h-14 rounded-full overflow-hidden border-2 border-white/20 p-1 bg-black/60 shadow-xl group-hover:scale-110 transition-transform">
                                  <ImageWithFallback src={link.team2Logo} alt={link.team2Name || 'Team 2'} className="w-full h-full object-contain" />
                                </div>
                                <span className="text-[9px] md:text-[10px] font-black text-white/90 uppercase text-center truncate w-full drop-shadow-md">{link.team2Name}</span>
                              </div>
                           </div>
                         )}

                         {/* Overlay Gradients */}
                         <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30 opacity-60 group-hover:opacity-40 transition-opacity z-0" />
                         
                         {/* Play Button Overlay */}
                         <div className="absolute inset-0 flex items-center justify-center transition-all duration-500 z-20">
                            <div className="w-16 h-16 rounded-full bg-neon-red/20 backdrop-blur-sm border border-neon-red/30 flex items-center justify-center text-white scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-500">
                               <div className="w-12 h-12 rounded-full bg-neon-red flex items-center justify-center shadow-[0_0_20px_rgba(255,46,99,0.8)]">
                                 <Youtube size={24} fill="currentColor" />
                               </div>
                            </div>
                         </div>

                         {/* Live Tag if applicable or index */}
                         <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                           <div className="px-2.5 py-1 bg-black/60 backdrop-blur-md border border-white/10 text-white text-[9px] font-black rounded-lg uppercase tracking-widest shadow-lg">
                             POV #{idx + 1}
                           </div>
                           {link.url.includes('live') && (
                             <div className="px-2.5 py-1 bg-neon-red text-white text-[9px] font-black rounded-lg uppercase tracking-widest animate-pulse shadow-[0_0_10px_rgba(255,46,99,0.5)]">
                               LIVE
                             </div>
                           )}
                         </div>

                         {/* Duration or Timestamp Placeholder */}
                         <div className="absolute bottom-4 right-4 z-20 px-2 py-1 bg-black/80 text-white text-[10px] font-mono font-bold rounded border border-white/10">
                           {getYouTubeId(link.url) ? 'HQ VIDEO' : 'STREAM'}
                         </div>
                      </div>

                      {/* Content Section */}
                      <div className="p-6 space-y-3">
                         <h3 className="font-black text-xl text-white group-hover:text-neon-red transition-colors uppercase italic tracking-tight line-clamp-1">
                           {link.title}
                         </h3>
                         {link.description && (
                           <p className="text-xs text-gray-500 font-bold uppercase tracking-tight line-clamp-2 leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">
                             {link.description}
                           </p>
                         )}
                         <div className="pt-4 flex items-center justify-between border-t border-white/5">
                           <div className="flex items-center gap-2">
                             <TrendingUp size={14} className="text-neon-red" />
                             <span className="text-[10px] font-black text-neon-red uppercase tracking-[0.2em]">ENGAGING NOW</span>
                           </div>
                           <motion.div 
                             whileHover={{ x: 5 }}
                             className="flex items-center gap-1.5 text-gray-400 group-hover:text-white transition-colors"
                           >
                             <span className="text-[9px] font-black uppercase tracking-widest">Open Video</span>
                             <ArrowRight size={14} />
                           </motion.div>
                         </div>
                      </div>
                    </div>
                  </a>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Activity Feed */}
      <section className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-8 bg-neon-blue shadow-[0_0_10px_rgba(0,229,255,0.5)]" />
          <h2 className="text-2xl font-black uppercase tracking-tighter italic">
            TACTICAL <span className="text-neon-blue">FEED</span>
          </h2>
        </div>

        <div className="grid gap-4">
          {recentEvents.map((event, idx) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="glass-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-2 border-neon-blue/30 group hover:border-neon-blue transition-all"
            >
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-lg bg-white/5 border border-white/10 ${event.type === 'match' ? 'text-neon-red' : 'text-neon-green'}`}>
                  {event.type === 'match' ? <Swords size={20} /> : <Shield size={20} />}
                </div>
                <div>
                  <p className="text-xs md:text-sm font-bold uppercase tracking-tight text-white group-hover:text-neon-blue transition-colors">
                    {event.message}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock size={12} className="text-gray-600" />
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      {(() => {
                        const ts = event.timestamp;
                        if (!ts) return 'TBD';
                        const date = ts.toMillis ? new Date(ts.toMillis()) : new Date(ts);
                        return isNaN(date.getTime()) ? 'TBD' : date.toLocaleString();
                      })()}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <span className="px-3 py-1 rounded-full bg-white/5 text-[8px] font-black uppercase tracking-[0.2em] text-gray-400 group-hover:text-neon-blue transition-colors">
                  {event.type}
                </span>
              </div>
            </motion.div>
          ))}
          {recentEvents.length === 0 && (
            <div className="p-12 glass-card text-center text-gray-500 uppercase tracking-[0.3em] text-[10px] italic">
              Awaiting tactical developments...
            </div>
          )}
        </div>
      </section>

      {/* Features Grid */}
      {settings?.showFeaturesSection !== false && (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8 w-full">
          {finalFeatures.filter(f => f.enabled).map((feat, i) => {
            const IconComponent = getIcon(feat.icon);
            return (
              <motion.div
                key={i}
                whileHover={{ y: -10 }}
                className="glass-card p-6 md:p-10 space-y-4 md:space-y-6 relative group overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <IconComponent size={100} className="md:w-[120px] md:h-[120px]" />
                </div>
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-neon-blue/10 border border-neon-blue/30 flex items-center justify-center text-neon-blue">
                  <IconComponent size={24} className="md:w-7 md:h-7" />
                </div>
                <h3 className="text-xl md:text-2xl font-black italic uppercase relative z-10">{feat.title}</h3>
                <p className="text-gray-400 leading-relaxed font-medium text-xs md:text-base relative z-10">{feat.desc}</p>
                {feat.title === 'SOLO MERCENARIES' && (
                  <Link to="/solo-players" className="absolute inset-0 z-20" />
                )}
              </motion.div>
            );
          })}
        </section>
      )}

      {/* Brand / About section */}
      {settings?.showAboutSection !== false && (
        <section className="glass-card p-8 md:p-20 relative overflow-hidden backdrop-blur-3xl">
          <div className="max-w-3xl space-y-6 md:space-y-8 relative z-10">
            <h2 className="text-3xl md:text-6xl font-black tracking-tighter uppercase italic leading-tight">
              {settings?.aboutTitle || (
                <>ABOUT <span className="gaming-text-stroke block sm:inline">{guildName}</span></>
              )}
            </h2>
            <div className="space-y-4 md:space-y-6 text-sm md:text-lg text-gray-400 font-medium leading-relaxed">
              {settings?.aboutDescription ? (
                <p className="whitespace-pre-line">{settings.aboutDescription}</p>
              ) : (
                <>
                  <p>
                    {guildName} is the premier esports platform dedicated to the Mobile Legends: Bang Bang community in Bangladesh. 
                    Our mission is to provide a professional, competitive environment where guilds can showcase their skills and battle for glory.
                  </p>
                  <p>
                    By integrating a sophisticated Points & Diamonds economy, we've created a system that rewards consistency, 
                    strategic growth, and tournament performance.
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-3 md:gap-4 pt-2 md:pt-4">
            {settings?.discordLink && (
              <a 
                href="#" 
                onClick={(e) => openExternalLink(e, settings.discordLink)}
                className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-indigo-600/10 border border-indigo-600/30 flex items-center justify-center text-indigo-500 hover:bg-indigo-600 hover:text-white transition-all"
              >
                <svg className="w-5 h-5 md:w-6 md:h-6 fill-current" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.372.292a.077.077 0 0 1-.006.128 12.553 12.553 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
              </a>
            )}
            {settings?.facebookLink && (
              <a 
                href="#" 
                onClick={(e) => openExternalLink(e, settings.facebookLink)}
                className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-blue-600/10 border border-blue-600/30 flex items-center justify-center text-blue-500 hover:bg-blue-600 hover:text-white transition-all"
              >
                <Facebook size={20} className="md:w-6 md:h-6" />
              </a>
            )}
            {settings?.youtubeLink && (
              <a 
                href="#" 
                onClick={(e) => openExternalLink(e, settings.youtubeLink)}
                className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-red-600/10 border border-red-600/30 flex items-center justify-center text-red-500 hover:bg-red-600 hover:text-white transition-all"
              >
                <Youtube size={20} className="md:w-6 md:h-6" />
              </a>
            )}
            {settings?.messengerLink && (
              <a 
                href="#" 
                onClick={(e) => openExternalLink(e, settings.messengerLink)}
                className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-pink-600/10 border border-pink-600/30 flex items-center justify-center text-pink-500 hover:bg-pink-600 hover:text-white transition-all"
              >
                <MessageCircle size={20} className="md:w-6 md:h-6" />
              </a>
            )}
            {settings?.rulesUrl && (
              <a 
                href="#" 
                onClick={(e) => openExternalLink(e, settings.rulesUrl)}
                className="px-4 md:px-6 h-10 md:h-12 rounded-lg bg-neon-blue/10 border border-neon-blue/30 flex items-center justify-center text-neon-blue font-black uppercase tracking-widest text-[10px] hover:bg-neon-blue hover:text-black transition-all"
              >
                RULES DOC
              </a>
            )}
          </div>
        </div>
      </section>
      )}

      {/* Rules Modal */}
      {createPortal(
        <AnimatePresence>
          {showRulesModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-black/90 border border-neon-purple/30 rounded-2xl w-full max-w-2xl overflow-hidden shadow-[0_0_50px_rgba(157,78,221,0.2)] flex flex-col max-h-[90vh]"
              >
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                  <h2 className="text-xl font-black uppercase tracking-widest flex items-center gap-2 text-neon-purple">
                     <Book size={20} /> Community Rules
                  </h2>
                  <button 
                    onClick={() => setShowRulesModal(false)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar">
                  {settings?.communityRules ? (
                    <div className="prose prose-invert prose-p:text-gray-300 prose-headings:text-white prose-a:text-neon-blue max-w-none whitespace-pre-wrap font-mono text-sm leading-relaxed tracking-wide">
                      {settings.communityRules}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500 font-mono text-sm">
                      No community rules have been established yet.
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

    </div>
  );
};

export default Home;
