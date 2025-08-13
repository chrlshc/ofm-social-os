/**
 * React Hook for Mobile Optimization
 * 
 * Provides mobile-specific optimizations and responsive behavior
 * for onboarding components with automatic device detection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  detectDevice,
  getMobileOptimizations,
  getSafeAreaInsets,
  checkBiometricSupport,
  setupVirtualKeyboardHandling,
  optimizeTouchInteractions,
  detectNetworkQuality,
  triggerHapticFeedback,
  type DeviceInfo,
  type MobileOptimizations
} from '../utils/mobile-detection';

interface BiometricInfo {
  available: boolean;
  type: 'fingerprint' | 'face' | 'voice' | 'none';
}

interface NetworkInfo {
  effectiveType: '2g' | '3g' | '4g' | 'unknown';
  downlink: number;
  rtt: number;
}

interface KeyboardState {
  isOpen: boolean;
  height: number;
}

interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface MobileOptimizationHook {
  // Device Information
  device: DeviceInfo;
  optimizations: MobileOptimizations;
  safeArea: SafeAreaInsets;
  
  // Capabilities
  biometric: BiometricInfo;
  network: NetworkInfo;
  
  // State
  keyboard: KeyboardState;
  orientation: 'portrait' | 'landscape';
  
  // Actions
  triggerFeedback: (type?: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') => void;
  optimizeElement: (element: HTMLElement | null) => void;
  
  // Utilities
  isSlowNetwork: boolean;
  shouldReduceAnimations: boolean;
  recommendedInputType: string;
}

/**
 * Mobile Optimization Hook
 */
export function useMobileOptimization(): MobileOptimizationHook {
  // Device detection state
  const [device, setDevice] = useState<DeviceInfo>(() => detectDevice());
  const [optimizations, setOptimizations] = useState<MobileOptimizations>(() => 
    getMobileOptimizations(device)
  );
  const [safeArea, setSafeArea] = useState<SafeAreaInsets>(() => getSafeAreaInsets());
  
  // Capabilities state
  const [biometric, setBiometric] = useState<BiometricInfo>({
    available: false,
    type: 'none'
  });
  const [network, setNetwork] = useState<NetworkInfo>(() => detectNetworkQuality());
  
  // Interactive state
  const [keyboard, setKeyboard] = useState<KeyboardState>({
    isOpen: false,
    height: 0
  });
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(device.orientation);
  
  // Cleanup refs
  const keyboardCleanupRef = useRef<(() => void) | null>(null);
  const touchCleanupRef = useRef<(() => void) | null>(null);
  
  // Initialize device detection and capabilities
  useEffect(() => {
    let mounted = true;
    
    // Check biometric support
    checkBiometricSupport().then(biometricInfo => {
      if (mounted) {
        setBiometric(biometricInfo);
      }
    });
    
    // Setup keyboard handling
    const keyboardHandler = setupVirtualKeyboardHandling();
    keyboardCleanupRef.current = keyboardHandler.cleanup;
    
    // Listen for virtual keyboard events
    const handleKeyboardChange = (event: CustomEvent) => {
      if (mounted) {
        setKeyboard({
          isOpen: event.detail.open,
          height: event.detail.height
        });
      }
    };
    
    window.addEventListener('virtualKeyboard', handleKeyboardChange as EventListener);
    
    return () => {
      mounted = false;
      keyboardCleanupRef.current?.();
      window.removeEventListener('virtualKeyboard', handleKeyboardChange as EventListener);
    };
  }, []);
  
  // Handle orientation and resize changes
  useEffect(() => {
    const handleResize = () => {
      const newDevice = detectDevice();
      setDevice(newDevice);
      setOptimizations(getMobileOptimizations(newDevice));
      setOrientation(newDevice.orientation);
      setSafeArea(getSafeAreaInsets());
    };
    
    const handleOrientationChange = () => {
      // Delay to ensure dimensions are updated
      setTimeout(handleResize, 100);
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);
  
  // Network monitoring
  useEffect(() => {
    const updateNetworkInfo = () => {
      setNetwork(detectNetworkQuality());
    };
    
    // Listen for network changes
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connection?.addEventListener('change', updateNetworkInfo);
      
      return () => {
        connection?.removeEventListener('change', updateNetworkInfo);
      };
    }
  }, []);
  
  // Haptic feedback function
  const triggerFeedback = useCallback((
    type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light'
  ) => {
    if (device.isMobile && device.hasTouch) {
      triggerHapticFeedback(type);
    }
  }, [device.isMobile, device.hasTouch]);
  
  // Touch optimization function
  const optimizeElement = useCallback((element: HTMLElement | null) => {
    // Cleanup previous element
    touchCleanupRef.current?.();
    
    if (element && device.hasTouch) {
      const touchHandler = optimizeTouchInteractions(element);
      touchCleanupRef.current = touchHandler.cleanup;
    }
  }, [device.hasTouch]);
  
  // Computed values
  const isSlowNetwork = network.effectiveType === '2g' || network.effectiveType === '3g';
  const shouldReduceAnimations = optimizations.reducedAnimations || 
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  // Recommended input type based on device
  const recommendedInputType = device.isMobile ? 
    (device.platform === 'ios' ? 'email' : 'text') : 'text';
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      keyboardCleanupRef.current?.();
      touchCleanupRef.current?.();
    };
  }, []);
  
  return {
    // Device Information
    device,
    optimizations,
    safeArea,
    
    // Capabilities
    biometric,
    network,
    
    // State
    keyboard,
    orientation,
    
    // Actions
    triggerFeedback,
    optimizeElement,
    
    // Utilities
    isSlowNetwork,
    shouldReduceAnimations,
    recommendedInputType
  };
}

/**
 * Hook for mobile-specific form optimizations
 */
export function useMobileFormOptimization() {
  const mobile = useMobileOptimization();
  
  const getInputProps = useCallback((type: 'email' | 'password' | 'text' | 'tel') => {
    const baseProps = {
      autoComplete: 'off',
      autoCapitalize: 'none',
      autoCorrect: 'off',
      spellCheck: false
    };
    
    if (mobile.device.isMobile) {
      return {
        ...baseProps,
        style: {
          fontSize: '16px', // Prevent zoom on iOS
          ...(mobile.optimizations.largerButtons && {
            minHeight: '44px',
            padding: '12px 16px'
          })
        },
        onFocus: () => mobile.triggerFeedback('light'),
        ...(type === 'email' && {
          inputMode: 'email' as const,
          type: 'email'
        }),
        ...(type === 'tel' && {
          inputMode: 'tel' as const,
          type: 'tel'
        })
      };
    }
    
    return baseProps;
  }, [mobile]);
  
  const getButtonProps = useCallback((variant: 'primary' | 'secondary' = 'primary') => {
    const baseProps = {
      style: {}
    };
    
    if (mobile.device.isMobile) {
      baseProps.style = {
        minHeight: '44px', // Apple HIG minimum
        fontSize: '16px',
        padding: '12px 24px',
        touchAction: 'manipulation',
        ...(variant === 'primary' && {
          boxShadow: '0 2px 8px rgba(99, 102, 241, 0.2)'
        })
      };
      
      // Add haptic feedback on click
      const originalOnClick = baseProps.onClick;
      baseProps.onClick = (e) => {
        mobile.triggerFeedback(variant === 'primary' ? 'medium' : 'light');
        originalOnClick?.(e);
      };
    }
    
    return baseProps;
  }, [mobile]);
  
  return {
    ...mobile,
    getInputProps,
    getButtonProps
  };
}