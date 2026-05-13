import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Shield, Zap, Youtube, Facebook, ArrowRight, Calendar, Clock, Users, Timer, Swords, Sword, UserPlus, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Team, Challenge, ScheduleMatch } from '../types';
import CountdownTimer from '../components/CountdownTimer';
import { FALLBACK_IMAGE, openExternalLink } from '../lib/utils';
import { ImageWithFallback } from '../components/ImageWithFallback';

const Home: React.FC = () => {
  const { settings } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [schedules, setSchedules] = useState<ScheduleMatch[]>([]);

  useEffect(() => {
    const teamsQuery = query(collection(db, 'teams'), where('registrationStatus', '==', 'approved'));
    const unsubscribeTeams = onSnapshot(teamsQuery, (snapshot) => {
      setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'teams');
    });

    const challengesQuery = collection(db, 'challenges');
    const unsubscribeChallenges = onSnapshot(challengesQuery, (snapshot) => {
      setChallenges(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Challenge)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'challenges');
    });

    const schedulesQuery = collection(db, 'schedules');
    const unsubscribeSchedules = onSnapshot(schedulesQuery, (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScheduleMatch)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'schedules');
    });

    return () => {
      unsubscribeTeams();
      unsubscribeChallenges();
      unsubscribeSchedules();
    };
  }, []);

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

  return (
    <div className="space-y-12 md:space-y-24 py-6 md:py-10">
      {/* Hero Section */}
      {settings?.showHeroSection !== false && (
        <section className="relative h-[60vh] md:h-[80vh] flex items-center justify-center text-center overflow-hidden rounded-3xl">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-10" />
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=2070')] bg-cover bg-center opacity-40 scale-110 hover:scale-100 transition-transform duration-1000" />
          
          <div className="relative z-20 max-w-4xl px-6 space-y-4 md:space-y-6">
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
    </div>
  );
};

export default Home;
