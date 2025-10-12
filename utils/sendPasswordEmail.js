const sgMail = require("@sendgrid/mail");
require("dotenv").config();

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

function generateVerificationCode() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit code
}

async function sendPasswordEmail(user) {
  const code = generateVerificationCode();

  // Save code and expiry to DB (10 min expiry)
  user.passwordVerificationCode = code;
  user.passwordCodeExpires = Date.now() + 10 * 60 * 1000;
  await user.save();

  const msg = {
    to: user.email,
    from: process.env.EMAIL_USER,
    replyTo: process.env.EMAIL_USER,
    subject: "Buddy Password Reset Code",
    text: `Your password reset code is: ${code}`,
    html: `
      <div style="font-family: Arial, sans-serif; font-size: 16px; color: #333;">
        <p>Hi ${user.userName},</p>
        <p>Your <strong>Buddy</strong> password reset code is:</p>
        <p style="font-size: 28px; font-weight: bold; color: #007bff;">${code}</p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn’t request this, please ignore this email.</p>
      </div>
    `,
  };

  try {
    const response = await sgMail.send(msg);
  } catch (err) {}
}

module.exports = sendPasswordEmail;
