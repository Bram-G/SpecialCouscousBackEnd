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

// Send verification email
const sendVerificationEmail = async (user, host) => {
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
    subject: "Movie Monday - Email Verification",
    html: `
      <h1>Welcome to Movie Monday!</h1>
      <p>Please click the link below to verify your email address:</p>
      <a href="${verificationURL}">Verify Email</a>
      <p>This link will expire in 24 hours.</p>
    `,
  };

  return transporter.sendMail(mailOptions);
};

// Send password reset email
const sendPasswordResetEmail = async (user, host) => {
  const token = generateToken();

  // Save token to user
  user.passwordResetToken = token;
  user.passwordResetExpires = Date.now() + 1 * 60 * 60 * 1000; // 1 hour
  await user.save();

  // Create reset URL
  const resetURL = `http://${host}/reset-password/${token}`;

  // Send email
  const mailOptions = {
    to: user.email,
    from: process.env.EMAIL_USERNAME,
    subject: "Movie Monday - Password Reset",
    html: `
      <h1>Password Reset</h1>
      <p>You requested a password reset for your Movie Monday account.</p>
      <p>Please click the link below to reset your password:</p>
      <a href="${resetURL}">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = {
  generateToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
