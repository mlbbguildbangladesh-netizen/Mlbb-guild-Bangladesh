import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, User, Shield, Users, Camera, CheckCircle2, Download, Trophy, AlertTriangle, Lock, AlertCircle } from 'lucide-react';
import { collection, addDoc, serverTimestamp, doc, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { AppSetting, FormFieldSetting } from '../types';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { TeamCard } from '../components/TeamCard';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { FALLBACK_IMAGE } from '../lib/utils';
import { createNotification, notifyAdmins } from '../lib/notificationUtils';
import toast from 'react-hot-toast';

import imageCompression from 'browser-image-compression';

const DEFAULT_FIELDS: FormFieldSetting[] = [
  { id: 'logoUrl', label: 'Team Logo Upload', type: 'image', required: false, enabled: true, isCustom: false },
  { id: 'leaderCardUrl', label: 'Leader NID/Card', type: 'image', required: true, enabled: true, isCustom: false },
];

const Registration: React.FC = () => {
  const { user, firebaseUser, isAdmin, loading: authLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<AppSetting | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState<{ logo: number, card: number }>({ logo: 0, card: 0 });
  const [submitted, setSubmitted] = useState(false);
  const [generatedId, setGeneratedId] = useState<string>('');
  const [formData, setFormData] = useState({
    teamName: '',
    leaderName: '',
    leaderEmail: '',
    phoneNumber: '',
    players: ['', '', '', '', ''],
    type: 'new' as 'new' | 'old',
    logoUrl: '',
    cardUrl: ''
  });
  
  const [customData, setCustomData] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user?.email && !formData.leaderEmail) {
      setFormData(prev => ({ ...prev, leaderEmail: user.email || '' }));
    }
  }, [user]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        const s = { id: snap.id, ...snap.data() } as AppSetting;
        setSettings(s);
        if (!s.allowOldTeamRegistration) {
          setFormData(prev => ({ ...prev, type: 'new' }));
        }
      }
    }, (error) => {
      console.error("Settings Snapshot Error:", error);
    });
    return () => unsub();
  }, []);

  const formFields = settings?.formFields || DEFAULT_FIELDS;
  const logoField = formFields.find(f => f.id === 'logoUrl');
  const cardField = formFields.find(f => f.id === 'leaderCardUrl');
  const customFieldsConfig = formFields.filter(f => f.isCustom);

  const [useLink, setUseLink] = useState<{ logo: boolean, card: boolean }>({ logo: true, card: false });
  const [files, setFiles] = useState<{ logo?: File, card?: File }>({});
  const [previews, setPreviews] = useState<{ logo?: string, card?: string }>({});
  const [customFiles, setCustomFiles] = useState<Record<string, File>>({});
  const [customProgress, setCustomProgress] = useState<Record<string, number>>({});

  const cardRef = React.useRef<HTMLDivElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [errorFields, setErrorFields] = useState<number[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    const name = e.target.name;

    if ((name === 'logoUrl' || name === 'cardUrl') && value.includes('drive.google.com')) {
      const match1 = value.match(/\/d\/([a-zA-Z0-9_-]+)/);
      const match2 = value.match(/id=([a-zA-Z0-9_-]+)/);
      const id = (match1 && match1[1]) ? match1[1] : (match2 && match2[1] ? match2[1] : null);
      if (id) {
        value = `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
      }
    }
    setFormData({ ...formData, [e.target.name]: value });
    if (error) setError(null);
  };

  const handleCustomChange = (id: string, value: string) => {
    setCustomData(prev => ({ ...prev, [id]: value }));
    if (error) setError(null);
  };

  const handlePlayerChange = (index: number, value: string) => {
    const numericValue = value.replace(/\D/g, '');
    const newPlayers = [...formData.players];
    newPlayers[index] = numericValue;
    setFormData({ ...formData, players: newPlayers });
    if (error) setError(null);
    if (errorFields.length > 0) setErrorFields([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'card') => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError(`${type.toUpperCase()} file is too large. Max 2MB allowed.`);
        return;
      }
      setFiles({ ...files, [type]: file });
      setPreviews({ ...previews, [type]: URL.createObjectURL(file) });
      setError(null);
    }
  };

  const handleCustomFileChange = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError(`File is too large. Max 2MB allowed.`);
        return;
      }
      setCustomFiles(prev => ({ ...prev, [id]: file }));
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation
    const cleanPhone = formData.phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length !== 11) {
      setError("WhatsApp number must be exactly 11 digits.");
      setLoading(false);
      return;
    }

    if (!settings?.hideLogoUpload && logoField?.enabled && logoField?.required && !useLink.logo && !files.logo && !formData.logoUrl) {
      setError(`Please provide ${logoField.label}.`);
      setLoading(false);
      return;
    }
    if (cardField?.enabled && cardField?.required && !useLink.card && !files.card && !formData.cardUrl) {
      setError(`Please provide ${cardField.label}.`);
      setLoading(false);
      return;
    }

    // Custom validation
    for (const field of customFieldsConfig) {
      const isFileField = field.type === 'file' || field.type === 'image';
      if (field.enabled && field.required) {
        if (isFileField) {
          if (!customFiles[field.id]) {
            setError(`Please provide a file for: ${field.label}`);
            setLoading(false);
            return;
          }
        } else {
          if (!customData[field.id] || customData[field.id].trim() === '') {
            setError(`Please fill required field: ${field.label}`);
            setLoading(false);
            return;
          }
        }
      }
    }

    try {
      // --- UID Uniqueness Check ---
      const playersRaw = formData.players;
      const playerIdsToCheck = playersRaw.filter(p => p.trim() !== '');
      
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
        setLoading(false);
        return;
      }

      if (playerIdsToCheck.length > 0) {
        // 1. Check existing approved teams
        const teamsQuery = query(collection(db, 'teams'), where('players', 'array-contains-any', playerIdsToCheck));
        const teamsSnapshot = await getDocs(teamsQuery);
        
        if (!teamsSnapshot.empty) {
          const conflictingTeamData = teamsSnapshot.docs[0].data();
          const teamName = conflictingTeamData.teamName;
          const matchedUid = playerIdsToCheck.find(uid => (conflictingTeamData.players as string[]).includes(uid));
          
          // Find which field has this matchedUid
          const conflictIdx = playersRaw.findIndex(u => u === matchedUid);
          if (conflictIdx !== -1) setErrorFields([conflictIdx]);
          
          setError(`This player (${matchedUid}) is already registered on ${teamName}.`);
          setLoading(false);
          return;
        }

        // 2. Check pending registrations
        const regQuery = query(
          collection(db, 'registrations'), 
          where('status', '==', 'pending'),
          where('players', 'array-contains-any', playerIdsToCheck)
        );
        const regSnapshot = await getDocs(regQuery);
        
        if (!regSnapshot.empty) {
          const conflictingRegData = regSnapshot.docs[0].data();
          const teamName = conflictingRegData.teamName;
          const matchedUid = playerIdsToCheck.find(uid => (conflictingRegData.players as string[]).includes(uid));
          
          const conflictIdx = playersRaw.findIndex(u => u === matchedUid);
          if (conflictIdx !== -1) setErrorFields([conflictIdx]);

          setError(`Player UID ${matchedUid} is already in a pending registration for team "${teamName}".`);
          setLoading(false);
          return;
        }
      }
      // --- End UID Uniqueness Check ---

      setProgress({ logo: 0, card: 0 });

      const compressionOptions = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      };

      setCompressing(true);
      setError(null);
      
      const [compressedLogo, compressedCard] = await Promise.all([
        (!useLink.logo && files.logo && logoField?.enabled) ? imageCompression(files.logo, compressionOptions).catch(err => null) : Promise.resolve(null),
        (!useLink.card && files.card && cardField?.enabled) ? imageCompression(files.card, compressionOptions).catch(err => null) : Promise.resolve(null)
      ]);
      
      setCompressing(false);
      setLoading(true);

      let logoUrl = formData.logoUrl;
      let cardUrl = formData.cardUrl;
      let finalCustomData = { ...customData };

      const uploadTasks: Promise<void>[] = [];

      Object.entries(customFiles).forEach(([id, fileValue]) => {
        const file = fileValue as File;
        const fieldConfig = customFieldsConfig.find(f => f.id === id);
        if (!fieldConfig) return;

        uploadTasks.push(new Promise(async (resolve, reject) => {
          let fileToUpload: File | Blob = file;
          
          if (fieldConfig.type === 'image') {
            try {
              fileToUpload = await imageCompression(file, compressionOptions);
            } catch (e: any) {
              console.error('Compression failed for', id, e?.message || e);
            }
          }

          const safeName = file.name.replace(/[^a-z0-9.]/gi, '_');
          const fileRef = ref(storage, `registrations/custom/${Date.now()}_${safeName}`);
          const uploadTask = uploadBytesResumable(fileRef, fileToUpload);

          uploadTask.on('state_changed',
            (snapshot) => {
              const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setCustomProgress(prev => ({ ...prev, [id]: Math.max(prev[id] || 0, p) }));
            },
            (err) => reject(err),
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              finalCustomData[id] = url;
              setCustomProgress(prev => ({ ...prev, [id]: 100 }));
              resolve();
            }
          );
        }));
      });

      if (compressedLogo && files.logo) {
        uploadTasks.push(new Promise((resolve, reject) => {
          const safeName = files.logo!.name.replace(/[^a-z0-9.]/gi, '_');
          const logoRef = ref(storage, `registrations/logos/${Date.now()}_${safeName}`);
          const uploadTask = uploadBytesResumable(logoRef, compressedLogo);
          
          uploadTask.on('state_changed', 
            (snapshot) => {
              const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setProgress(prev => ({ ...prev, logo: Math.max(prev.logo, p) }));
            }, 
            (err) => reject(err), 
            async () => {
              logoUrl = await getDownloadURL(uploadTask.snapshot.ref);
              setProgress(prev => ({ ...prev, logo: 100 }));
              resolve();
            }
          );
        }));
      }

      if (compressedCard && files.card) {
        uploadTasks.push(new Promise((resolve, reject) => {
          const safeName = files.card!.name.replace(/[^a-z0-9.]/gi, '_');
          const cardRef = ref(storage, `registrations/cards/${Date.now()}_${safeName}`);
          const uploadTask = uploadBytesResumable(cardRef, compressedCard);
          
          uploadTask.on('state_changed', 
            (snapshot) => {
              const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setProgress(prev => ({ ...prev, card: Math.max(prev.card, p) }));
            }, 
            (err) => reject(err), 
            async () => {
              cardUrl = await getDownloadURL(uploadTask.snapshot.ref);
              setProgress(prev => ({ ...prev, card: 100 }));
              resolve();
            }
          );
        }));
      }

      await Promise.all(uploadTasks);

      const uniqueIdString = `MGB-${Math.floor(100000 + Math.random() * 900000)}`;

      const registrationData = {
        userId: user?.id,
        ownerId: user?.id,
        seasonId: settings?.currentSeasonId,
        teamName: formData.teamName,
        leaderName: formData.leaderName,
        leaderEmail: formData.leaderEmail,
        phoneNumber: formData.phoneNumber,
        players: formData.players,
        type: formData.type,
        logoUrl,
        leaderCardUrl: cardUrl,
        customData: finalCustomData,
        status: 'pending',
        uniqueId: uniqueIdString,
        timestamp: serverTimestamp()
      };

      try {
        await addDoc(collection(db, 'registrations'), registrationData);
        
        // Notify Admins and Moderators
        try {
          await notifyAdmins(
            'New Registration!',
            `Team "${formData.teamName}" has submitted a registration for review.`,
            'system',
            '/admin?tab=registrations',
            settings
          );
        } catch (notifErr) {
          console.error("Failed to notify admins:", notifErr);
        }

      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'registrations');
      }

      setGeneratedId(uniqueIdString);
      setSubmitted(true);
    } catch (err: any) {
      console.error("Registration error:", err?.message || err);
      let errMsg = "Something went wrong. Please check your internet and try again.";
      if (err.message?.includes('retry-limit-exceeded')) {
        errMsg = "Network timeout.";
      } else if (err.message?.includes('permission-denied')) {
        errMsg = "Permission denied.";
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const [downloading, setDownloading] = useState<string | null>(null);

  const downloadCard = async (format: 'png' | 'pdf') => {
    if (!cardRef.current) return;
    setDownloading(format);

    try {
      // Ensure all images in the card are loaded
      const images = cardRef.current.querySelectorAll('img');
      const loadPromises = Array.from(images).map(img => {
        const image = img as HTMLImageElement;
        if (image.complete) return Promise.resolve();
        return new Promise((resolve) => {
          image.onload = resolve;
          image.onerror = resolve; // Continue anyway
        });
      });
      
      await Promise.all(loadPromises);
      
      // Wait for fonts to be ready
      if ('fonts' in document) {
        await (document as any).fonts.ready;
      }
      
      // Wait a bit more for font rendering
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const options = {
        cacheBust: true,
        backgroundColor: '#000000',
        pixelRatio: 2, // 3 might be too heavy for some browsers
        skipFonts: false,
        includeQueryParams: true,
        style: {
          transform: 'scale(1)',
          opacity: '1',
          visibility: 'visible',
          display: 'flex'
        }
      };

      let dataUrl = '';
      
      // Try to generate multiple times if first one is empty
      for (let i = 0; i < 3; i++) {
        try {
          dataUrl = await toPng(cardRef.current, options);
          // Check if the result is a valid PNG data URL and has substantial content
          if (dataUrl && dataUrl.startsWith('data:image/png') && dataUrl.length > 2000) break;
        } catch (e: any) {
          console.warn(`Attempt ${i+1} failed`, e?.message || e);
          if (i === 2) throw e; // Last attempt failed
        }
        // If it failed, wait longer and try again
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      if (!dataUrl || !dataUrl.startsWith('data:image/png') || dataUrl.length < 2000) {
        throw new Error('GUILD CARD GENERATION FAILED: This usually happens when utilizing external image links that block security permissions (CORS). For best results, please take a manual screenshot of the preview below, or try again later.');
      }

      const fileName = `${formData.teamName.replace(/[^a-z0-9]/gi, '_') || 'team'}-card`;

      if (format === 'png') {
        try {
          // Convert data URL to Blob for better mobile support
          const byteString = atob(dataUrl.split(',')[1]);
          const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          const blob = new Blob([ab], { type: mimeString });
          
          // Try native device share first (perfect for mobile)
          const file = new File([blob], `${fileName}.png`, { type: mimeString });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({
                title: 'MGB Guild Card',
                text: 'My MGB Guild Registration Card',
                files: [file]
              });
              return; // Success!
            } catch (shareErr: any) {
              if (shareErr.name === 'AbortError') return; // User cancelled
              console.log('Share failed, falling back to download', shareErr);
            }
          }

          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = `${fileName}.png`;
          link.style.display = 'none'; // Ensure it's hidden
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
          
          // For iOS where link.click() fails after async operations,
          // Show a helpful hint if they are on mobile
          if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
             toast.success('If download failed, you can take a screenshot of the card below.', { duration: 5000 });
          }
        } catch (error) {
          console.error("Blob download failed, falling back to data URL:", error);
          const link = document.createElement('a');
          link.download = `${fileName}.png`;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } else {
        const pdf = new jsPDF('l', 'px', [400, 250]);
        pdf.addImage(dataUrl, 'PNG', 0, 0, 400, 250, undefined, 'FAST');
        pdf.save(`${fileName}.pdf`);
      }
    } catch (err: any) {
      console.error('Download failed', err?.message || err);
      setError(err.message || 'Card generation failed. Please try again or take a screenshot.');
    } finally {
      setDownloading(null);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center space-y-10">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-24 h-24 bg-neon-blue rounded-full flex items-center justify-center mx-auto neon-glow-blue"
        >
          <CheckCircle2 size={48} className="text-black" />
        </motion.div>
        
        <div className="space-y-4">
          <h1 className="text-4xl font-black uppercase italic">SUCCESSFULLY REGISTERED!</h1>
          <p className="text-gray-400 max-w-md mx-auto">
            Your team registration has been submitted. Our admins will review it within 24 hours. 
            Once approved, you'll receive a confirmation email.
          </p>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold text-neon-blue">YOUR TEAM CARD PREVIEW</h2>
          
          <div className="flex justify-center">
            <TeamCard 
              ref={cardRef}
              team={{
                teamName: formData.teamName,
                leaderName: formData.leaderName,
                players: formData.players,
                logoUrl: (useLink.logo && formData.logoUrl) ? formData.logoUrl : previews.logo,
                points: 0,
                uniqueId: generatedId
              }}
            />
          </div>

        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <button 
            disabled={!!downloading}
            onClick={() => downloadCard('png')}
            className="flex items-center gap-2 px-6 py-2 bg-white/10 rounded-lg hover:bg-white/20 disabled:opacity-50 transition-all font-bold"
          >
            {downloading === 'png' ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : <Download size={18} />} 
            PNG
          </button>
          <button 
            disabled={!!downloading}
            onClick={() => downloadCard('pdf')}
            className="flex items-center gap-2 px-6 py-2 bg-white/10 rounded-lg hover:bg-white/20 disabled:opacity-50 transition-all font-bold"
          >
            {downloading === 'pdf' ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : <Download size={18} />} 
            PDF
          </button>
        </div>

        {isAdmin && (
          <div className="pt-10">
            <button
              onClick={() => {
                setSubmitted(false);
                setFormData({
                  teamName: '',
                  leaderName: '',
                  leaderEmail: '',
                  players: ['', '', '', '', ''],
                  type: 'new',
                  logoUrl: '',
                  cardUrl: ''
                });
                setPreviews({});
                setFiles({});
              }}
              className="px-8 py-3 bg-neon-blue text-black font-black uppercase tracking-widest rounded-xl hover:brightness-110 transition-all"
            >
              REGISTER ANOTHER TEAM
            </button>
            <p className="text-[10px] font-black text-gray-500 mt-4 uppercase tracking-widest">ADMIN PRIVILEGE: UNLIMITED REGISTRATIONS ENABLED</p>
          </div>
        )}
      </div>
    </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-neon-blue border-t-transparent rounded-full animate-spin flex items-center justify-center">
          <div className="w-4 h-4 bg-neon-blue rounded-full pulse-neon" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-12 gaming-border-blue"
        >
          <div className="w-24 h-24 bg-neon-blue/20 rounded-full flex items-center justify-center mx-auto mb-6 text-neon-blue">
            <AlertTriangle size={48} />
          </div>
          <h1 className="text-4xl font-black uppercase tracking-tighter italic">
            ACCESS <span className="text-neon-blue">RESTRICTED</span>
          </h1>
          <p className="text-gray-400 text-lg">
            To register a team and join the MGB MLBB Guild, you must first sign in to your account.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link 
              to="/login" 
              className="px-8 py-4 bg-neon-blue text-black font-black uppercase tracking-widest rounded-xl hover:neon-glow-blue transition-all active:scale-95"
            >
              SIGN IN NOW
            </Link>
            <Link 
              to="/login?mode=signup" 
              className="px-8 py-4 bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all"
            >
              CREATE ACCOUNT
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  if (settings?.registrationEnabled === false && !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-6"
        >
          <div className="inline-flex p-4 rounded-2xl bg-neon-red/10 border border-neon-red/20 text-neon-red mb-4">
            <Lock size={48} />
          </div>
          <h1 className="text-4xl font-black uppercase tracking-tighter italic">
            REGISTRATION <span className="text-neon-red">CLOSED</span>
          </h1>
          <p className="text-gray-400 text-lg">
            Guards! The registration phase for this season has concluded. Stay tuned for future openings.
          </p>
          <Link 
            to="/" 
            className="inline-block px-8 py-4 bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all"
          >
            RETURN HOME
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-10 space-y-8">
      <div className="space-y-2 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black">TEAM <span className="text-neon-blue">REGISTRATION</span></h1>
          <p className="text-gray-400">Join the elite MGB MLBB community today.</p>
        </div>
        <button 
          onClick={() => setShowPreview(!showPreview)}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all text-neon-blue"
        >
          {showPreview ? 'HIDE PREVIEW' : 'SHOW LIVE PREVIEW'}
        </button>
      </div>

      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex justify-center pb-4">
              <TeamCard 
                team={{
                  teamName: formData.teamName,
                  leaderName: formData.leaderName,
                  players: formData.players,
                  logoUrl: (useLink.logo && formData.logoUrl) ? formData.logoUrl : previews.logo,
                  points: 0
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {settings?.allowOldTeamRegistration === false && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-neon-blue/5 border border-neon-blue/20 rounded-xl flex gap-3 items-center text-neon-blue/80 text-[10px] sm:text-xs font-bold uppercase tracking-widest leading-relaxed"
        >
          <div className="p-2 bg-neon-blue/10 rounded-lg">
            <Lock size={16} />
          </div>
          <div>
            <p className="text-white">Old Team Registration is Currently on Hold</p>
            <p className="text-gray-500 text-[8px] sm:text-[10px]">Only New Teams are being accepted for this season.</p>
          </div>
        </motion.div>
      )}

      {settings?.allowOldTeamRegistration !== false && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-4 p-1 bg-white/5 rounded-xl border border-white/10">
            <button 
              type="button"
              onClick={() => setFormData({ ...formData, type: 'new' })}
              className={`flex-1 py-3 rounded-lg text-sm font-black transition-all ${formData.type === 'new' ? 'bg-neon-blue text-black neon-glow-blue' : 'text-gray-400 hover:text-white'}`}
            >
              NEW TEAM
            </button>
            <button 
              type="button"
              onClick={() => setFormData({ ...formData, type: 'old' })}
              className={`flex-1 py-3 rounded-lg text-sm font-black transition-all ${formData.type === 'old' ? 'bg-neon-blue text-black neon-glow-blue' : 'text-gray-400 hover:text-white'}`}
            >
              OLD TEAM
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="glass-card p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div className="space-y-2">
              <label className="text-[10px] md:text-xs font-black uppercase text-gray-500 flex items-center gap-2">
                <Shield size={14} className="text-neon-blue" />
                Team Name
              </label>
              <input
                required
                type="text"
                name="teamName"
                value={formData.teamName}
                onChange={handleInputChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-neon-blue text-sm"
                placeholder="Enter Team Name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] md:text-xs font-black uppercase text-gray-500 flex items-center gap-2">
                <User size={14} className="text-neon-blue" />
                Leader IGN
              </label>
              <input
                required
                type="text"
                name="leaderName"
                value={formData.leaderName}
                onChange={handleInputChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-neon-blue text-sm"
                placeholder="Leader IGN"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-gray-500">Contact Email</label>
              <input
                required
                type="email"
                name="leaderEmail"
                value={formData.leaderEmail}
                onChange={handleInputChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-neon-blue"
                placeholder="leader@example.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-gray-500">WhatsApp / Phone Number</label>
              <input
                required
                type="tel"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-neon-blue"
                placeholder="01xxxxxxxxx"
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-black uppercase text-gray-500 flex items-center gap-2">
              <Users size={14} className="text-neon-blue" />
              Players (5 Members)
            </label>
            <div className="grid gap-3">
              {formData.players.map((p, i) => (
                <input
                  key={i}
                  required
                  type="text"
                  inputMode="numeric"
                  placeholder={`Player ${i + 1} UID (Numbers Only)`}
                  value={p}
                  onChange={(e) => handlePlayerChange(i, e.target.value)}
                  className={`w-full bg-white/5 border rounded-lg py-2.5 px-4 text-sm focus:outline-none transition-all ${
                    errorFields.includes(i) 
                      ? 'border-neon-red/50 bg-neon-red/5 text-neon-red placeholder:text-neon-red/40' 
                      : 'border-white/10 focus:border-neon-blue'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="glass-card p-8 space-y-8">
          <div className="grid md:grid-cols-2 gap-8">
            {logoField?.enabled && !settings?.hideLogoUpload && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-black uppercase text-gray-500">
                    {logoField.label} {logoField.required && <span className="text-neon-red">*</span>}
                  </p>
                  <button 
                    type="button"
                    onClick={() => setUseLink({ ...useLink, logo: !useLink.logo })}
                    className="text-[10px] font-black text-neon-blue uppercase tracking-widest hover:underline"
                  >
                    {useLink.logo ? 'SWITCH TO UPLOAD' : 'SWITCH TO LINK'}
                  </button>
                </div>
                
                {useLink.logo ? (
                  <>
                    <div className="flex gap-4 items-center">
                      <input
                        required={logoField.required}
                        type="url"
                        name="logoUrl"
                        value={formData.logoUrl}
                        onChange={handleInputChange}
                        placeholder={`Paste ${logoField.label} URL`}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-neon-blue text-sm"
                      />
                      {formData.logoUrl && (
                        <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          <ImageWithFallback src={formData.logoUrl} className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>
                    {formData.logoUrl && formData.logoUrl.match(/(discord|fbcdn|fb)/i) && (
                      <div className="text-xs text-yellow-500 flex items-center gap-1 mt-1">
                        <AlertCircle size={12} />
                        Warning: This link might expire after some time. Please consider uploading the file directly.
                      </div>
                    )}
                  </>
                ) : (
                  <div 
                    className="relative h-40 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-3 group hover:border-neon-blue transition-all cursor-pointer overflow-hidden"
                    onClick={() => document.getElementById('logo-upload')?.click()}
                  >
                    {previews.logo ? (
                      <img src={previews.logo} className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <>
                        <Upload className="text-gray-600 group-hover:text-neon-blue transition-colors" />
                        <span className="text-xs font-bold text-gray-500 uppercase">UPLOAD {logoField.label}</span>
                      </>
                    )}
                    <input id="logo-upload" type="file" required={logoField.required && !previews.logo} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'logo')} />
                  </div>
                )}
              </div>
            )}

            {cardField?.enabled && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-black uppercase text-gray-500">
                    {cardField.label} {cardField.required && <span className="text-neon-red">*</span>}
                  </p>
                  <button 
                    type="button"
                    onClick={() => setUseLink({ ...useLink, card: !useLink.card })}
                    className="text-[10px] font-black text-neon-red uppercase tracking-widest hover:underline"
                  >
                    {useLink.card ? 'SWITCH TO UPLOAD' : 'SWITCH TO LINK'}
                  </button>
                </div>

                {useLink.card ? (
                  <>
                    <div className="flex gap-4 items-center">
                      <input
                        required={cardField.required}
                        type="url"
                        name="cardUrl"
                        value={formData.cardUrl}
                        onChange={handleInputChange}
                        placeholder={`Paste ${cardField.label} URL`}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-neon-red text-sm"
                      />
                      {formData.cardUrl && (
                        <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          <ImageWithFallback src={formData.cardUrl} className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>
                    {formData.cardUrl && formData.cardUrl.match(/(discord|fbcdn|fb)/i) && (
                      <div className="text-xs text-yellow-500 flex items-center gap-1 mt-1">
                        <AlertCircle size={12} />
                        Warning: This link might expire after some time. Please consider uploading the file directly.
                      </div>
                    )}
                  </>
                ) : (
                  <div 
                    className="relative h-40 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-3 group hover:border-neon-red transition-all cursor-pointer overflow-hidden"
                    onClick={() => document.getElementById('card-upload')?.click()}
                  >
                    {previews.card ? (
                      <img src={previews.card} className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <>
                        <Camera className="text-gray-600 group-hover:text-neon-red transition-colors" />
                        <span className="text-xs font-bold text-gray-500 uppercase">UPLOAD {cardField.label}</span>
                      </>
                    )}
                    <input id="card-upload" type="file" required={cardField.required && !previews.card} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'card')} />
                  </div>
                )}
              </div>
            )}
          </div>

          {customFieldsConfig.length > 0 && (
            <div className="pt-4 border-t border-white/10 grid md:grid-cols-2 gap-6">
              {customFieldsConfig.map(field => field.enabled && (
                <div key={field.id} className="space-y-2">
                  <label className="text-xs font-black uppercase text-gray-500">
                    {field.label} {field.required && <span className="text-neon-red">*</span>}
                  </label>
                  {(field.type === 'file' || field.type === 'image') ? (
                    <div className="relative space-y-2">
                      {field.type === 'image' && customFiles[field.id] && (
                        <div className="h-32 w-full max-w-[200px] relative border-2 border-dashed border-neon-blue/30 rounded-xl overflow-hidden">
                          <img src={URL.createObjectURL(customFiles[field.id])} className="w-full h-full object-cover" alt="Preview" />
                        </div>
                      )}
                      <input
                        required={field.required && !customFiles[field.id]}
                        type="file"
                        accept={field.type === 'image' ? 'image/*' : '*/*'}
                        onChange={(e) => handleCustomFileChange(e, field.id)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 focus:outline-none focus:border-neon-blue text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-neon-blue/10 file:text-neon-blue hover:file:bg-neon-blue/20 cursor-pointer"
                      />
                    </div>
                  ) : (
                    <input
                      required={field.required}
                      type={field.type}
                      value={customData[field.id] || ''}
                      onChange={(e) => handleCustomChange(field.id, e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-3 px-4 focus:outline-none focus:border-neon-blue text-sm"
                      placeholder={`Enter ${field.label}`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-neon-red/10 border border-neon-red/20 rounded-xl flex gap-3 items-center text-neon-red text-sm font-bold"
          >
            <Shield size={18} />
            {error}
          </motion.div>
        )}

        <button
          disabled={loading || compressing}
          type="submit"
          className="btn-skew w-full bg-neon-blue text-black font-black py-4 rounded-xl shadow-[0_0_30px_rgba(0,229,255,0.4)] hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70"
        >
          {loading || compressing ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span className="uppercase tracking-widest text-xs font-black">
                  {compressing ? 'Optimizing Images...' : 'Uploading Assets...'}
                </span>
              </div>
              {!compressing && (
                <div className="w-full space-y-2">
                  {(!useLink.logo && files.logo) && (
                    <>
                      <div className="flex justify-between text-[10px] font-black text-gray-500 uppercase tracking-widest">
                        <span>Logo</span>
                        <span>{Math.round(progress.logo)}%</span>
                      </div>
                      <div className="h-1 bg-black/20 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-neon-blue" 
                          initial={{ width: 0 }}
                          animate={{ width: `${progress.logo}%` }}
                        />
                      </div>
                    </>
                  )}
                  {(!useLink.card && files.card) && (
                    <>
                      <div className="flex justify-between text-[10px] font-black text-gray-500 uppercase tracking-widest pt-1">
                        <span>ID Card</span>
                        <span>{Math.round(progress.card)}%</span>
                      </div>
                      <div className="h-1 bg-black/20 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-neon-red shadow-[0_0_10px_rgba(255,0,60,0.5)]" 
                          initial={{ width: 0 }}
                          animate={{ width: `${progress.card}%` }}
                        />
                      </div>
                    </>
                  )}
                  {(useLink.logo && useLink.card) && (
                    <div className="text-[10px] font-black text-neon-blue uppercase tracking-widest animate-pulse">
                      Processing Data...
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>SUBMIT REGISTRATION</>
          )}
        </button>
      </form>
    </div>
  );
};

export default Registration;
