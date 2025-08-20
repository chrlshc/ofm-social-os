'use client';

import { useState } from 'react';

export default function JoinPage() {
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    email: '',
    instagram: '',
    niche: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    consent: false,
  });

  const timezones = [
    'Europe/Paris',
    'Europe/London',
    'America/New_York',
    'America/Los_Angeles',
    'America/Chicago',
    'Asia/Tokyo',
    'Asia/Dubai',
    'Australia/Sydney',
  ];

  const niches = [
    'Fitness & Health',
    'Fashion & Beauty',
    'Travel & Lifestyle',
    'Gaming & Tech',
    'Art & Photography',
    'Music & Entertainment',
    'Food & Cooking',
    'Education & Coaching',
    'Adult Content',
    'Other'
  ];

  const stats = {
    creators: '500+',
    revenue: '$50M+',
    active: '24/7'
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Failed to join waitlist');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-purple-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
            Huntaze
          </h1>
          <p className="text-gray-600">AI-Powered Platform for Content Creators</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden lg:flex">
          {/* Left Column - Benefits */}
          <div className="lg:w-1/2 p-8 lg:p-12 bg-gradient-to-br from-purple-600 to-pink-600 text-white">
            <h2 className="text-3xl font-bold mb-6">
              Transform your OnlyFans into a 6-figure automated business
            </h2>
            
            <p className="text-purple-100 mb-8">
              Our AI handles messaging, content scheduling, and fan engagement 24/7 
              while you focus on creating.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.creators}</div>
                <div className="text-sm text-purple-200">Creators</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.revenue}</div>
                <div className="text-sm text-purple-200">Revenue Generated</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.active}</div>
                <div className="text-sm text-purple-200">AI Automation</div>
              </div>
            </div>

            {/* Benefits */}
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-purple-200 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h3 className="font-semibold">AI Messaging Assistant</h3>
                  <p className="text-sm text-purple-200">Personalized fan conversations that increase tips by 300%</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-purple-200 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h3 className="font-semibold">Smart Content Scheduler</h3>
                  <p className="text-sm text-purple-200">Post at perfect times across all platforms</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-purple-200 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <div>
                  <h3 className="font-semibold">Advanced Analytics</h3>
                  <p className="text-sm text-purple-200">Track revenue and predict churn before it happens</p>
                </div>
              </div>
            </div>

            {/* Testimonial */}
            <div className="mt-8 p-4 bg-white/10 rounded-lg backdrop-blur">
              <p className="text-sm italic mb-2">
                "Huntaze helped me go from $2k to $25k/month in just 3 months!"
              </p>
              <p className="text-xs text-purple-200">- Sarah M., Top 0.5% Creator</p>
            </div>
          </div>

          {/* Right Column - Form */}
          <div className="lg:w-1/2 p-8 lg:p-12">
            {submitted ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome aboard! 🎉</h2>
                <p className="text-gray-600 mb-4">
                  Check your email for confirmation and next steps.
                </p>
                <p className="text-sm text-gray-500">
                  Didn't receive it? Check your spam folder or contact support@huntaze.com
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  Get Early Access
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      placeholder="creator@example.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="instagram" className="block text-sm font-medium text-gray-700 mb-1">
                      Instagram Handle
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">@</span>
                      <input
                        type="text"
                        id="instagram"
                        name="instagram"
                        value={form.instagram}
                        onChange={handleChange}
                        className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        placeholder="yourhandle"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="niche" className="block text-sm font-medium text-gray-700 mb-1">
                      Content Niche
                    </label>
                    <select
                      id="niche"
                      name="niche"
                      value={form.niche}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    >
                      <option value="">Select your niche</option>
                      {niches.map((niche) => (
                        <option key={niche} value={niche}>
                          {niche}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
                      Timezone
                    </label>
                    <select
                      id="timezone"
                      name="timezone"
                      value={form.timezone}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    >
                      {timezones.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      id="consent"
                      name="consent"
                      checked={form.consent}
                      onChange={handleChange}
                      className="mt-1 h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <label htmlFor="consent" className="ml-2 text-sm text-gray-700">
                      I want to receive updates about new features and creator tips
                    </label>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Joining...
                      </span>
                    ) : (
                      'Get My Invitation'
                    )}
                  </button>

                  <p className="text-xs text-center text-gray-500 mt-4">
                    By joining, you agree to our Terms of Service and Privacy Policy
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}