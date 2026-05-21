import { getToken, onMessage } from 'firebase/messaging';
import { messaging, db } from './firebase';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import toast from 'react-hot-toast';

export const requestNotificationPermission = async (userId: string) => {
  if (!messaging) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const vapidKey = (import.meta as any).env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        console.warn('VITE_FIREBASE_VAPID_KEY is missing in env');
        return;
      }

      const token = await getToken(messaging, { vapidKey });
      if (token) {
        console.log('FCM Token:', token);
        // Save token to user document
        await setDoc(doc(db, 'users', userId), {
          fcmTokens: arrayUnion(token)
        }, { merge: true });
        return token;
      } else {
        console.warn('No registration token available. Request permission to generate one.');
      }
    } else {
      console.warn('Notification permission denied.');
    }
  } catch (error) {
    console.error('An error occurred while retrieving token:', error);
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    if (!messaging) return;
    onMessage(messaging, (payload) => {
      console.log('Foreground Message received: ', payload);
      resolve(payload);
    });
  });
