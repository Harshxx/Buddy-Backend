const Support = require("../models/supportModel");
const asyncHandler = require("express-async-handler");

const supportCtrl = {
  //! add contact message
  addContactMessage: asyncHandler(async (req, res) => {
    const { username, email, message } = req.body;
    const newMessage = await Support.create({
      userName: username,
      email: email,
      message: message,
    });
    if (!newMessage) {
      return res.status(400).json({
        success: false,
        message: "Failed to add contact message",
      });
    } else {
      return res.status(200).json({
        success: true,
        message: "Contact message added successfully",
      });
    }
  }),
};

module.exports = supportCtrl;
