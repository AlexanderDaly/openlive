/**
 * ErrorBoundary — last line of defence for the app shell (owned by the
 * foundation).
 *
 * The autosaved project is restored before the first render, so a project
 * that renders badly would otherwise take the whole app down on EVERY
 * reload with no way back — the bad payload is still in localStorage. The
 * fallback therefore offers an escape hatch that discards the autosave and
 * reboots into the demo project.
 *
 * Loading is defensive too (`coerceProjectFile` drops malformed entities),
 * so reaching this screen means a genuine bug worth reporting.
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { clearSavedProject } from '@/store/persistence';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('OpenLive crashed:', error, info.componentStack);
  }

  private reload = (): void => {
    window.location.reload();
  };

  private discardAndReload = (): void => {
    clearSavedProject();
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#1a1a1a] p-6 text-neutral-200">
        <div className="w-full max-w-md">
          <p className="text-sm font-semibold tracking-wide">
            Open<span className="text-[#ff8c2e]">Live</span> hit an error
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            Something went wrong while rendering the app. If this happens again right
            after reloading, the autosaved project is probably the cause — discarding it
            restores the demo project.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-sm border border-[#333] bg-[#141414] p-2 text-[10px] leading-relaxed text-[#e0483c]">
            {error.message || String(error)}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={this.reload}
              className="rounded-sm bg-[#2b2b2b] px-3 py-1.5 text-[11px] font-semibold tracking-wide text-neutral-200 hover:bg-neutral-700"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.discardAndReload}
              className="rounded-sm bg-[#ff8c2e] px-3 py-1.5 text-[11px] font-semibold tracking-wide text-black hover:bg-[#ff9d4d]"
            >
              Discard saved project &amp; reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
