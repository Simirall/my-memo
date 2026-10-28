"use client";

import { Component, type ReactNode } from "react";

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="space-y-4 p-4 text-center">
        <h1 className="text-4xl font-bold">エラーが発生しました</h1>
        <p role="alert">時間をおいて、もう一度お試しください。</p>
        <button
          className="btn"
          onClick={() => window.location.reload()}
          type="button"
        >
          ページを再読み込み
        </button>
      </main>
    );
  }
}
