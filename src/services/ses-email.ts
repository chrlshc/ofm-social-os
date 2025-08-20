import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { env } from '@/lib/env';

// Configuration AWS SES
const sesClient = new SESClient({
  region: env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export async function sendWelcomeEmail(to: string) {
  try {
    const params = {
      Source: env.SES_FROM_EMAIL || 'Huntaze <charles@huntaze.com>',
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Data: 'Welcome to Huntaze! 🚀',
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(to right, #7c3aed, #ec4899); padding: 40px; text-align: center;">
                  <h1 style="color: white; margin: 0;">Welcome to Huntaze!</h1>
                </div>
                
                <div style="padding: 40px; background: #ffffff;">
                  <p style="font-size: 18px; color: #374151;">Thank you for joining our waitlist!</p>
                  
                  <p style="color: #6b7280;">You're now on the list to get early access to our AI-powered platform that's helping creators automate their OnlyFans business.</p>
                  
                  <h3 style="color: #1f2937; margin-top: 30px;">What happens next?</h3>
                  <ul style="color: #6b7280; line-height: 1.8;">
                    <li>We'll notify you as soon as we're ready to onboard new creators</li>
                    <li>You'll receive exclusive tips and insights while you wait</li>
                    <li>Early access members get special pricing and features</li>
                  </ul>
                  
                  <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 30px 0;">
                    <p style="margin: 0; color: #6b7280;">
                      <strong>Pro tip:</strong> Follow us on social media for updates and creator success stories!
                    </p>
                  </div>
                  
                  <hr style="border: 1px solid #e5e7eb; margin: 30px 0;">
                  
                  <p style="color: #9ca3af; font-size: 14px;">
                    If you have any questions, reply to this email or contact charles@huntaze.com
                  </p>
                </div>
              </div>
            `,
            Charset: 'UTF-8',
          },
          Text: {
            Data: `
Welcome to Huntaze!

Thank you for joining our waitlist!

You're now on the list to get early access to our AI-powered platform that's helping creators automate their OnlyFans business.

What happens next?
- We'll notify you as soon as we're ready to onboard new creators
- You'll receive exclusive tips and insights while you wait
- Early access members get special pricing and features

Pro tip: Follow us on social media for updates and creator success stories!

If you have any questions, reply to this email or contact charles@huntaze.com

Best regards,
The Huntaze Team
            `,
            Charset: 'UTF-8',
          },
        },
      },
    };

    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    
    console.log('Email sent via AWS SES:', response.MessageId);
    return response;
  } catch (error) {
    console.error('AWS SES error:', error);
    throw error;
  }
}

// Vérifier la configuration SES
export async function verifySESConfig() {
  try {
    // Test avec un email de vérification
    const testParams = {
      Source: env.SES_FROM_EMAIL || 'charles@huntaze.com',
      Destination: {
        ToAddresses: [env.SES_FROM_EMAIL || 'charles@huntaze.com'],
      },
      Message: {
        Subject: { Data: 'SES Configuration Test' },
        Body: {
          Text: { Data: 'This is a test email to verify AWS SES configuration.' },
        },
      },
    };
    
    const command = new SendEmailCommand(testParams);
    await sesClient.send(command);
    
    console.log('✅ AWS SES is configured correctly');
    return true;
  } catch (error: any) {
    console.error('❌ AWS SES configuration error:', error.message);
    return false;
  }
}