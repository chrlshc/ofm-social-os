import nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

interface EmailOptions {
  to: string;
  from?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
  }>;
}

class NotificationService {
  private emailTransporter: Transporter | null = null;
  
  constructor() {
    this.initializeEmailTransporter();
  }
  
  private initializeEmailTransporter() {
    if (!process.env.SMTP_HOST) {
      console.warn('SMTP non configuré. Les emails seront simulés.');
      return;
    }
    
    this.emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    
    // Vérifier la connexion
    this.emailTransporter.verify((error) => {
      if (error) {
        console.error('Erreur de configuration SMTP:', error);
      } else {
        console.log('Service email prêt');
      }
    });
  }
  
  async sendEmail(options: EmailOptions): Promise<void> {
    const mailOptions = {
      from: options.from || process.env.SMTP_FROM || 'noreply@ofm-social.com',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments
    };
    
    if (this.emailTransporter) {
      try {
        const info = await this.emailTransporter.sendMail(mailOptions);
        console.log('Email envoyé:', info.messageId);
      } catch (error) {
        console.error('Erreur envoi email:', error);
        throw error;
      }
    } else {
      // Mode simulation
      console.log('📧 Email simulé:');
      console.log('To:', mailOptions.to);
      console.log('Subject:', mailOptions.subject);
      console.log('Content:', mailOptions.text || mailOptions.html);
    }
  }
  
  async sendBulkEmails(recipients: string[], options: Omit<EmailOptions, 'to'>): Promise<void> {
    const chunks = this.chunkArray(recipients, 50); // Limiter à 50 par batch
    
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(to => this.sendEmail({ ...options, to }))
      );
      // Attendre entre les batches pour éviter le rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  // Templates d'emails prédéfinis
  async sendAlertEmail(data: {
    to: string;
    alertType: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    details?: Record<string, any>;
  }) {
    const severityColors = {
      info: '#0ea5e9',
      warning: '#f59e0b',
      critical: '#ef4444'
    };
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: ${severityColors[data.severity]}; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f4f4f4; padding: 20px; margin-top: 20px; }
          .details { background-color: white; padding: 15px; margin-top: 15px; border-radius: 5px; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Alerte ${data.severity.toUpperCase()} - ${data.alertType}</h2>
          </div>
          <div class="content">
            <p>${data.message}</p>
            ${data.details ? `
              <div class="details">
                <h3>Détails:</h3>
                ${Object.entries(data.details).map(([key, value]) => 
                  `<p><strong>${key}:</strong> ${value}</p>`
                ).join('')}
              </div>
            ` : ''}
          </div>
          <div class="footer">
            <p>Cette alerte a été générée par OFM Social OS KPI System</p>
            <p>Pour modifier vos préférences d'alertes, connectez-vous au dashboard</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    await this.sendEmail({
      to: data.to,
      subject: `[${data.severity.toUpperCase()}] ${data.alertType}`,
      html,
      text: `${data.message}\n\n${data.details ? JSON.stringify(data.details, null, 2) : ''}`
    });
  }
  
  async sendDailyReport(data: {
    to: string;
    date: Date;
    metrics: Array<{
      name: string;
      value: number;
      change: number;
    }>;
    insights: string[];
    recommendations: string[];
  }) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #3b82f6; color: white; padding: 20px; text-align: center; }
          .metric { background-color: #f3f4f6; padding: 15px; margin: 10px 0; border-radius: 5px; }
          .positive { color: #10b981; }
          .negative { color: #ef4444; }
          .section { margin: 20px 0; }
          ul { padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Rapport KPI Quotidien</h2>
            <p>${data.date.toLocaleDateString()}</p>
          </div>
          
          <div class="section">
            <h3>📊 Métriques clés</h3>
            ${data.metrics.map(metric => `
              <div class="metric">
                <strong>${metric.name}:</strong> ${metric.value}
                <span class="${metric.change >= 0 ? 'positive' : 'negative'}">
                  (${metric.change >= 0 ? '+' : ''}${metric.change}%)
                </span>
              </div>
            `).join('')}
          </div>
          
          <div class="section">
            <h3>💡 Insights</h3>
            <ul>
              ${data.insights.map(insight => `<li>${insight}</li>`).join('')}
            </ul>
          </div>
          
          <div class="section">
            <h3>🎯 Recommandations</h3>
            <ul>
              ${data.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
          </div>
        </div>
      </body>
      </html>
    `;
    
    await this.sendEmail({
      to: data.to,
      subject: `Rapport KPI du ${data.date.toLocaleDateString()}`,
      html
    });
  }
}

// Singleton
const notificationService = new NotificationService();

// Exports
export const sendEmail = notificationService.sendEmail.bind(notificationService);
export const sendBulkEmails = notificationService.sendBulkEmails.bind(notificationService);
export const sendAlertEmail = notificationService.sendAlertEmail.bind(notificationService);
export const sendDailyReport = notificationService.sendDailyReport.bind(notificationService);

export default notificationService;