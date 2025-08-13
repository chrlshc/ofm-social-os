/**
 * Mobile-Optimized Onboarding Flow Component
 * 
 * Provides a mobile-first onboarding experience with:
 * - Responsive step navigation
 * - Touch-optimized interactions
 * - Biometric authentication support
 * - Virtual keyboard handling
 * - Progressive Web App features
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useMobileFormOptimization } from '../hooks/useMobileOptimization';

// Types
interface OnboardingStep {
  id: string;
  title: string;
  description?: string;
  component: React.ComponentType<any>;
  optional?: boolean;
  mobileOptimized?: boolean;
}

interface OnboardingFlowProps {
  initialStep?: string;
  onComplete?: (data: any) => void;
  onStepChange?: (step: string) => void;
  className?: string;
}

interface StepData {
  registration?: {
    email: string;
    password: string;
  };
  verification?: {
    token: string;
    verified: boolean;
  };
  terms?: {
    accepted: boolean;
    version: string;
  };
  stripe?: {
    accountId: string;
    completed: boolean;
  };
}

/**
 * Mobile Registration Step Component
 */
const MobileRegistrationStep: React.FC<{
  onNext: (data: any) => void;
  onBack?: () => void;
}> = ({ onNext, onBack }) => {
  const mobile = useMobileFormOptimization();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      mobile.triggerFeedback('error');
      return;
    }
    
    setLoading(true);
    mobile.triggerFeedback('medium');
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      mobile.triggerFeedback('success');
      onNext({
        email: formData.email,
        password: formData.password
      });
    } catch (error) {
      mobile.triggerFeedback('error');
      setErrors({ submit: 'Registration failed. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="mobile-registration-step">
      {/* Header */}
      <div className="step-header" style={{
        paddingTop: mobile.safeArea.top || 16,
        paddingBottom: 24,
        textAlign: 'center'
      }}>
        <h1 style={{
          fontSize: mobile.device.isMobile ? '24px' : '32px',
          fontWeight: '600',
          margin: '0 0 8px 0',
          color: '#1f2937'
        }}>
          Create Your Account
        </h1>
        <p style={{
          fontSize: '16px',
          color: '#6b7280',
          margin: 0
        }}>
          Join thousands of creators earning more
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{
        padding: mobile.device.isMobile ? '0 20px' : '0 32px',
        maxWidth: '400px',
        margin: '0 auto'
      }}>
        {/* Email Input */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '6px'
          }}>
            Email Address
          </label>
          <input
            {...mobile.getInputProps('email')}
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            placeholder="your@email.com"
            style={{
              width: '100%',
              border: errors.email ? '2px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '8px',
              padding: mobile.device.isMobile ? '12px 16px' : '10px 12px',
              fontSize: '16px', // Prevent iOS zoom
              backgroundColor: '#ffffff',
              transition: 'border-color 0.2s',
              ...(mobile.device.isMobile && {
                minHeight: '44px'
              })
            }}
          />
          {errors.email && (
            <p style={{
              color: '#ef4444',
              fontSize: '14px',
              margin: '4px 0 0 0'
            }}>
              {errors.email}
            </p>
          )}
        </div>

        {/* Password Input */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '6px'
          }}>
            Password
          </label>
          <input
            {...mobile.getInputProps('password')}
            type="password"
            value={formData.password}
            onChange={(e) => handleInputChange('password', e.target.value)}
            placeholder="At least 8 characters"
            style={{
              width: '100%',
              border: errors.password ? '2px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '8px',
              padding: mobile.device.isMobile ? '12px 16px' : '10px 12px',
              fontSize: '16px',
              backgroundColor: '#ffffff',
              transition: 'border-color 0.2s',
              ...(mobile.device.isMobile && {
                minHeight: '44px'
              })
            }}
          />
          {errors.password && (
            <p style={{
              color: '#ef4444',
              fontSize: '14px',
              margin: '4px 0 0 0'
            }}>
              {errors.password}
            </p>
          )}
        </div>

        {/* Confirm Password Input */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '6px'
          }}>
            Confirm Password
          </label>
          <input
            {...mobile.getInputProps('password')}
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
            placeholder="Confirm your password"
            style={{
              width: '100%',
              border: errors.confirmPassword ? '2px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '8px',
              padding: mobile.device.isMobile ? '12px 16px' : '10px 12px',
              fontSize: '16px',
              backgroundColor: '#ffffff',
              transition: 'border-color 0.2s',
              ...(mobile.device.isMobile && {
                minHeight: '44px'
              })
            }}
          />
          {errors.confirmPassword && (
            <p style={{
              color: '#ef4444',
              fontSize: '14px',
              margin: '4px 0 0 0'
            }}>
              {errors.confirmPassword}
            </p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          {...mobile.getButtonProps('primary')}
          style={{
            width: '100%',
            backgroundColor: loading ? '#9ca3af' : '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            ...(mobile.device.isMobile ? {
              minHeight: '48px',
              fontSize: '16px',
              padding: '12px 24px'
            } : {
              height: '44px',
              fontSize: '14px',
              padding: '10px 20px'
            })
          }}
        >
          {loading ? (
            <>
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid transparent',
                borderTop: '2px solid currentColor',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              Creating Account...
            </>
          ) : (
            'Create Account'
          )}
        </button>

        {errors.submit && (
          <p style={{
            color: '#ef4444',
            fontSize: '14px',
            textAlign: 'center',
            margin: '16px 0 0 0'
          }}>
            {errors.submit}
          </p>
        )}
      </form>

      {/* Footer */}
      <div style={{
        textAlign: 'center',
        padding: '24px 20px',
        paddingBottom: mobile.safeArea.bottom || 20,
        fontSize: '14px',
        color: '#6b7280'
      }}>
        Already have an account?{' '}
        <button
          onClick={() => {/* Handle sign in */}}
          style={{
            background: 'none',
            border: 'none',
            color: '#6366f1',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontSize: 'inherit'
          }}
        >
          Sign in
        </button>
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .mobile-registration-step input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
        }
        
        .mobile-registration-step button:hover:not(:disabled) {
          background-color: #5855eb !important;
        }
        
        .mobile-registration-step button:active {
          transform: scale(0.98);
        }
        
        @media (max-width: 640px) {
          .mobile-registration-step {
            padding: 0;
          }
        }
      `}</style>
    </div>
  );
};

/**
 * Mobile Stripe Connect Step Component
 */
const MobileStripeStep: React.FC<{
  onNext: (data: any) => void;
  onBack?: () => void;
}> = ({ onNext, onBack }) => {
  const mobile = useMobileFormOptimization();
  const [loading, setLoading] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);

  const handleStripeOnboarding = async () => {
    setLoading(true);
    mobile.triggerFeedback('medium');

    try {
      // Get mobile-optimized Stripe configuration
      const stripeConfig = {
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#6366f1',
            borderRadius: '8px',
            fontSizeBase: '16px', // Prevent iOS zoom
          }
        },
        ...(mobile.device.isMobile && {
          layout: 'accordion',
          redirectBehavior: 'modal'
        })
      };

      // Simulate Stripe onboarding
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      mobile.triggerFeedback('success');
      onNext({
        accountId: 'acct_mock123',
        completed: true
      });
    } catch (error) {
      mobile.triggerFeedback('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mobile-stripe-step" style={{
      padding: mobile.device.isMobile ? '20px' : '32px',
      textAlign: 'center',
      paddingTop: mobile.safeArea.top || 20,
      paddingBottom: mobile.safeArea.bottom || 20
    }}>
      <div style={{
        maxWidth: '400px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            backgroundColor: '#6366f1',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            fontSize: '24px'
          }}>
            💳
          </div>
          <h2 style={{
            fontSize: mobile.device.isMobile ? '24px' : '28px',
            fontWeight: '600',
            color: '#1f2937',
            margin: '0 0 8px 0'
          }}>
            Set Up Payments
          </h2>
          <p style={{
            fontSize: '16px',
            color: '#6b7280',
            margin: 0,
            lineHeight: '1.5'
          }}>
            Complete your payment setup to start earning. We use Stripe for secure, fast payments.
          </p>
        </div>

        {/* Benefits */}
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '32px',
          textAlign: 'left'
        }}>
          <h3 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#1f2937',
            margin: '0 0 12px 0'
          }}>
            Why Stripe?
          </h3>
          <ul style={{
            margin: 0,
            padding: '0 0 0 16px',
            fontSize: '14px',
            color: '#4b5563',
            lineHeight: '1.6'
          }}>
            <li>Instant payouts to your bank account</li>
            <li>Industry-leading security & fraud protection</li>
            <li>No hidden fees - transparent pricing</li>
            <li>24/7 customer support</li>
          </ul>
        </div>

        {/* Action Button */}
        <button
          onClick={handleStripeOnboarding}
          disabled={loading}
          {...mobile.getButtonProps('primary')}
          style={{
            width: '100%',
            backgroundColor: loading ? '#9ca3af' : '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '16px',
            ...(mobile.device.isMobile ? {
              minHeight: '48px',
              fontSize: '16px',
              padding: '12px 24px'
            } : {
              height: '44px',
              fontSize: '14px',
              padding: '10px 20px'
            })
          }}
        >
          {loading ? (
            <>
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid transparent',
                borderTop: '2px solid currentColor',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              Setting Up...
            </>
          ) : (
            <>
              <span>Complete Payment Setup</span>
              <span style={{ fontSize: '18px' }}>→</span>
            </>
          )}
        </button>

        {/* Back Button */}
        {onBack && (
          <button
            onClick={onBack}
            disabled={loading}
            style={{
              background: 'none',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '10px 20px',
              width: '100%'
            }}
          >
            Back
          </button>
        )}

        {/* Footer */}
        <p style={{
          fontSize: '12px',
          color: '#9ca3af',
          margin: '24px 0 0 0',
          lineHeight: '1.4'
        }}>
          Your information is secured with bank-level encryption.
          <br />
          Powered by Stripe.
        </p>
      </div>
    </div>
  );
};

/**
 * Main Mobile Onboarding Flow Component
 */
export const MobileOnboardingFlow: React.FC<OnboardingFlowProps> = ({
  initialStep = 'registration',
  onComplete,
  onStepChange,
  className = ''
}) => {
  const mobile = useMobileFormOptimization();
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [stepData, setStepData] = useState<StepData>({});
  const [progress, setProgress] = useState(0);

  // Define onboarding steps
  const steps: OnboardingStep[] = [
    {
      id: 'registration',
      title: 'Create Account',
      component: MobileRegistrationStep,
      mobileOptimized: true
    },
    {
      id: 'verification',
      title: 'Verify Email',
      description: 'Check your email for verification link',
      component: ({ onNext }) => (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <h2>Check Your Email</h2>
          <p>We've sent a verification link to your email address.</p>
          <button onClick={() => onNext({ verified: true })}>
            I've Verified My Email
          </button>
        </div>
      )
    },
    {
      id: 'terms',
      title: 'Accept Terms',
      component: ({ onNext }) => (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <h2>Terms & Conditions</h2>
          <p>Please review and accept our terms to continue.</p>
          <button onClick={() => onNext({ accepted: true, version: 'v1.0' })}>
            Accept Terms
          </button>
        </div>
      )
    },
    {
      id: 'stripe',
      title: 'Payment Setup',
      component: MobileStripeStep,
      mobileOptimized: true
    }
  ];

  // Calculate progress
  useEffect(() => {
    const currentIndex = steps.findIndex(step => step.id === currentStep);
    const progressPercent = ((currentIndex + 1) / steps.length) * 100;
    setProgress(progressPercent);
  }, [currentStep]);

  // Handle step navigation
  const handleStepComplete = useCallback((data: any) => {
    // Update step data
    setStepData(prev => ({
      ...prev,
      [currentStep]: data
    }));

    // Find next step
    const currentIndex = steps.findIndex(step => step.id === currentStep);
    const nextStep = steps[currentIndex + 1];

    if (nextStep) {
      setCurrentStep(nextStep.id);
      onStepChange?.(nextStep.id);
      mobile.triggerFeedback('success');
    } else {
      // Onboarding complete
      const completeData = {
        ...stepData,
        [currentStep]: data
      };
      onComplete?.(completeData);
      mobile.triggerFeedback('success');
    }
  }, [currentStep, stepData, onComplete, onStepChange, mobile]);

  const handleStepBack = useCallback(() => {
    const currentIndex = steps.findIndex(step => step.id === currentStep);
    const prevStep = steps[currentIndex - 1];

    if (prevStep) {
      setCurrentStep(prevStep.id);
      onStepChange?.(prevStep.id);
      mobile.triggerFeedback('light');
    }
  }, [currentStep, onStepChange, mobile]);

  // Get current step component
  const currentStepData = steps.find(step => step.id === currentStep);
  const StepComponent = currentStepData?.component;

  return (
    <div className={`mobile-onboarding-flow ${className}`} style={{
      minHeight: '100vh',
      backgroundColor: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      ...(mobile.device.isMobile && {
        paddingTop: mobile.safeArea.top,
        paddingBottom: mobile.safeArea.bottom
      })
    }}>
      {/* Progress Bar */}
      <div style={{
        position: 'sticky',
        top: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        padding: '16px 20px 12px',
        borderBottom: '1px solid #f3f4f6',
        zIndex: 10
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px'
        }}>
          <h1 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: '#1f2937',
            margin: 0
          }}>
            {currentStepData?.title}
          </h1>
          <span style={{
            fontSize: '14px',
            color: '#6b7280'
          }}>
            {steps.findIndex(s => s.id === currentStep) + 1} of {steps.length}
          </span>
        </div>
        
        {/* Progress bar */}
        <div style={{
          width: '100%',
          height: '4px',
          backgroundColor: '#f3f4f6',
          borderRadius: '2px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            backgroundColor: '#6366f1',
            borderRadius: '2px',
            transition: mobile.shouldReduceAnimations ? 'none' : 'width 0.3s ease'
          }} />
        </div>
      </div>

      {/* Step Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {StepComponent && (
          <StepComponent
            onNext={handleStepComplete}
            onBack={steps.findIndex(s => s.id === currentStep) > 0 ? handleStepBack : undefined}
          />
        )}
      </div>
    </div>
  );
};

export default MobileOnboardingFlow;