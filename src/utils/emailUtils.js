const nodemailer = require("nodemailer");
const crypto = require("crypto");

// Create reusable transporter
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Generate a random token
const generateToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// Send verification email with improved styling
const sendVerificationEmail = async (user, host) => {
  try {
    const token = generateToken();

    // Save token to user
    user.verificationToken = token;
    user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();

    // Create verification URL
    const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
    const verificationURL = `${FRONTEND_URL}/verify-email/${token}`;

    // Send email
    const mailOptions = {
      to: user.email,
      from: process.env.EMAIL_USERNAME,
      subject: "🎬 Verify Your Movie Monday Account",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Email</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f7; padding: 40px 0;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                    
                    <!-- Header with gradient background -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                          🎬 Movie Monday
                        </h1>
                        <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">
                          Your Personal Movie Journey Begins
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Main content -->
                    <tr>
                      <td style="padding: 40px 30px;">
                        <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 24px; font-weight: 600;">
                          Welcome, ${user.username}! 👋
                        </h2>
                        
                        <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                          Thank you for joining Movie Monday! We're excited to help you discover, track, and share your favorite films.
                        </p>
                        
                        <p style="margin: 0 0 30px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                          To get started, please verify your email address by clicking the button below:
                        </p>
                        
                        <!-- Call to action button -->
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center" style="padding: 0 0 30px 0;">
                              <a href="${verificationURL}" 
                                 style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 6px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                                Verify Email Address
                              </a>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- Divider -->
                        <div style="border-top: 1px solid #e0e0e0; margin: 30px 0;"></div>
                        
                        <!-- Alternative link -->
                        <p style="margin: 0 0 10px 0; color: #777777; font-size: 14px; line-height: 1.6;">
                          If the button above doesn't work, copy and paste this link into your browser:
                        </p>
                        
                        <p style="margin: 0 0 30px 0; padding: 15px; background-color: #f8f9fa; border-radius: 4px; word-break: break-all;">
                          <a href="${verificationURL}" 
                             style="color: #667eea; text-decoration: none; font-size: 13px;">
                            ${verificationURL}
                          </a>
                        </p>
                        
                        <!-- Security note -->
                        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px; margin: 0 0 20px 0;">
                          <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.6;">
                            <strong>⏰ Quick Reminder:</strong> This verification link will expire in 24 hours for your security.
                          </p>
                        </div>
                        
                        <p style="margin: 0; color: #777777; font-size: 14px; line-height: 1.6;">
                          If you didn't create a Movie Monday account, you can safely ignore this email.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
                        <p style="margin: 0 0 10px 0; color: #999999; font-size: 13px;">
                          Happy watching! 🍿
                        </p>
                        <p style="margin: 0; color: #999999; font-size: 13px;">
                          The Movie Monday Team
                        </p>
                      </td>
                    </tr>
                    
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    };

    console.log("Attempting to send email to:", user.email);
    console.log("Using email account:", process.env.EMAIL_USERNAME);
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.response);

    return info;
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw error;
  }
};

// Send password reset email with improved styling
const sendPasswordResetEmail = async (user, host) => {
  const token = generateToken();

  // Save token to user
  user.passwordResetToken = token;
  user.passwordResetExpires = Date.now() + 1 * 60 * 60 * 1000; // 1 hour
  await user.save();

  // Create reset URL
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
  const resetURL = `${FRONTEND_URL}/reset-password/${token}`;

  // Send email
  const mailOptions = {
    to: user.email,
    from: process.env.EMAIL_USERNAME,
    subject: "🔒 Reset Your Movie Monday Password",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f7; padding: 40px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                  
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                        🎬 Movie Monday
                      </h1>
                      <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">
                        Password Reset Request
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Main content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 24px; font-weight: 600;">
                        Hello, ${user.username} 👋
                      </h2>
                      
                      <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                        We received a request to reset the password for your Movie Monday account.
                      </p>
                      
                      <p style="margin: 0 0 30px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                        Click the button below to create a new password:
                      </p>
                      
                      <!-- Call to action button -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 0 0 30px 0;">
                            <a href="${resetURL}" 
                               style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 6px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                              Reset Password
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Divider -->
                      <div style="border-top: 1px solid #e0e0e0; margin: 30px 0;"></div>
                      
                      <!-- Alternative link -->
                      <p style="margin: 0 0 10px 0; color: #777777; font-size: 14px; line-height: 1.6;">
                        If the button above doesn't work, copy and paste this link into your browser:
                      </p>
                      
                      <p style="margin: 0 0 30px 0; padding: 15px; background-color: #f8f9fa; border-radius: 4px; word-break: break-all;">
                        <a href="${resetURL}" 
                           style="color: #667eea; text-decoration: none; font-size: 13px;">
                          ${resetURL}
                        </a>
                      </p>
                      
                      <!-- Security warnings -->
                      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px; margin: 0 0 20px 0;">
                        <p style="margin: 0 0 10px 0; color: #856404; font-size: 14px; line-height: 1.6;">
                          <strong>⏰ Important:</strong> This password reset link will expire in 1 hour.
                        </p>
                        <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.6;">
                          <strong>🔒 Security Note:</strong> If you didn't request this password reset, please ignore this email and your password will remain unchanged.
                        </p>
                      </div>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
                      <p style="margin: 0 0 10px 0; color: #999999; font-size: 13px;">
                        Stay secure! 🔐
                      </p>
                      <p style="margin: 0; color: #999999; font-size: 13px;">
                        The Movie Monday Team
                      </p>
                    </td>
                  </tr>
                  
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = {
  generateToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
};