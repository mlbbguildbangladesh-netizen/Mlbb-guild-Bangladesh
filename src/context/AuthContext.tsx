import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { requestNotificationPermission, onMessageListener } from '../lib/fcmService';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  moderatorPermissions: string[];
  settings: AppSetting | null;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<AppSetting | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAuth = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setFirebaseUser({ ...auth.currentUser });
    }
  };

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        let settingsData = snap.data() as AppSetting;
        
        // Client-side auto-off logic for immediate responsiveness
        if (settingsData.maintenanceMode && settingsData.maintenanceEndTime) {
          if (new Date() > new Date(settingsData.maintenanceEndTime)) {
            settingsData = { ...settingsData, maintenanceMode: false };
          }
        }
        
        setSettings({ id: snap.id, ...settingsData } as AppSetting);
      } else {
        setSettings({
          id: 'global',
          guildName: 'MGB OFFICIAL',
          registrationEnabled: true,
          challengePhaseLocked: false,
          allowOldTeamRegistration: true
        } as AppSetting);
      }
    }, (error) => {
      console.error("Settings Snapshot Error:", error);
    });

    let unsubUserDocument: (() => void) | null = null;
    let unsubTeamDocument: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (fUser) => {
      setFirebaseUser(fUser);
      
      // Safety timeout: if onSnapshot takes too long, stop loading
      const snapshotTimeout = setTimeout(() => {
        if (loading) {
          console.warn("Auth snapshot timeout reached. Proceeding with limited data.");
          setLoading(false);
        }
      }, 3000);

      if (unsubUserDocument) {
        unsubUserDocument();
        unsubUserDocument = null;
      }
      if (unsubTeamDocument) {
        unsubTeamDocument();
        unsubTeamDocument = null;
      }

      if (fUser) {
        // Request FCM permission
        requestNotificationPermission(fUser.uid);
        
        // Listen for foreground messages
        onMessageListener().then((payload: any) => {
          console.log("Push Notification Received:", payload);
          toast((t) => (
            <div className="flex flex-col gap-1">
              <span className="font-bold text-sm">{payload.notification?.title}</span>
              <span className="text-xs text-gray-500">{payload.notification?.body}</span>
              {payload.data?.click_action && (
                <button 
                  onClick={() => {
                   window.location.href = payload.data.click_action;
                   toast.dismiss(t.id);
                  }}
                  className="bg-neon-blue text-black text-[10px] font-black uppercase px-2 py-1 rounded mt-1"
                >
                  View
                </button>
              )}
            </div>
          ), { duration: 6000 });
        });

        // User is logged in, attach a real-time listener to their data
        const userRef = doc(db, 'users', fUser.uid);
        unsubUserDocument = onSnapshot(userRef, (docSnap) => {
          clearTimeout(snapshotTimeout);
          const isAdminEmail = fUser.email?.toLowerCase() === 'mlbbguildbangladesh@gmail.com';
          
          if (docSnap.exists()) {
            const userData = docSnap.data();
            
            // Proactively ensure admin role is set in DB to help security rules
            if (isAdminEmail) {
              const isAdminInDoc = userData.role === 'admin';
              const isAdminInSettings = settings?.adminUids?.includes(fUser.uid);

              if (!isAdminInDoc) {
                updateDoc(userRef, { role: 'admin' }).catch(err => {
                  console.error("Proactive Admin Role Update Failed:", err);
                });
              }

              if (settings && !isAdminInSettings) {
                const settingsRef = doc(db, 'settings', 'global');
                const newAdminUids = [...(settings.adminUids || []), fUser.uid];
                setDoc(settingsRef, { adminUids: newAdminUids }, { merge: true }).catch(err => {
                  console.error("Failed to update admin list in settings:", err);
                });
              }
            }
            
            // If they have a teamId, listen to it too
            if (userData.teamId && !unsubTeamDocument) {
              const teamRef = doc(db, 'teams', userData.teamId);
              unsubTeamDocument = onSnapshot(teamRef, (teamSnap) => {
                if (teamSnap.exists()) {
                  const teamData = teamSnap.data();
                  setUser(prev => {
                    if (!prev) return null;
                    return {
                      ...prev,
                      points: teamData.points ?? prev.points,
                      diamonds: teamData.diamonds ?? prev.diamonds,
                      teamName: teamData.teamName ?? prev.teamName,
                      logoUrl: teamData.logoUrl ?? prev.logoUrl
                    };
                  });
                }
              });
            }

            setUser(prev => {
              const baseUser = { 
                id: fUser.uid, 
                ...userData,
                displayName: userData.displayName || (isAdminEmail ? 'Admin' : 'New Recruiter'),
                email: fUser.email || userData.email, 
                role: isAdminEmail ? 'admin' : (userData.role || 'team') 
              } as User;

              // If we have previous state, we want to PREFER the new userData fields
              // BUT we want to keep the teamData points/diamonds if we have them
              if (prev && prev.id === fUser.uid) {
                return {
                  ...baseUser,
                  // Re-apply team stats if they were already present in state
                  // This is crucial if user doc has stale data but team doc was updated
                  points: prev.points !== undefined ? prev.points : (baseUser.points ?? 0),
                  diamonds: prev.diamonds !== undefined ? prev.diamonds : (baseUser.diamonds ?? 0),
                };
              }
              return baseUser;
            });
          } else {
            const isJustCreated = fUser.metadata.creationTime 
              ? (new Date().getTime() - new Date(fUser.metadata.creationTime).getTime()) < 60000 
              : false;

            if (!isJustCreated) {
              console.log("User document missing. Setting up default profile...");
              // Attempt to recreate profile if it somehow got deleted or failed to create
              try {
                // If it fails, they will just use the default state below
                // We're not throwing error to allow them to at least see the app
                setDoc(userRef, {
                  displayName: isAdminEmail ? 'Admin' : (fUser.displayName || 'New Recruiter'),
                  email: fUser.email || '',
                  role: isAdminEmail ? 'admin' : 'team',
                  points: isAdminEmail ? 10000 : 0,
                  diamonds: 0,
                  createdAt: new Date().toISOString(),
                  isVerified: true
                }, { merge: true }).catch(e => console.error("Could not setDoc new profile:", e));
              } catch (e) {
                console.error("Could not recreate profile", e);
              }
            }
            
            // Default user if doc doesn't exist yet
            setUser({
              id: fUser.uid,
              displayName: isAdminEmail ? 'Admin' : (fUser.displayName || 'New Recruiter'),
              email: fUser.email || '',
              role: isAdminEmail ? 'admin' : 'team',
              points: isAdminEmail ? 10000 : 0,
              diamonds: isAdminEmail ? 10000 : 0,
              isVerified: true
            });
          }
          setLoading(false);
        }, (error) => {
          clearTimeout(snapshotTimeout);
          console.error("User Snapshot Error:", error);
          setLoading(false);
        });
      } else {
        clearTimeout(snapshotTimeout);
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      unsubSettings();
      if (unsubUserDocument) unsubUserDocument();
      if (unsubTeamDocument) unsubTeamDocument();
    };
  }, []);

  const currentUid = user?.id || firebaseUser?.uid;
  const isAdmin = user?.role === 'admin' || 
                  user?.email?.toLowerCase() === 'mlbbguildbangladesh@gmail.com' ||
                  firebaseUser?.email?.toLowerCase() === 'mlbbguildbangladesh@gmail.com';
  const isModerator = settings?.moderators?.some(m => m.uid === currentUid) || false;
  const moderatorPermissions = settings?.moderators?.find(m => m.uid === currentUid)?.permissions || [];

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, isAdmin, isModerator, moderatorPermissions, settings, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
