const express = require("express");
const userCtrl = require("../../controllers/userController");
const isAuthenticated = require("../../middleware/authMiddleware");
const isAdmin = require("../../middleware/isAdmin");
const userRouter = express.Router();

//! basic
userRouter.post("/register", userCtrl.register);

userRouter.post("/login", userCtrl.login);

userRouter.delete("/delete", isAuthenticated, userCtrl.delete);

userRouter.delete("/delete-data", isAuthenticated, userCtrl.deleteData);

userRouter.put("/update", isAuthenticated, userCtrl.update);

//! verify user
userRouter.post("/verify", isAuthenticated, userCtrl.verify);

userRouter.post(
  "/send-Verification-Email",
  isAuthenticated,
  userCtrl.sendVerificationEmail
);

//! reset password
userRouter.post("/verify-password", userCtrl.verifyPasswordEmail);

userRouter.post("/send-Password-Email", userCtrl.sendPasswordEmail);

userRouter.put("/update-password", userCtrl.updatePassword);

//! get user
userRouter.post("/get-user", isAuthenticated, isAdmin, userCtrl.getUser);

module.exports = userRouter;
