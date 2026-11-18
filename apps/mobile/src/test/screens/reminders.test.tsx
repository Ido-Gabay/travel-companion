import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { ReminderSync } from '@/features/companion/ReminderSync';
import { goOffline, renderApp, resetAll, serverHas } from '../render';

const ours = [
  { identifier: 'tc:leaveSoon:trip:stop', content: { title: 'Leave soon', data: { tc: 1, fp: 'x', pk: 'y', tripId: 'trip' } } },
];

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date('2026-11-23T12:00:00Z') });
  await resetAll();
  await AsyncStorage.setItem('reminders:settings:v1', JSON.stringify({ enabled: true }));
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock<() => Promise<unknown>>).mockImplementation(() =>
    Promise.resolve(ours),
  );
});
afterEach(() => {
  jest.useRealTimers();
});

async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('Reminder sync (M12a)', () => {
  it('never cancels scheduled reminders when trips cannot be loaded (offline, no saved copy)', async () => {
    goOffline();
    await renderApp(<ReminderSync signedIn />);
    await settle();
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('control: cancels them when the server says there is no trip', async () => {
    serverHas([]);
    await renderApp(<ReminderSync signedIn />);
    await settle();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('tc:leaveSoon:trip:stop');
  });
});
