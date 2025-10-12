const Bot = require("../models/botModel");
const Message = require("../models/messageModel");
const asyncHandler = require("express-async-handler");
const { buildGeminiHistory } = require("../utils/geminiManager");
const { GoogleGenAI } = require("@google/genai");
const cloudinary = require("../utils/configCloudinary");
const mongoose = require("mongoose");
const {
  deleteMessagesByUserAndBot,
  deleteMessagesByUser,
  deleteSingleMessageById,
} = require("../utils/deleteMessages");

const messageCtrl = {
  //! Get all messages
  getAllMessages: asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const groupedMessages = await Message.aggregate([
      {
        $match: { userId: new mongoose.Types.ObjectId(userId) },
      },
      {
        $lookup: {
          from: "images", // your Image collection name
          localField: "image", // message.image is the ObjectId
          foreignField: "_id",
          as: "imageData",
        },
      },
      {
        $unwind: {
          path: "$imageData",
          preserveNullAndEmptyArrays: true, // keeps messages without image
        },
      },
      {
        $addFields: {
          image: {
            $cond: {
              if: { $gt: [{ $type: "$imageData" }, "missing"] },
              then: "$imageData.url",
              else: null,
            },
          },
        },
      },
      {
        $group: {
          _id: "$botId",
          messages: {
            $push: {
              messageId: "$_id",
              message: "$message",
              image: "$image",
              senderType: "$senderType",
              timestamp: "$createdAt",
              isGenerating: { $literal: false },
            },
          },
        },
      },
      {
        $project: {
          botId: "$_id",
          messages: 1,
          _id: 0,
        },
      },
    ]);

    res.status(200).json({ success: true, groupedMessages: groupedMessages });
  }),

  //! Get bot messages
  getBotMessages: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { botId } = req.body;
    const messages = await Message.find({
      userId,
      botId: botId,
    });
    res.status(200).json(messages);
  }),

  //! add message to bot
  characterMessage: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { text, botId, botDescription, personality } = req.body;
    const image = req.savedImage || null;

    // Clean message
    const cleanMessage = typeof text === "string" ? text.trim() : "";

    if (!cleanMessage && !image) {
      return res.status(400).json({
        error: "Either a message or an image is required.",
      });
    }

    // Recent history
    const recentMessages = await Message.find({ userId, botId })
      .sort({ createdAt: 1 })
      .limit(20)
      .populate({
        path: "image",
        select: "url -_id",
      })
      .lean();

    // Format history for Gemini
    let formattedHistory = await buildGeminiHistory({
      recentMessages,
      botDescription,
      personality,
      ...(image?.inlineData && { imageData: image.inlineData }),
    });

    // ✅ Initialize Gemini
    const genAI = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    try {
      // ✅ Generate response with history
      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          ...formattedHistory,
          {
            role: "user",
            parts: [
              ...(cleanMessage ? [{ text: cleanMessage }] : []),
              ...(image?.inlineData ? [{ inlineData: image.inlineData }] : []),
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 150,
        },
        thinkingConfig: {
          // thinkingBudget: 1024,
          // Turn off thinking:
          // thinkingBudget: 0
          // Turn on dynamic thinking:
          thinkingBudget: -1,
        },
      });
      const rawReply =
        response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Sorry, I couldn't generate a response.";

      const reply = typeof rawReply === "string" ? rawReply.trim() : rawReply;

      // Save messages
      await Message.insertMany([
        {
          userId,
          botId,
          senderType: "user",
          message: cleanMessage,
          ...(image?._id && { image: image._id }),
        },
        {
          userId,
          botId,
          senderType: "model",
          message: reply,
        },
      ]);

      res.status(200).json({ success: true, reply });
    } catch (err) {
      console.error("Gemini chat error:", err.message);
      res
        .status(500)
        .json({ success: false, error: "Failed to generate response." });
    }
  }),

  //! delete messages of user
  deleteMessages: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { botId } = req.body;

    if (!botId) {
      return res
        .status(400)
        .json({ success: false, message: "botId is required." });
    }
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "userId is required." });
    }

    // delete message and image of single bot
    await deleteMessagesByUserAndBot(userId, botId);

    res.status(200).json({
      success: true,
      message: "Messages and associated images deleted successfully.",
    });
  }),
  //! delete single message of user
  deleteSingleMessage: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { messageId } = req.body;

    if (!messageId) {
      return res
        .status(400)
        .json({ success: false, message: "messageId is required." });
    }
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "userId is required." });
    }

    // delete message and image of single bot
    await deleteSingleMessageById(userId, messageId);

    res.status(200).json({
      success: true,
      message: "Messages and associated images deleted successfully.",
    });
  }),
};

module.exports = messageCtrl;
