/**
 * Email Templates
 * Professional HTML email templates for user communications
 */

export const emailTemplates = {
  /**
   * Base template wrapper
   */
  baseTemplate: (content, options = {}) => {
    const { preheader = '', footer = true } = options;
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UX Flow Engine</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset styles */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    
    /* Mobile styles */
    @media screen and (max-width: 600px) {
      .mobile-hide { display: none !important; }
      .mobile-center { text-align: center !important; }
      .container { width: 100% !important; max-width: 100% !important; }
      .content { padding: 10px !important; }
      h1 { font-size: 24px !important; }
      .button { width: 100% !important; max-width: 300px !important; }
    }
    
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      .dark-mode-bg { background-color: #1a1a1a !important; }
      .dark-mode-text { color: #ffffff !important; }
      .dark-mode-link { color: #4a9eff !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f7;">
  ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${preheader}</div>` : ''}
  
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f7;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="container" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 40px 20px; border-bottom: 1px solid #e0e0e0;">
              <img src="${process.env.LOGO_URL || 'https://via.placeholder.com/200x50'}" alt="UX Flow Engine" width="200" style="display: block; max-width: 200px; width: 100%; height: auto;">
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td class="content" style="padding: 40px 30px;">
              ${content}
            </td>
          </tr>
          
          ${footer ? `
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #f8f9fa; border-top: 1px solid #e0e0e0; border-radius: 0 0 8px 8px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom: 20px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding: 0 10px;">
                          <a href="${process.env.SOCIAL_TWITTER || '#'}" style="color: #666666; text-decoration: none;">Twitter</a>
                        </td>
                        <td style="padding: 0 10px;">
                          <a href="${process.env.SOCIAL_LINKEDIN || '#'}" style="color: #666666; text-decoration: none;">LinkedIn</a>
                        </td>
                        <td style="padding: 0 10px;">
                          <a href="${process.env.SOCIAL_GITHUB || '#'}" style="color: #666666; text-decoration: none;">GitHub</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="color: #999999; font-size: 12px; line-height: 18px;">
                    © ${new Date().getFullYear()} UX Flow Engine. All rights reserved.<br>
                    <a href="${process.env.BASE_URL}/unsubscribe" style="color: #999999; text-decoration: underline;">Unsubscribe</a> | 
                    <a href="${process.env.BASE_URL}/privacy" style="color: #999999; text-decoration: underline;">Privacy Policy</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  },

  /**
   * Welcome email template
   */
  welcome: (data) => {
    const content = `
      <h1 style="color: #333333; font-size: 28px; font-weight: 600; margin: 0 0 20px 0;">Welcome to UX Flow Engine!</h1>
      
      <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0 0 20px 0;">
        Hi ${data.firstName || 'there'},
      </p>
      
      <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0 0 30px 0;">
        We're excited to have you on board! UX Flow Engine is the AI-powered platform that transforms your ideas into professional UX flow diagrams in minutes.
      </p>
      
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding: 30px 0;">
            <a href="${data.verificationUrl}" class="button" style="display: inline-block; padding: 14px 30px; background-color: #5865F2; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Verify Email Address</a>
          </td>
        </tr>
      </table>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 30px 0;">
        <h2 style="color: #333333; font-size: 20px; font-weight: 600; margin: 0 0 15px 0;">Get Started</h2>
        <ul style="color: #666666; font-size: 14px; line-height: 22px; margin: 0; padding-left: 20px;">
          <li style="margin-bottom: 8px;">Create your first project and describe your UX flow</li>
          <li style="margin-bottom: 8px;">Watch our AI agents collaborate to design your flow</li>
          <li style="margin-bottom: 8px;">Export your diagrams in multiple formats</li>
          <li>Collaborate with your team in real-time</li>
        </ul>
      </div>
      
      <p style="color: #666666; font-size: 14px; line-height: 22px; margin: 20px 0 0 0;">
        If you didn't create an account, you can safely ignore this email.
      </p>`;
    
    return emailTemplates.baseTemplate(content, {
      preheader: 'Verify your email to get started with UX Flow Engine'
    });
  },

  /**
   * Email verification template
   */
  emailVerification: (data) => {
    const content = `
      <h1 style="color: #333333; font-size: 28px; font-weight: 600; margin: 0 0 20px 0;">Verify Your Email</h1>
      
      <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0 0 30px 0;">
        Please verify your email address to complete your registration and access all features of UX Flow Engine.
      </p>
      
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding: 30px 0;">
            <a href="${data.verificationUrl}" class="button" style="display: inline-block; padding: 14px 30px; background-color: #5865F2; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Verify Email Address</a>
          </td>
        </tr>
      </table>
      
      <p style="color: #999999; font-size: 14px; line-height: 20px; margin: 20px 0;">
        Or copy and paste this link into your browser:
      </p>
      <p style="color: #5865F2; font-size: 14px; line-height: 20px; word-break: break-all; margin: 0 0 30px 0;">
        ${data.verificationUrl}
      </p>
      
      <p style="color: #666666; font-size: 14px; line-height: 22px; margin: 0;">
        This link will expire in 24 hours. If you didn't request this verification, please ignore this email.
      </p>`;
    
    return emailTemplates.baseTemplate(content, {
      preheader: 'Action required: Verify your email address'
    });
  },

  /**
   * Password reset template
   */
  passwordReset: (data) => {
    const content = `
      <h1 style="color: #333333; font-size: 28px; font-weight: 600; margin: 0 0 20px 0;">Reset Your Password</h1>
      
      <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0 0 30px 0;">
        We received a request to reset your password. Click the button below to create a new password.
      </p>
      
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding: 30px 0;">
            <a href="${data.resetUrl}" class="button" style="display: inline-block; padding: 14px 30px; background-color: #5865F2; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Reset Password</a>
          </td>
        </tr>
      </table>
      
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 30px 0;">
        <p style="color: #92400e; font-size: 14px; line-height: 20px; margin: 0;">
          <strong>Security Notice:</strong> This link will expire in 1 hour. If you didn't request a password reset, please secure your account immediately.
        </p>
      </div>
      
      <p style="color: #999999; font-size: 14px; line-height: 20px; margin: 20px 0;">
        Or copy and paste this link into your browser:
      </p>
      <p style="color: #5865F2; font-size: 14px; line-height: 20px; word-break: break-all; margin: 0;">
        ${data.resetUrl}
      </p>`;
    
    return emailTemplates.baseTemplate(content, {
      preheader: 'Reset your UX Flow Engine password'
    });
  },

  /**
   * Password changed notification
   */
  passwordChanged: (data) => {
    const content = `
      <h1 style="color: #333333; font-size: 28px; font-weight: 600; margin: 0 0 20px 0;">Password Changed Successfully</h1>
      
      <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0 0 30px 0;">
        Your password has been successfully changed on ${new Date().toLocaleString()}.
      </p>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 30px 0;">
        <h3 style="color: #333333; font-size: 16px; font-weight: 600; margin: 0 0 10px 0;">Security Information</h3>
        <p style="color: #666666; font-size: 14px; line-height: 20px; margin: 0 0 10px 0;">
          <strong>IP Address:</strong> ${data.ipAddress || 'Unknown'}<br>
          <strong>Browser:</strong> ${data.userAgent || 'Unknown'}<br>
          <strong>Time:</strong> ${new Date().toLocaleString()}
        </p>
      </div>
      
      <p style="color: #666666; font-size: 14px; line-height: 22px; margin: 0 0 20px 0;">
        If you didn't make this change, please reset your password immediately and contact our support team.
      </p>
      
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding: 20px 0;">
            <a href="${process.env.BASE_URL}/support" style="display: inline-block; padding: 12px 24px; background-color: #ef4444; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">Report Unauthorized Access</a>
          </td>
        </tr>
      </table>`;
    
    return emailTemplates.baseTemplate(content, {
      preheader: 'Your password has been changed'
    });
  },

  /**
   * Two-factor authentication enabled
   */
  twoFactorEnabled: (data) => {
    const content = `
      <h1 style="color: #333333; font-size: 28px; font-weight: 600; margin: 0 0 20px 0;">Two-Factor Authentication Enabled</h1>
      
      <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0 0 30px 0;">
        Great news! You've successfully enabled two-factor authentication on your account, adding an extra layer of security.
      </p>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 15px; margin: 30px 0;">
        <h3 style="color: #0c4a6e; font-size: 16px; font-weight: 600; margin: 0 0 10px 0;">Your Backup Codes</h3>
        <p style="color: #0c4a6e; font-size: 14px; line-height: 20px; margin: 0 0 15px 0;">
          Save these backup codes in a secure location. Each code can only be used once.
        </p>
        <div style="background-color: #ffffff; padding: 15px; border-radius: 4px; font-family: monospace; font-size: 14px;">
          ${data.backupCodes.map(code => `${code}<br>`).join('')}
        </div>
      </div>
      
      <p style="color: #666666; font-size: 14px; line-height: 22px; margin: 20px 0;">
        You'll now need to enter a verification code from your authenticator app when signing in.
      </p>`;
    
    return emailTemplates.baseTemplate(content, {
      preheader: 'Your account is now more secure'
    });
  },

  /**
   * Workspace invitation
   */
  workspaceInvitation: (data) => {
    const content = `
      <h1 style="color: #333333; font-size: 28px; font-weight: 600; margin: 0 0 20px 0;">You're Invited!</h1>
      
      <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0 0 30px 0;">
        ${data.inviterName} has invited you to join the <strong>${data.workspaceName}</strong> workspace on UX Flow Engine.
      </p>
      
      ${data.message ? `
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 30px 0; border-left: 4px solid #5865F2;">
        <p style="color: #666666; font-size: 14px; line-height: 20px; margin: 0; font-style: italic;">
          "${data.message}"
        </p>
        <p style="color: #999999; font-size: 12px; margin: 10px 0 0 0;">
          — ${data.inviterName}
        </p>
      </div>
      ` : ''}
      
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding: 30px 0;">
            <a href="${data.acceptUrl}" class="button" style="display: inline-block; padding: 14px 30px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600; margin-right: 10px;">Accept Invitation</a>
            <a href="${data.declineUrl}" style="display: inline-block; padding: 14px 30px; background-color: #ffffff; color: #666666; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600; border: 2px solid #e5e7eb;">Decline</a>
          </td>
        </tr>
      </table>
      
      <p style="color: #999999; font-size: 14px; line-height: 22px; margin: 20px 0;">
        This invitation will expire in 7 days.
      </p>`;
    
    return emailTemplates.baseTemplate(content, {
      preheader: `Join ${data.workspaceName} on UX Flow Engine`
    });
  },

  /**
   * Account deletion confirmation
   */
  accountDeletion: (data) => {
    const content = `
      <h1 style="color: #333333; font-size: 28px; font-weight: 600; margin: 0 0 20px 0;">Account Deletion Scheduled</h1>
      
      <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0 0 30px 0;">
        Your account deletion request has been received. Your account and all associated data will be permanently deleted in 30 days.
      </p>
      
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 30px 0;">
        <h3 style="color: #991b1b; font-size: 16px; font-weight: 600; margin: 0 0 10px 0;">What will be deleted:</h3>
        <ul style="color: #991b1b; font-size: 14px; line-height: 20px; margin: 0; padding-left: 20px;">
          <li>Your profile and account information</li>
          <li>All projects and UX flows</li>
          <li>Workspace memberships</li>
          <li>API keys and integrations</li>
        </ul>
      </div>
      
      <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 30px 0;">
        If you change your mind, you can cancel the deletion request within the next 30 days.
      </p>
      
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding: 20px 0;">
            <a href="${data.cancelUrl}" style="display: inline-block; padding: 12px 24px; background-color: #5865F2; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">Cancel Deletion</a>
          </td>
        </tr>
      </table>`;
    
    return emailTemplates.baseTemplate(content, {
      preheader: 'Your account will be deleted in 30 days'
    });
  },

  /**
   * API key created notification
   */
  apiKeyCreated: (data) => {
    const content = `
      <h1 style="color: #333333; font-size: 28px; font-weight: 600; margin: 0 0 20px 0;">New API Key Created</h1>
      
      <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0 0 30px 0;">
        A new API key has been created for your account.
      </p>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 30px 0;">
        <h3 style="color: #333333; font-size: 16px; font-weight: 600; margin: 0 0 15px 0;">API Key Details</h3>
        <p style="color: #666666; font-size: 14px; line-height: 20px; margin: 0;">
          <strong>Name:</strong> ${data.keyName}<br>
          <strong>Created:</strong> ${new Date().toLocaleString()}<br>
          <strong>Expires:</strong> ${data.expiresAt ? new Date(data.expiresAt).toLocaleString() : 'Never'}<br>
          <strong>Scopes:</strong> ${data.scopes.join(', ') || 'Full access'}
        </p>
      </div>
      
      <p style="color: #666666; font-size: 14px; line-height: 22px; margin: 20px 0;">
        If you didn't create this API key, please revoke it immediately and secure your account.
      </p>
      
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding: 20px 0;">
            <a href="${process.env.BASE_URL}/settings/api-keys" style="display: inline-block; padding: 12px 24px; background-color: #5865F2; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">Manage API Keys</a>
          </td>
        </tr>
      </table>`;
    
    return emailTemplates.baseTemplate(content, {
      preheader: 'New API key created for your account'
    });
  },

  /**
   * Suspicious activity alert
   */
  suspiciousActivity: (data) => {
    const content = `
      <h1 style="color: #ef4444; font-size: 28px; font-weight: 600; margin: 0 0 20px 0;">⚠️ Suspicious Activity Detected</h1>
      
      <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0 0 30px 0;">
        We've detected unusual activity on your account that requires your attention.
      </p>
      
      <div style="background-color: #fef2f2; border: 2px solid #ef4444; padding: 20px; border-radius: 6px; margin: 30px 0;">
        <h3 style="color: #991b1b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0;">Activity Details</h3>
        <p style="color: #991b1b; font-size: 14px; line-height: 20px; margin: 0;">
          <strong>Type:</strong> ${data.activityType}<br>
          <strong>Location:</strong> ${data.location || 'Unknown'}<br>
          <strong>IP Address:</strong> ${data.ipAddress}<br>
          <strong>Time:</strong> ${new Date().toLocaleString()}
        </p>
      </div>
      
      <h3 style="color: #333333; font-size: 18px; font-weight: 600; margin: 30px 0 15px 0;">Recommended Actions:</h3>
      <ol style="color: #666666; font-size: 14px; line-height: 22px; margin: 0 0 30px 0; padding-left: 20px;">
        <li style="margin-bottom: 8px;">Review your recent account activity</li>
        <li style="margin-bottom: 8px;">Change your password immediately</li>
        <li style="margin-bottom: 8px;">Enable two-factor authentication</li>
        <li>Review and revoke any suspicious API keys or sessions</li>
      </ol>
      
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding: 20px 0;">
            <a href="${process.env.BASE_URL}/security" style="display: inline-block; padding: 14px 30px; background-color: #ef4444; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Secure My Account</a>
          </td>
        </tr>
      </table>`;
    
    return emailTemplates.baseTemplate(content, {
      preheader: 'Urgent: Suspicious activity on your account'
    });
  }
};

export default emailTemplates;