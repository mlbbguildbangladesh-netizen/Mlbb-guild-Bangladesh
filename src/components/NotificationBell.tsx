import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, ExternalLink, Inbox } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  updateDoc, 
  doc, 
  limit,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Notification } from '../types';
import { Link } from 'react-router-dom';
import { formatRelativeTime } from '../lib/utils';

export function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.id),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification)));
    }, (error) => {
      // Quietly log notification errors as they shouldn't crash the UI
      console.error('Notification Service Error:', error);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) {
      console.error(err);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (err) {
      console.error(err);
    }
  };

  const clearAll = async () => {
    // Note: This would typically be a cloud function for safety, but for now we'll do it manually
    // or just leave it for the user to delete individually to avoid batch issues in rules
    for (const n of notifications) {
      await deleteDoc(doc(db, 'notifications', n.id));
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-neon-blue/30 transition-all relative group"
      >
        <Bell size={20} className={`transition-colors ${unreadCount > 0 ? 'text-neon-blue shadow-[0_0_10px_rgba(0,229,255,0.3)]' : 'text-gray-400'}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-blue opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-neon-blue text-[8px] font-black text-black items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute -right-12 md:right-0 mt-4 w-72 sm:w-80 max-h-[480px] bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
          >
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-neon-blue" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Notifications</h3>
              </div>
              {notifications.length > 0 && (
                <button 
                  onClick={clearAll}
                  className="text-[8px] font-black text-gray-500 hover:text-neon-red uppercase tracking-widest transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-grow custom-scrollbar">
              {notifications.length > 0 ? (
                notifications.map((n) => (
                  <div 
                    key={n.id} 
                    className={`p-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors relative group ${!n.read ? 'bg-neon-blue/5' : ''}`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="space-y-1 flex-grow cursor-pointer" onClick={() => markAsRead(n.id)}>
                        <div className="flex justify-between items-center">
                          <h4 className={`text-[11px] font-black uppercase tracking-wide ${!n.read ? 'text-neon-blue' : 'text-gray-300'}`}>
                            {n.title}
                          </h4>
                          {n.createdAt && (
                            <span className="text-[9px] text-gray-500 font-bold ml-2 whitespace-nowrap">
                              {formatRelativeTime(n.createdAt)}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500 leading-relaxed font-bold">
                          {n.message}
                        </p>
                        {n.link && (
                          <Link 
                            to={n.link} 
                            onClick={() => {
                              markAsRead(n.id);
                              setIsOpen(false);
                            }}
                            className="inline-flex items-center gap-1 mt-2 text-[8px] font-black text-neon-blue hover:underline uppercase tracking-[0.1em]"
                          >
                            View Details <ExternalLink size={8} />
                          </Link>
                        )}
                      </div>
                      <button 
                        onClick={() => deleteNotification(n.id)}
                        className="p-1 text-gray-700 hover:text-neon-red opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 flex flex-col items-center justify-center gap-4 text-center px-6">
                  <div className="p-4 rounded-full bg-white/5 border border-white/10">
                    <Inbox size={24} className="text-gray-700" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">All clear</h4>
                    <p className="text-[9px] text-gray-600 font-bold uppercase tracking-wider">No new combat intel.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-white/5 border-t border-white/10 text-center">
              <p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.2em]">Latest Tactical Updates</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
