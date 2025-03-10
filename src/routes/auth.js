const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
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
    
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      isVerified: false
    });

    // Send verification email
     // Send verification email
     await sendVerificationEmail(user, req.headers.host);

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
    
    const user = await User.findOne({
      where: {
        verificationToken: token,
        verificationTokenExpires: { [Op.gt]: Date.now() }
      }
    });
    
    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or expired verification token' 
      });
    }
    
    // Update user as verified
    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();
    
    // Return success
    res.json({ 
      success: true,
      message: 'Email verified successfully. You can now log in.' 
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ 
      success: false,
      message: 'An error occurred during verification' 
    });
  }
});

// Login with verification check
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Check if email is verified
    if (!user.isVerified) {
      return res.status(403).json({ 
        message: 'Email not verified. Please check your email to verify your account.',
        needsVerification: true
      });
    }

    // Generate token
    const token = jwt.sign(
      { 
        id: user.id,
        username: user.username 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

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
    
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      // For security, don't reveal if email exists
      return res.json({ 
        success: true,
        message: 'If your email exists in our system, a verification email has been sent.' 
      });
    }
    
    if (user.isVerified) {
      return res.json({ 
        success: true,
        alreadyVerified: true,
        message: 'Your email is already verified. You can log in now.' 
      });
    }
    
    // Send new verification email
    await sendVerificationEmail(user, req.headers.host);
    
    res.json({ 
      success: true,
      message: 'Verification email has been resent to your email address.' 
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

module.exports = router;