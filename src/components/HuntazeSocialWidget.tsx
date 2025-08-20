'use client';

import React from 'react';
import Link from 'next/link';

interface SocialStats {
  connected_platforms: number;
  total_posts: number;
  scheduled_posts: number;
  last_post_date?: string;
}

interface HuntazeSocialWidgetProps {
  userId: number;
  stats?: SocialStats;
}

/**
 * Widget à intégrer dans le dashboard Huntaze
 * Affiche un résumé des activités Social OS
 */
export default function HuntazeSocialWidget({ userId, stats }: HuntazeSocialWidgetProps) {
  const defaultStats: SocialStats = {
    connected_platforms: 0,
    total_posts: 0,
    scheduled_posts: 0
  };
  
  const displayStats = stats || defaultStats;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Social Publishing</h3>
        <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
          Beta
        </span>
      </div>
      
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {displayStats.connected_platforms}
          </div>
          <div className="text-xs text-gray-500">Platforms</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {displayStats.total_posts}
          </div>
          <div className="text-xs text-gray-500">Total Posts</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {displayStats.scheduled_posts}
          </div>
          <div className="text-xs text-gray-500">Scheduled</div>
        </div>
      </div>
      
      <div className="space-y-3">
        <Link 
          href="/social/schedule"
          className="block w-full text-center bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
        >
          Schedule New Post
        </Link>
        
        <Link 
          href="/social/accounts"
          className="block w-full text-center bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Manage Accounts
        </Link>
      </div>
      
      {displayStats.last_post_date && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Last post: {new Date(displayStats.last_post_date).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}