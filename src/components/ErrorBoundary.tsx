import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/States";

interface Props {
  children: ReactNode;
  /** What failed, e.g. "3D viewer". Used in the message. */
  label?: string;
  fullScreen?: boolean;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[CADify] ${this.props.label ?? "UI"} crashed`, error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={this.props.fullScreen ? "grid h-screen place-items-center bg-app" : "grid h-full place-items-center bg-canvas"}>
        <ErrorState
          title={`The ${this.props.label ?? "interface"} stopped working`}
          description="Your project files are safe. Reload this part of the interface to continue."
          detail={this.state.error.message}
          action={
            <Button size="sm" onClick={() => (this.props.fullScreen ? window.location.reload() : this.setState({ error: null }))}>
              Reload
            </Button>
          }
        />
      </div>
    );
  }
}
