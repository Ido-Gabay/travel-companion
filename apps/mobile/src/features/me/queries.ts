import type { Me, UpdatePreferencesInput, UpdateProfileInput } from '@travel-companion/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';

export const meKey = ['me'] as const;

export function useMe() {
  const { session } = useAuth();
  return useQuery({ queryKey: meKey, queryFn: api.getMe, enabled: session !== null });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileInput) => api.updateMe(body),
    onSuccess: (me) => queryClient.setQueryData(meKey, me),
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePreferencesInput) => api.updatePreferences(body),
    onSuccess: (preferences) =>
      queryClient.setQueryData<Me>(meKey, (me) => (me ? { ...me, preferences } : me)),
  });
}
