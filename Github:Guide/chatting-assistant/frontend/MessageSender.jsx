import React, { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  Button, 
  Textarea, 
  Alert,
  Badge,
  Separator,
  Progress
} from '@/components/ui/card';
import { Copy, ExternalLink, Check, Clock, Send } from 'lucide-react';

/**
 * MessageSender Component - One-click manual sending with OnlyFans compliance
 * 
 * This component maintains OnlyFans compliance by:
 * 1. Copying message to clipboard
 * 2. Opening OnlyFans in new tab
 * 3. Requiring manual paste and send
 * 4. Tracking compliance audit trail
 */
const MessageSender = ({ 
  fanId, 
  suggestedMessage, 
  auditId: initialAuditId,
  onSendComplete,
  className = "" 
}) => {
  const [auditId, setAuditId] = useState(initialAuditId);
  const [sendStatus, setSendStatus] = useState('ready'); // ready, preparing, clipboard_ready, sent, error
  const [error, setError] = useState(null);
  const [clipboardSupported, setClipboardSupported] = useState(false);
  const [sendingProgress, setSendingProgress] = useState(0);
  const [instructions, setInstructions] = useState({});

  useEffect(() => {
    // Check clipboard support
    setClipboardSupported(navigator.clipboard && window.isSecureContext);
    
    // Prepare message for sending if not already prepared
    if (!auditId && fanId && suggestedMessage) {
      prepareMessage();
    }
  }, [fanId, suggestedMessage]);

  const prepareMessage = async () => {
    try {
      setSendStatus('preparing');
      setSendingProgress(25);
      
      const response = await fetch('/send/prepare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fan_id: fanId,
          message: suggestedMessage,
          audit_id: auditId
        })
      });

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }

      setAuditId(result.audit_id);
      setInstructions(result.instructions || {});
      setSendStatus('ready');
      setSendingProgress(50);
      
    } catch (err) {
      setError(err.message);
      setSendStatus('error');
      setSendingProgress(0);
    }
  };

  const executeOneClickSend = async () => {
    try {
      setSendStatus('clipboard_preparing');
      setSendingProgress(75);
      setError(null);

      const response = await fetch('/send/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audit_id: auditId,
          open_browser: true
        })
      });

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }

      setSendStatus('clipboard_ready');
      setSendingProgress(100);
      
      // Show success message
      if (result.clipboard_copied) {
        // Auto-hide success message after 5 seconds
        setTimeout(() => {
          if (sendStatus === 'clipboard_ready') {
            setSendStatus('waiting_confirmation');
          }
        }, 5000);
      }
      
    } catch (err) {
      setError(err.message);
      setSendStatus('error');
      setSendingProgress(0);
    }
  };

  const confirmMessageSent = async () => {
    try {
      const response = await fetch(`/send/confirm/${auditId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }

      setSendStatus('sent');
      
      // Notify parent component
      if (onSendComplete) {
        onSendComplete({
          auditId,
          fanId,
          sentAt: result.sent_at,
          success: true
        });
      }
      
    } catch (err) {
      setError(err.message);
      setSendStatus('error');
    }
  };

  const copyToClipboard = async () => {
    if (clipboardSupported) {
      try {
        await navigator.clipboard.writeText(suggestedMessage);
        // Temporary feedback
        const originalStatus = sendStatus;
        setSendStatus('copied');
        setTimeout(() => setSendStatus(originalStatus), 2000);
      } catch (err) {
        setError('Échec de la copie dans le presse-papiers');
      }
    }
  };

  const getStatusBadge = () => {
    const statusConfig = {
      ready: { text: 'Prêt', variant: 'default', icon: Clock },
      preparing: { text: 'Préparation...', variant: 'secondary', icon: Clock },
      clipboard_ready: { text: 'Copié! Ouvrir OnlyFans', variant: 'default', icon: ExternalLink },
      clipboard_preparing: { text: 'Copie en cours...', variant: 'secondary', icon: Copy },
      waiting_confirmation: { text: 'En attente confirmation', variant: 'warning', icon: Clock },
      sent: { text: 'Envoyé ✓', variant: 'success', icon: Check },
      copied: { text: 'Copié ✓', variant: 'success', icon: Check },
      error: { text: 'Erreur', variant: 'destructive', icon: null }
    };

    const config = statusConfig[sendStatus] || statusConfig.ready;
    const IconComponent = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        {IconComponent && <IconComponent className="w-3 h-3" />}
        {config.text}
      </Badge>
    );
  };

  const getMainButton = () => {
    if (sendStatus === 'sent') {
      return (
        <Button disabled className="w-full">
          <Check className="w-4 h-4 mr-2" />
          Message envoyé avec succès
        </Button>
      );
    }

    if (sendStatus === 'clipboard_ready' || sendStatus === 'waiting_confirmation') {
      return (
        <Button onClick={confirmMessageSent} className="w-full" variant="outline">
          <Check className="w-4 h-4 mr-2" />
          Confirmer l'envoi
        </Button>
      );
    }

    if (sendStatus === 'error') {
      return (
        <Button onClick={prepareMessage} className="w-full" variant="outline">
          Réessayer
        </Button>
      );
    }

    return (
      <Button 
        onClick={executeOneClickSend} 
        disabled={sendStatus === 'preparing' || sendStatus === 'clipboard_preparing'}
        className="w-full"
      >
        <Send className="w-4 h-4 mr-2" />
        {sendStatus === 'preparing' || sendStatus === 'clipboard_preparing' 
          ? 'Préparation...' 
          : 'Copier et ouvrir OnlyFans'
        }
      </Button>
    );
  };

  return (
    <Card className={`w-full max-w-2xl ${className}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Envoi Manuel - Fan {fanId}</CardTitle>
          {getStatusBadge()}
        </div>
        {(sendStatus === 'preparing' || sendStatus === 'clipboard_preparing') && (
          <Progress value={sendingProgress} className="w-full" />
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Message Preview */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Message à envoyer:</label>
          <Textarea
            value={suggestedMessage}
            readOnly
            className="min-h-[100px] resize-none"
            placeholder="Aucun message généré"
          />
          
          {/* Manual copy fallback */}
          {!clipboardSupported && (
            <Alert>
              <Copy className="h-4 w-4" />
              <div>
                <p className="font-medium">Copie manuelle requise</p>
                <p className="text-sm">Sélectionnez et copiez le message ci-dessus.</p>
              </div>
            </Alert>
          )}
          
          {clipboardSupported && sendStatus === 'ready' && (
            <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-2">
              <Copy className="w-4 h-4" />
              Copier seulement
            </Button>
          )}
        </div>

        <Separator />

        {/* Instructions */}
        {instructions.step_1 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Instructions d'envoi:</label>
            <div className="text-sm space-y-1 bg-muted p-3 rounded-lg">
              <div>1. {instructions.step_1}</div>
              <div>2. {instructions.step_2}</div>
              <div>3. {instructions.step_3}</div>
              <div>4. {instructions.step_4}</div>
              <div>5. {instructions.step_5}</div>
              <div>6. {instructions.step_6}</div>
            </div>
            
            {instructions.compliance_note && (
              <Alert>
                <div>
                  <p className="font-medium">Conformité OnlyFans</p>
                  <p className="text-sm">{instructions.compliance_note}</p>
                </div>
              </Alert>
            )}
          </div>
        )}

        {/* Success Message */}
        {sendStatus === 'clipboard_ready' && (
          <Alert>
            <Check className="h-4 w-4" />
            <div>
              <p className="font-medium">Message copié avec succès!</p>
              <p className="text-sm">
                OnlyFans s'ouvre dans un nouvel onglet. Collez le message (Ctrl+V ou Cmd+V) 
                et cliquez sur Envoyer dans OnlyFans.
              </p>
            </div>
          </Alert>
        )}

        {/* Error Message */}
        {error && (
          <Alert variant="destructive">
            <div>
              <p className="font-medium">Erreur</p>
              <p className="text-sm">{error}</p>
            </div>
          </Alert>
        )}

        {/* Main Action Button */}
        {getMainButton()}

        {/* Audit Information */}
        {auditId && (
          <div className="text-xs text-muted-foreground">
            ID d'audit: {auditId}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MessageSender;