import nodemailer from 'nodemailer';

// Configuration du transporteur email
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendWelcomeEmail(to: string) {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || 'Huntaze <noreply@huntaze.com>',
      to,
      subject: 'Welcome to Huntaze! 🚀',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #7c3aed;">Welcome aboard!</h1>
          <p>Thank you for joining the Huntaze waitlist.</p>
          <p>You're now on the list to get early access to our AI-powered platform for content creators.</p>
          <h3>What's next?</h3>
          <ul>
            <li>We'll notify you as soon as we're ready to onboard new creators</li>
            <li>You'll receive exclusive tips and insights while you wait</li>
            <li>Early access members get special pricing and features</li>
          </ul>
          <p>In the meantime, follow us on social media for updates!</p>
          <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 14px;">
            If you have any questions, reply to this email or contact support@huntaze.com
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email error:', error);
    throw error;
  }
}

// Tester la configuration
export async function testEmailConfig() {
  try {
    await transporter.verify();
    console.log('Email server is ready');
    return true;
  } catch (error) {
    console.error('Email server error:', error);
    return false;
  }
}