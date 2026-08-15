import { doc, setDoc, getDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface FunnelEvent {
  id: string;
  timestamp: string;
  eventName: string;
  path: string;
  step?: number;
  stepName?: string;
  metadata?: Record<string, any>;
}

export interface VisitorSession {
  visitorId: string;
  sessionId: string;
  firstSeen: string;
  lastSeen: string;
  deviceType: 'Mobile' | 'Tablet' | 'Desktop';
  browser: string;
  referrer: string;
  landingPage: string;
  currentPath: string;
  furthestStep: number;
  furthestStepName: string;
  convertedQuote: boolean;
  convertedAccount: boolean;
  userEmail?: string;
  userName?: string;
  eventsCount: number;
  events: FunnelEvent[];
}

const VISITOR_ID_KEY = 'inktheory_visitor_id';
const SESSION_ID_KEY = 'inktheory_session_id';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function clearVisitorSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(VISITOR_ID_KEY);
  sessionStorage.removeItem(SESSION_ID_KEY);
}

export function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') return 'server';
  let visitorId = localStorage.getItem(VISITOR_ID_KEY);
  if (!visitorId) {
    visitorId = generateId('v');
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  }
  return visitorId;
}

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = generateId('s');
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

export function detectDeviceType(): 'Mobile' | 'Tablet' | 'Desktop' {
  if (typeof window === 'undefined') return 'Desktop';
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'Tablet';
  }
  if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i.test(ua)) {
    return 'Mobile';
  }
  return 'Desktop';
}

export function detectBrowser(): string {
  if (typeof window === 'undefined') return 'Unknown';
  const ua = navigator.userAgent;
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Safari/')) return 'Safari';
  return 'Browser';
}

const STEP_NAMES: Record<number, string> = {
  0: 'Landing (/start2)',
  1: 'Category & Garment Selection',
  2: 'Upload Artwork / Logo',
  3: 'Placement & Proof Configurator',
  4: 'Sizing & Quantities',
  5: 'Quote Submitted',
  6: 'Account Created',
};

export async function trackVisitorEvent(
  eventName: string,
  options?: {
    path?: string;
    step?: number;
    stepName?: string;
    metadata?: Record<string, any>;
    userEmail?: string;
    userName?: string;
    convertedQuote?: boolean;
    convertedAccount?: boolean;
  }
) {
  if (typeof window === 'undefined') return;

  try {
    const visitorId = getOrCreateVisitorId();
    const sessionId = getOrCreateSessionId();
    const path = options?.path || window.location.pathname + window.location.search;
    const nowIso = new Date().toISOString();
    const step = options?.step ?? (path.includes('/start2') ? 0 : path.includes('/start') ? 1 : 0);
    const stepName = options?.stepName || STEP_NAMES[step] || `Step ${step}`;

    const newEvent: FunnelEvent = {
      id: generateId('evt'),
      timestamp: nowIso,
      eventName,
      path,
      step,
      stepName,
      metadata: options?.metadata || {},
    };

    const docRef = doc(db, 'visitor_sessions', visitorId);
    const existingSnap = await getDoc(docRef);

    if (existingSnap.exists()) {
      const data = existingSnap.data() as Partial<VisitorSession>;
      const newFurthestStep = Math.max(data.furthestStep || 0, step);
      
      const updateData: Record<string, any> = {
        lastSeen: nowIso,
        currentPath: path,
        furthestStep: newFurthestStep,
        furthestStepName: STEP_NAMES[newFurthestStep] || `Step ${newFurthestStep}`,
        eventsCount: (data.eventsCount || 0) + 1,
        events: arrayUnion(newEvent),
        updatedAt: serverTimestamp(),
      };

      if (options?.convertedQuote) updateData.convertedQuote = true;
      if (options?.convertedAccount) updateData.convertedAccount = true;
      if (options?.userEmail) updateData.userEmail = options.userEmail;
      if (options?.userName) updateData.userName = options.userName;

      await setDoc(docRef, updateData, { merge: true });
    } else {
      const newSession: Record<string, any> = {
        visitorId,
        sessionId,
        firstSeen: nowIso,
        lastSeen: nowIso,
        deviceType: detectDeviceType(),
        browser: detectBrowser(),
        referrer: document.referrer || 'Direct',
        landingPage: path,
        currentPath: path,
        furthestStep: step,
        furthestStepName: stepName,
        convertedQuote: Boolean(options?.convertedQuote),
        convertedAccount: Boolean(options?.convertedAccount),
        userEmail: options?.userEmail || null,
        userName: options?.userName || null,
        eventsCount: 1,
        events: [newEvent],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(docRef, newSession);
    }
  } catch (err) {
    console.warn('Failed to track visitor event:', err);
  }
}
