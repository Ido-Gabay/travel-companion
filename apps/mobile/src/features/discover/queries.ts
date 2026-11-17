import type { DiscoverSearchRequest, InterpretRequest } from '@travel-companion/shared';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useInterpret() {
  return useMutation({ mutationFn: (body: InterpretRequest) => api.interpret(body) });
}

export function useDiscoverSearch() {
  return useMutation({ mutationFn: (body: DiscoverSearchRequest) => api.discoverSearch(body) });
}
