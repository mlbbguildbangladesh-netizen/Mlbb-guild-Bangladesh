import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Home, Trophy, Users, ShoppingCart, User as UserIcon, LogOut, Menu, X, LayoutDashboard, Swords, AlertCircle, Shield, Diamond, Calendar, History, Table, Book, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { MatchReminder } from './MatchReminder';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';

const Navbar: React.FC = () => {
  const { user, firebaseUser, isAdmin, isModerator, moderatorPermissions, settings } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = React.useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const navItems = [
    { name: 'Home', path: '/', icon: Home },
  ];

  const hasPublicSheets = settings?.googleSheets?.some(s => s.isPublic);
  const hasDatabasePermission = isModerator && moderatorPermissions?.includes('database');
  if (isAdmin || hasPublicSheets || hasDatabasePermission) {
    navItems.push({ name: 'Database', path: '/database', icon: Table });
  }

  if (settings?.showLeaderboard !== false) {
    navItems.push({ name: 'Leaderboard', path: '/leaderboard', icon: Trophy });
  }

  navItems.push({ name: 'Schedule', path: '/schedule', icon: Calendar });
  navItems.push({ name: 'Results', path: '/results', icon: History });

  if (settings?.showChallenges !== false) {
    navItems.push({ name: 'Challenges', path: '/challenges', icon: Swords });
  }

  if (settings?.registrationEnabled !== false) {
    navItems.push({ name: 'Registration', path: '/registration', icon: Users });
  }

  if (settings?.showSoloPlayers !== false) {
    navItems.push({ name: 'Solo Players', path: '/solo-players', icon: Shield });
  }

  if (settings?.showTrainingGround !== false) {
    navItems.push({ name: 'Training Ground', path: '/training', icon: Flame });
  }

  if (settings?.showShop !== false) {
    navItems.push({ name: 'Shop', path: '/shop', icon: ShoppingCart });
  }

  if (isAdmin || isModerator) {
    navItems.push({ name: 'Teams', path: '/teams', icon: Users });
    navItems.push({ name: 'Admin', path: '/admin', icon: LayoutDashboard });
  }

  const guildName = settings?.guildName || 'MGB OFFICIAL';
  const guildNameParts = guildName.split(' ');
  const lastPart = guildNameParts.length > 1 ? guildNameParts.pop() : '';
  const firstPart = guildNameParts.join(' ');

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-black/60 backdrop-blur-lg border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 min-h-[4rem] py-2 flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex items-center gap-4">
          <NavLink to="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center neon-glow-blue border border-white/10 gaming-gradient-blue transition-transform group-hover:scale-110">
              <Logo className="text-xl" />
            </div>
            <span className="text-xl font-extrabold tracking-tighter gaming-text-gradient">
              {firstPart} <span className="text-neon-blue">{lastPart}</span>
            </span>
          </NavLink>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex flex-wrap items-center justify-end gap-x-2 lg:gap-x-4 gap-y-3 flex-1 ml-4">
          <div className="flex flex-wrap items-center justify-end gap-x-3 lg:gap-x-5 gap-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `group relative flex items-center gap-1.5 text-[10px] lg:text-[11px] font-black uppercase tracking-widest transition-all hover:text-neon-blue ${
                    isActive ? 'text-neon-blue' : 'text-gray-400'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon size={14} className="group-hover:scale-110 transition-transform lg:w-4 lg:h-4" />
                    <span>{item.name}</span>
                    <div className={`absolute -bottom-1 left-0 h-[1px] bg-neon-blue transition-all shadow-[0_0_10px_#00E5FF] ${
                      isActive ? 'w-full' : 'w-0 group-hover:w-full'
                    }`} />
                  </>
                )}
              </NavLink>
            ))}
          </div>
          
          {user ? (
            <div className="flex items-center gap-3 pl-2 lg:pl-4 md:border-l border-white/10">
              {settings?.showDiamonds !== false && (
                <div className="hidden lg:flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                  <Diamond size={14} className="text-neon-cyan" />
                  <span className="text-[11px] font-black tracking-widest text-white">
                    {isAdmin ? 'UNLIMITED' : (user.diamonds || 0)}
                  </span>
                </div>
              )}
              <NotificationBell />
              <NavLink to="/profile" className="flex items-center gap-2 bg-white/5 px-2.5 py-1.5 lg:px-3 lg:py-1.5 rounded-full border border-white/10 hover:border-neon-blue transition-colors group">
                <div className="w-5 h-5 lg:w-6 lg:h-6 rounded-full bg-neon-blue/20 flex items-center justify-center group-hover:bg-neon-blue/40 transition-colors">
                  <UserIcon size={12} className="text-neon-blue lg:w-3.5 lg:h-3.5" />
                </div>
                <span className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest group-hover:text-neon-blue transition-colors">
                  {(isAdmin || isModerator) ? 'STAFF PANEL' : (user.teamName || user.displayName || 'PROFILE')}
                </span>
              </NavLink>
              <button 
                onClick={handleLogout}
                className="text-gray-400 hover:text-neon-red transition-colors"
                title="Logout"
              >
                <LogOut size={18} className="lg:w-5 lg:h-5" />
              </button>
            </div>
          ) : (
            <div className="pl-2 lg:pl-4 md:border-l border-white/10">
              <NavLink 
                to="/login"
                className="px-4 py-1.5 lg:px-5 lg:py-2 rounded-lg bg-neon-blue text-black font-bold text-[11px] lg:text-sm neon-glow-blue hover:brightness-110 transition-all whitespace-nowrap"
              >
                LOGIN
              </NavLink>
            </div>
          )}
        </div>

        {/* Mobile Menu Toggle & Admin Logout */}
        <div className="md:hidden flex items-center gap-2">
          {user && <NotificationBell />}
          {(isAdmin || isModerator) && (
            <button 
              onClick={handleLogout}
              className="p-2 text-neon-red bg-neon-red/10 border border-neon-red/30 rounded-lg active:scale-95 transition-all"
              title="Staff Logout"
            >
              <LogOut size={18} />
            </button>
          )}
          <button className="text-white p-2" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="md:hidden absolute top-16 left-0 w-full bg-black/95 backdrop-blur-xl border-b border-white/10 p-4 pb-8 space-y-4 shadow-2xl"
          >
            {user && (
              <NavLink
                to="/profile"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
              >
                <div className="w-10 h-10 rounded-full bg-neon-blue/20 flex items-center justify-center border border-neon-blue/30 shadow-[0_0_15px_rgba(0,229,255,0.2)]">
                  <UserIcon size={20} className="text-neon-blue" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-black text-sm tracking-widest text-white uppercase truncate">{user.teamName || 'Team Profile'}</span>
                  {settings?.showDiamonds !== false && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Diamond size={10} className="text-neon-cyan" />
                      <span className="text-[10px] text-neon-cyan font-black tracking-widest">
                        {(isAdmin || isModerator) ? 'UNLTD' : (user.diamonds || 0)}
                       </span>
                    </div>
                  )}
                </div>
              </NavLink>
            )}
            
            <div className="grid grid-cols-2 gap-2 pt-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center gap-2 p-3 min-h-[80px] rounded-xl transition-all border ${
                      isActive 
                        ? 'bg-neon-blue/10 text-neon-blue border-neon-blue/40 shadow-[0_0_15px_rgba(0,229,255,0.15)]' 
                        : 'bg-black/50 border-white/5 hover:bg-white/5 text-gray-400'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon size={20} className={isActive ? 'text-neon-blue' : 'text-gray-400'} />
                      <span className="font-black text-[9px] uppercase tracking-widest text-center">{item.name}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>

            <div className="pt-4 space-y-3">
              {!user ? (
                <NavLink
                  to="/login"
                  onClick={() => setIsOpen(false)}
                  className="w-full flex items-center justify-center py-4 rounded-xl bg-neon-blue text-black font-black uppercase tracking-widest shadow-[0_0_20px_rgba(0,229,255,0.3)] active:scale-95 transition-transform"
                >
                  LOGIN INITIALIZE
                </NavLink>
              ) : (
                <button
                  onClick={() => {
                    handleLogout();
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-xl border border-neon-red/30 text-neon-red font-black uppercase tracking-widest shadow-[0_0_15px_rgba(255,46,99,0.15)] bg-black/50 hover:bg-neon-red/10 active:scale-95 transition-all"
                >
                  <LogOut size={18} />
                  TERMINATE SESSION
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const MaintenanceCountdown: React.FC<{ endTime: string }> = ({ endTime }) => {
  const [timeLeft, setTimeLeft] = React.useState<string>('');

  React.useEffect(() => {
    const calculate = () => {
      const now = new Date().getTime();
      const end = new Date(endTime).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft('SYSTEM RECALIBRATING...');
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };

    calculate();
    const timer = setInterval(calculate, 1000);
    return () => clearInterval(timer);
  }, [endTime]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-4xl font-black font-mono tracking-widest text-neon-red drop-shadow-[0_0_10px_rgba(255,46,99,0.5)]">
        {timeLeft}
      </div>
      <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">REMAINING TERMINAL DOWNTIME</p>
    </div>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings, isAdmin, isModerator, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMaintenance = settings?.maintenanceMode && !isAdmin && !isModerator && location.pathname !== '/login';

  return (
    <div className="min-h-screen pt-24 pb-10 relative overflow-x-hidden">
      <div className="scanline-overlay" />
      <Navbar />
      
      {settings?.announcement && !isMaintenance && (
        // Smart Filter: Hide announcement if it's about old team registration but the feature is disabled
        (settings?.allowOldTeamRegistration !== false || !settings.announcement.toLowerCase().includes('old team'))
      ) && (
        <div className="fixed top-16 left-0 w-full z-40 bg-neon-blue/10 border-b border-neon-blue/20 backdrop-blur-md py-2 overflow-hidden">
          <div className="flex whitespace-nowrap animate-marquee">
            {[1, 2, 3].map((i) => (
              <span key={i} className="text-[10px] font-black text-neon-blue uppercase tracking-[0.3em] px-12">
                CRITICAL BROADCAST: {settings.announcement} • {settings.announcement} • {settings.announcement}
              </span>
            ))}
          </div>
        </div>
      )}

      {user && !isAdmin && (!user.phoneNumber || user.phoneNumber.replace(/\D/g, '').length !== 11) && location.pathname !== '/profile' && (
        <div className="mx-4 mt-8 bg-neon-red/10 border border-neon-red rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-neon-red shrink-0" size={24} />
            <div>
              <h4 className="text-white font-bold uppercase">Update Your WhatsApp Number</h4>
              <p className="text-sm text-gray-400">Your profile is missing a valid 11-digit WhatsApp number. Please update it now.</p>
            </div>
          </div>
          <button onClick={() => navigate('/profile')} className="px-6 py-2 bg-neon-red text-white uppercase font-black text-xs rounded-lg hover:brightness-110 shrink-0">
            UPDATE NOW
          </button>
        </div>
      )}
      
      <AnimatePresence>
        {isMaintenance ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6 text-center"
          >
            <div className="max-w-md space-y-8">
              <div className="w-20 h-20 bg-neon-red/10 rounded-full flex items-center justify-center mx-auto text-neon-red border border-neon-red/30 shadow-[0_0_30px_rgba(255,46,99,0.2)]">
                <AlertCircle size={40} />
              </div>
              <div className="space-y-4">
                <h1 className="text-3xl font-black italic tracking-tighter uppercase">SYSTEM <span className="text-neon-red">MAINTENANCE</span></h1>
                <p className="text-gray-400 text-sm font-bold uppercase tracking-widest leading-relaxed">
                  {settings?.announcement || "The guild terminal is currently undergoing scheduled data recalibration. Please return to your station later."}
                </p>
              </div>

              {settings?.maintenanceEndTime && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-md">
                  <MaintenanceCountdown endTime={settings.maintenanceEndTime} />
                </div>
              )}
              
              <div className="pt-4 space-y-4">
                {!user ? (
                  <button 
                    onClick={() => navigate('/login')}
                    className="group relative px-10 py-4 bg-neon-blue text-black font-black rounded-xl text-xs shadow-[0_0_30px_rgba(0,229,255,0.4)] hover:shadow-[0_0_50px_rgba(0,229,255,0.6)] hover:scale-105 transition-all active:scale-95 flex items-center gap-3 mx-auto"
                  >
                    <Shield size={16} className="group-hover:rotate-12 transition-transform" />
                    ADMIN ACCESS
                    <div className="absolute inset-0 rounded-xl border-2 border-white/20 scale-105 opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all pointer-events-none" />
                  </button>
                ) : (
                  <button 
                    onClick={() => signOut(auth)}
                    className="px-8 py-3 bg-white/5 border border-white/10 text-white font-black rounded-lg text-xs hover:bg-neon-red/10 hover:text-neon-red hover:border-neon-red/30 transition-all"
                  >
                    LOGOUT TERMINAL
                  </button>
                )}
                <div className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] animate-pulse">
                  {user ? `Terminal ID: ${user.email} (Restricted)` : 'Access Logic: Restricted'}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <main className="max-w-7xl mx-auto px-4 relative z-10 text-white min-h-[calc(100vh-160px)]">
            {children}
          </main>
        )}
      </AnimatePresence>
      
      {/* Footer */}
      <footer className="mt-auto py-6 relative z-10 border-t border-white/5 mt-12 bg-black/40 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            © {new Date().getFullYear()} MGB OFFICIAL. ALL RIGHTS RESERVED.
          </div>
          <div className="flex items-center gap-6">
            <a 
              href="/privacy-policy" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] text-gray-400 font-bold uppercase tracking-widest hover:text-neon-blue transition-colors flex items-center gap-2"
            >
              Privacy Policy
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </a>
          </div>
        </div>
      </footer>
      
      {/* Background Elements */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-[#02050a]">
        <div className="grid-bg" />
        <div className="particles" />
        <div className="light-streaks">
          <div className="streak top-[20%] left-[-10%]" style={{ animationDelay: '0s' }} />
          <div className="streak top-[50%] left-[-20%]" style={{ animationDelay: '2s' }} />
          <div className="streak top-[80%] left-[-15%]" style={{ animationDelay: '4s' }} />
        </div>
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neon-blue opacity-10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neon-red opacity-10 rounded-full blur-[120px]" />
      </div>

      {/* Electric Border Accents */}
      <div className="fixed top-0 left-0 w-32 h-[2px] bg-neon-blue shadow-[0_0_10px_#00E5FF] z-[60]" />
      <div className="fixed top-0 left-0 w-[2px] h-32 bg-neon-blue shadow-[0_0_10px_#00E5FF] z-[60]" />
      <div className="fixed bottom-0 right-0 w-32 h-[2px] bg-neon-red shadow-[0_0_10px_#FF2E63] z-[60]" />
      <div className="fixed bottom-0 right-0 w-[2px] h-32 bg-neon-red shadow-[0_0_10px_#FF2E63] z-[60]" />
      
      <MatchReminder />
    </div>
  );
};
