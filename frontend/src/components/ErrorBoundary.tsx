import { Component, type ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

// Odottamaton virhe näkymässä näyttää selkeän ilmoituksen tyhjän valkoisen sivun sijaan
export default class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Näkymän virhe:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="auth-page">
        <div className="card" style={{ maxWidth: 380, width: '100%', display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }} aria-hidden="true">😵</div>
          <h1 style={{ fontSize: 22 }}>Jokin meni pieleen</h1>
          <p className="muted">Lataa sivu uudelleen. Jos olit pelissä, pääset takaisin samaan huoneeseen.</p>
          <button className="btn btn-primary btn-block" onClick={() => window.location.reload()}>Lataa uudelleen</button>
        </div>
      </div>
    );
  }
}
