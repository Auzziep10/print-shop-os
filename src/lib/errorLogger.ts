import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';

export interface UserSessionContext {
  userId?: string;
  email?: string;
  role?: string;
  customerId?: string;
}

export interface ErrorReportContext {
  url?: string;
  path?: string;
  queryParams?: string;
  referrer?: string;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
  };
  timestamp?: string;
  session?: UserSessionContext;
}

export interface StructuredErrorPayload {
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  digest?: string;
  code?: number | string;
  context: ErrorReportContext;
  environment: string;
  createdAt: string;
}

const IS_DEV = import.meta.env.DEV;

/**
 * Structured error logger that captures full stack traces, request context,
 * and user session data into Firestore and monitoring console without
 * exposing raw details to the customer.
 */
export async function logErrorToMonitoring(
  error: Error | unknown,
  extraContext?: {
    componentStack?: string;
    code?: number | string;
    session?: UserSessionContext;
    customMessage?: string;
  }
): Promise<void> {
  try {
    const errObj = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown Error');

    const requestContext: ErrorReportContext = {
      url: typeof window !== 'undefined' ? window.location.href : '',
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      queryParams: typeof window !== 'undefined' ? window.location.search : '',
      referrer: typeof document !== 'undefined' ? document.referrer : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      viewport: typeof window !== 'undefined' ? { width: window.innerWidth, height: window.innerHeight } : undefined,
      timestamp: new Date().toISOString(),
      session: extraContext?.session
        ? {
            userId: extraContext.session.userId || undefined,
            email: extraContext.session.email || undefined,
            role: extraContext.session.role || undefined,
            customerId: extraContext.session.customerId || undefined,
          }
        : undefined,
    };

    const payload: StructuredErrorPayload = {
      message: extraContext?.customMessage || errObj.message || 'An unexpected error occurred',
      name: errObj.name || 'Error',
      stack: errObj.stack || '',
      componentStack: extraContext?.componentStack || '',
      code: extraContext?.code || 500,
      context: requestContext,
      environment: import.meta.env.MODE || (IS_DEV ? 'development' : 'production'),
      createdAt: new Date().toISOString(),
    };

    if (IS_DEV) {
      console.group('🚨 [INKTHEORY Structured Error Captured]');
      console.error('Message:', payload.message);
      console.error('Stack Trace:', payload.stack);
      if (payload.componentStack) console.error('Component Stack:', payload.componentStack);
      console.log('Request Context:', payload.context);
      console.groupEnd();
    } else {
      console.error(`[App Error ${payload.code}]`, payload.message);
    }

    // Persist error payload silently to Firestore error_logs collection
    try {
      await addDoc(collection(db, 'error_logs'), payload);
    } catch (dbErr) {
      // Silently catch database log errors to prevent secondary crashes
      console.error('Failed to persist structured error log:', dbErr);
    }
  } catch (loggingErr) {
    console.error('Error in logErrorToMonitoring:', loggingErr);
  }
}
