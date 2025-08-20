'use client';

import React, { useState } from 'react';

interface ConnectAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: number;
  onAccountConnected?: () => void;
}

const platforms = [
  {
    id: 'reddit',
    name: 'Reddit',
    icon: '🔴',
    description: 'Post to your favorite subreddits',
    color: 'bg-orange-500',
    available: true
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: '📷',
    description: 'Share Reels and Stories',
    color: 'bg-gradient-to-r from-purple-500 to-pink-500',
    available: true
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: '🎵',
    description: 'Create viral videos',
    color: 'bg-black',
    available: true
  }
];

export default function ConnectAccountModal({
  isOpen,
  onClose,
  userId,
  onAccountConnected
}: ConnectAccountModalProps) {
  const [connecting, setConnecting] = useState<string | null>(null);
  
  if (!isOpen) return null;
  
  const handleConnect = async (platformId: string) => {
    setConnecting(platformId);
    
    try {
      // Redirect to OAuth flow
      // userId is now optional - gets from session
      window.location.href = `/api/social/auth/${platformId}`;
    } catch (error) {
      console.error('Failed to initiate connection:', error);
      setConnecting(null);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              Connect a social account
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Connect your accounts to publish automatically
          </p>
        </div>
        
        {/* Platforms */}
        <div className="p-6 space-y-4">
          {platforms.map((platform) => (
            <div
              key={platform.id}
              className={`
                border rounded-lg p-4 transition-all
                ${platform.available 
                  ? 'border-gray-200 hover:border-gray-300 cursor-pointer' 
                  : 'border-gray-100 opacity-60 cursor-not-allowed'
                }
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className={`
                    w-12 h-12 rounded-lg flex items-center justify-center text-2xl
                    ${platform.color} ${platform.available ? '' : 'opacity-50'}
                  `}>
                    <span className="filter drop-shadow">{platform.icon}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      {platform.name}
                    </h3>
                    <p className="text-sm text-gray-600">{platform.description}</p>
                  </div>
                </div>
                
                {platform.available && (
                  <button
                    onClick={() => handleConnect(platform.id)}
                    disabled={connecting === platform.id}
                    className={`
                      px-4 py-2 rounded-lg font-medium text-white transition-all
                      ${platform.color}
                      ${connecting === platform.id 
                        ? 'opacity-50 cursor-not-allowed' 
                        : 'hover:opacity-90'
                      }
                    `}
                  >
                    {connecting === platform.id ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Connecting...
                      </span>
                    ) : (
                      'Connect'
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 rounded-b-xl">
          <p className="text-xs text-gray-500 text-center">
            Your data is encrypted and secure. You can disconnect your accounts at any time.
          </p>
        </div>
      </div>
    </div>
  );
}