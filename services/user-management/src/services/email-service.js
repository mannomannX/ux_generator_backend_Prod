// ==========================================
// SERVICES/USER-MANAGEMENT/src/services/email-service.js
// ==========================================
import nodemailer from 'nodemailer';
import config from '../config/index.js';

class EmailService {
  constructor(logger) {
    this.logger = logger;
    this.transporter = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      if (config.email.provider === 'smtp' && config.email.smtp.host) {
        this.transporter = nodemailer.createTransporter({
          host: config.email.smtp.host,
          port: config.email.smtp.port,
          secure: config.email.smtp.secure,
          auth: config.email.smtp.auth.user ? {
            user: config.email.smtp.auth.user,
            pass: config.email.smtp.auth.pass,
          } : undefined,
        });

        // Verify connection
        await this.transporter.verify();
        this.logger.info('SMTP connection verified successfully');
      } else {
        this.logger.warn('Email service not configured - emails will be logged only');
      }

      this.initialized = true;
    } catch (error) {
      this.logger.error('Failed to initialize email service', error);
      throw error;
    }
  }

  async sendEmail(to, subject, html, text = null) {
    try {
      const emailOptions = {
        from: {
          name: config.email.from.name,
          address: config.email.from.address,
        },
        to,
        subject,
        html,
        text: text || this.htmlToText(html),
      };

      if (this.transporter) {
        const result = await this.transporter.sendMail(emailOptions);
        this.logger.info('Email sent successfully', {
          to,
          subject,
          messageId: result.messageId,
        });
        return result;
      } else {
        // Log email instead of sending (development mode)
        this.logger.info('EMAIL (Development Mode)', {
          to,
          subject,
          html,
        });
        return { messageId: 'dev-mode-' + Date.now() };
      }
    } catch (error) {
      this.logger.error('Failed to send email', error, { to, subject });
      throw error;
    }
  }

  async sendWelcomeEmail(email, data) {
    try {
      if (!config.email.templates.welcomeEmail) return;

      const { firstName, workspaceName } = data;

      const subject = `Welcome to UX-Flow-Engine${workspaceName ? ` - ${workspaceName}` : ''}!`;
      
      const html = this.generateWelcomeEmailHtml({
        firstName: firstName || 'User',
        workspaceName: workspaceName || 'Your Workspace',
      });

      await this.sendEmail(email, subject, html);

      this.logger.info('Welcome email sent', { email, firstName });
    } catch (error) {
      this.logger.error('Failed to send welcome email', error, { email });
      // Don't throw - welcome email failure shouldn't block registration
    }
  }

  async sendEmailVerification(email, data) {
    try {
      if (!config.email.templates.emailVerification) return;

      const { firstName, verificationToken, baseUrl } = data;
      const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

      const subject = 'Verify your email address';
      
      const html = this.generateEmailVerificationHtml({
        firstName: firstName || 'User',
        verificationUrl,
      });

      await this.sendEmail(email, subject, html);

      this.logger.info('Email verification sent', { email });
    } catch (error) {
      this.logger.error('Failed to send email verification', error, { email });
      throw error;
    }
  }

  async sendPasswordReset(email, data) {
    try {
      if (!config.email.templates.passwordReset) return;

      const { firstName, resetToken, baseUrl } = data;
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

      const subject = 'Reset your password';
      
      const html = this.generatePasswordResetHtml({
        firstName: firstName || 'User',
        resetUrl,
        expiryHours: 1, // Password reset expires in 1 hour
      });

      await this.sendEmail(email, subject, html);

      this.logger.info('Password reset email sent', { email });
    } catch (error) {
      this.logger.error('Failed to send password reset email', error, { email });
      throw error;
    }
  }

  async sendWorkspaceInvitation(email, data) {
    try {
      if (!config.email.templates.workspaceInvitation) return;

      const { workspaceName, inviterName, invitationToken, message, baseUrl } = data;
      const invitationUrl = `${baseUrl}/accept-invitation?token=${invitationToken}`;

      const subject = `You're invited to join ${workspaceName} on UX-Flow-Engine`;
      
      const html = this.generateWorkspaceInvitationHtml({
        workspaceName,
        inviterName,
        invitationUrl,
        message,
      });

      await this.sendEmail(email, subject, html);

      this.logger.info('Workspace invitation sent', { email, workspaceName });
    } catch (error) {
      this.logger.error('Failed to send workspace invitation', error, { email });
      throw error;
    }
  }

  // Email template generators
  generateWelcomeEmailHtml(data) {
    const { firstName, workspaceName } = data;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to UX-Flow-Engine</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Welcome to UX-Flow-Engine!</h1>
            <p>Your AI-powered UX design companion</p>
        </div>
        <div class="content">
            <h2>Hi ${firstName}!</h2>
            <p>Welcome to UX-Flow-Engine! We're excited to have you on board.</p>
            
            <p>Your workspace "<strong>${workspaceName}</strong>" is ready to go. You can now:</p>
            <ul>
                <li>🤖 Chat with our AI to create flows instantly</li>
                <li>📊 Design complex user journeys with ease</li>
                <li>👥 Collaborate with your team in real-time</li>
                <li>📈 Version and iterate on your designs</li>
            </ul>

            <p>Ready to create your first flow?</p>
            <a href="${process.env.FRONTEND_URL || 'https://app.ux-flow-engine.com'}" class="button">Get Started</a>

            <p>If you have any questions, our team is here to help. Just reply to this email!</p>
            
            <p>Happy designing!<br>
            The UX-Flow-Engine Team</p>
        </div>
        <div class="footer">
            <p>UX-Flow-Engine - AI-Powered UX Design Made Simple</p>
        </div>
    </div>
</body>
</html>`;
  }

  generateEmailVerificationHtml(data) {
    const { firstName, verificationUrl } = data;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify your email address</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #667eea; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 6px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✉️ Verify your email address</h1>
        </div>
        <div class="content">
            <h2>Hi ${firstName}!</h2>
            <p>Thank you for signing up for UX-Flow-Engine! To complete your registration, please verify your email address by clicking the button below:</p>

            <a href="${verificationUrl}" class="button">Verify Email Address</a>

            <div class="warning">
                <strong>⏰ This verification link expires in 24 hours.</strong>
            </div>

            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>

            <p>If you didn't create an account with UX-Flow-Engine, you can safely ignore this email.</p>
            
            <p>Best regards,<br>
            The UX-Flow-Engine Team</p>
        </div>
        <div class="footer">
            <p>UX-Flow-Engine - AI-Powered UX Design Made Simple</p>
        </div>
    </div>
</body>
</html>`;
  }

  generatePasswordResetHtml(data) {
    const { firstName, resetUrl, expiryHours } = data;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset your password</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc3545; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        .warning { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 6px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 Reset your password</h1>
        </div>
        <div class="content">
            <h2>Hi ${firstName}!</h2>
            <p>We received a request to reset your password for your UX-Flow-Engine account. Click the button below to set a new password:</p>

            <a href="${resetUrl}" class="button">Reset Password</a>

            <div class="warning">
                <strong>⏰ This password reset link expires in ${expiryHours} hour${expiryHours > 1 ? 's' : ''}.</strong>
            </div>

            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #dc3545;">${resetUrl}</p>

            <p><strong>If you didn't request a password reset</strong>, you can safely ignore this email. Your password will remain unchanged.</p>
            
            <p>Best regards,<br>
            The UX-Flow-Engine Team</p>
        </div>
        <div class="footer">
            <p>UX-Flow-Engine - AI-Powered UX Design Made Simple</p>
        </div>
    </div>
</body>
</html>`;
  }

  generateWorkspaceInvitationHtml(data) {
    const { workspaceName, inviterName, invitationUrl, message } = data;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workspace Invitation</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        .message-box { background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0; }
        .workspace-info { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #dee2e6; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 You're Invited!</h1>
            <p>Join ${workspaceName} on UX-Flow-Engine</p>
        </div>
        <div class="content">
            <h2>Hi there!</h2>
            <p><strong>${inviterName}</strong> has invited you to join the <strong>${workspaceName}</strong> workspace on UX-Flow-Engine.</p>
            
            <div class="workspace-info">
                <h3>📋 About ${workspaceName}</h3>
                <p>This workspace is where you'll collaborate on UX design projects using our AI-powered flow design tools.</p>
                
                <p>As a team member, you'll be able to:</p>
                <ul>
                    <li>🤖 Create flows with AI assistance</li>
                    <li>👥 Collaborate in real-time</li>
                    <li>📊 Access shared design resources</li>
                    <li>💬 Participate in design discussions</li>
                </ul>
            </div>

            ${message ? `
            <div class="message-box">
                <strong>Personal message from ${inviterName}:</strong><br>
                "${message}"
            </div>
            ` : ''}

            <p>Ready to join the team?</p>
            <a href="${invitationUrl}" class="button">Accept Invitation</a>

            <p><strong>Note:</strong> This invitation will expire in 7 days. If you don't have a UX-Flow-Engine account yet, you'll be prompted to create one when you accept the invitation.</p>
            
            <p>If you have any questions about this invitation, feel free to reach out to ${inviterName} or our support team.</p>
            
            <p>Best regards,<br>
            The UX-Flow-Engine Team</p>
        </div>
        <div class="footer">
            <p>UX-Flow-Engine - AI-Powered UX Design Made Simple</p>
        </div>
    </div>
</body>
</html>`;
  }

  // Utility methods
  htmlToText(html) {
    // Simple HTML to text conversion
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  async healthCheck() {
    try {
      if (!this.initialized) {
        return { status: 'error', message: 'Email service not initialized' };
      }

      if (this.transporter) {
        await this.transporter.verify();
        return { 
          status: 'ok', 
          provider: config.email.provider,
          configured: true 
        };
      } else {
        return { 
          status: 'ok', 
          provider: 'development',
          configured: false,
          message: 'Email service running in development mode (logging only)'
        };
      }
    } catch (error) {
      this.logger.error('Email service health check failed', error);
      return { 
        status: 'error', 
        message: error.message,
        provider: config.email.provider
      };
    }
  }
}

export { EmailService };