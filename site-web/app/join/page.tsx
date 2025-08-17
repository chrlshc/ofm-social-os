"use client";

import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';

type FormState = 'idle' | 'loading' | 'success' | 'error';

export default function JoinPage() {
  const [state, setState] = useState<FormState>('idle');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [handleIg, setHandleIg] = useState('');
  const [niche, setNiche] = useState('');
  const [timezone, setTimezone] = useState('');
  const [consent, setConsent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('loading');
    setMessage('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          handle_ig: handleIg || undefined,
          niche: niche || undefined,
          timezone: timezone || undefined,
          consent: consent || undefined,
        }),
      });
      if (res.ok) {
        setState('success');
        setMessage('Welcome aboard! Check your email for next steps.');
        setEmail('');
        setHandleIg('');
        setNiche('');
        setTimezone('');
        setConsent(false);
      } else if (res.status === 422) {
        const data = await res.json();
        setState('error');
        setMessage('Please check your input: ' + (data.error || 'Invalid data'));
      } else if (res.status === 429) {
        setState('error');
        setMessage('Too many requests. Please try again later.');
      } else {
        const data = await res.json();
        setState('error');
        setMessage(data.error || 'An unexpected error occurred.');
      }
    } catch (err) {
      setState('error');
      setMessage('Network error. Please try again later.');
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <Card className="p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 text-center">
          Get Early Access
        </h1>
        <p className="text-gray-600 text-center mb-8">
          Join the waitlist to be among the first to experience our marketing suite and AI chatting assistant.
        </p>
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email<span className="text-red-600">*</span>
            </label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label
              htmlFor="handleIg"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Instagram handle (optional)
            </label>
            <Input
              id="handleIg"
              type="text"
              value={handleIg}
              onChange={(e) => setHandleIg(e.target.value)}
              placeholder="@yourhandle"
            />
          </div>
          <div>
            <label
              htmlFor="niche"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Niche (optional)
            </label>
            <Input
              id="niche"
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. travel, fashion, tech"
            />
          </div>
          <div>
            <label
              htmlFor="timezone"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Timezone (optional)
            </label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="block w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select timezone</option>
              <option value="ET">Eastern Time (ET)</option>
              <option value="CT">Central Time (CT)</option>
              <option value="MT">Mountain Time (MT)</option>
              <option value="PT">Pacific Time (PT)</option>
            </select>
          </div>
          <div className="flex items-center">
            <input
              id="consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label
              htmlFor="consent"
              className="ml-2 text-sm text-gray-700"
            >
              I agree to receive updates about Huntaze
            </label>
          </div>
          <Button
            type="submit"
            disabled={state === 'loading'}
            className="w-full"
          >
            {state === 'loading' ? 'Submitting...' : 'Get invite'}
          </Button>
          <div
            aria-live="polite"
            className="text-sm text-center mt-4"
          >
            {message && (
              <p
                className={
                  state === 'success' ? 'text-green-600' : 'text-red-600'
                }
              >
                {message}
              </p>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}