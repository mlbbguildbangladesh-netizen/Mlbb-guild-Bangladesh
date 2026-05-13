import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { Notification } from '../types';

export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: Notification['type'],
  link?: string
) => {
  if (!userId) {
    console.warn('createNotification: No userId provided');
    return;
  }
  try {
    await addDoc(collection(db, 'notifications'), {
      userId,
      title,
      message,
      type,
      link,
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
};

export const notifyAdmins = async (
  title: string,
  message: string,
  type: Notification['type'],
  link?: string,
  settings?: any
) => {
  const notificationPromises: Promise<any>[] = [];
  const notifiedUids = new Set<string>();

  // 1. Notify direct admin UIDs
  const adminUids = settings?.adminUids || [];
  adminUids.forEach((uid: string) => {
    if (uid && !notifiedUids.has(uid)) {
      notificationPromises.push(createNotification(uid, title, message, type, link));
      notifiedUids.add(uid);
    }
  });

  // 2. Notify moderators with relevant permissions based on type
  if (settings?.moderators) {
    settings.moderators.forEach((mod: any) => {
      let shouldNotify = false;
      if (type === 'system' || type === 'recruitment') {
        // High level notifications
        shouldNotify = mod.permissions.includes('users') || mod.permissions.includes('teams');
      }
      if (link?.includes('registrations')) {
        shouldNotify = shouldNotify || mod.permissions.includes('registrations');
      }
      
      if (shouldNotify && !notifiedUids.has(mod.uid)) {
        notificationPromises.push(createNotification(mod.uid, title, message, type, link));
        notifiedUids.add(mod.uid);
      }
    });
  }

  if (notificationPromises.length > 0) {
    await Promise.all(notificationPromises);
  } else {
    console.warn('notifyAdmins: No admins or moderators found to notify', { settings });
  }
};
