import React from 'react';
import { useState, useEffect } from 'react';
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  MessageCircle,
  Bell,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

interface DashboardStats {
  fans: number;
  revenueMonth: number;
  revenueLastMonth: number;
  engagementRate: number;
  pendingMessages: number;
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  link?: string;
  linkText?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, trend, link, linkText }) => {
  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-6 transition-all hover:shadow-xl hover:scale-[1.02]">
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl text-white">
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-sm font-medium ${
            trend.isPositive ? 'text-green-600' : 'text-red-600'
          }`}>
            {trend.isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      
      <h3 className="text-gray-600 text-sm font-medium mb-1">{title}</h3>
      <p className="text-2xl font-bold text-gray-900 mb-3">{value}</p>
      
      {link && (
        <a 
          href={link} 
          className="text-sm font-medium bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent hover:underline"
        >
          {linkText || 'Voir détails'} →
        </a>
      )}
    </div>
  );
};

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    fans: 0,
    revenueMonth: 0,
    revenueLastMonth: 0,
    engagementRate: 0,
    pendingMessages: 0
  });
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await fetch('/api/dashboard/stats', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setStats(data.stats);
          setUserName(data.userName || 'Créateur');
        }
      } catch (error) {
        console.error('Erreur lors du chargement des données:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const revenueChange = stats.revenueLastMonth > 0 
    ? ((stats.revenueMonth - stats.revenueLastMonth) / stats.revenueLastMonth) * 100
    : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('fr-FR').format(num);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Bonjour {userName} 👋
          </h1>
          <p className="text-gray-600">Voici votre tableau de bord pour aujourd'hui</p>
        </div>

        {stats.pendingMessages > 0 && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="text-yellow-600" size={20} />
              <span className="text-yellow-800 font-medium">
                {stats.pendingMessages} messages en attente de réponse
              </span>
            </div>
            <a 
              href="/messaging" 
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:shadow-lg transition-shadow"
            >
              Voir messages
            </a>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Fans actuels"
            value={formatNumber(stats.fans)}
            icon={<Users size={24} />}
            link="/analytics"
          />
          
          <StatCard
            title="Revenus ce mois"
            value={formatCurrency(stats.revenueMonth)}
            icon={<DollarSign size={24} />}
            trend={{
              value: revenueChange,
              isPositive: revenueChange >= 0
            }}
            link="/analytics"
          />
          
          <StatCard
            title="Taux d'engagement"
            value={`${stats.engagementRate}%`}
            icon={<TrendingUp size={24} />}
            link="/analytics"
          />
          
          <StatCard
            title="Messages en attente"
            value={stats.pendingMessages}
            icon={<MessageCircle size={24} />}
            link="/messaging"
            linkText="Répondre"
          />
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions rapides</h2>
            <div className="space-y-3">
              <a 
                href="/ai-config" 
                className="flex items-center justify-between p-3 rounded-lg hover:bg-purple-50 transition-colors"
              >
                <span className="text-gray-700">Configurer l'IA</span>
                <ArrowUpRight size={16} className="text-purple-600" />
              </a>
              <a 
                href="/analytics" 
                className="flex items-center justify-between p-3 rounded-lg hover:bg-purple-50 transition-colors"
              >
                <span className="text-gray-700">Voir statistiques détaillées</span>
                <ArrowUpRight size={16} className="text-purple-600" />
              </a>
              <a 
                href="/profile" 
                className="flex items-center justify-between p-3 rounded-lg hover:bg-purple-50 transition-colors"
              >
                <span className="text-gray-700">Modifier mon profil</span>
                <ArrowUpRight size={16} className="text-purple-600" />
              </a>
            </div>
          </div>

          <div className="md:col-span-2 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl shadow-lg p-6 text-white">
            <h2 className="text-lg font-semibold mb-4">Conseils du jour</h2>
            <p className="text-white/90 mb-4">
              Votre taux d'engagement est excellent ! Continuez à interagir régulièrement avec vos fans pour maintenir cette dynamique.
            </p>
            <a 
              href="/chatbot" 
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg font-medium hover:bg-white/30 transition-colors"
            >
              Demander conseil à l'IA
              <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;