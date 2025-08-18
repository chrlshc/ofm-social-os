'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function DemoPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [videoUploaded, setVideoUploaded] = useState(false);

  const handleTikTokLogin = () => {
    // Simulate TikTok OAuth flow
    setTimeout(() => {
      setIsConnected(true);
    }, 1500);
  };

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleVideoUpload = () => {
    setIsUploading(true);
    setTimeout(() => {
      setIsUploading(false);
      setVideoUploaded(true);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent mb-4">
            Huntaze TikTok Integration Demo
          </h1>
          <p className="text-gray-600">Content Posting API & Login Kit Demonstration</p>
        </div>

        {/* Step 1: Connect TikTok */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold mb-4">Step 1: Connect Your TikTok Account</h2>
          
          {!isConnected ? (
            <div className="space-y-4">
              <p className="text-gray-600">Click the button below to connect your TikTok account using OAuth 2.0</p>
              <button
                onClick={handleTikTokLogin}
                className="bg-black text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-gray-800 transition"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                </svg>
                Continue with TikTok
              </button>
              <p className="text-xs text-gray-500">
                Scopes requested: user.info.basic, video.upload, video.publish
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full"></div>
                <div>
                  <p className="font-semibold">@demo_creator</p>
                  <p className="text-sm text-gray-500">Successfully connected</p>
                </div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-green-700 text-sm">✓ TikTok account connected successfully</p>
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Upload Video */}
        {isConnected && (
          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-bold mb-4">Step 2: Upload and Publish Video</h2>
            
            {!videoUploaded ? (
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-gray-600 mb-2">Select a video to upload</p>
                  <p className="text-sm text-gray-500 mb-4">MP4, MOV up to 500MB</p>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    id="video-upload"
                    onChange={handleFileSelect}
                  />
                  <label
                    htmlFor="video-upload"
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-purple-700 transition inline-block"
                  >
                    Choose Video
                  </label>
                  {selectedFile && (
                    <p className="mt-2 text-sm text-gray-600">
                      Selected: {selectedFile.name}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Caption</label>
                    <textarea
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      rows={3}
                      placeholder="Add a caption for your video..."
                      defaultValue="Check out my latest content! Created with @huntaze #ContentCreator #TikTok"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="draft" className="rounded" />
                    <label htmlFor="draft" className="text-sm text-gray-700">
                      Save as draft (user can edit before posting)
                    </label>
                  </div>

                  <button
                    onClick={handleVideoUpload}
                    disabled={isUploading || !selectedFile}
                    className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-lg font-semibold hover:from-pink-600 hover:to-purple-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                        Uploading...
                      </span>
                    ) : (
                      'Publish to TikTok'
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-800 mb-2">✓ Video Published Successfully!</h3>
                  <p className="text-green-700 text-sm">Your video has been posted to TikTok</p>
                </div>
                <div className="bg-gray-100 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-2">Video ID: 7391234567890123456</p>
                  <p className="text-sm text-gray-600">Status: Published</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* API Flow Explanation */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-4">API Flow</h2>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">1</span>
              <span>User authorizes app with TikTok OAuth (Login Kit)</span>
            </li>
            <li className="flex gap-3">
              <span className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">2</span>
              <span>Retrieve user info with user.info.basic scope</span>
            </li>
            <li className="flex gap-3">
              <span className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">3</span>
              <span>Upload video using video.upload scope</span>
            </li>
            <li className="flex gap-3">
              <span className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">4</span>
              <span>Publish video with video.publish scope</span>
            </li>
          </ol>
        </div>

        <div className="text-center mt-8">
          <Link href="/" className="text-purple-600 hover:text-purple-700 font-medium">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}