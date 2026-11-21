import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import NewTripScreen from '@/app/trips/new';
import i18n from '@/i18n/i18n';
import { mockApi, renderApp, resetAll, serverHas } from '../render';

const t = i18n.t.bind(i18n);

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date(2026, 10, 10, 9, 0) });
  await resetAll();
  serverHas([]);
  mockApi.createTrip.mockImplementation((...args: never[]) =>
    Promise.resolve({
      id: '00000000-0000-4000-8000-000000000001',
      ...(args[0] as unknown as object),
      placeCount: 0,
      createdAt: '2026-11-10T09:00:00.000Z',
      updatedAt: '2026-11-10T09:00:00.000Z',
      version: 1,
      basePlaceId: null,
    }),
  );
});
afterEach(() => {
  jest.useRealTimers();
});

const createButton = () => screen.getByRole('button', { name: t('createTrip.submit') });

describe('New trip', () => {
  it('destination from suggestions, a date range on the calendar, a neighborhood, and a suggested name, then create', async () => {
    await renderApp(<NewTripScreen />);
    const destination = await screen.findByLabelText(t('createTrip.destination'));
    await fireEvent(destination, 'focus');
    await fireEvent.changeText(destination, 'new yo');
    await fireEvent.press(await screen.findByLabelText('New York, USA'));
    expect(screen.getByLabelText(t('createTrip.destination')).props.value).toBe('New York, USA');
    // The name follows the destination until the user types one.
    expect(screen.getByLabelText(t('createTrip.name')).props.value).toBe('New York');

    await fireEvent.press(screen.getByTestId('day-2026-11-23'));
    expect(screen.getByText(t('createTrip.pickEnd'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('day-2026-11-29'));
    expect(screen.getByText(t('createTrip.days', { count: 7 }))).toBeTruthy();
    expect(screen.getByText(t('createTrip.pickedRange', { count: 7 }))).toBeTruthy();
    expect(screen.getByLabelText(t('createTrip.name')).props.value).toBe('New York in November');

    await fireEvent.press(screen.getByText('SoHo'));
    expect(screen.getByLabelText(t('createTrip.baseLocation')).props.value).toBe('SoHo, New York');

    await fireEvent.press(createButton());
    await waitFor(() => expect(mockApi.createTrip).toHaveBeenCalledTimes(1));
    expect(mockApi.createTrip.mock.calls[0]?.[0]).toMatchObject({
      title: 'New York in November',
      destination: 'New York, USA',
      baseLocation: 'SoHo, New York',
      startDate: '2026-11-23',
      endDate: '2026-11-29',
    });
  });

  it('never an end before the start; any place can be typed; a name is required', async () => {
    await renderApp(<NewTripScreen />);
    const destination = await screen.findByLabelText(t('createTrip.destination'));
    await fireEvent.changeText(destination, 'Hallstatt, Austria');
    expect(screen.getByLabelText(t('createTrip.name')).props.value).toBe('Hallstatt');

    await fireEvent.press(screen.getByTestId('day-2026-11-20'));
    // An earlier day becomes the new start instead of an end before the start.
    await fireEvent.press(screen.getByTestId('day-2026-11-12'));
    expect(screen.getByText(t('createTrip.pickEnd'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('day-2026-11-14'));
    expect(screen.getByText(t('createTrip.days', { count: 3 }))).toBeTruthy();
    await fireEvent.press(screen.getByText(t('createTrip.clearDates')));
    expect(screen.getByText(t('createTrip.pickStart'))).toBeTruthy();

    // The user's own name wins; an empty name can't be created.
    await fireEvent.changeText(screen.getByLabelText(t('createTrip.name')), '');
    expect(createButton().props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText(t('createTrip.name')), 'Alps');
    await fireEvent.changeText(destination, 'Salzburg');
    expect(screen.getByLabelText(t('createTrip.name')).props.value).toBe('Alps');

    await fireEvent.press(createButton());
    await waitFor(() => expect(mockApi.createTrip).toHaveBeenCalledTimes(1));
    expect(mockApi.createTrip.mock.calls[0]?.[0]).toMatchObject({ title: 'Alps', destination: 'Salzburg', startDate: null, endDate: null });
  });

  it('the calendar moves between months', async () => {
    await renderApp(<NewTripScreen />);
    expect(await screen.findByTestId('day-2026-11-30')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t('createTrip.nextMonth')));
    expect(screen.getByTestId('day-2026-12-31')).toBeTruthy();
    expect(screen.queryByTestId('day-2026-11-30')).toBeNull();
  });
});
