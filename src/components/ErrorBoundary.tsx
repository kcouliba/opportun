import { Component, type ReactNode, type ErrorInfo } from "react";

interface ErrorBoundaryProps {
  fallback?: (error: Error, reset: () => void) => ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return <PageErrorFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function PageErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md w-full text-center">
        <h2 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
          This page couldn't load
        </h2>
        <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

export function AppErrorFallback(error: Error, reset: () => void) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4">⚠</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{error.message}</p>
        <button
          onClick={reset}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
