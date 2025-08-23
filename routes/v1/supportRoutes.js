const express = require("express");
const isAuthenticated = require("../../middleware/authMiddleware");
const supportCtrl = require("../../controllers/supportController");

const supportRouter = express.Router();

supportRouter.post(
  "/add-contact-message",
  isAuthenticated,
  supportCtrl.addContactMessage
);

module.exports = supportRouter;
