const mongoose = require("mongoose");

const userMessageSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  message: {
    type: String,
    default: null,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  isRead: { type: Boolean, default: false }, // ✅ unread tracking
});

// ✅ This line prevents OverwriteModelError
module.exports = mongoose.model("UserMessage", userMessageSchema);
