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

    // Trim message if it's a string (avoid blank spaces only)
    const cleanMessage = typeof text === "string" ? text.trim() : "";

    // Validate: at least message or image must exist
    if (!cleanMessage && !image) {
      return res.status(400).json({
        error: "Either a message or an image is required.",
      });
    }

    // recent history
    const recentMessages = await Message.find({ userId, botId })
      .sort({ createdAt: 1 })
      .limit(20)
      .populate({
        path: "image",
        select: "url -_id", // only fetch image.inlineData, exclude _id
      })
      .lean();

    //format history
    let formattedHistory = await buildGeminiHistory({
      recentMessages,
      botDescription,
      personality,
      ...(image?.inlineData && { imageData: image.inlineData }),
    });

    // create gemini model
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Construct Gemini chat session from saved history
    const chat = genAI.chats.create({
      model: "gemini-1.5-pro",
      history: formattedHistory,
      config: {
        temperature: 0.7, // adds more variation and personality
        topP: 0.9, // allows more diverse word choices
        maxTokens: 150, // enough for richer, friendly replies but still mobile-appropriate
      },
    });

    const response = await chat.sendMessage({ message: cleanMessage });

    const rawReply =
      response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sorry, I couldn't generate a response.";

    const reply = typeof rawReply === "string" ? rawReply.trim() : rawReply;
    // Save new user message + Gemini reply to DB
    await Message.insertMany([
      {
        userId,
        botId,
        senderType: "user",
        message: cleanMessage,
        ...(image?._id && { image: image._id }), // include image only if image._id exists
      },
      {
        userId,
        botId,
        senderType: "model",
        message: reply, // last reply
      },
    ]);

    res.status(200).json({ success: true, reply: reply });
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
};

module.exports = messageCtrl;
