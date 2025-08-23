const express = require("express");
const botCtrl = require("../../controllers/botController");
const isAuthenticated = require("../../middleware/authMiddleware");
const isAdmin = require("../../middleware/isAdmin");

const botRouter = express.Router();

botRouter.get("/get-all-bot", isAuthenticated, isAdmin, botCtrl.getAllBots);

botRouter.get("/get-bot/:name", isAuthenticated, botCtrl.getSingleBot);

botRouter.post(
  "/add-default-bot",
  isAuthenticated,
  isAdmin,
  botCtrl.addDefaultBot
);

botRouter.post("/add-custom-bot", isAuthenticated, botCtrl.addCustomBot);

botRouter.get("/get-custom-bot", isAuthenticated, botCtrl.getUserCustomBots);

botRouter.put("/update-custom-bot", isAuthenticated, botCtrl.updateCustomBot);

botRouter.delete("/delete-bot", isAuthenticated, botCtrl.deleteBot);

module.exports = botRouter;
