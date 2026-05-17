import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import {
  setupNotifications,
  registerBackgroundSweep,
  loadNotifMeta,
  handleNotifAction,
  onNotificationDelivered,
  ACTION_TAKEN,
  ACTION_SNOOZE,
  ACTION_SKIP,
} from '../services/notifications';

/**
 * Hook installed once at the root layout. Wires up:
 * 1. Permission request + Android channel
 * 2. Background task registration
 * 3. Foreground delivery listener (chains escalations)
 * 4. Notification response listener (Take / Snooze / Skip)
 */
export function useNotificationListeners() {
  const router = useRouter();
  const recvRef = useRef<Notifications.EventSubscription | null>(null);
  const respRef = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await setupNotifications();
        await registerBackgroundSweep();
      } catch (e) {
        console.warn('notification setup error', e);
      }
      if (cancelled) return;

      recvRef.current = Notifications.addNotificationReceivedListener(async (notif) => {
        await onNotificationDelivered(notif);
      });

      respRef.current = Notifications.addNotificationResponseReceivedListener(async (response) => {
        const action = response.actionIdentifier as string;
        let meta = await loadNotifMeta(response.notification.request.identifier);
        if (!meta) {
          // Fallback: rebuild meta from notification data
          const d = (response.notification.request.content.data || {}) as any;
          if (d.medicationId && d.scheduledTime) {
            const today = new Date();
            const dt = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            meta = {
              medicationId: d.medicationId,
              medicationName: d.medicationName || 'medication',
              dosage: d.dosage || '',
              scheduledDate: d.scheduledDate || dt,
              scheduledTime: d.scheduledTime,
              reminderStage: d.stage || 'primary',
            };
          }
        }
        if (!meta) return;

        if (action === ACTION_TAKEN || action === ACTION_SKIP || action === ACTION_SNOOZE) {
          await handleNotifAction(action as any, meta);
        } else if (action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
          // User tapped the notification body → open dose confirmation (home screen)
          router.push('/(tabs)/home');
        }
      });
    })();

    return () => {
      cancelled = true;
      recvRef.current?.remove();
      respRef.current?.remove();
    };
  }, [router]);
}
