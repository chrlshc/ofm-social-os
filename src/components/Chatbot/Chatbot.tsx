import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Bot,
  User,
  RotateCcw,
  Sparkles,
  Loader2,
  HelpCircle,
  TrendingUp,
  MessageSquare,
  Lightbulb
} from 'lucide-react';

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  isTyping?: boolean;
}

interface SuggestionProps {
  text: string;
  icon: React.ReactNode;
  onClick: () => void;
}

const Suggestion: React.FC<SuggestionProps> = ({ text, icon, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors"
    >
      <span className="text-purple-600">{icon}</span>
      <span className="text-sm text-gray-700">{text}</span>
    </button>
  );
};

const Chatbot: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      content: 'Bonjour ! Je suis votre assistant OFM IA. Je peux vous aider à optimiser votre stratégie de contenu, améliorer votre engagement, et répondre à toutes vos questions. Que puis-je faire pour vous aujourd\'hui ?',
      sender: 'ai',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      content: inputMessage,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsAiTyping(true);

    const typingMessage: ChatMessage = {
      id: `ai-typing-${Date.now()}`,
      content: '',
      sender: 'ai',
      timestamp: new Date(),
      isTyping: true
    };

    setMessages(prev => [...prev, typingMessage]);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          message: inputMessage,
          conversationId
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        if (!conversationId && data.conversationId) {
          setConversationId(data.conversationId);
        }

        setMessages(prev => prev.filter(msg => !msg.isTyping));

        const aiResponse: ChatMessage = {
          id: `ai-${Date.now()}`,
          content: data.reply,
          sender: 'ai',
          timestamp: new Date()
        };

        animateAiResponse(aiResponse);
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi du message:', error);
      setMessages(prev => prev.filter(msg => !msg.isTyping));
      
      const errorMessage: ChatMessage = {
        id: `ai-error-${Date.now()}`,
        content: 'Désolé, une erreur s\'est produite. Veuillez réessayer.',
        sender: 'ai',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsAiTyping(false);
    }
  };

  const animateAiResponse = (message: ChatMessage) => {
    const words = message.content.split(' ');
    let currentContent = '';
    let wordIndex = 0;

    const tempMessage: ChatMessage = {
      ...message,
      content: ''
    };

    setMessages(prev => [...prev, tempMessage]);

    const interval = setInterval(() => {
      if (wordIndex < words.length) {
        currentContent += (wordIndex > 0 ? ' ' : '') + words[wordIndex];
        setMessages(prev => 
          prev.map(msg => 
            msg.id === message.id 
              ? { ...msg, content: currentContent }
              : msg
          )
        );
        wordIndex++;
      } else {
        clearInterval(interval);
      }
    }, 50);
  };

  const resetConversation = () => {
    setMessages([{
      id: `ai-${Date.now()}`,
      content: 'Nouvelle conversation démarrée. Comment puis-je vous aider ?',
      sender: 'ai',
      timestamp: new Date()
    }]);
    setConversationId(null);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputMessage(suggestion);
    inputRef.current?.focus();
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const suggestions = [
    {
      text: 'Comment améliorer mon engagement ?',
      icon: <TrendingUp size={16} />
    },
    {
      text: 'Idées de contenu pour cette semaine',
      icon: <Lightbulb size={16} />
    },
    {
      text: 'Analyser mes performances récentes',
      icon: <MessageSquare size={16} />
    }
  ];

  return (
    <div className="h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-white flex flex-col">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl">
              <Bot className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Assistant OFM IA</h1>
              <p className="text-sm text-gray-500">Toujours là pour vous aider</p>
            </div>
          </div>
          
          <button
            onClick={resetConversation}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors group"
            title="Nouvelle conversation"
          >
            <RotateCcw className="text-gray-500 group-hover:text-gray-700" size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.sender === 'ai' && (
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
                    <Bot className="text-white" size={18} />
                  </div>
                </div>
              )}
              
              <div className={`max-w-[70%] ${
                message.sender === 'user' ? 'order-1' : 'order-2'
              }`}>
                {message.isTyping ? (
                  <div className="bg-gray-100 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="animate-spin text-purple-600" size={16} />
                      <span className="text-gray-500 text-sm">L'assistant réfléchit...</span>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`rounded-2xl px-4 py-3 ${
                      message.sender === 'user'
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    <p className={`text-xs mt-1 ${
                      message.sender === 'user' ? 'text-white/70' : 'text-gray-500'
                    }`}>
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                )}
              </div>
              
              {message.sender === 'user' && (
                <div className="flex-shrink-0 order-2">
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                    <User className="text-gray-600" size={18} />
                  </div>
                </div>
              )}
            </div>
          ))}
          
          <div ref={messagesEndRef} />
          
          {messages.length === 1 && (
            <div className="mt-8">
              <p className="text-center text-gray-500 mb-4">
                Suggestions pour commencer :
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                {suggestions.map((suggestion, index) => (
                  <Suggestion
                    key={index}
                    text={suggestion.text}
                    icon={suggestion.icon}
                    onClick={() => handleSuggestionClick(suggestion.text)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Posez votre question à l'assistant..."
                rows={1}
                disabled={isAiTyping}
                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-50 disabled:text-gray-400"
                style={{ minHeight: '48px', maxHeight: '120px' }}
              />
              <button
                className="absolute right-2 bottom-2 p-1.5 text-gray-400 hover:text-gray-600"
                title="Aide"
              >
                <HelpCircle size={20} />
              </button>
            </div>
            
            <button
              onClick={sendMessage}
              disabled={!inputMessage.trim() || isAiTyping}
              className="p-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAiTyping ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Send size={20} />
              )}
            </button>
          </div>
          
          <div className="flex items-center justify-center gap-2 mt-3 text-xs text-gray-500">
            <Sparkles size={12} />
            <span>Propulsé par l'IA OFM</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;