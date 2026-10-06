export interface TrackerOptions {
  /** Where the handler is mounted. Default `/api/jialytics`. */
  endpoint?: string;
  /** Paths never sent, e.g. the dashboard. Strings match exactly or as a `/prefix/`. Default `['/jialytics']`. */
  ignore?: (string | RegExp)[];
  /** Also count visits on localhost and other development hosts. Default `false`. */
  trackLocalhost?: boolean;
  /** Log each page view to the console instead of staying quiet. */
  debug?: boolean;
}

const VISITOR_KEY = 'jialytics_visitor';
const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$|\.(localhost|local|test)$/;

const ignored = (path: string, rules: (string | RegExp)[]) =>
  rules.some((rule) =>
    typeof rule === 'string' ? path === rule || path.startsWith(rule.endsWith('/') ? rule : `${rule}/`) : rule.test(path),
  );

// A random id kept in localStorage, so returning visitors count once. No cookies; nothing that
// identifies a person. Private windows and blocked storage just count as new visitors.
function visitorId(): string | null {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

let stop: (() => void) | null = null;
// Kept across inject() calls, so stopping and starting again on the same page (React's
// StrictMode does exactly that) doesn't count it twice, and only the landing view has a referrer.
let lastPath: string | null = null;
let firstView = true;

/**
 * Start tracking page views: one now, and one per client-side navigation after (pushState,
 * replaceState to a new path, back/forward). Safe to call more than once; returns a function
 * that stops it.
 */
export function inject(options: TrackerOptions = {}): () => void {
  if (typeof window === 'undefined') return () => {};
  stop?.();
  const { endpoint = '/api/jialytics', ignore = ['/jialytics'], trackLocalhost = false, debug = false } = options;
  if (!trackLocalhost && DEV_HOST.test(location.hostname)) {
    if (debug) console.info('[jialytics] not tracking on a development host; pass trackLocalhost to change that');
    return () => {};
  }

  const send = () => {
    const path = location.pathname;
    if (path === lastPath || ignored(path, ignore)) return;
    lastPath = path;
    const body = JSON.stringify({
      path,
      query: location.search,
      // The external referrer belongs to the landing page only.
      referrer: firstView ? document.referrer : '',
      visitor: visitorId(),
    });
    firstView = false;
    if (debug) console.info('[jialytics] page view', path);
    const blob = new Blob([body], { type: 'application/json' });
    if (!navigator.sendBeacon?.(endpoint, blob)) {
      fetch(endpoint, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(
        () => {},
      );
    }
  };

  // Routers change the URL through the history API; wrap it so every navigation is seen.
  const { pushState, replaceState } = history;
  const later = () => setTimeout(send, 0);
  history.pushState = function (...args) {
    pushState.apply(this, args);
    later();
  };
  history.replaceState = function (...args) {
    replaceState.apply(this, args);
    later();
  };
  window.addEventListener('popstate', later);
  send();

  stop = () => {
    history.pushState = pushState;
    history.replaceState = replaceState;
    window.removeEventListener('popstate', later);
    stop = null;
  };
  return stop;
}
