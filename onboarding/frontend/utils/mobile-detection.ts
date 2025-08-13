/**
 * Mobile Detection and Device Optimization Utilities
 * 
 * Provides device detection, mobile-specific optimizations,
 * and responsive UI adjustments for onboarding flow.
 */

// Device Detection Types
export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  platform: 'ios' | 'android' | 'web';
  screenSize: 'small' | 'medium' | 'large';
  hasTouch: boolean;
  orientation: 'portrait' | 'landscape';
  viewportHeight: number;
  viewportWidth: number;
}

export interface MobileOptimizations {
  useModal: boolean;
  compactLayout: boolean;
  largerButtons: boolean;
  simplifiedForms: boolean;
  biometricAuth: boolean;
  reducedAnimations: boolean;
}

/**
 * Comprehensive device detection
 */
export function detectDevice(): DeviceInfo {
  // User Agent Detection
  const userAgent = navigator.userAgent || '';
  const isMobileUA = /iPhone|Android|webOS|BlackBerry|Windows Phone/i.test(userAgent);
  const isTabletUA = /iPad|Android.*tablet|Kindle/i.test(userAgent);
  
  // Screen Size Detection
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Touch Detection
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // Platform Detection
  let platform: 'ios' | 'android' | 'web' = 'web';
  if (/iPhone|iPad/i.test(userAgent)) {
    platform = 'ios';
  } else if (/Android/i.test(userAgent)) {
    platform = 'android';
  }
  
  // Screen Size Classification
  let screenSize: 'small' | 'medium' | 'large';
  if (viewportWidth < 640) {
    screenSize = 'small';
  } else if (viewportWidth < 1024) {
    screenSize = 'medium';
  } else {
    screenSize = 'large';
  }
  
  // Device Classification
  const isMobile = isMobileUA || (hasTouch && screenWidth < 768);
  const isTablet = isTabletUA || (hasTouch && screenWidth >= 768 && screenWidth < 1024);
  const isDesktop = !isMobile && !isTablet;
  
  // Orientation
  const orientation = viewportHeight > viewportWidth ? 'portrait' : 'landscape';
  
  return {
    isMobile,
    isTablet, 
    isDesktop,
    platform,
    screenSize,
    hasTouch,
    orientation,
    viewportHeight,
    viewportWidth
  };
}

/**
 * Get mobile-specific optimizations based on device
 */
export function getMobileOptimizations(device: DeviceInfo): MobileOptimizations {
  return {
    useModal: device.isMobile || device.screenSize === 'small',
    compactLayout: device.isMobile || device.viewportHeight < 600,
    largerButtons: device.isMobile && device.hasTouch,
    simplifiedForms: device.isMobile || device.screenSize === 'small',
    biometricAuth: device.platform === 'ios' || device.platform === 'android',
    reducedAnimations: device.isMobile && device.viewportHeight < 600
  };
}

/**
 * Detect if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get optimal viewport configuration for mobile
 */
export function getOptimalViewport(device: DeviceInfo): string {
  if (device.isMobile) {
    // Prevent zoom on iOS/Android
    return 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
  } else if (device.isTablet) {
    // Allow zoom on tablets
    return 'width=device-width, initial-scale=1.0, maximum-scale=2.0';
  } else {
    // Standard viewport for desktop
    return 'width=device-width, initial-scale=1.0';
  }
}

/**
 * Safe area detection for notched devices (iPhone X+)
 */
export function getSafeAreaInsets(): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  // Use CSS environment variables if available
  const getEnvVar = (name: string): number => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(`env(${name})`)
      .replace('px', '');
    return parseFloat(value) || 0;
  };

  return {
    top: getEnvVar('safe-area-inset-top'),
    right: getEnvVar('safe-area-inset-right'),
    bottom: getEnvVar('safe-area-inset-bottom'),
    left: getEnvVar('safe-area-inset-left')
  };
}

/**
 * Check if device supports biometric authentication
 */
export async function checkBiometricSupport(): Promise<{
  available: boolean;
  type: 'fingerprint' | 'face' | 'voice' | 'none';
}> {
  // Check for Web Authentication API
  if (!window.PublicKeyCredential) {
    return { available: false, type: 'none' };
  }

  try {
    // Check for platform authenticator (Touch ID, Face ID, etc.)
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    
    if (available) {
      // Try to determine biometric type based on platform
      const device = detectDevice();
      if (device.platform === 'ios') {
        // iOS devices typically have Touch ID or Face ID
        return { available: true, type: 'face' }; // Assume Face ID for modern devices
      } else if (device.platform === 'android') {
        // Android devices typically have fingerprint
        return { available: true, type: 'fingerprint' };
      }
    }
    
    return { available, type: available ? 'fingerprint' : 'none' };
  } catch (error) {
    console.warn('Biometric support check failed:', error);
    return { available: false, type: 'none' };
  }
}

/**
 * Keyboard detection for mobile devices
 */
export function setupVirtualKeyboardHandling(): {
  cleanup: () => void;
} {
  let initialViewportHeight = window.innerHeight;
  
  const handleResize = () => {
    const currentHeight = window.innerHeight;
    const heightDifference = initialViewportHeight - currentHeight;
    
    // Keyboard is likely open if height decreased significantly (>150px)
    const keyboardOpen = heightDifference > 150;
    
    // Emit custom event
    const event = new CustomEvent('virtualKeyboard', {
      detail: {
        open: keyboardOpen,
        height: keyboardOpen ? heightDifference : 0
      }
    });
    window.dispatchEvent(event);
  };
  
  // Listen for resize events
  window.addEventListener('resize', handleResize);
  
  // Also listen for visual viewport changes (more accurate on iOS)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize);
  }
  
  return {
    cleanup: () => {
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      }
    }
  };
}

/**
 * Optimize touch interactions for better mobile UX
 */
export function optimizeTouchInteractions(element: HTMLElement): {
  cleanup: () => void;
} {
  // Prevent 300ms tap delay on mobile
  element.style.touchAction = 'manipulation';
  
  // Add visual feedback for touch interactions
  let touchTimeout: NodeJS.Timeout;
  
  const handleTouchStart = (e: TouchEvent) => {
    element.classList.add('touch-active');
    
    // Clear any existing timeout
    if (touchTimeout) {
      clearTimeout(touchTimeout);
    }
  };
  
  const handleTouchEnd = () => {
    // Remove touch feedback after a short delay
    touchTimeout = setTimeout(() => {
      element.classList.remove('touch-active');
    }, 150);
  };
  
  const handleTouchCancel = () => {
    element.classList.remove('touch-active');
    if (touchTimeout) {
      clearTimeout(touchTimeout);
    }
  };
  
  // Add event listeners
  element.addEventListener('touchstart', handleTouchStart, { passive: true });
  element.addEventListener('touchend', handleTouchEnd, { passive: true });
  element.addEventListener('touchcancel', handleTouchCancel, { passive: true });
  
  return {
    cleanup: () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchCancel);
      if (touchTimeout) {
        clearTimeout(touchTimeout);
      }
    }
  };
}

/**
 * Network quality detection for mobile optimization
 */
export function detectNetworkQuality(): {
  effectiveType: '2g' | '3g' | '4g' | 'unknown';
  downlink: number;
  rtt: number;
} {
  // Use Network Information API if available
  const connection = (navigator as any).connection || 
                     (navigator as any).mozConnection || 
                     (navigator as any).webkitConnection;
  
  if (connection) {
    return {
      effectiveType: connection.effectiveType || 'unknown',
      downlink: connection.downlink || 0,
      rtt: connection.rtt || 0
    };
  }
  
  // Fallback: estimate based on timing
  return {
    effectiveType: 'unknown',
    downlink: 0,
    rtt: 0
  };
}

/**
 * Create mobile-optimized Stripe Connect configuration
 */
export function getMobileStripeConfig(device: DeviceInfo): {
  appearance: any;
  layout: string;
  redirectBehavior: 'modal' | 'redirect';
} {
  const config = {
    appearance: {
      theme: 'stripe' as const,
      variables: {},
      rules: {}
    },
    layout: 'tabs' as const,
    redirectBehavior: 'redirect' as 'modal' | 'redirect'
  };
  
  if (device.isMobile) {
    // Mobile-specific optimizations
    config.appearance.variables = {
      colorPrimary: '#6366f1',
      borderRadius: '8px',
      spacingUnit: '6px',
      fontSizeBase: '16px', // Prevent zoom on iOS
      fontWeightNormal: '400',
      fontWeightMedium: '500'
    };
    
    config.appearance.rules = {
      '.Input': {
        fontSize: '16px', // Prevent zoom on iOS
        padding: '12px'   // Larger touch targets
      },
      '.Button': {
        fontSize: '16px',
        padding: '14px 24px',
        minHeight: '44px'  // Apple HIG minimum
      }
    };
    
    config.layout = 'accordion'; // Better for small screens
    config.redirectBehavior = device.screenSize === 'small' ? 'modal' : 'redirect';
  }
  
  return config;
}

/**
 * Haptic feedback for supported devices
 */
export function triggerHapticFeedback(
  type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light'
): void {
  // Check for Haptic Feedback API (iOS Safari)
  if ('Haptics' in window && (window as any).Haptics) {
    try {
      const haptics = (window as any).Haptics;
      
      switch (type) {
        case 'light':
          haptics.notification({ type: 'light' });
          break;
        case 'medium':
          haptics.impact({ style: 'medium' });
          break;
        case 'heavy':
          haptics.impact({ style: 'heavy' });
          break;
        case 'success':
          haptics.notification({ type: 'success' });
          break;
        case 'warning':
          haptics.notification({ type: 'warning' });
          break;
        case 'error':
          haptics.notification({ type: 'error' });
          break;
      }
    } catch (error) {
      console.warn('Haptic feedback not available:', error);
    }
  }
  
  // Fallback: Use Vibration API if available
  if ('vibrate' in navigator) {
    const patterns = {
      light: [10],
      medium: [20],
      heavy: [30],
      success: [10, 50, 10],
      warning: [20, 100, 20],
      error: [50, 100, 50]
    };
    
    navigator.vibrate(patterns[type] || patterns.light);
  }
}