import { useEffect } from 'react';
import { inject, type TrackerOptions } from './index';

export type JialyticsProps = TrackerOptions;

/**
 * Drop into your root layout and every page view is counted, client-side navigations included.
 *
 * ```tsx
 * <Jialytics />
 * ```
 */
export function Jialytics({ endpoint, ignore, trackLocalhost, debug }: JialyticsProps) {
  const ignoreKey = JSON.stringify(ignore?.map(String));
  useEffect(
    () => inject({ endpoint, ignore, trackLocalhost, debug }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endpoint, ignoreKey, trackLocalhost, debug],
  );
  return null;
}

export { inject, type TrackerOptions };
