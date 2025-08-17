import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Marketing',
  description:
    'Learn more about the marketing suite of OFM Social OS: multi‑platform publishing, durable workflows, media pipelines, observability, and compliance.',
};

export default function MarketingPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-16">
      <section className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">Marketing Suite</h1>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto">
          Professional tools for content creators who need reliability, scale, and compliance.
        </p>
      </section>

      <section className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Multi-platform Publishing</h2>
          <p className="text-gray-600 mb-6">
            One dashboard, multiple platforms. Schedule and publish content across your entire social presence.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-2">Instagram</h3>
            <p className="text-sm text-gray-600">Posts, Stories, Reels, and Carousels with full scheduling support.</p>
          </Card>
          <Card className="p-4">
            <h3 className="font-semibold mb-2">TikTok</h3>
            <p className="text-sm text-gray-600">Video publishing with trend tracking and sound library integration.</p>
          </Card>
          <Card className="p-4">
            <h3 className="font-semibold mb-2">X (Twitter)</h3>
            <p className="text-sm text-gray-600">Thread composer, media attachments, and engagement analytics.</p>
          </Card>
          <Card className="p-4">
            <h3 className="font-semibold mb-2">Reddit</h3>
            <p className="text-sm text-gray-600">Community targeting, cross-posting, and flair management.</p>
          </Card>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Durable Workflows</h2>
          <p className="text-gray-600">
            Powered by Temporal, our workflows are designed for reliability at scale.
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-6">
          <ul className="space-y-3 text-gray-700">
            <li>• Automatic retries with exponential backoff</li>
            <li>• State persistence across server restarts</li>
            <li>• Visual debugging and monitoring</li>
            <li>• Multi-step campaign orchestration</li>
          </ul>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Media Pipeline</h2>
          <p className="text-gray-600">
            Professional-grade media processing with FFmpeg and Whisper.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <h3 className="font-semibold mb-3">FFmpeg Processing</h3>
            <p className="text-sm text-gray-600">
              Automatic format conversion, smart compression, thumbnail generation, and watermark overlays.
            </p>
          </Card>
          <Card>
            <h3 className="font-semibold mb-3">Whisper Transcription</h3>
            <p className="text-sm text-gray-600">
              Automatic captions in 50+ languages, SEO-optimized transcripts, and accessibility compliance.
            </p>
          </Card>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Observability</h2>
          <p className="text-gray-700 leading-relaxed">
            Stay on top of your operations with built‑in observability. Our
            integration with Prometheus and Grafana provides metrics and
            dashboards out of the box, so you can monitor throughput, latency,
            error rates, and more. Gain confidence in your system's health and
            quickly identify issues before they impact your workflow.
          </p>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Security & GDPR</h2>
          <p className="text-gray-700 leading-relaxed">
            Security and privacy are foundational principles of OFM Social OS. We
            only interact with official platform APIs—there are no shortcuts or
            engagement manipulation strategies here. Our infrastructure is built
            with data protection in mind and complies with the General Data
            Protection Regulation (GDPR). Your content and your users' data are
            handled with care.
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