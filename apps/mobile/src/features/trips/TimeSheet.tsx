import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Sheet } from '@/components/ui';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors } from '@/theme/tokens';
import { fromStartTime, toStartTime } from './itinerary';

interface TimeSheetProps {
  visible: boolean;
  placeName: string;
  /** "HH:MM" or null. */
  value: string | null;
  onSave: (value: string | null) => void;
  onClose: () => void;
}

/**
 * Set or clear a place's planned time. iOS: a sheet with a time wheel.
 * Android: the system time dialog (a cleared time is done from the stop's menu).
 */
export function TimeSheet({ visible, placeName, value, onSave, onClose }: TimeSheetProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [draft, setDraft] = useState(() => fromStartTime(value));

  useEffect(() => {
    if (visible) setDraft(fromStartTime(value));
  }, [visible, value]);

  if (Platform.OS === 'android') {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={draft}
        mode="time"
        onChange={(event, date) => {
          if (event.type === 'set' && date) onSave(toStartTime(date));
          else onClose();
        }}
      />
    );
  }

  return (
    <Sheet
      visible={visible}
      title={t('itinerary.setTime')}
      subtitle={placeName}
      onClose={onClose}
      scroll={false}
      footer={
        <>
          <Button label={t('common.save')} onPress={() => onSave(toStartTime(draft))} />
          {value ? (
            <Button label={t('itinerary.clearTime')} variant="secondary" onPress={() => onSave(null)} />
          ) : null}
        </>
      }
    >
      <View style={styles.picker}>
        <DateTimePicker
          value={draft}
          mode="time"
          display="spinner"
          locale={locale}
          minuteInterval={5}
          textColor={colors.text}
          onChange={(_event, date) => {
            if (date) setDraft(date);
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  picker: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
