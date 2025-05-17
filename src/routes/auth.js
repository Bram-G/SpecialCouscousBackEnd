const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, WatchlistCategory, sequelize } = require('../models');
const crypto = require('crypto')
const { Op } = require('sequelize');
const auth = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailUtils');

// Registration with email verification
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ 
        message: 'Missing required fields'
      });
    }

    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          { username: username },
          { email: email }
        ]
      }
    });
    
    if (existingUser) {
      return res.status(409).json({ 
        message: 'User already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate a verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    // Create the user
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      isVerified: false,
      verificationToken,
      verificationTokenExpires
    });

    // Create a default watchlist for the new user
    await WatchlistCategory.create({
      name: 'My Watchlist',
      description: 'Your default watchlist for saved movies',
      userId: user.id,
      isPublic: false
    });

    // Send verification email
    try {
      await sendVerificationEmail(user, req.headers.origin || req.headers.host);
    } catch (emailError) {
      console.error('Error sending verification email:', emailError);
      // Continue with the registration process even if email fails
    }

    // Return success without token
    res.status(201).json({ 
      success: true,
      message: 'User created successfully. Please check your email to verify your account.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Verify email
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    console.log('Verification attempt with token:', token);
    
    if (!token) {
      console.log('Token missing in request');
      return res.status(400).json({ 
        success: false,
        message: 'Verification token is missing' 
      });
    }
    
    // Find user with this token
    const user = await User.findOne({
      where: {
        verificationToken: token
      }
    });
    
    // Log the result of the lookup
    if (user) {
      console.log(`Found user ${user.username} (${user.email}) with provided token`);
    } else {
      console.log('No user found with provided token:', token);
    }
    
    // Check if user exists
    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid verification token' 
      });
    }
    
    // Check if already verified
    if (user.isVerified) {
      console.log(`User ${user.email} is already verified`);
      return res.json({ 
        success: true,
        alreadyVerified: true,
        message: 'Your email is already verified. You can now log in.' 
      });
    }
    
    // Check if token is expired
    if (user.verificationTokenExpires && new Date(user.verificationTokenExpires) < new Date()) {
      console.log(`Token expired for user ${user.email}. Expired at: ${user.verificationTokenExpires}`);
      return res.status(400).json({ 
        success: false,
        expired: true,
        message: 'Verification token has expired. Please request a new one.' 
      });
    }
    
    // Update user as verified
    console.log(`Verifying user ${user.email}`);
    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();
    
    console.log(`Successfully verified user ${user.email}`);
    
    // Return success
    res.json({ 
      success: true,
      message: 'Email verified successfully. You can now log in.' 
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ 
      success: false,
      message: 'An error occurred during verification. Please try again.' 
    });
  }
});

// Login with verification check
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('Login attempt for user:', username);
    
    const user = await User.findOne({ where: { username } });
    
    if (!user) {
      console.log('No user found with username:', username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('Invalid password for user:', username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    console.log(`User ${username} verification status: ${user.isVerified ? 'Verified' : 'Not Verified'}`);
    
    // Check if email is verified
    if (!user.isVerified) {
      console.log(`Login rejected for ${username} - not verified`);
      return res.status(403).json({ 
        message: 'Email not verified. Please check your email to verify your account.',
        needsVerification: true,
        email: user.email // Include email for easy resending
      });
    }

    // Generate token
    const token = jwt.sign(
      { 
        id: user.id,
        username: user.username 
      },
      process.env.JWT_SECRET,
      { expiresIn: '14d' }
    );

    console.log(`Successful login for ${username}`);
    
    res.json({ 
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    console.log('Resend verification request for:', email);
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }
    
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      console.log('No user found with email:', email);
      return res.json({ 
        success: true,
        message: 'If your email exists in our system, a verification email has been sent.' 
      });
    }
    
    console.log(`Found user: ${user.username} (${user.email}), isVerified: ${user.isVerified}`);
    
    // Check if already verified
    if (user.isVerified) {
      console.log(`User ${user.email} is already verified`);
      return res.json({ 
        success: true,
        alreadyVerified: true,
        message: 'Your email is already verified. You can log in now.' 
      });
    }
    
    // Create a new verification token
    const verificationToken = require('crypto').randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    console.log(`Generated new token for ${user.email}:`, verificationToken);
    
    // Update user with new token
    user.verificationToken = verificationToken;
    user.verificationTokenExpires = verificationTokenExpires;
    await user.save();
    
    console.log(`Updated user ${user.email} with new verification token`);
    
    // Send verification email
    try {
      await sendVerificationEmail(user, req.headers.origin || req.headers.host);
      console.log(`Successfully sent verification email to ${user.email}`);
    } catch (emailError) {
      console.error(`Failed to send verification email to ${user.email}:`, emailError);
      return res.status(500).json({ 
        success: false,
        message: 'Failed to send verification email. Please try again later.' 
      });
    }
    
    // Return success
    res.json({ 
      success: true,
      message: 'Verification email has been sent to your email address.' 
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ 
      success: false,
      message: 'An error occurred. Please try again later.' 
    });
  }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      // For security, don't reveal if email exists
      return res.json({ message: 'If your email exists in our system, a password reset email has been sent.' });
    }
    
    // Send password reset email
    await sendPasswordResetEmail(user, req.headers.host);
    
    res.json({ message: 'Password reset email has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/check-verification', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    const user = await User.findOne({ 
      where: { email },
      attributes: ['id', 'email', 'isVerified'] 
    });
    
    if (!user) {
      return res.json({ 
        exists: false,
        message: 'No account found with this email' 
      });
    }
    
    return res.json({
      exists: true,
      isVerified: user.isVerified,
      message: user.isVerified 
        ? 'Account is verified' 
        : 'Account is not verified'
    });
  } catch (error) {
    console.error('Verification check error:', error);
    res.status(500).json({ message: 'Error checking verification status' });
  }
});

// Reset password
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    const user = await User.findOne({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { [Op.gt]: Date.now() }
      }
    });
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired password reset token' });
    }
    
    // Update password
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();
    
    res.json({ message: 'Password has been reset successfully. You can now log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/verify', auth, (req, res) => {
  // If we reach here, the auth middleware has already verified the token
  // and attached the user to the request
  res.json({
    valid: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email
    }
  });
});

module.exports = router;