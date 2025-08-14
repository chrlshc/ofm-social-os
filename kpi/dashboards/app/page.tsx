'use client';

import React, { useState } from 'react';
import ModelDashboard from '../components/ModelDashboard';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 1000, // 10 secondes
      refetchOnWindowFocus: false,
    },
  },
});

const availableModels = [
  { id: 'marketing', name: 'Marketing', description: 'KPI de performance marketing' },
  { id: 'onboarding', name: 'Onboarding', description: 'Métriques d\'acquisition utilisateur' },
  { id: 'payment', name: 'Payment', description: 'Indicateurs de revenus et conversions' }
];

export default function Home() {
  const [selectedModel, setSelectedModel] = useState('marketing');

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <h1 className="text-xl font-semibold">OFM Social OS - KPI Dashboard</h1>
              <div className="flex items-center space-x-4">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                >
                  {availableModels.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name} - {model.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <ModelDashboard modelName={selectedModel} />
        </main>
      </div>
    </QueryClientProvider>
  );
}