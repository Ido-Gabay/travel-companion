import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors } from '@/theme/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Mirror direction-bearing icons (arrows, chevrons) in RTL. */
  flipInRtl?: boolean;
}

export function Icon({ name, size = 22, color = colors.text, flipInRtl = false }: IconProps) {
  const { isRtl } = useLocale();
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      style={flipInRtl && isRtl ? { transform: [{ scaleX: -1 }] } : undefined}
    />
  );
}
