const nodemailer = require("nodemailer");
require("dotenv").config();

function generateVerificationCode() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit code
}

async function sendVerificationEmail(user) {
  const code = generateVerificationCode();

  // Save code and expiry to DB (10 min expiry)
  user.verificationCode = code;
  user.codeExpires = Date.now() + 10 * 60 * 1000;
  await user.save();

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Buddy Support" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: "Your Buddy Verification Code",
    text: `Your verification code is: ${code}`,
    html: `
      <div style="font-family: Arial, sans-serif; font-size: 16px; color: #333;">
        <p>Hi ${user.userName},</p>
        <p>Your <strong>Buddy</strong> verification code is:</p>
        <p style="font-size: 28px; font-weight: bold; color: #007bff;">${code}</p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn’t request this, please ignore this email.</p>
        <p style="margin-top: 30px;">Thanks,<br>The Buddy Team</p>
      </div>
    `,
  });
}

module.exports = sendVerificationEmail;
