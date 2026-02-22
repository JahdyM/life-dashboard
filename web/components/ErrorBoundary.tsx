"use client";

import { Component, ErrorInfo, ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  name?: string;
  onRetry?: () => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string | null;
};

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : "Unexpected error",
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error(
      `[ErrorBoundary:${this.props.name || "component"}]`,
      error,
      errorInfo
    );
  }

  reset = () => {
    this.setState({ hasError: false, errorMessage: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="card error-card">
          <h2>Something went wrong</h2>
          <p>
            {this.props.name
              ? `We could not render ${this.props.name}.`
              : "We could not render this section."}
          </p>
          {this.state.errorMessage ? (
            <p className="warning">{this.state.errorMessage}</p>
          ) : null}
          <button className="secondary" onClick={this.reset}>
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
