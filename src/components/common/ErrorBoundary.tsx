import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logErrorToMonitoring, type UserSessionContext } from '../../lib/errorLogger';
import { ErrorPage } from '../../pages/Error/ErrorPage';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  userSession?: UserSessionContext;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    componentStack: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      componentStack: '',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const componentStack = errorInfo.componentStack || '';
    this.setState({ componentStack });

    // Log structured error metadata to Firestore and monitoring channel
    logErrorToMonitoring(error, {
      componentStack,
      code: 500,
      session: this.props.userSession,
      customMessage: `Uncaught React Component Error: ${error.message}`,
    });
  }

  public componentDidMount(): void {
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
    window.addEventListener('error', this.handleWindowError);
  }

  public componentWillUnmount(): void {
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
    window.removeEventListener('error', this.handleWindowError);
  }

  private handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    logErrorToMonitoring(reason, {
      code: 500,
      session: this.props.userSession,
      customMessage: `Unhandled Promise Rejection: ${typeof reason === 'object' && reason?.message ? reason.message : String(reason)}`,
    });
  };

  private handleWindowError = (event: ErrorEvent): void => {
    if (event.error) {
      logErrorToMonitoring(event.error, {
        code: 500,
        session: this.props.userSession,
        customMessage: `Global Window Error: ${event.message}`,
      });
    }
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorPage
          code={500}
          error={this.state.error}
          componentStack={this.state.componentStack}
        />
      );
    }

    return this.props.children;
  }
}
