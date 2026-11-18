import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ProfileScreen from '@/app/(tabs)/profile';
import { signOut } from '@/features/auth/auth-actions';
import { tripDetail, uuid } from '@/features/offline/test-fixtures';
import i18n from '@/i18n/i18n';
import { goOffline, renderApp, resetAll, seedSavedCopy } from '../render';

jest.mock('@/features/auth/auth-actions', () => ({ signOut: jest.fn(() => Promise.resolve()) }));

beforeEach(async () => {
  await resetAll();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Profile sign-out', () => {
  it('warns before signing out with changes that have not synced (and does not sign out yet)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await seedSavedCopy([tripDetail([])], Date.now(), {
      ops: [{ id: 'v', kind: 'visited', placeId: uuid(101), value: true, base: false, createdAt: 1 }],
    });
    goOffline();
    await renderApp(<ProfileScreen />);
    await fireEvent.press(await screen.findByText(i18n.t('profile.signOut')));
    expect(alert).toHaveBeenCalledWith(i18n.t('offline.signOutTitle'), expect.any(String), expect.any(Array));
    expect(signOut).not.toHaveBeenCalled();
  });
});
