/**
 * OFM Mobile-First Onboarding Application Entry Point
 * 
 * Initializes the React application with mobile optimizations:
 * - Progressive Web App (PWA) registration
 * - Mobile device detection and optimization
 * - Responsive design system initialization
 * - Error boundaries and offline handling
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { MobileOnboardingFlow } from './components/MobileOnboardingFlow';
import { detectDevice, getOptimalViewport } from './utils/mobile-detection';

// Import CSS
import './styles/mobile-first.css';

/**
 * PWA Service Worker Registration
 */
function registerServiceWorker(): void {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        });
        
        console.log('Service Worker registered:', registration.scope);
        
        // Handle updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New content available, refresh the page
              if (window.confirm('New version available! Refresh to update?')) {
                window.location.reload();
              }
            }
          });
        });
        
      } catch (error) {
        console.warn('Service Worker registration failed:', error);
      }
    });
  }
}

/**
 * Initialize mobile optimizations
 */
function initializeMobileOptimizations(): void {
  const device = detectDevice();
  
  // Set optimal viewport
  let viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
  if (!viewportMeta) {
    viewportMeta = document.createElement('meta');
    viewportMeta.name = 'viewport';
    document.head.appendChild(viewportMeta);
  }
  viewportMeta.content = getOptimalViewport(device);
  
  // Add device classes to body
  document.body.classList.add(
    device.isMobile ? 'mobile-device' : 'desktop-device',
    `platform-${device.platform}`,
    `screen-${device.screenSize}`
  );
  
  // Disable pinch zoom on iOS if mobile
  if (device.platform === 'ios' && device.isMobile) {
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    document.addEventListener('gestureend', (e) => e.preventDefault());
  }
  
  // Handle iOS safe areas
  if (device.platform === 'ios') {
    document.documentElement.style.setProperty(
      '--safe-area-inset-top',
      'env(safe-area-inset-top, 0px)'
    );
    document.documentElement.style.setProperty(
      '--safe-area-inset-bottom',
      'env(safe-area-inset-bottom, 0px)'
    );
  }
  
  // Prevent rubber band scrolling on iOS
  document.body.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1 || (e.target as Element)?.closest('.scrollable')) {
      return;
    }
    e.preventDefault();
  }, { passive: false });
}

/**
 * Error Boundary Component
 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Onboarding Error:', error, errorInfo);
    
    // Report error to monitoring service in production
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
    }
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '40px 20px',
          textAlign: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
        }}>
          <div style={{
            fontSize: '64px',
            marginBottom: '24px'
          }}>
            😵
          </div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: '600',
            color: '#1f2937',
            marginBottom: '16px'
          }}>
            Something went wrong
          </h1>
          <p style={{
            fontSize: '16px',
            color: '#6b7280',
            marginBottom: '32px',
            maxWidth: '400px',
            lineHeight: '1.5'
          }}>
            We're sorry for the inconvenience. Please refresh the page to try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              minHeight: '44px'
            }}
          >
            Refresh Page
          </button>
          
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{
              marginTop: '24px',
              padding: '16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              fontSize: '12px',
              fontFamily: 'monospace',
              textAlign: 'left',
              maxWidth: '100%',
              overflow: 'auto'
            }}>
              <summary style={{ marginBottom: '8px', fontWeight: '600' }}>
                Error Details (Development)
              </summary>
              <pre>{this.state.error.stack}</pre>
            </details>
          )}
        </div>
      );
    }
    
    return this.props.children;
  }
}

/**
 * App Component with mobile-first onboarding flow
 */
const App: React.FC = () => {
  const [isOnlineReady, setIsOnlineReady] = React.useState(navigator.onLine);
  
  // Handle online/offline status
  React.useEffect(() => {
    const handleOnline = () => setIsOnlineReady(true);
    const handleOffline = () => setIsOnlineReady(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  const handleOnboardingComplete = (data: any) => {
    console.log('Onboarding completed:', data);
    
    // Trigger success feedback
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
    
    // Redirect to main application or success page
    setTimeout(() => {
      window.location.href = '/dashboard?onboarded=true';
    }, 1500);
  };
  
  const handleStepChange = (step: string) => {
    console.log('Step changed to:', step);
    
    // Analytics tracking
    if (window.gtag) {
      window.gtag('event', 'onboarding_step', {
        event_category: 'onboarding',
        event_label: step
      });
    }
  };
  
  return (
    <div className="app">
      {/* Offline banner */}
      {!isOnlineReady && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: '#f59e0b',
          color: 'white',
          padding: '8px 16px',
          textAlign: 'center',
          fontSize: '14px',
          zIndex: 9999
        }}>
          You're offline. Some features may not work.
        </div>
      )}
      
      {/* Main onboarding flow */}
      <MobileOnboardingFlow
        onComplete={handleOnboardingComplete}
        onStepChange={handleStepChange}
        className="main-onboarding"
      />
    </div>
  );
};

/**
 * Initialize and render the application
 */
function initializeApp(): void {
  // Initialize mobile optimizations
  initializeMobileOptimizations();
  
  // Register PWA service worker
  registerServiceWorker();
  
  // Get root element
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }
  
  // Create React root and render app
  const root = ReactDOM.createRoot(rootElement);
  
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
  
  // Performance monitoring
  if (process.env.NODE_ENV === 'production') {
    // Measure and report Core Web Vitals
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      const reportMetric = (metric: any) => {
        console.log(metric);
        // Report to analytics service
        if (window.gtag) {
          window.gtag('event', metric.name, {
            event_category: 'Web Vitals',
            value: Math.round(metric.value),
            event_label: metric.id,
            non_interaction: true,
          });
        }
      };
      
      getCLS(reportMetric);
      getFID(reportMetric);
      getFCP(reportMetric);
      getLCP(reportMetric);
      getTTFB(reportMetric);
    });
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Global error handling
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  // Report to error tracking service in production
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // Report to error tracking service in production
});

// Export for testing
export { App, ErrorBoundary };