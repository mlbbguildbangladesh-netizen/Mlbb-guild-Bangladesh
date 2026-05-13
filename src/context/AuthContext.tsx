import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { User, Role, AppSetting } from '../types';

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
      
      if (unsubUserDocument) {
        unsubUserDocument();
        unsubUserDocument = null;
      }
      if (unsubTeamDocument) {
        unsubTeamDocument();
        unsubTeamDocument = null;
      }

      if (fUser) {
        // User is logged in, attach a real-time listener to their data
        const userRef = doc(db, 'users', fUser.uid);
        unsubUserDocument = onSnapshot(userRef, (docSnap) => {
          const isAdminEmail = fUser.email?.toLowerCase() === 'mlbbguildbangladesh@gmail.com';
          
          if (docSnap.exists()) {
            const userData = docSnap.data();
            
            // Proactively ensure admin role is set in DB to help security rules
            if (isAdminEmail) {
              const updates: any = {};
              if (userData.role !== 'admin') updates.role = 'admin';
              
              const settingsRef = doc(db, 'settings', 'global');
              getDoc(settingsRef).then(sSnap => {
                const sData = sSnap.exists() ? sSnap.data() : {};
                const uids = sData.adminUids || [];
                if (!uids.includes(fUser.uid)) {
                  console.log("Adding UID to admin list:", fUser.uid);
                  setDoc(settingsRef, {
                    adminUids: [...uids, fUser.uid]
                  }, { merge: true }).catch(err => {
                    console.error("Failed to update admin list in settings:", err);
                  });
                }
              }).catch(err => {
                console.error("Failed to read settings for admin sync:", err);
              });

              if (Object.keys(updates).length > 0) {
                updateDoc(userRef, updates).catch(err => {
                  console.error("Proactive Admin Update Failed:", err);
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

            if (!isAdminEmail && !isJustCreated) {
              console.log("User document missing. Setting up default profile...");
              // Attempt to recreate profile if it somehow got deleted or failed to create
              try {
                // If it fails, they will just use the default state below
                // We're not throwing error to allow them to at least see the app
                const isVerified = true; // Based on Login.tsx auto verify
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
          console.error("User Snapshot Error:", error);
          setLoading(false);
        });
      } else {
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
