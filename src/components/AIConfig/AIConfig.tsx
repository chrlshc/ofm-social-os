import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Brain,
  Clock,
  Calendar,
  FileText,
  Shield,
  Save,
  RotateCcw,
  Upload,
  MessageSquare,
  Sparkles,
  AlertCircle,
  Check
} from 'lucide-react';

interface AIConfig {
  tone: number;
  persona: string;
  autoPostFrequency: number;
  activeHours: {
    [key: string]: { start: string; end: string; enabled: boolean };
  };
  blockedTopics: string[];
  humorLevel: number;
  responseLength: 'short' | 'medium' | 'long';
  languageStyle: 'formal' | 'casual' | 'flirty';
}

interface ConfigSection {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const AIConfig: React.FC = () => {
  const [config, setConfig] = useState<AIConfig>({
    tone: 50,
    persona: '',
    autoPostFrequency: 3,
    activeHours: {
      monday: { start: '09:00', end: '21:00', enabled: true },
      tuesday: { start: '09:00', end: '21:00', enabled: true },
      wednesday: { start: '09:00', end: '21:00', enabled: true },
      thursday: { start: '09:00', end: '21:00', enabled: true },
      friday: { start: '09:00', end: '21:00', enabled: true },
      saturday: { start: '10:00', end: '22:00', enabled: true },
      sunday: { start: '10:00', end: '22:00', enabled: false }
    },
    blockedTopics: [],
    humorLevel: 30,
    responseLength: 'medium',
    languageStyle: 'casual'
  });

  const [originalConfig, setOriginalConfig] = useState<AIConfig>(config);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [newBlockedTopic, setNewBlockedTopic] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/ai/config', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        setOriginalConfig(data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccessMessage('');
    
    try {
      const response = await fetch('/api/ai/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(config)
      });
      
      if (response.ok) {
        setOriginalConfig(config);
        setSuccessMessage('Configuration mise à jour avec succès !');
        setTimeout(() => setSuccessMessage(''), 3000);
        
        await fetch('/api/ai/reload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(originalConfig);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('guidelines', file);
    
    try {
      const response = await fetch('/api/ai/upload-guidelines', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });
      
      if (response.ok) {
        setSuccessMessage('Guide de style importé avec succès !');
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (error) {
      console.error('Erreur lors de l\'upload:', error);
    }
  };

  const addBlockedTopic = () => {
    if (newBlockedTopic.trim() && !config.blockedTopics.includes(newBlockedTopic)) {
      setConfig({
        ...config,
        blockedTopics: [...config.blockedTopics, newBlockedTopic.trim()]
      });
      setNewBlockedTopic('');
    }
  };

  const removeBlockedTopic = (topic: string) => {
    setConfig({
      ...config,
      blockedTopics: config.blockedTopics.filter(t => t !== topic)
    });
  };

  const dayNames: { [key: string]: string } = {
    monday: 'Lundi',
    tuesday: 'Mardi',
    wednesday: 'Mercredi',
    thursday: 'Jeudi',
    friday: 'Vendredi',
    saturday: 'Samedi',
    sunday: 'Dimanche'
  };

  const getToneLabel = (value: number) => {
    if (value < 25) return 'Très professionnel';
    if (value < 50) return 'Professionnel';
    if (value < 75) return 'Décontracté';
    return 'Très décontracté';
  };

  const getHumorLabel = (value: number) => {
    if (value < 25) return 'Sérieux';
    if (value < 50) return 'Modéré';
    if (value < 75) return 'Humoristique';
    return 'Très humoristique';
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
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <Brain className="text-purple-600" />
            Configuration de l'IA
          </h1>
          <p className="text-gray-600">
            Personnalisez le comportement de votre assistant intelligent pour qu'il corresponde à votre style
          </p>
        </div>

        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <Check className="text-green-600" size={20} />
            <span className="text-green-800">{successMessage}</span>
          </div>
        )}

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-start gap-3 mb-6">
              <MessageSquare className="text-purple-600 mt-1" size={24} />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Personnalité de l'IA</h2>
                <p className="text-gray-600 text-sm mt-1">
                  Définissez comment votre IA communique avec vos fans
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Tonalité des réponses
                </label>
                <div className="space-y-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config.tone}
                    onChange={(e) => setConfig({ ...config, tone: parseInt(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${config.tone}%, #E5E7EB ${config.tone}%, #E5E7EB 100%)`
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Professionnel</span>
                    <span className="font-medium text-purple-600">{getToneLabel(config.tone)}</span>
                    <span>Décontracté</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Niveau d'humour
                </label>
                <div className="space-y-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config.humorLevel}
                    onChange={(e) => setConfig({ ...config, humorLevel: parseInt(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #EC4899 0%, #EC4899 ${config.humorLevel}%, #E5E7EB ${config.humorLevel}%, #E5E7EB 100%)`
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Sérieux</span>
                    <span className="font-medium text-pink-600">{getHumorLabel(config.humorLevel)}</span>
                    <span>Humoristique</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Style de langage
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['formal', 'casual', 'flirty'] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => setConfig({ ...config, languageStyle: style })}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        config.languageStyle === style
                          ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {style === 'formal' ? 'Formel' : style === 'casual' ? 'Décontracté' : 'Charmeur'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Persona de l'IA
                </label>
                <textarea
                  value={config.persona}
                  onChange={(e) => setConfig({ ...config, persona: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                  placeholder="Décrivez la personnalité de votre IA... Ex: Mon assistant est bienveillant, encourageant et toujours positif. Il utilise des emojis avec parcimonie et reste professionnel tout en étant chaleureux."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Cette description guidera le comportement général de votre IA
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-start gap-3 mb-6">
              <Sparkles className="text-purple-600 mt-1" size={24} />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Publication automatique</h2>
                <p className="text-gray-600 text-sm mt-1">
                  Configurez la fréquence de publication de contenu
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Nombre de posts automatiques par semaine
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min="0"
                  max="21"
                  value={config.autoPostFrequency}
                  onChange={(e) => setConfig({ ...config, autoPostFrequency: parseInt(e.target.value) || 0 })}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-center"
                />
                <span className="text-gray-600">posts par semaine</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                L'IA publiera automatiquement du contenu selon cette fréquence
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-start gap-3 mb-6">
              <Clock className="text-purple-600 mt-1" size={24} />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Heures actives</h2>
                <p className="text-gray-600 text-sm mt-1">
                  Définissez quand l'IA peut répondre aux messages
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {Object.entries(config.activeHours).map(([day, hours]) => (
                <div key={day} className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={hours.enabled}
                    onChange={(e) => setConfig({
                      ...config,
                      activeHours: {
                        ...config.activeHours,
                        [day]: { ...hours, enabled: e.target.checked }
                      }
                    })}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  
                  <span className="w-24 font-medium text-gray-700">{dayNames[day]}</span>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={hours.start}
                      onChange={(e) => setConfig({
                        ...config,
                        activeHours: {
                          ...config.activeHours,
                          [day]: { ...hours, start: e.target.value }
                        }
                      })}
                      disabled={!hours.enabled}
                      className="px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100 disabled:text-gray-400"
                    />
                    <span className="text-gray-500">à</span>
                    <input
                      type="time"
                      value={hours.end}
                      onChange={(e) => setConfig({
                        ...config,
                        activeHours: {
                          ...config.activeHours,
                          [day]: { ...hours, end: e.target.value }
                        }
                      })}
                      disabled={!hours.enabled}
                      className="px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-start gap-3 mb-6">
              <Shield className="text-purple-600 mt-1" size={24} />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Restrictions de contenu</h2>
                <p className="text-gray-600 text-sm mt-1">
                  Définissez les sujets que l'IA ne doit pas aborder
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBlockedTopic}
                  onChange={(e) => setNewBlockedTopic(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addBlockedTopic()}
                  placeholder="Ajouter un sujet à éviter..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
                <button
                  onClick={addBlockedTopic}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Ajouter
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {config.blockedTopics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm"
                  >
                    {topic}
                    <button
                      onClick={() => removeBlockedTopic(topic)}
                      className="hover:text-red-900"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-start gap-3 mb-6">
              <FileText className="text-purple-600 mt-1" size={24} />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Contenu personnalisé</h2>
                <p className="text-gray-600 text-sm mt-1">
                  Importez des ressources pour personnaliser l'IA
                </p>
              </div>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-600 mb-4">
                Importez votre guide de style ou vos instructions personnalisées
              </p>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 cursor-pointer">
                <Upload size={20} />
                Choisir un fichier
                <input
                  type="file"
                  accept=".pdf,.txt,.doc,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-gray-500 mt-2">
                Formats acceptés : PDF, TXT, DOC, DOCX
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:shadow-lg transition-shadow disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Enregistrement...
                </>
              ) : (
                <>
                  <Save size={20} />
                  Enregistrer les modifications
                </>
              )}
            </button>
            
            <button
              onClick={handleReset}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 flex items-center gap-2"
            >
              <RotateCcw size={20} />
              Réinitialiser
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIConfig;