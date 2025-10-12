const express = require("express");
const messageRouter = express.Router();
const messageCtrl = require("../../controllers/messageController");
const isAuthenticated = require("../../middleware/authMiddleware");
const isAdmin = require("../../middleware/isAdmin");
const uploadImage = require("../..//middleware/uploadImage");

messageRouter.get(
  "/get-all-message",
  isAuthenticated,
  messageCtrl.getAllMessages
);

messageRouter.post(
  "/send-message",
  isAuthenticated,
  uploadImage,
  messageCtrl.characterMessage
);

messageRouter.post(
  "/delete-message-bot",
  isAuthenticated,
  messageCtrl.deleteMessages
);

messageRouter.post(
  "/delete-message-single",
  isAuthenticated,
  messageCtrl.deleteSingleMessage
);

messageRouter.post(
  "/get-bot-messages",
  isAuthenticated,
  messageCtrl.getBotMessages
);

module.exports = messageRouter;
