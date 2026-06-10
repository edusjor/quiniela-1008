'use client';

import { useEffect, useState } from 'react';
import { apiFetch, User } from './api';

export function useMe() {
  const [me, setMe] = useState<User|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await apiFetch<{user:User}>('/auth/me');
        if (mounted) setMe(r.user);
      } catch {
        if (mounted) setMe(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return { me, loading, refresh: async () => {
    const r = await apiFetch<{user:User}>('/auth/me');
    setMe(r.user);
  }};
}
