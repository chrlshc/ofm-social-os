import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chatting',
  description:
    'Explore the AI Chatting Assistant: fan profiling, personalized messaging, inbox‑safe behaviors, and analytics.',
};

export default function ChattingPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-16">
      <section className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">AI Chatting Assistant</h1>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto">
          Engage authentically with your audience using AI that understands context and maintains your voice.
        </p>
      </section>

      <section className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Fan Profiling</h2>
          <p className="text-gray-600 mb-6">
            Understand your fans and followers on a deeper level. Our assistant
            builds rich profiles by analyzing past interactions and context.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <h3 className="font-semibold mb-2">Preference Tracking</h3>
            <p className="text-sm text-gray-600">
              Automatically track topics, interests, and communication styles for each fan.
            </p>
          </Card>
          <Card>
            <h3 className="font-semibold mb-2">Interaction History</h3>
            <p className="text-sm text-gray-600">
              Maintain context across conversations with complete history tracking.
            </p>
          </Card>
          <Card>
            <h3 className="font-semibold mb-2">Audience Segmentation</h3>
            <p className="text-sm text-gray-600">
              Group fans by engagement level and interests for targeted communication.
            </p>
          </Card>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Personalized Messages (IRAS)</h2>
          <p className="text-gray-700 leading-relaxed">
            Powered by our IRAS (Intelligent Response Augmentation System), the
            assistant crafts messages that resonate with each individual. It uses
            conversation history and fan preferences to generate replies that
            mirror your tone and style while remaining authentic and friendly.
          </p>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Inbox-safe Behaviors</h2>
          <p className="text-gray-600 mb-6">
            The AI follows guidelines designed to keep your interactions safe and
            compliant. It avoids spammy patterns and respects platform rules.
          </p>
        </div>
        <div className="bg-blue-50 rounded-lg p-6">
          <ul className="space-y-3 text-gray-700">
            <li>• Natural conversation pacing</li>
            <li>• Respects platform guidelines</li>
            <li>• No engagement manipulation</li>
            <li>• Maintains authentic interactions</li>
          </ul>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Analytics for Replies</h2>
          <p className="text-gray-700 leading-relaxed">
            Gain insight into how fans respond without making speculative
            promises about growth or engagement. Our analytics highlight trends in
            responses so you can refine your content strategy and continue to
            delight your community.
          </p>
        </div>
      </section>

      <div className="text-center pt-8">
        <Button asChild>
          <Link href="/join">Get invite</Link>
        </Button>
      </div>
    </div>
  );
}