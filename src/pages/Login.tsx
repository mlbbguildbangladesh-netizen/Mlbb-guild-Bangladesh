import React, { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { notifyAdmins } from '../lib/notificationUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, User, Lock, Mail, ArrowLeft, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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

const Login: React.FC = () => {
  const { user, firebaseUser, isAdmin, settings } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');

  useEffect(() => {
    if (firebaseUser && !loading) {
      if (isAdmin) {
        navigate('/admin');
      } else if (user) {
        navigate('/');
      }
    }
  }, [user, firebaseUser, isAdmin, navigate, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        setSuccess('Logged in successfully!');
      } else {
        if (!name) throw new Error("Name is required");
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const fUser = result.user;
        
        const userRef = doc(db, 'users', fUser.uid);
        const isAdminEmail = fUser.email?.toLowerCase() === 'mlbbguildbangladesh@gmail.com';
        
        await setDoc(userRef, {
          displayName: name,
          email: fUser.email,
          role: isAdminEmail ? 'admin' : 'team',
          points: 0,
          diamonds: 0,
          createdAt: new Date().toISOString(),
          isVerified: true,
          visiblePassword: password
        });
        
        setSuccess('Account created successfully!');
      }
    } catch (err: any) {
      console.error("Auth Error:", err);
      // Simplify error messages for user
      let message = err.message || 'Authentication failed.';
      if (message.includes('auth/invalid-credential')) {
        message = 'Invalid email or password. If you haven\'t registered yet, please create an account.';
      } else if (message.includes('auth/user-not-found') || message.includes('auth/wrong-password')) {
        message = 'Invalid email or password.';
      } else if (message.includes('auth/email-already-in-use')) {
        message = 'Email is already taken.';
      } else if (message.includes('auth/weak-password')) {
        message = 'Password should be at least 6 characters.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (!forgotEmail) {
      setError('Please enter your email address.');
      setLoading(false);
      return;
    }

    try {
      await addDoc(collection(db, 'passwordRequests'), {
        email: forgotEmail,
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      
      // Notify admins
      await notifyAdmins(
        'Password Reset Requested',
        `User ${forgotEmail} is requesting a password reset.`,
        'system',
        '/admin?tab=pass-reqs',
        settings
      );

      setSuccess('Request forwarded to admin! Please await password reset.');
      setIsForgotPassword(false);
      setForgotEmail('');
    } catch (err: any) {
      console.error(err);
      setError('Failed to send request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6 md:p-10 max-w-md w-full space-y-6 md:space-y-8 gaming-border-blue relative overflow-hidden"
      >
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-neon-blue via-neon-purple to-neon-blue" />
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-neon-blue/10 border border-neon-blue/30 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(0,229,255,0.15)]">
            <Lock className="text-neon-blue" size={32} />
          </div>
          <h1 className="text-4xl font-black italic">
            GUILD <span className="text-neon-blue uppercase">
              {isForgotPassword ? "RECOVERY" : isLogin ? "ACCESS" : "JOIN"}
            </span>
          </h1>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">
            {isForgotPassword 
              ? "Request admin for password recovery" 
              : isLogin 
                ? "Enter your credentials to access dashboard" 
                : "Create an account to join the guild"}
          </p>
        </div>

        {settings?.maintenanceMode && (
          <div className="p-4 bg-neon-red/10 border border-neon-red/30 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-neon-red">
               <AlertCircle size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">MAINTENANCE ACTIVE</span>
            </div>
            <p className="text-[9px] text-gray-500 font-bold uppercase leading-tight italic">
              Terminal restricted to administrative access only.
            </p>
            {settings.maintenanceEndTime && (
              <div className="pt-2 border-t border-neon-red/10">
                <p className="text-[8px] text-neon-red/60 font-black uppercase mb-1">Expected Operational Signal:</p>
                <div className="text-xl font-black font-mono text-neon-red">
                  <Countdown endTime={settings.maintenanceEndTime} />
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-4 bg-neon-red/10 border border-neon-red/30 text-neon-red rounded-lg text-[10px] font-black uppercase tracking-widest">
            {error}
          </div>
        )}

        {success && (
          <div className="p-4 bg-neon-blue/10 border border-neon-blue/30 text-neon-blue rounded-lg text-[10px] font-black uppercase tracking-widest text-center">
            {success}
          </div>
        )}

        {!isForgotPassword && (
          <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 mb-6">
            <button
              type="button"
              onClick={() => { setIsLogin(true); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                isLogin ? 'bg-neon-blue text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]' : 'text-gray-500 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(false); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                !isLogin ? 'bg-neon-blue text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]' : 'text-gray-500 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {isForgotPassword ? (
            <motion.form 
              key="forgot-password"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleForgotPassword} 
              className="space-y-4"
            >
              <div className="space-y-2">
                 <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Email Address</label>
                 <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                     <Mail size={16} />
                   </div>
                   <input
                     type="email"
                     value={forgotEmail}
                     onChange={(e) => setForgotEmail(e.target.value)}
                     className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-neon-blue focus:shadow-[0_0_15px_rgba(0,229,255,0.1)] transition-all"
                     placeholder="agent@mgb.com"
                     required
                   />
                 </div>
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-neon-blue text-black font-black py-4 rounded-xl flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:scale-[1.02] active:scale-95 transition-all text-sm uppercase tracking-widest mt-6 disabled:opacity-50"
              >
                {loading ? (
                   <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  'REQUEST ADMIN FOR PASSWORD'
                )}
              </button>

              <button 
                type="button"
                onClick={() => { setIsForgotPassword(false); setError(''); }}
                className="w-full text-gray-500 hover:text-white py-2 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all mt-4"
              >
                <ArrowLeft size={14} /> Back to Sign In
              </button>
            </motion.form>
          ) : (
            <motion.form 
              key={isLogin ? 'login' : 'register'}
              initial={{ opacity: 0, x: isLogin ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isLogin ? 20 : -20 }}
              onSubmit={handleSubmit} 
              className="space-y-4"
            >
              {!isLogin && (
                <div className="space-y-2">
                   <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Full Name / In-Game Name</label>
                   <div className="relative">
                     <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                       <User size={16} />
                     </div>
                     <input
                       type="text"
                       value={name}
                       onChange={(e) => setName(e.target.value)}
                       className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-neon-blue focus:shadow-[0_0_15px_rgba(0,229,255,0.1)] transition-all"
                       placeholder="Gosu | Name"
                       required={!isLogin}
                     />
                   </div>
                </div>
              )}
              
              <div className="space-y-2">
                 <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Email Address</label>
                 <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                     <Mail size={16} />
                   </div>
                   <input
                     type="email"
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-neon-blue focus:shadow-[0_0_15px_rgba(0,229,255,0.1)] transition-all"
                     placeholder="agent@mgb.com"
                     required
                   />
                 </div>
              </div>

              <div className="space-y-2">
                 <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Password</label>
                 <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                     <Lock size={16} />
                   </div>
                   <input
                     type="password"
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-neon-blue focus:shadow-[0_0_15px_rgba(0,229,255,0.1)] transition-all"
                     placeholder="••••••••"
                     required
                   />
                 </div>
              </div>

              {isLogin && (
                <div className="flex justify-end mt-1">
                  <button
                    type="button"
                    onClick={() => { setIsForgotPassword(true); setError(''); }}
                    className="text-[10px] text-neon-blue hover:text-white font-bold tracking-widest uppercase transition-colors"
                  >
                    Req Admin for Password?
                  </button>
                </div>
              )}

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-neon-blue text-black font-black py-4 rounded-xl flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:scale-[1.02] active:scale-95 transition-all text-sm uppercase tracking-widest mt-6 disabled:opacity-50"
              >
                {loading ? (
                   <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  isLogin ? 'INITIALIZE LOGIN' : 'CREATE ACCOUNT'
                )}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <p className="text-center text-[8px] text-gray-600 font-bold uppercase tracking-widest mt-8">
          MGB SECURITY PROTOCOL • VERIFIED ACCESS ONLY
        </p>
      </motion.div>
    </div>
  );
};

export default Login;


