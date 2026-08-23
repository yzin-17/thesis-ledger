import { useQuery } from '@tanstack/react-query';
import { fetchOnboardingStatus } from './onboarding.api.js';

export const onboardingKeys = {
  root: ['desktop', 'onboarding'] as const,
  status: (hasPosition: boolean) => [...onboardingKeys.root, 'status', hasPosition] as const,
};

export const useOnboardingStatusQuery = (hasPosition: boolean) =>
  useQuery({
    queryKey: onboardingKeys.status(hasPosition),
    queryFn: () => fetchOnboardingStatus(),
    enabled: hasPosition,
    refetchOnMount: 'always',
  });
