const Bot = require("../models/botModel");
const asyncHandler = require("express-async-handler");
const {
  generateDescription,
  geminiGenerateAvatar,
} = require("../utils/geminiManager");
const { deleteMessagesByUserAndBot } = require("../utils/deleteMessages");

const botCtrl = {
  //! Get all bots
  getAllBots: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const bots = await Bot.find({
      $or: [{ userId }, { userId: null }],
    });
    res.status(200).json(bots);
  }),

  //! Get single bot
  getSingleBot: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const name = req.params.name;
    const bot = await Bot.findOne({
      userId,
      name: name.trim().toLowerCase(),
    });
    if (!bot) {
      return res.status(404).json({ error: "Bot not found" });
    }
    res.status(200).json(bot);
  }),

  //! Add default bot
  addDefaultBot: asyncHandler(async (req, res) => {
    const { name, description, personality, isDefault } = req.body;
    if (!name || !description || !personality) {
      return res
        .status(400)
        .json({ error: "Name, description, and personality are required" });
    }

    const exists = await Bot.findOne({
      name: name.trim().toLowerCase(),
      userId: null,
    });

    if (exists) {
      return res
        .status(400)
        .json({ error: "Bot with this name already exists as default" });
    }

    const bot = await Bot.create({
      name,
      description,
      personality,
      isDefault: isDefault ?? true,
    });

    res.status(201).json(bot);
  }),

  //! Add custom bot
  addCustomBot: asyncHandler(async (req, res) => {
    const userId = req.user?.id;

    const {
      name,
      description,
      personality = "friendly",
      color = "ffffff",
      creativity = "medium",
      generateAvatar = false,
    } = req.body;

    const existing = await Bot.findOne({ name, userId });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Bot name already exists.",
      });
    }

    // Validate required fields
    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required.",
      });
    }

    if (!description?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Description is required.",
      });
    }

    // Generate AI description
    const aiDescription = await generateDescription({
      prompt: description,
      name,
      personality,
      creativity,
    });

    if (!aiDescription?.success) {
      return res.status(500).json({
        success: false,
        message: aiDescription?.message || "Failed to generate AI description.",
      });
    }

    // Try avatar generation (if requested)
    let avatar = null;
    if (generateAvatar) {
      try {
        avatar = await geminiGenerateAvatar({
          userId,
          description: aiDescription.description,
          name,
          personality,
          color,
          creativity,
        });

        if (!avatar?.success) {
          return res.status(500).json({
            success: false,
            message: avatar?.message || "Failed to generate AI image.",
          });
        }
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: error?.message || "Failed to generate AI description.",
        });
      }
    }

    // Prepare bot payload
    const botData = {
      name,
      description: aiDescription.description,
      userDescription: description,
      personality,
      color,
      creativity,
      userId,
    };

    if (avatar?.success) {
      botData.image = avatar.imageId;
    }

    const bot = await Bot.create(botData);

    return res.status(201).json({
      success: true,
      bot,
      message: "Bot created successfully.",
      imageUrl: avatar?.imageUrl, // Include avatar url if generated
    });
  }),

  //! get user custom bots
  getUserCustomBots: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const bots = await Bot.find({
      userId,
      isDefault: false,
    })
      .populate("image", "url -_id")
      .select("-__v -updatedAt -createdAt"); // optional: exclude clutter fields

    res.status(200).json({ success: true, bots: bots });
  }),

  //! Update custom bot
  updateCustomBot: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { prevName, newName, description, personality, color, creativity } =
      req.body;

    // Validate inputs
    if (!prevName || !newName || !description || !personality) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const trimmedPrevName = prevName.trim().toLowerCase();
    const trimmedNewName = newName.trim().toLowerCase();

    // Check if the bot exists
    const bot = await Bot.findOne({ name: trimmedPrevName, userId });
    if (!bot) {
      return res.status(404).json({ error: "Bot not found" });
    }

    // Check for name conflict with other bots
    if (bot.name !== trimmedNewName) {
      const conflict = await Bot.findOne({
        name: trimmedNewName,
        userId,
        _id: { $ne: bot._id },
      });

      if (conflict) {
        return res
          .status(400)
          .json({ error: "Another bot with this name already exists" });
      }

      bot.name = trimmedNewName;
    }

    // Update description if changed
    if (bot.description !== description) {
      const aiDescription = await generateDescription({
        prompt: description,
        newName,
        personality,
        creativity,
      });

      if (!aiDescription) {
        return res
          .status(500)
          .json({ error: "Failed to generate AI description" });
      }

      bot.description = aiDescription;
    }

    // Update personality if changed
    if (bot.personality !== personality) {
      bot.personality = personality;
    }

    // update color if changed
    if (bot.color !== color) {
      bot.color = color;
    }

    // update creativity if changed
    if (bot.creativity !== creativity) {
      bot.creativity = creativity;
    }

    await bot.save();
    res.status(200).json(bot);
  }),

  //! delete bot
  deleteBot: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { botId } = req.body;

    // Check if bot exists and belongs to the user
    const bot = await Bot.findOne({ _id: botId, userId });
    if (!bot) {
      return res.status(404).json({ error: "Bot not found" });
    }

    // message and image of bot
    await deleteMessagesByUserAndBot(userId, bot._id);

    // delete bot data
    await bot.deleteOne();

    res.status(200).json({ message: "Bot deleted successfully" });
  }),
};

module.exports = botCtrl;
