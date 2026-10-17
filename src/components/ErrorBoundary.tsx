import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Last-resort boundary: a render crash shows a recovery message, never a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-xl mx-auto text-center py-20 px-5">
          <h1 className="font-serif text-2xl text-charcoal mb-3">Something went wrong</h1>
          <p className="text-sm text-slateink leading-relaxed mb-8">
            An unexpected error interrupted this page. Your saved records are safe. Reloading
            usually resolves it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-paper hover:bg-terracotta-dark transition-colors"
          >
            Reload the page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
