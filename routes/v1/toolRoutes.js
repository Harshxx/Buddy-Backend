const express = require("express");
const isAuthenticated = require("../../middleware/authMiddleware");
const toolCtrl = require("../../controllers/toolController");
const toolRouter = express.Router();
const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage() }); // parse file buffer

toolRouter.post(
  "/math-solve",
  isAuthenticated,
  upload.single("image"),
  toolCtrl.mathSolve
);

toolRouter.post("/generate-image", isAuthenticated, toolCtrl.generateImage);

toolRouter.get(
  "/get-all-generated-images",
  isAuthenticated,
  toolCtrl.getAllGeneratedImages
);

toolRouter.post(
  "/read-document",
  isAuthenticated,
  upload.single("document"),
  toolCtrl.readDocument
);

module.exports = toolRouter;
