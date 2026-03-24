import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { api } from './client';
import type { KnowledgeDoc, ApiSuccess } from '@app/types';

export function useLogin() {
  return useMutation({
    mutationFn: async (payload: { email: string; password: string }) => {
      const { data } = await api.post('/api/auth/login', payload);
      const { tokens, user } = (data as ApiSuccess<any>).data;
      localStorage.setItem('accessToken', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    }
  });
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data } = await api.get('/api/users/me');
      return (data as ApiSuccess<any>).data;
    },
    staleTime: 5 * 60 * 1000
  });
}

export function useKnowledge() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['knowledge'],
    queryFn: async () => {
      const { data } = await api.get('/api/knowledge/list');
      return (data as ApiSuccess<KnowledgeDoc[]>).data;
    }
  });

  const upload = useMutation({
    mutationFn: async (payload: { name: string; size: number }) => {
      const { data } = await api.post('/api/knowledge/upload', payload);
      return (data as ApiSuccess<KnowledgeDoc>).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] })
  });

  return { query, upload };
}
