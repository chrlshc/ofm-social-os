/**
 * Mobile-Optimized Stripe Connect Modal Component
 * 
 * Provides a mobile-first Stripe Connect onboarding experience with:
 * - Full-screen modal on mobile devices
 * - Touch-optimized interactions
 * - iOS/Android specific optimizations
 * - Offline handling and retry mechanisms
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useMobileFormOptimization } from '../hooks/useMobileOptimization';

interface StripeConnectConfig {
  accountId?: string;
  returnUrl: string;
  refreshUrl: string;
  type: 'account_onboarding' | 'account_update';
}

interface MobileStripeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (accountId: string) => void;
  onError: (error: string) => void;
  config: StripeConnectConfig;
  className?: string;
}

interface StripeAccountLinkResponse {
  url: string;
  expires_at: number;
}

/**
 * Mobile Stripe Connect Modal Component
 */
export const MobileStripeModal: React.FC<MobileStripeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onError,
  config,
  className = ''
}) => {
  const mobile = useMobileFormOptimization();
  const [loading, setLoading] = useState(false);
  const [stripeUrl, setStripeUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // Refs for cleanup
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const retryTimeoutRef = useRef<NodeJS.Timeout>();

  /**
   * Create Stripe Account Link with mobile optimizations
   */
  const createAccountLink = useCallback(async (): Promise<string> => {
    const payload = {
      account_id: config.accountId,
      type: config.type,
      collect: 'eventually_due',
      return_url: config.returnUrl,
      refresh_url: config.refreshUrl,
      // Mobile-specific optimizations
      mobile_optimized: true,
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#6366f1',
          borderRadius: '8px',
          fontSizeBase: '16px', // Prevent zoom on iOS
          spacingUnit: mobile.device.isMobile ? '6px' : '4px'
        },
        rules: {
          '.Input': {
            fontSize: '16px', // Prevent zoom on iOS
            padding: mobile.device.isMobile ? '12px' : '8px',
            minHeight: mobile.device.isMobile ? '44px' : '36px'
          },
          '.Button': {
            fontSize: '16px',
            padding: mobile.device.isMobile ? '14px 24px' : '10px 20px',
            minHeight: mobile.device.isMobile ? '44px' : '36px',
            touchAction: 'manipulation'
          }
        }
      },
      // Device-specific configuration
      ...(mobile.device.isMobile && {
        layout: mobile.device.screenSize === 'small' ? 'accordion' : 'tabs',
        redirect_behavior: 'modal'
      })
    };

    const response = await fetch('/api/stripe/create-account-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data: StripeAccountLinkResponse = await response.json();
    return data.url;
  }, [config, mobile.device]);

  /**
   * Initialize Stripe onboarding flow
   */
  const initializeStripe = useCallback(async () => {
    if (loading) return;
    
    setLoading(true);
    setError(null);
    mobile.triggerFeedback('light');

    try {
      const url = await createAccountLink();
      setStripeUrl(url);
      
      // Set timeout for iframe loading
      timeoutRef.current = setTimeout(() => {
        if (stripeUrl && !error) {
          setError('Loading timeout. Please try again.');
          mobile.triggerFeedback('error');
        }
      }, 15000); // 15 second timeout
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Stripe';
      setError(errorMessage);
      onError(errorMessage);
      mobile.triggerFeedback('error');
      
      // Auto-retry on network errors
      if (retryCount < 3 && errorMessage.includes('Network')) {
        retryTimeoutRef.current = setTimeout(() => {
          setRetryCount(prev => prev + 1);
          initializeStripe();
        }, 2000 * (retryCount + 1)); // Exponential backoff
      }
    } finally {
      setLoading(false);
    }
  }, [loading, createAccountLink, onError, mobile, retryCount, stripeUrl, error]);

  /**
   * Handle iframe load events
   */
  const handleIframeLoad = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    mobile.triggerFeedback('success');
  }, [mobile]);

  /**
   * Handle iframe error events
   */
  const handleIframeError = useCallback(() => {
    setError('Failed to load Stripe Connect. Please check your connection.');
    mobile.triggerFeedback('error');
  }, [mobile]);

  /**
   * Listen for Stripe success/failure messages
   */
  useEffect(() => {
    if (!isOpen) return;

    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security
      if (!event.origin.includes('connect.stripe.com') && 
          !event.origin.includes('js.stripe.com')) {
        return;
      }

      const { type, payload } = event.data || {};

      switch (type) {
        case 'stripe_onboarding_success':
          mobile.triggerFeedback('success');
          onSuccess(payload.accountId);
          break;
          
        case 'stripe_onboarding_error':
          const errorMsg = payload?.error || 'Stripe onboarding failed';
          setError(errorMsg);
          onError(errorMsg);
          mobile.triggerFeedback('error');
          break;
          
        case 'stripe_onboarding_exit':
          // User closed Stripe modal
          onClose();
          break;
          
        case 'stripe_iframe_ready':
          // Iframe is ready and responsive
          handleIframeLoad();
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen, onSuccess, onError, onClose, mobile, handleIframeLoad]);

  /**
   * Initialize when modal opens
   */
  useEffect(() => {
    if (isOpen && !stripeUrl && !loading) {
      initializeStripe();
    }
  }, [isOpen, stripeUrl, loading, initializeStripe]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  /**
   * Handle retry button click
   */
  const handleRetry = () => {
    setStripeUrl(null);
    setError(null);
    setRetryCount(0);
    initializeStripe();
  };

  /**
   * Handle close with confirmation on mobile
   */
  const handleClose = () => {
    if (mobile.device.isMobile && !error && !loading) {
      // Show confirmation on mobile to prevent accidental closure
      const confirmed = window.confirm(
        'Are you sure you want to close? Your progress may be lost.'
      );
      if (!confirmed) return;
    }
    
    mobile.triggerFeedback('light');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className={`mobile-stripe-overlay ${isOpen ? 'visible' : ''}`}
        onClick={handleClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          zIndex: 9999,
          opacity: isOpen ? 1 : 0,
          transition: mobile.shouldReduceAnimations ? 'none' : 'opacity 0.3s ease',
        }}
      />

      {/* Modal */}
      <div
        className={`mobile-stripe-modal ${className}`}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#ffffff',
          zIndex: 10000,
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: mobile.shouldReduceAnimations ? 'none' : 'transform 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
          
          // Safe area support
          paddingTop: mobile.safeArea.top,
          paddingBottom: mobile.safeArea.bottom,
          paddingLeft: mobile.safeArea.left,
          paddingRight: mobile.safeArea.right,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #f3f4f6',
          backgroundColor: '#ffffff',
          position: 'sticky',
          top: mobile.safeArea.top,
          zIndex: 1
        }}>
          <h2 style={{
            fontSize: mobile.device.isMobile ? '18px' : '20px',
            fontWeight: '600',
            color: '#1f2937',
            margin: 0
          }}>
            Payment Setup
          </h2>
          
          <button
            onClick={handleClose}
            {...mobile.getButtonProps('secondary')}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              color: '#6b7280',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '6px',
              minHeight: '40px',
              minWidth: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.2s'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {loading && !stripeUrl ? (
            // Loading state
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              padding: '40px 20px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '3px solid #f3f4f6',
                borderTop: '3px solid #6366f1',
                borderRadius: '50%',
                animation: mobile.shouldReduceAnimations ? 'none' : 'spin 1s linear infinite',
                marginBottom: '16px'
              }} />
              <p style={{
                fontSize: '16px',
                color: '#6b7280',
                textAlign: 'center',
                margin: 0
              }}>
                Setting up your payment account...
              </p>
              {retryCount > 0 && (
                <p style={{
                  fontSize: '14px',
                  color: '#9ca3af',
                  textAlign: 'center',
                  marginTop: '8px'
                }}>
                  Attempt {retryCount + 1} of 4
                </p>
              )}
            </div>
          ) : error ? (
            // Error state
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              padding: '40px 20px',
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: '48px',
                marginBottom: '16px'
              }}>
                ⚠️
              </div>
              <h3 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: '#ef4444',
                margin: '0 0 8px 0'
              }}>
                Connection Failed
              </h3>
              <p style={{
                fontSize: '14px',
                color: '#6b7280',
                marginBottom: '24px',
                lineHeight: '1.5'
              }}>
                {error}
              </p>
              <button
                onClick={handleRetry}
                {...mobile.getButtonProps('primary')}
                style={{
                  backgroundColor: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: mobile.device.isMobile ? '12px 24px' : '10px 20px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  marginBottom: '12px'
                }}
              >
                Try Again
              </button>
              <button
                onClick={handleClose}
                style={{
                  background: 'none',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  padding: mobile.device.isMobile ? '12px 24px' : '10px 20px',
                  fontSize: '14px',
                  color: '#6b7280',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          ) : stripeUrl ? (
            // Stripe iframe
            <iframe
              ref={iframeRef}
              src={stripeUrl}
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                backgroundColor: '#ffffff'
              }}
              title="Stripe Connect Onboarding"
              allow="payment"
              sandbox="allow-scripts allow-forms allow-same-origin allow-top-navigation"
            />
          ) : null}
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .mobile-stripe-overlay {
          backdrop-filter: blur(4px);
        }
        
        .mobile-stripe-modal button:hover {
          background-color: #f9fafb !important;
        }
        
        .mobile-stripe-modal button:active {
          transform: scale(0.98);
        }
        
        @media (max-width: 640px) {
          .mobile-stripe-modal {
            border-radius: 0;
          }
        }
        
        @media (min-width: 768px) {
          .mobile-stripe-modal {
            top: 5vh;
            bottom: 5vh;
            left: 5vw;
            right: 5vw;
            max-width: 600px;
            max-height: 90vh;
            margin: 0 auto;
            border-radius: 16px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          }
        }
      `}</style>
    </>
  );
};

export default MobileStripeModal;