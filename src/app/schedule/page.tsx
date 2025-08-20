'use client';

import React, { useState, useEffect } from 'react';
import ConnectAccountModal from '@/components/ConnectAccountModal';

interface Account {
  id: number;
  platform: string;
  username: string;
  is_expired: boolean;
}

interface Post {
  id: number;
  platform: string;
  caption: string;
  status: string;
  scheduled_at: string;
  external_post_url?: string;
  error_message?: string;
}

export default function SchedulePage() {
  // TODO: Get from auth context
  const userId = 1;
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState('reddit');
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Reddit specific
  const [subreddit, setSubreddit] = useState('test');
  const [title, setTitle] = useState('');
  
  useEffect(() => {
    fetchAccounts();
    fetchPosts();
  }, []);
  
  const fetchAccounts = async () => {
    try {
      const res = await fetch(`/api/social/accounts?user_id=${userId}`);
      const data = await res.json();
      if (data.success) {
        setAccounts(data.accounts);
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  };
  
  const fetchPosts = async () => {
    try {
      const res = await fetch(`/api/social/publish?user_id=${userId}&limit=10`);
      const data = await res.json();
      if (data.success) {
        setPosts(data.posts);
      }
    } catch (error) {
      console.error('Failed to fetch posts:', error);
    }
  };
  
  const handlePublish = async (immediate = true) => {
    setError('');
    setSuccess('');
    setIsPublishing(true);
    
    try {
      const body: any = {
        user_id: userId,
        platform: selectedPlatform,
        caption,
        media_url: mediaUrl || undefined,
        platform_specific: {}
      };
      
      if (!immediate && scheduleDate) {
        body.scheduled_at = new Date(scheduleDate).toISOString();
      }
      
      if (selectedPlatform === 'reddit') {
        body.platform_specific = {
          subreddit,
          title
        };
      }
      
      const res = await fetch('/api/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSuccess(immediate ? 'Post publié avec succès!' : 'Post planifié avec succès!');
        setCaption('');
        setMediaUrl('');
        setTitle('');
        setScheduleDate('');
        fetchPosts();
      } else {
        setError(data.message || 'Erreur lors de la publication');
      }
    } catch (error: any) {
      setError(error.message || 'Erreur lors de la publication');
    } finally {
      setIsPublishing(false);
    }
  };
  
  const getStatusBadge = (status: string) => {
    const badges = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      RUNNING: 'bg-blue-100 text-blue-800',
      SUCCEEDED: 'bg-green-100 text-green-800',
      FAILED: 'bg-red-100 text-red-800'
    };
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800';
  };
  
  const platformAccounts = accounts.filter(a => a.platform === selectedPlatform);
  const hasAccount = platformAccounts.length > 0 && !platformAccounts[0].is_expired;
  
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Planification des posts
        </h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Composer */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-6">Créer un post</h2>
            
            {/* Platform selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Plateforme
              </label>
              <div className="flex gap-2">
                {['reddit', 'instagram', 'tiktok'].map(platform => (
                  <button
                    key={platform}
                    onClick={() => setSelectedPlatform(platform)}
                    className={`
                      px-4 py-2 rounded-lg font-medium capitalize transition-all
                      ${selectedPlatform === platform
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }
                      ${platform !== 'reddit' ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                    disabled={platform !== 'reddit'}
                  >
                    {platform}
                    {platform !== 'reddit' && <span className="text-xs ml-1">(bientôt)</span>}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Account check */}
            {!hasAccount && (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 mb-2">
                  Vous devez connecter un compte {selectedPlatform} pour publier
                </p>
                <button
                  onClick={() => setShowConnectModal(true)}
                  className="text-sm font-medium text-yellow-800 underline hover:no-underline"
                >
                  Connecter un compte →
                </button>
              </div>
            )}
            
            {/* Reddit specific fields */}
            {selectedPlatform === 'reddit' && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subreddit
                  </label>
                  <input
                    type="text"
                    value={subreddit}
                    onChange={(e) => setSubreddit(e.target.value)}
                    placeholder="test"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Titre
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Mon titre accrocheur"
                    maxLength={300}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </>
            )}
            
            {/* Caption */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {selectedPlatform === 'reddit' ? 'Contenu' : 'Légende'}
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                placeholder="Écrivez votre message..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
            
            {/* Media URL (optional for Reddit) */}
            {(selectedPlatform === 'reddit' || selectedPlatform === 'instagram' || selectedPlatform === 'tiktok') && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL du média {selectedPlatform === 'reddit' ? '(optionnel)' : ''}
                </label>
                <input
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
            
            {/* Schedule */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Planifier pour plus tard (optionnel)
              </label>
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* Error/Success messages */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {error}
              </div>
            )}
            
            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                {success}
              </div>
            )}
            
            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => handlePublish(true)}
                disabled={!hasAccount || isPublishing || !caption || (selectedPlatform === 'reddit' && !title)}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isPublishing ? 'Publication...' : 'Publier maintenant'}
              </button>
              
              <button
                onClick={() => handlePublish(false)}
                disabled={!hasAccount || isPublishing || !caption || !scheduleDate || (selectedPlatform === 'reddit' && !title)}
                className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Planifier
              </button>
            </div>
          </div>
          
          {/* Recent posts */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-6">Posts récents</h2>
            
            <div className="space-y-4">
              {posts.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  Aucun post pour le moment
                </p>
              ) : (
                posts.map(post => (
                  <div key={post.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">
                          {post.platform}
                        </span>
                        <span className={`ml-2 text-xs px-2 py-1 rounded-full ${getStatusBadge(post.status)}`}>
                          {post.status}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(post.scheduled_at).toLocaleString()}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-700 line-clamp-2 mb-2">
                      {post.caption}
                    </p>
                    
                    {post.external_post_url && (
                      <a
                        href={post.external_post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Voir le post →
                      </a>
                    )}
                    
                    {post.error_message && (
                      <p className="text-xs text-red-600 mt-1">
                        Erreur: {post.error_message}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      
      <ConnectAccountModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        userId={userId}
        onAccountConnected={() => {
          fetchAccounts();
          setShowConnectModal(false);
        }}
      />
    </div>
  );
}