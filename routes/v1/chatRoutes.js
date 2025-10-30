const express = require("express");
const chatRouter = express.Router();
const chatCtrl = require("../../controllers/chatController");
const isAuthenticated = require("../../middleware/authMiddleware");

//! get all users
chatRouter.get("/get-all-users", isAuthenticated, chatCtrl.getAllUsers);

//! get chat history
chatRouter.get(
  "/get-all-users-messages",
  isAuthenticated,
  chatCtrl.getAllUserMessages
);


module.exports = chatRouter;
