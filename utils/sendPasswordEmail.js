const nodemailer = require("nodemailer");

function generateVerificationCode() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit code
}

async function sendPasswordEmail(user) {
  const code = generateVerificationCode();

  // Save code and expiry to DB (10 min expiry)
  user.passwordVerificationCode = code;
  user.passwordCodeExpires = Date.now() + 10 * 60 * 1000;
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

  const mailOptions = {
    from: `"Buddy Support" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: "Your Buddy Password Reset Code",
    text: `Your password reset code is: ${code}`,
    html: `
      <div style="font-family: Arial, sans-serif; font-size: 16px; color: #333;">
        <p>Hi ${user.userName},</p>
        <p>Your <strong>Buddy</strong> password reset code is:</p>
        <p style="font-size: 28px; font-weight: bold; color: #007bff;">${code}</p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn’t request this, please ignore this email.</p>
        <p style="margin-top: 30px;">Thanks,<br>The Buddy Team</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.response);
  } catch (err) {
    console.error("Error sending email:", err);
  }
}

module.exports = sendPasswordEmail;
