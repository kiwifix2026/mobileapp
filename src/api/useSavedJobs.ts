import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listSavedJobs, saveJob, unsaveJob, type SavedJob } from './extras';
import { useAuth } from '../auth/AuthContext';

// Shared saved-jobs state for the tradie app — mirrors the web dashboard's
// savedJobIds set + toggleSaveJob(). One query keeps the Home cards, the job
// detail screen and the Saved Jobs list in sync with each other.
export function useSavedJobs() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const email = session?.email || '';
  const key = ['savedJobs', email];

  const { data, refetch, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listSavedJobs(session!.token, email),
    enabled: !!session && session.role === 'tradie',
  });
  const saved: SavedJob[] = data || [];
  const ids = new Set(saved.map((j) => j.id));

  const toggle = useMutation({
    mutationFn: async (jobId: string) => {
      if (ids.has(jobId)) {
        await unsaveJob(session!.token, email, jobId);
      } else {
        await saveJob(session!.token, email, jobId);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return {
    saved,
    isSaved: (jobId: string) => ids.has(jobId),
    toggle: (jobId: string) => toggle.mutate(jobId),
    isLoading,
    refetch,
  };
}
