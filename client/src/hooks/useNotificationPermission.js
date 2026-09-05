import { useCallback, useEffect, useState } from 'react';

export function useNotificationPermission() {
  const isSupported =
    typeof window !== 'undefined' && 'Notification' in window;

  const [permission, setPermission] = useState(
    isSupported ? Notification.permission : 'unsupported',
  );

  const request = useCallback(async () => {
    if (!isSupported) return 'unsupported';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, [isSupported]);

  useEffect(() => {
    if (!isSupported || !navigator.permissions?.query) return undefined;
    let status;
    let cancelled = false;
    const handler = () => {
      if (status && !cancelled) setPermission(status.state === 'prompt' ? 'default' : status.state);
    };

    navigator.permissions
      .query({ name: 'notifications' })
      .then((result) => {
        status = result;
        status.addEventListener('change', handler);
      })
      .catch(() => {
        // Ignored
      });

    return () => {
      cancelled = true;
      status?.removeEventListener('change', handler);
    };
  }, [isSupported]);

  return { permission, request, isSupported };
}
