import React, { useState, useEffect } from 'react';
import {
  Bell,
  Globe,
  Shield,
  Moon,
  Sun,
  Smartphone,
  Mail,
  LogOut,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Check,
  AlertTriangle,
  Clock,
  Languages
} from 'lucide-react';

interface UserSettings {
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  marketingEmails: boolean;
  weeklyReport: boolean;
  language: string;
  timezone: string;
  twoFactorAuth: boolean;
  theme: 'light' | 'dark' | 'auto';
}

interface SettingToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: React.ReactNode;
}

const SettingToggle: React.FC<SettingToggleProps> = ({ 
  label, 
  description, 
  checked, 
  onChange, 
  icon 
}) => {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex items-start gap-3">
        {icon && <div className="text-gray-500 mt-0.5">{icon}</div>}
        <div className="flex-1">
          <p className="font-medium text-gray-900">{label}</p>
          {description && (
            <p className="text-sm text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-purple-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
        <span className="sr-only">{label}</span>
      </button>
    </div>
  );
};

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>({
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    marketingEmails: false,
    weeklyReport: true,
    language: 'fr',
    timezone: 'Europe/Paris',
    twoFactorAuth: false,
    theme: 'light'
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/user/settings', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des paramètres:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key: keyof UserSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    try {
      const response = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ [key]: value })
      });
      
      if (response.ok) {
        setSuccessMessage('Paramètre mis à jour');
        setTimeout(() => setSuccessMessage(''), 2000);
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error);
    }
  };

  const handleLogoutAll = async () => {
    try {
      const response = await fetch('/api/user/logout-all', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        setShowLogoutModal(false);
        setSuccessMessage('Déconnexion de tous les appareils effectuée');
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const response = await fetch('/api/user', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        localStorage.removeItem('token');
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du compte:', error);
    }
  };

  const languages = [
    { code: 'fr', name: 'Français' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'de', name: 'Deutsch' }
  ];

  const timezones = [
    'Europe/Paris',
    'Europe/London',
    'America/New_York',
    'America/Los_Angeles',
    'Asia/Tokyo',
    'Australia/Sydney'
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Réglages du compte</h1>
          <p className="text-gray-600 mt-2">Gérez vos préférences et paramètres de sécurité</p>
        </div>

        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <Check className="text-green-600" size={20} />
            <span className="text-green-800">{successMessage}</span>
          </div>
        )}

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <Bell size={24} />
              Notifications
            </h2>
            
            <div className="divide-y divide-gray-200">
              <SettingToggle
                label="Notifications par email"
                description="Recevez des notifications importantes par email"
                icon={<Mail size={20} />}
                checked={settings.emailNotifications}
                onChange={(checked) => updateSetting('emailNotifications', checked)}
              />
              
              <SettingToggle
                label="Notifications SMS"
                description="Recevez des SMS pour les messages urgents"
                icon={<Smartphone size={20} />}
                checked={settings.smsNotifications}
                onChange={(checked) => updateSetting('smsNotifications', checked)}
              />
              
              <SettingToggle
                label="Notifications push"
                description="Notifications dans l'application"
                icon={<Bell size={20} />}
                checked={settings.pushNotifications}
                onChange={(checked) => updateSetting('pushNotifications', checked)}
              />
              
              <SettingToggle
                label="Emails marketing"
                description="Recevez nos offres et actualités"
                checked={settings.marketingEmails}
                onChange={(checked) => updateSetting('marketingEmails', checked)}
              />
              
              <SettingToggle
                label="Rapport hebdomadaire"
                description="Résumé de vos performances chaque semaine"
                checked={settings.weeklyReport}
                onChange={(checked) => updateSetting('weeklyReport', checked)}
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <Globe size={24} />
              Préférences
            </h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Languages className="inline mr-2" size={16} />
                  Langue de l'interface
                </label>
                <select
                  value={settings.language}
                  onChange={(e) => updateSetting('language', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  {languages.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Clock className="inline mr-2" size={16} />
                  Fuseau horaire
                </label>
                <select
                  value={settings.timezone}
                  onChange={(e) => updateSetting('timezone', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  {timezones.map(tz => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Thème de l'interface
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'light', label: 'Clair', icon: <Sun size={16} /> },
                    { value: 'dark', label: 'Sombre', icon: <Moon size={16} /> },
                    { value: 'auto', label: 'Auto', icon: <Globe size={16} /> }
                  ].map(theme => (
                    <button
                      key={theme.value}
                      onClick={() => updateSetting('theme', theme.value as 'light' | 'dark' | 'auto')}
                      className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                        settings.theme === theme.value
                          ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {theme.icon}
                      {theme.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <Shield size={24} />
              Sécurité
            </h2>
            
            <div className="space-y-4">
              <SettingToggle
                label="Authentification à deux facteurs"
                description="Ajoutez une couche de sécurité supplémentaire à votre compte"
                icon={<Shield size={20} />}
                checked={settings.twoFactorAuth}
                onChange={(checked) => {
                  if (checked) {
                    window.location.href = '/settings/2fa-setup';
                  } else {
                    updateSetting('twoFactorAuth', false);
                  }
                }}
              />
              
              <div className="pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowLogoutModal(true)}
                  className="flex items-center gap-2 text-purple-600 hover:text-purple-700 font-medium"
                >
                  <LogOut size={18} />
                  Se déconnecter de tous les appareils
                </button>
                <p className="text-sm text-gray-500 mt-1 ml-6">
                  Cela vous déconnectera de toutes vos sessions actives
                </p>
              </div>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-red-900 mb-4">Zone dangereuse</h2>
            <p className="text-red-700 mb-4">
              Ces actions sont irréversibles. Procédez avec prudence.
            </p>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 flex items-center gap-2"
            >
              <Trash2 size={18} />
              Supprimer mon compte
            </button>
          </div>
        </div>
      </div>

      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Se déconnecter de tous les appareils ?
            </h3>
            <p className="text-gray-600 mb-6">
              Cette action vous déconnectera de toutes vos sessions actives sur tous les appareils.
              Vous devrez vous reconnecter pour accéder à votre compte.
            </p>
            <div className="flex gap-4">
              <button
                onClick={handleLogoutAll}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700"
              >
                Confirmer
              </button>
              <button
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="text-red-600" size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900">
                Supprimer votre compte ?
              </h3>
            </div>
            <p className="text-gray-600 mb-6">
              Cette action est irréversible. Toutes vos données seront définitivement supprimées,
              incluant vos messages, statistiques et configurations.
            </p>
            <div className="flex gap-4">
              <button
                onClick={handleDeleteAccount}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
              >
                Oui, supprimer
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;