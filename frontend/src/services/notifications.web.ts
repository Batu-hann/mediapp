export const CATEGORY_MEDICATION = 'MEDICATION';
export const ACTION_TAKEN = 'TAKE_DOSE';
export const ACTION_SNOOZE = 'SNOOZE_DOSE';
export const ACTION_SKIP = 'SKIP_DOSE';

export const MISSED_DOSE_TASK = 'mediassist-missed-dose-sweep';
export const NOTIF_CHANNEL_REMINDERS = 'medication-reminders';

export type NotifAction = typeof ACTION_TAKEN | typeof ACTION_SNOOZE | typeof ACTION_SKIP;

export type DoseMeta = {
  medicationId: string;
  medicationName: string;
  dosage: string;
  scheduledDate: string;
  scheduledTime: string;
  reminderStage: 'primary' | 't10' | 't30' | 't60';
};

export type ReminderTime = string;

export async function setupNotifications(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  return { granted: false, canAskAgain: false };
}

export async function loadNotifMeta(_notifId: string): Promise<DoseMeta | null> {
  return null;
}

export async function scheduleMedicationReminders(_opts: {
  medicationId: string;
  medicationName: string;
  dosage: string;
  times: ReminderTime[];
  startDate?: string;
  endDate?: string;
}): Promise<string[]> {
  return [];
}

export async function cancelMedicationReminders(_medicationId: string): Promise<void> {}

export async function cancelAllMedicationReminders(): Promise<void> {}

export async function scheduleEscalation(
  _meta: DoseMeta,
  _minutes: number,
  _stage: DoseMeta['reminderStage']
): Promise<string | null> {
  return null;
}

export async function cancelEscalations(
  _medicationId: string,
  _scheduledTime: string
): Promise<void> {}

export async function handleNotifAction(_action: NotifAction, _meta: DoseMeta): Promise<void> {}

export async function onNotificationDelivered(_notif: unknown): Promise<void> {}

export async function registerBackgroundSweep(): Promise<void> {}

export async function unregisterBackgroundSweep(): Promise<void> {}
