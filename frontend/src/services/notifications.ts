/**
 * MediAssist Notification Service
 *
 * Production-grade local notification system using:
 * - expo-notifications (scheduling, categories, action buttons, listeners)
 * - expo-task-manager + expo-background-task (background missed-dose sweep)
 *
 * Smart escalation: when a dose time arrives we schedule 4 reminders:
 *   T+0    → primary alert (Take / Snooze / Skip actions)
 *   T+10m  → "Reminder: have you taken X?"
 *   T+30m  → escalation
 *   T+60m  → final reminder (will mark as missed if untouched)
 *
 * When the user marks "Taken" or "Skip", all follow-up reminders for that
 * dose are cancelled. "Snooze" schedules a fresh notification after 10 min.
 *
 * Action buttons are configured via setNotificationCategoryAsync. They work
 * fully on a real device build (development build, APK, IPA). In Expo Go
 * notifications fire but action buttons may be limited.
 */
import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api';

export const CATEGORY_MEDICATION = 'MEDICATION';
export const ACTION_TAKEN = 'TAKE_DOSE';
export const ACTION_SNOOZE = 'SNOOZE_DOSE';
export const ACTION_SKIP = 'SKIP_DOSE';

export const MISSED_DOSE_TASK = 'mediassist-missed-dose-sweep';
export const NOTIF_CHANNEL_REMINDERS = 'medication-reminders';

// Stable cache key prefix in AsyncStorage – maps each scheduled notification
// to its medication+dose context (used when the app handles user actions).
const NOTIF_META_PREFIX = 'mediassist_notif_meta:';

export type NotifAction = typeof ACTION_TAKEN | typeof ACTION_SNOOZE | typeof ACTION_SKIP;

export type DoseMeta = {
  medicationId: string;
  medicationName: string;
  dosage: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:MM
  reminderStage: 'primary' | 't10' | 't30' | 't60';
};

// Foreground handler – show banner + sound while app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// =============================================================
// Setup
// =============================================================
export async function setupNotifications(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  // Web has no native notifications API for our purpose
  if (Platform.OS === 'web') return { granted: false, canAskAgain: false };

  // Android: configure high-importance channel (required for heads-up alerts)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL_REMINDERS, {
      name: 'Medication Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4A90D9',
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
      enableVibrate: true,
    });
  }

  // Action buttons category (iOS + Android)
  try {
    await Notifications.setNotificationCategoryAsync(CATEGORY_MEDICATION, [
      {
        identifier: ACTION_TAKEN,
        buttonTitle: '✅ Alındı',
        options: { opensAppToForeground: true },
      },
      {
        identifier: ACTION_SNOOZE,
        buttonTitle: '⏰ 10 dk sonra',
        options: { opensAppToForeground: false },
      },
      {
        identifier: ACTION_SKIP,
        buttonTitle: '⏭ Atla',
        options: { opensAppToForeground: false, isDestructive: true },
      },
    ]);
  } catch (e) {
    console.warn('setNotificationCategoryAsync failed', e);
  }

  // Permissions
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  let canAskAgain = existing.canAskAgain ?? true;
  if (status !== 'granted' && canAskAgain) {
    const ask = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true, allowAnnouncements: false },
    });
    status = ask.status;
    canAskAgain = ask.canAskAgain ?? false;
  }
  return { granted: status === 'granted', canAskAgain };
}

// =============================================================
// Persistence helpers (notification → dose mapping)
// =============================================================
async function saveNotifMeta(notifId: string, meta: DoseMeta) {
  try { await AsyncStorage.setItem(NOTIF_META_PREFIX + notifId, JSON.stringify(meta)); } catch {}
}
export async function loadNotifMeta(notifId: string): Promise<DoseMeta | null> {
  try {
    const v = await AsyncStorage.getItem(NOTIF_META_PREFIX + notifId);
    return v ? (JSON.parse(v) as DoseMeta) : null;
  } catch { return null; }
}
async function deleteNotifMeta(notifId: string) {
  try { await AsyncStorage.removeItem(NOTIF_META_PREFIX + notifId); } catch {}
}

// =============================================================
// Schedule helpers – uses calendar trigger so daily reminders
// repeat at the same wall-clock time in local device timezone.
// =============================================================
export type ReminderTime = string; // 'HH:MM'

function parseHHMM(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(':').map((x) => parseInt(x, 10));
  return { hour: isFinite(h) ? h : 0, minute: isFinite(m) ? m : 0 };
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Schedule daily reminders for one medication at the given times.
 * Returns the list of scheduled notification IDs (can be saved on the
 * medication record so they can be cancelled when the medication is edited / deleted).
 */
export async function scheduleMedicationReminders(opts: {
  medicationId: string;
  medicationName: string;
  dosage: string;
  times: ReminderTime[];
  startDate?: string;
  endDate?: string;
}): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  const { medicationId, medicationName, dosage, times } = opts;
  // Cancel any prior schedule for this med
  await cancelMedicationReminders(medicationId);

  const ids: string[] = [];
  const now = new Date();
  
  for (const t of times) {
    const { hour, minute } = parseHHMM(t);
    
    // Create 14 individual future triggers instead of a buggy repeating trigger
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const triggerDate = new Date();
      triggerDate.setHours(hour, minute, 0, 0);
      triggerDate.setDate(triggerDate.getDate() + dayOffset);
      
      // If the scheduled time for today has already passed, skip it
      if (triggerDate.getTime() <= now.getTime()) {
        continue;
      }

      try {
        const id = await Notifications.scheduleNotificationAsync({
          identifier: `med-${medicationId}-${t}-${dayOffset}`,
          content: {
            title: `💊 ${medicationName} alma vakti`,
            body: `${dosage} dozunu şimdi al`,
            categoryIdentifier: CATEGORY_MEDICATION,
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.HIGH,
            data: {
              type: 'medication_primary',
              medicationId,
              medicationName,
              dosage,
              scheduledTime: t,
            } as any,
          },
          trigger: triggerDate,
        });
        ids.push(id);

        if (dayOffset === 0 || (dayOffset === 1 && triggerDate.getDate() !== now.getDate())) {
          // Persist meta only for the first valid upcoming trigger
          const meta: DoseMeta = {
            medicationId,
            medicationName,
            dosage,
            scheduledDate: isoDate(triggerDate),
            scheduledTime: t,
            reminderStage: 'primary',
          };
          await saveNotifMeta(id, meta);
        }
      } catch (err) {
        console.warn('scheduleNotificationAsync failed', t, err);
      }
    }
  }

  // Save the list against the med id, so we can cancel later
  try { await AsyncStorage.setItem(`mediassist_notif_ids:${medicationId}`, JSON.stringify(ids)); } catch {}
  return ids;
}

export async function cancelMedicationReminders(medicationId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const stored = await AsyncStorage.getItem(`mediassist_notif_ids:${medicationId}`);
    const ids: string[] = stored ? JSON.parse(stored) : [];
    for (const id of ids) {
      try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
      await deleteNotifMeta(id);
    }
    await AsyncStorage.removeItem(`mediassist_notif_ids:${medicationId}`);
  } catch {}
}

/**
 * Schedule a follow-up "have you taken your medication?" reminder some minutes from now.
 * One-shot trigger.
 */
export async function scheduleEscalation(meta: DoseMeta, minutes: number, stage: DoseMeta['reminderStage']): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      identifier: `med-${meta.medicationId}-escalate-${meta.scheduledTime}-${stage}`,
      content: {
        title: `⚠️ ${meta.medicationName} hatırlatması`,
        body: stage === 't60'
          ? `Son hatırlatma: ${meta.medicationName} ${meta.dosage} dozunu hala almadınız.`
          : `${meta.medicationName} ${meta.dosage} dozunuzu aldınız mı?`,
        categoryIdentifier: CATEGORY_MEDICATION,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          type: 'medication_escalation',
          stage,
          medicationId: meta.medicationId,
          medicationName: meta.medicationName,
          dosage: meta.dosage,
          scheduledTime: meta.scheduledTime,
          scheduledDate: meta.scheduledDate,
        } as any,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.floor(minutes * 60)),
        repeats: false,
        channelId: NOTIF_CHANNEL_REMINDERS,
      } as any,
    });
    await saveNotifMeta(id, { ...meta, reminderStage: stage });
    return id;
  } catch (err) {
    console.warn('scheduleEscalation failed', err);
    return null;
  }
}

/**
 * Cancel all escalation reminders for a specific dose.
 */
export async function cancelEscalations(medicationId: string, scheduledTime: string) {
  if (Platform.OS === 'web') return;
  for (const stage of ['t10', 't30', 't60'] as const) {
    const id = `med-${medicationId}-escalate-${scheduledTime}-${stage}`;
    try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
    await deleteNotifMeta(id);
  }
}

// =============================================================
// User action handlers (Take / Snooze / Skip)
// =============================================================
export async function handleNotifAction(action: NotifAction, meta: DoseMeta): Promise<void> {
  switch (action) {
    case ACTION_TAKEN:
      await cancelEscalations(meta.medicationId, meta.scheduledTime);
      try {
        await api.post('/dose-logs', {
          medication_id: meta.medicationId,
          scheduled_date: meta.scheduledDate,
          scheduled_time: meta.scheduledTime,
          status: 'taken',
        });
        await api.post('/notification-logs', {
          medication_id: meta.medicationId,
          notification_id: `med-${meta.medicationId}-${meta.scheduledTime}`,
          scheduled_date: meta.scheduledDate,
          scheduled_time: meta.scheduledTime,
          status: 'taken',
          fired_at: new Date().toISOString(),
        });
      } catch (e) { console.warn('mark taken sync failed', e); }
      break;

    case ACTION_SKIP:
      await cancelEscalations(meta.medicationId, meta.scheduledTime);
      try {
        await api.post('/dose-logs', {
          medication_id: meta.medicationId,
          scheduled_date: meta.scheduledDate,
          scheduled_time: meta.scheduledTime,
          status: 'skipped',
        });
        await api.post('/notification-logs', {
          medication_id: meta.medicationId,
          notification_id: `med-${meta.medicationId}-${meta.scheduledTime}`,
          scheduled_date: meta.scheduledDate,
          scheduled_time: meta.scheduledTime,
          status: 'skipped',
          fired_at: new Date().toISOString(),
        });
      } catch (e) { console.warn('mark skipped sync failed', e); }
      break;

    case ACTION_SNOOZE:
      await scheduleEscalation(meta, 10, 't10');
      try {
        await api.post('/notification-logs', {
          medication_id: meta.medicationId,
          notification_id: `med-${meta.medicationId}-${meta.scheduledTime}`,
          scheduled_date: meta.scheduledDate,
          scheduled_time: meta.scheduledTime,
          status: 'snoozed',
          snooze_minutes: 10,
        });
      } catch {}
      break;
  }
}

/**
 * Called when a notification is delivered (foreground or background) to
 * spin up the escalation chain for the primary reminder.
 */
export async function onNotificationDelivered(notif: Notifications.Notification): Promise<void> {
  const data = (notif.request.content.data || {}) as any;
  if (data?.type !== 'medication_primary') return;
  const meta: DoseMeta = {
    medicationId: data.medicationId,
    medicationName: data.medicationName,
    dosage: data.dosage,
    scheduledDate: isoDate(new Date()),
    scheduledTime: data.scheduledTime,
    reminderStage: 'primary',
  };
  // Chain follow-ups
  await scheduleEscalation(meta, 10, 't10');
  await scheduleEscalation(meta, 30, 't30');
  await scheduleEscalation(meta, 60, 't60');
  try {
    await api.post('/notification-logs', {
      medication_id: meta.medicationId,
      notification_id: notif.request.identifier,
      scheduled_date: meta.scheduledDate,
      scheduled_time: meta.scheduledTime,
      status: 'delivered',
      fired_at: new Date().toISOString(),
    });
  } catch {}
}

// =============================================================
// Background task: sweep missed doses (every ~15 minutes when permitted)
// =============================================================
TaskManager.defineTask(MISSED_DOSE_TASK, async () => {
  try {
    await api.post('/notification-logs/sweep-missed', {});
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.warn('sweep-missed failed', e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSweep() {
  if (Platform.OS === 'web') return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(MISSED_DOSE_TASK);
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(MISSED_DOSE_TASK, {
        minimumInterval: 15, // minutes (BackgroundTask uses minutes)
      });
    }
  } catch (e) {
    console.warn('registerBackgroundSweep failed', e);
  }
}

export async function unregisterBackgroundSweep() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(MISSED_DOSE_TASK);
    if (isRegistered) {
      await BackgroundTask.unregisterTaskAsync(MISSED_DOSE_TASK);
    }
  } catch {}
}
