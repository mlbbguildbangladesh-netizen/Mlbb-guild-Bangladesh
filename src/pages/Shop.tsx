import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Diamond, Shield, Zap, ShoppingBag, ArrowUpCircle, Info, CreditCard, Smartphone, Trophy, TrendingUp, ShoppingCart } from 'lucide-react';
import { doc, updateDoc, writeBatch, collection, serverTimestamp, getDoc, increment } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const SHOP_ITEMS = [
  {
    id: 'mlbb_weekly_pass',
    name: 'MLBB Weekly Pass',
    description: 'Direct top-up of Weekly Diamond Pass to your MLBB Account. Requires ID/Server in profile.',
    price: 1500,
    icon: CreditCard,
    color: 'text-neon-cyan',
    bg: 'bg-neon-cyan/10',
    category: 'Top Up'
  },
  {
    id: 'mlbb_50_diamonds',
    name: '50 Diamonds (MLBB)',
    description: 'Instant top-up of 50 Diamonds to your Mobile Legends account.',
    price: 350,
    icon: Smartphone,
    color: 'text-neon-cyan',
    bg: 'bg-neon-cyan/10',
    category: 'Top Up'
  },
  {
    id: 'double_points',
    name: 'Double Points Card',
    description: 'Get x2 points for your next victory in a tournament match.',
    price: 500,
    icon: Zap,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10'
  },
  {
    id: 'loss_shield',
    name: 'Loss Shield',
    description: 'Prevents point loss for your next defeat.',
    price: 300,
    icon: Shield,
    color: 'text-neon-blue',
    bg: 'bg-neon-blue/10'
  },
  {
    id: 'team_exp_boost',
    name: 'Team Level Up',
    description: 'Instantly increases your team upgrade level by 1.',
    price: 1000,
    icon: ArrowUpCircle,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10'
  }
];

const Shop: React.FC = () => {
  const { user, isAdmin, settings } = useAuth();
  
  if (settings?.showShop === false && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const filteredItems = filter ? SHOP_ITEMS.filter(i => i.category === filter) : SHOP_ITEMS;

  const canPurchaseToday = () => {
    if (!user || user.role === 'admin') return true;
    if (!user.lastDiamondPurchase) return true;

    const lastPurchase = user.lastDiamondPurchase.toDate ? user.lastDiamondPurchase.toDate() : new Date(user.lastDiamondPurchase);
    const today = new Date();
    
    return (
      lastPurchase.getDate() !== today.getDate() ||
      lastPurchase.getMonth() !== today.getMonth() ||
      lastPurchase.getFullYear() !== today.getFullYear()
    );
  };

  const handlePurchase = async (item: typeof SHOP_ITEMS[0]) => {
    if (!user) {
      toast.error("Please login to purchase items.");
      return;
    }

    if (!canPurchaseToday() && user.role !== 'admin') {
      toast.error("You can only purchase one item per day with diamonds! Come back tomorrow.");
      return;
    }

    if (item.category === 'Top Up' && (!user.gameId || !user.serverId)) {
      toast.error("Please update your MLBB Game ID and Server ID in your Profile before purchasing Top Up items.");
      return;
    }

    if ((user.diamonds || 0) < item.price) {
      toast.error("Insufficient diamonds!");
      return;
    }

    setPurchasing(item.id);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("No active session. Please login again.");

      const response = await fetch('/api/shop/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          itemId: item.id,
          teamId: user.teamId || user.id
        })
      });

      const responseText = await response.text();
      let data;
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (e) {
        throw new Error(`Invalid response from server: ${responseText || 'Empty response'}`);
      }

      if (!response.ok) throw new Error(data.error || "Purchase failed");

      toast.success(`Successfully purchased ${item.name}!`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Purchase failed. Please try again.");
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <div className="py-6 md:py-10 space-y-8 md:space-y-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
        <div className="space-y-1 text-center md:text-left">
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-black italic uppercase tracking-tighter">GUILD <span className="gaming-text-stroke">SHOP</span></h1>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] md:text-xs">Spend Diamonds to upgrade your arsenal</p>
        </div>

        {user && (
          <div className="flex flex-col md:flex-row gap-6 items-stretch">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex-1 flex items-center gap-6 bg-white/5 border border-white/10 px-8 py-6 rounded-2xl gaming-border-blue"
            >
              <div className="w-16 h-16 rounded-xl bg-neon-blue/10 flex items-center justify-center text-neon-blue border border-neon-blue/20">
                <Trophy size={32} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none">TEAM STATUS</p>
                <h2 className="text-2xl font-black text-white uppercase italic">{user.teamName || 'GUILD MEMBER'}</h2>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-400">
                    <TrendingUp size={14} className="text-neon-blue" />
                    {user.points || 0} PTS
                  </div>
                  <div className="w-[1px] h-3 bg-white/10" />
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-400">
                    <Zap size={14} className="text-neon-red" />
                    LVL {user.role === 'admin' ? 99 : (user.role === 'team' ? 1 : 0)}
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-4 bg-white/5 border border-white/10 px-8 py-6 rounded-2xl min-w-[240px]"
            >
              <div className="space-y-1 w-full">
                <p className="text-[10px] font-black text-neon-cyan uppercase tracking-widest leading-none">YOUR DIAMONDS</p>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-4xl font-black text-white">
                    <Diamond size={32} className="text-neon-cyan" />
                    {user.diamonds || 0}
                  </div>
                  <div className="p-2 bg-neon-cyan/10 rounded-lg text-neon-cyan">
                    <ShoppingCart size={20} />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      <div className="bg-neon-blue/5 border border-neon-blue/20 p-6 rounded-2xl flex gap-4 items-start">
        <Info className="text-neon-blue shrink-0 mt-1" size={20} />
        <p className="text-sm text-gray-400">
          Diamonds are earned through tournament victories and special bonuses. Items purchased in the shop are applied automatically to your next eligible match or team state.
        </p>
      </div>

      <div className="flex gap-4 border-b border-white/5 pb-4 overflow-x-auto no-scrollbar">
        <button 
          onClick={() => setFilter(null)}
          className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${!filter ? 'bg-white text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
        >
          All Items
        </button>
        <button 
          onClick={() => setFilter('Top Up')}
          className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'Top Up' ? 'bg-neon-cyan text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
        >
          Top Up
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {filteredItems.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
            className="glass-card group relative flex flex-col p-6 md:p-8 space-y-6 gaming-border-blue"
          >
            <div className={`w-16 h-16 rounded-2xl ${item.bg} flex items-center justify-center ${item.color} relative`}>
              <item.icon size={32} />
              {item.category && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded text-[8px] font-black bg-neon-blue text-white uppercase tracking-tighter">
                  {item.category}
                </span>
              )}
            </div>

            <div className="space-y-3 flex-1">
              <h3 className="text-2xl font-black">{item.name}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{item.description}</p>
            </div>

            <div className="space-y-4 pt-6 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">PRICE</span>
                <div className="flex items-center gap-1.5 font-black text-neon-cyan text-lg">
                  <Diamond size={16} />
                  {item.price}
                </div>
              </div>

              <button 
                disabled={purchasing === item.id || (!user) || (user.role !== 'admin' && !canPurchaseToday())}
                onClick={() => handlePurchase(item)}
                className="w-full bg-white text-black font-black py-3 rounded-xl hover:bg-neon-blue transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale group-hover:neon-glow-blue"
              >
                {purchasing === item.id ? (
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <ShoppingBag size={18} />
                    {!canPurchaseToday() && user.role !== 'admin' ? 'LIMIT REACHED' : 'BUY ITEM'}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Special Offers Section */}
      <section className="glass-card p-6 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-neon-blue/10 to-transparent pointer-events-none" />
        <div className="space-y-3 md:space-y-4 relative z-10 text-center md:text-left">
          <h2 className="text-2xl md:text-3xl font-black">WANT MORE <span className="text-neon-cyan">DIAMONDS?</span></h2>
          <p className="text-gray-400 text-sm md:text-base">Participate in our monthly special events or claim your weekend login bonuses.</p>
        </div>
        <button className="w-full md:w-auto px-8 md:px-10 py-4 md:py-5 bg-neon-cyan text-black font-black rounded-xl neon-glow-blue relative z-10 hover:scale-105 transition-transform shrink-0">
          VIEW EVENTS
        </button>
      </section>
    </div>
  );
};

export default Shop;
