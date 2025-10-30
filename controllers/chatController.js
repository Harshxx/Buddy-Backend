//! imports
const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const userMessageModel = require("../models/userMessageModel");
const mongoose = require("mongoose");

//! main logic
const chatCtrl = {
  //! get all users
  getAllUsers: asyncHandler(async (req, res) => {
    const users = await User.aggregate([
      {
        $project: {
          userId: "$_id",
          userName: 1,
          email: 1,
          _id: 0, // remove original _id
          createdAt: 1,
        },
      },
    ]);
    return res.status(200).json({
      success: true,
      users: users,
    });
  }),

  //! get chat history
  getAllUserMessages: asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const userId = req.user.id;

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Build match condition dynamically
    const matchStage = {
      $or: [{ senderId: userObjectId }, { receiverId: userObjectId }],
    };

    // Only add roomId filter if it exists
    if (roomId) {
      matchStage.roomId = roomId;
    }

    const messages = await userMessageModel.aggregate([
      { $match: matchStage },
      { $sort: { timestamp: 1 } },
      {
        $project: {
          _id: 0,
          messageId: "$_id",
          roomId: 1,
          senderId: 1,
          receiverId: 1,
          message: 1,
          timestamp: 1,
        },
      },
    ]);
    res.status(200).json({ success: true, messages: messages });
  }),
};

module.exports = chatCtrl;
