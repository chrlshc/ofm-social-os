import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Learn',
  description:
    'Discover how OFM Social OS works under the hood. Learn about the marketing pipeline and AI chatting assistant without any outreach functionality.',
};

export default function LearnPage() {
  const steps = [
    {
      title: 'Planning & scheduling',
      description:
        'Create your campaign once and plan posts across Instagram, TikTok, X, and Reddit. Our scheduler keeps everything organized in one place.',
    },
    {
      title: 'Media processing',
      description:
        'Upload your media and let our pipeline—powered by FFmpeg and Whisper—transcode, normalize, and generate transcripts for accessibility.',
    },
    {
      title: 'Durable workflows',
      description:
        'Temporal orchestrates all background jobs and retries, ensuring that tasks such as publishing, transcription, and analysis complete successfully.',
    },
    {
      title: 'Observability & monitoring',
      description:
        'Real‑time metrics collected via Prometheus and visualized in Grafana give you full visibility into performance, errors, and resource usage.',
    },
    {
      title: 'AI Chatting Assistant',
      description:
        'When fans reach out, our assistant builds a profile and drafts personalized responses using the IRAS engine, always respecting platform guidelines.',
    },
    {
      title: 'Security & compliance',
      description:
        'Every interaction uses official APIs, and data handling practices are compliant with GDPR. We never engage in artificial engagement manipulation.',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">
      <h1 className="text-4xl font-bold text-gray-900 mb-6">How it works</h1>
      <div className="space-y-8">
        {steps.map((step, index) => (
          <div key={index} className="flex flex-col sm:flex-row sm:items-start sm:gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center font-bold">
              {index + 1}
            </div>
            <div className="mt-4 sm:mt-0">
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                {step.title}
              </h2>
              <p className="text-gray-700 leading-relaxed text-sm">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}