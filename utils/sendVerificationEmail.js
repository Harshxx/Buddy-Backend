const sgMail = require("@sendgrid/mail");
require("dotenv").config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

function generateVerificationCode() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit code
}

async function sendVerificationEmail(user) {
  const code = generateVerificationCode();

  // Save code and expiry to DB
  user.verificationCode = code;
  user.codeExpires = Date.now() + 10 * 60 * 1000;
  await user.save();

  const msg = {
    to: user.email,
    from: process.env.EMAIL_USER,
    replyTo: process.env.EMAIL_USER,
    subject: "Buddy Verification Code",
    text: `Your verification code is: ${code}`,
    html: `
      <div style="font-family: Arial, sans-serif; font-size: 16px; color: #333;">
        <p>Hi ${user.userName},</p>
        <p>Your <strong>Buddy</strong> verification code is:</p>
        <p style="font-size: 28px; font-weight: bold; color: #007bff;">${code}</p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn’t request this, please ignore this email.</p>
      </div>
    `,
  };
  try {
    const response = await sgMail.send(msg);
    console.log(`Sending verify reset code ${code} to ${user.email}`);
  } catch (err) {
    console.error("Error sending email:", err.response);
  }
}

module.exports = sendVerificationEmail;
