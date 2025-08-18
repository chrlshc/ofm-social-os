import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  Save, 
  Lock, 
  User, 
  Mail, 
  AtSign,
  AlertCircle,
  Check
} from 'lucide-react';

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  bio: string;
  avatarUrl: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  username?: string;
  bio?: string;
  password?: string;
}

const Profile: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile>({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    bio: '',
    avatarUrl: ''
  });
  
  const [editedProfile, setEditedProfile] = useState<UserProfile>(profile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await fetch('/api/user/me', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setProfile(data);
        setEditedProfile(data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement du profil:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    
    if (!editedProfile.firstName.trim()) {
      newErrors.firstName = 'Le prénom est requis';
    }
    
    if (!editedProfile.lastName.trim()) {
      newErrors.lastName = 'Le nom est requis';
    }
    
    if (!editedProfile.username.trim()) {
      newErrors.username = 'Le nom d\'utilisateur est requis';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(editedProfile.username)) {
      newErrors.username = 'Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores';
    }
    
    if (editedProfile.bio.length > 500) {
      newErrors.bio = 'La bio ne peut pas dépasser 500 caractères';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    
    setSaving(true);
    setSuccessMessage('');
    
    try {
      const response = await fetch('/api/user/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          first_name: editedProfile.firstName,
          last_name: editedProfile.lastName,
          username: editedProfile.username,
          bio: editedProfile.bio
        })
      });
      
      if (response.ok) {
        setProfile(editedProfile);
        setSuccessMessage('Profil mis à jour avec succès !');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        const error = await response.json();
        if (error.message === 'Username already taken') {
          setErrors({ username: 'Ce nom d\'utilisateur est déjà pris' });
        }
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      setErrors({ password: 'Les mots de passe ne correspondent pas' });
      return;
    }
    
    if (newPassword.length < 8) {
      setErrors({ password: 'Le mot de passe doit contenir au moins 8 caractères' });
      return;
    }
    
    try {
      const response = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ password: newPassword })
      });
      
      if (response.ok) {
        setShowPasswordModal(false);
        setNewPassword('');
        setConfirmPassword('');
        setSuccessMessage('Mot de passe modifié avec succès !');
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (error) {
      console.error('Erreur lors du changement de mot de passe:', error);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('avatar', file);
    
    try {
      const response = await fetch('/api/user/avatar', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        setEditedProfile({ ...editedProfile, avatarUrl: data.avatarUrl });
        setProfile({ ...profile, avatarUrl: data.avatarUrl });
      }
    } catch (error) {
      console.error('Erreur lors de l\'upload de l\'image:', error);
    }
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
      <div className="max-w-3xl mx-auto">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Mon Profil</h1>
          
          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <Check className="text-green-600" size={20} />
              <span className="text-green-800">{successMessage}</span>
            </div>
          )}

          <div className="flex flex-col items-center mb-8">
            <div className="relative">
              <div className="w-32 h-32 rounded-full overflow-hidden bg-gradient-to-br from-purple-400 to-pink-400">
                {editedProfile.avatarUrl ? (
                  <img 
                    src={editedProfile.avatarUrl} 
                    alt="Avatar" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white">
                    <User size={48} />
                  </div>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full text-white hover:shadow-lg transition-shadow"
              >
                <Camera size={20} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prénom
                </label>
                <input
                  type="text"
                  value={editedProfile.firstName}
                  onChange={(e) => setEditedProfile({ ...editedProfile, firstName: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                    errors.firstName ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.firstName && (
                  <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle size={14} />
                    {errors.firstName}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom
                </label>
                <input
                  type="text"
                  value={editedProfile.lastName}
                  onChange={(e) => setEditedProfile({ ...editedProfile, lastName: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                    errors.lastName ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.lastName && (
                  <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle size={14} />
                    {errors.lastName}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="inline mr-1" size={16} />
                Adresse email
              </label>
              <input
                type="email"
                value={editedProfile.email}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 cursor-not-allowed"
              />
              <p className="mt-1 text-sm text-gray-500">
                L'adresse email ne peut pas être modifiée
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <AtSign className="inline mr-1" size={16} />
                Nom d'utilisateur
              </label>
              <input
                type="text"
                value={editedProfile.username}
                onChange={(e) => setEditedProfile({ ...editedProfile, username: e.target.value })}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                  errors.username ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="@username"
              />
              {errors.username && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle size={14} />
                  {errors.username}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bio / Description
              </label>
              <textarea
                value={editedProfile.bio}
                onChange={(e) => setEditedProfile({ ...editedProfile, bio: e.target.value })}
                rows={4}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none ${
                  errors.bio ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Parlez de vous..."
              />
              <div className="flex justify-between mt-1">
                <div>
                  {errors.bio && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle size={14} />
                      {errors.bio}
                    </p>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  {editedProfile.bio.length}/500
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowPasswordModal(true)}
                className="flex items-center gap-2 text-purple-600 hover:text-purple-700 font-medium"
              >
                <Lock size={18} />
                Modifier le mot de passe
              </button>
            </div>

            <div className="flex gap-4 pt-6">
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
                onClick={() => setEditedProfile(profile)}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      </div>

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Modifier le mot de passe</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              
              {errors.password && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle size={14} />
                  {errors.password}
                </p>
              )}
            </div>
            
            <div className="flex gap-4 mt-6">
              <button
                onClick={handlePasswordChange}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:shadow-lg"
              >
                Confirmer
              </button>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setNewPassword('');
                  setConfirmPassword('');
                  setErrors({});
                }}
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

export default Profile;