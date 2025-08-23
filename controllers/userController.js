const User = require("../models/userModel.js");
const jwt = require("jsonwebtoken");
const validateEmail = require("../utils/validateEmail");
const asyncHandler = require("express-async-handler");
const sendVerificationEmail = require("../utils/sendVerificationEmail");
const Image = require("../models/imageModel.js");
const Bot = require("../models/botModel.js");
const Message = require("../models/messageModel.js");
const cloudinary = require("../utils/configCloudinary.js");
const sendPasswordEmail = require("../utils/sendPasswordEmail.js");

function generateVerificationCode() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit code
}

const userCtrl = {
  //! register
  register: asyncHandler(async (req, res) => {
    // get data
    const { username, email, password } = req.body;

    // check if email is valid
    if (!(await validateEmail(email))) {
      return res.status(400).json({ success: false, message: "Invalid Email" });
    }

    //check is email already exits
    const emailExists = await User.findOne({ email });

    if (emailExists)
      return res.status(409).json({
        success: false,
        message: "Email Already Exists. Try Logging In",
      });

    //check is user already exits
    const userExists = await User.findOne({ userName: username });

    if (userExists)
      return res
        .status(409)
        .json({ success: false, message: "Username already taken" });
    // create user
    const user = await User.create({
      userName: username,
      email: email,
      password: password,
    });

    // generate token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    // registration successful message
    res.status(200).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        username: user.userName,
        email: user.email,
      },
    });
  }),

  //! Verify
  verify: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { code } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Check if already verified
    if (user.isVerified) {
      return res
        .status(400)
        .json({ success: true, message: "User already verified" });
    }

    // Check if code matches
    if (user.verificationCode !== code) {
      return res.status(400).json({ success: false, message: "Invalid code" });
    }
    // check if code expired
    if (user.codeExpires && Date.now() > user.codeExpires) {
      return res
        .status(400)
        .json({ success: false, message: "Code has expired" });
    }

    user.isVerified = true;
    user.verificationCode = null;
    user.codeExpires = null;
    await user.save();

    res
      .status(200)
      .json({ success: true, message: "Email verified successfully" });
  }),

  //! login
  login: asyncHandler(async (req, res) => {
    // get data
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Username or password is required" });
    }

    // Determine if username is an email or actual username
    let user;
    if (await validateEmail(username)) {
      user = await User.findOne({ email: username });
      // if given details do not match, return error
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Email not found" });
      }
    } else {
      user = await User.findOne({ userName: username });
      // if given details do not match, return error
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Username not found" });
      }
    }

    // check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid Password" });
    }

    // generate token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    // send success message and token to frontend for storing in localstorage of device
    res.status(200).json({
      success: true,
      message: "Login successful",
      token: token,
      user: {
        username: user.userName,
        email: user.email,
        isVerified: user.isVerified,
      },
    });
  }),

  //! delete
  delete: asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // 1. Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    try {
      // 2. Delete all images from Cloudinary under user folder
      await cloudinary.api.delete_resources_by_prefix(
        `Buddy-app/user-images/${userId}`
      );
      await cloudinary.api.delete_resources_by_prefix(
        `Buddy-app/generated-images/${userId}`
      );
      await cloudinary.api.delete_resources_by_prefix(
        `Buddy-app/generated-avatar/${userId}`
      );
      // 3. Delete image documents from MongoDB
      await Image.deleteMany({ userId });

      // 4. Delete all messages by user
      await Message.deleteMany({ userId });

      // 5. Delete all bots created by the user
      await Bot.deleteMany({ userId });

      // 6. Delete the user document
      await user.deleteOne();

      res.status(200).json({
        success: true,
        message: "User, bots, messages, and images deleted successfully.",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to delete user and related data.",
      });
    }
  }),

  //! delete data
  deleteData: asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // 1. Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    try {
      // 2. Delete all images from Cloudinary under user folder
      await cloudinary.api.delete_resources_by_prefix(
        `Buddy-app/user-images/${userId}`
      );
      await cloudinary.api.delete_resources_by_prefix(
        `Buddy-app/generated-images/${userId}`
      );
      await cloudinary.api.delete_resources_by_prefix(
        `Buddy-app/generated-avatar/${userId}`
      );
      // 3. Delete image documents from MongoDB
      await Image.deleteMany({ userId });

      // 4. Delete all messages by user
      await Message.deleteMany({ userId });

      // 5. Delete all bots created by the user
      await Bot.deleteMany({ userId });

      res.status(200).json({
        success: true,
        message: "Bots, messages, and images deleted successfully.",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to delete user and related data.",
      });
    }
  }),

  //! update
  update: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { username, email } = req.body;

    //find user
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    //update user name
    if (username && username !== user.userName) {
      // check if username already exists
      const userNameExits = await User.findOne({ userName: username });
      if (userNameExits) {
        return res
          .json(400)
          .json({ success: false, message: "Username already taken" });
      }

      // update username
      user.userName = username;
    }

    // update user email
    if (email && email !== user.email) {
      //check if email valid
      if (!(await validateEmail(email))) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid email" });
      }
      // check if email already in use
      const userExists = await User.findOne({ email });
      if (userExists) {
        return res.status(409).json({
          success: false,
          message: "Email already exist.",
        });
      }

      //update user email and set verified to false
      user.email = email;
      user.isVerified = false;
    }

    await user.save();
    res
      .status(200)
      .json({ success: true, message: "User updated successfully" });
  }),

  //! Send verification email
  sendVerificationEmail: asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // check if already verified
    if (user.isVerified === true) {
      return res
        .status(200)
        .json({ success: true, message: "User already verified" });
    }

    // send verification email
    await sendVerificationEmail(user);

    res
      .status(200)
      .json({ success: true, message: "Verification email sent successfully" });
  }),

  //! get user
  getUser: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.status(200).json(user);
  }),

  //! Send Password rest email
  sendPasswordEmail: asyncHandler(async (req, res) => {
    const { username } = req.body;
    // check is username given
    if (!username) {
      return res.status(400).json({ success: false, message: "Required" });
    }

    // Determine if username is an email or actual username
    let user;
    if (await validateEmail(username)) {
      user = await User.findOne({ email: username });
      // if given details do not match, return error
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Email not found" });
      }
    } else {
      user = await User.findOne({ userName: username });
      // if given details do not match, return error
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Username not found" });
      }
    }

    // Check if code exits
    if (
      user.passwordVerificationCode &&
      user.passwordCodeExpires &&
      Date.now() < user.passwordCodeExpires
    ) {
      return res.status(200).json({
        success: true,
        message: "Already sent Password Reset email",
      });
    }

    // send verification email
    await sendPasswordEmail(user);

    res.status(200).json({
      success: true,
      message: "Password Reset email sent successfully",
    });
  }),

  //! Verify password reset
  verifyPasswordEmail: asyncHandler(async (req, res) => {
    const { code, username } = req.body;

    // check is username given
    if (!username) {
      return res
        .status(400)
        .json({ success: false, message: "Username or Email is required" });
    }

    // Determine if username is an email or actual username
    let user;
    if (await validateEmail(username)) {
      user = await User.findOne({ email: username });
      // if given details do not match, return error
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid Email" });
      }
    } else {
      user = await User.findOne({ userName: username });
      // if given details do not match, return error
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid Username" });
      }
    }

    // Check if code matches
    if (user.passwordVerificationCode !== code) {
      return res.status(400).json({ success: false, message: "Invalid code" });
    }

    // check if code expired
    if (user.passwordCodeExpires && Date.now() > user.passwordCodeExpires) {
      return res
        .status(400)
        .json({ success: false, message: "Code has expired" });
    }

    res.status(200).json({
      success: true,
      message: "Password Reset code verified successfully",
    });
  }),

  //! update password
  updatePassword: asyncHandler(async (req, res) => {
    const { code, username, password } = req.body;

    // check is username given
    if (!username) {
      return res
        .status(400)
        .json({ success: false, message: "Username or Email is required" });
    }

    // Determine if username is an email or actual username
    let user;
    if (await validateEmail(username)) {
      user = await User.findOne({ email: username });
      // if given details do not match, return error
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid Email" });
      }
    } else {
      user = await User.findOne({ userName: username });
      // if given details do not match, return error
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid Username" });
      }
    }

    // Check if code matches
    if (user.passwordVerificationCode !== code) {
      return res.status(400).json({ success: false, message: "Invalid code" });
    }

    // check if code expired
    if (user.passwordCodeExpires && Date.now() > user.passwordCodeExpires) {
      return res.status(400).json({
        success: false,
        message: "Password Rest Time Expired. Try again",
      });
    }
    if (password) {
      user.password = password;
    }
    user.passwordVerificationCode = null;
    user.passwordCodeExpires = null;
    await user.save();
    res
      .status(200)
      .json({ success: true, message: "Password updated successfully" });
  }),
};

module.exports = userCtrl;
