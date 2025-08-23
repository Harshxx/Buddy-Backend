const { GoogleGenAI, createPartFromUri, Modality } = require("@google/genai");
const asyncHandler = require("express-async-handler");
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const streamifier = require("streamifier");
const generateImageHash = require("../utils/generateImageHash");
const Image = require("../models/imageModel");
const cloudinary = require("../utils/configCloudinary.js");
const Message = require("../models/messageModel.js");
const { buildGeminiHistoryDocument } = require("../utils/geminiManager.js");

const toolCtrl = {
  //! math solve
  mathSolve: asyncHandler(async (req, res) => {
    const { text, history } = req.body;
    const file = req.file;

    // Trim message if it's a string (avoid blank spaces only)
    const cleanMessage = typeof text === "string" ? text.trim() : "";
    // Validate: at least message or image must exist
    if (!cleanMessage && !file) {
      return res.status(400).json({
        error: "Either a message or an image is required.",
      });
    }

    // recent history
    const recentMessages = history;

    const formattedHistory = [];

    // Add the system message first
    formattedHistory.push({
      role: "user",
      parts: [
        {
          text: `You are a mathematics expert who can solve anything`,
        },
      ],
    });

    if (Array.isArray(recentMessages)) {
      for (const msg of recentMessages) {
        const parts = [];

        if (typeof msg.message === "string" && msg.message.trim()) {
          parts.push({ text: msg.message.trim() });
        }

        if (
          msg.image?.inlineData?.data &&
          typeof msg.image.inlineData.data === "string" &&
          msg.image.inlineData.data.trim() !== "" &&
          typeof msg.image.inlineData.mimeType === "string"
        ) {
          parts.push({
            inlineData: {
              mimeType: msg.image.inlineData.mimeType,
              data: msg.image.inlineData.data,
            },
          });
        }

        // Only include if there's valid text or image
        if (parts.length > 0) {
          formattedHistory.push({
            role: msg.senderType === "user" ? "user" : "model",
            parts,
          });
        }
      }
    }

    if (file) {
      const fileBuffer = file.buffer;
      const base64 = fileBuffer.toString("base64");
      const mimeType = file.mimetype;

      const isBase64 =
        typeof base64 === "string" && /^[A-Za-z0-9+/=\s]+$/.test(base64.trim());
      const isMimeTypeValid =
        typeof mimeType === "string" && mimeType.startsWith("image/");

      if (isBase64 && isMimeTypeValid) {
        formattedHistory.push({
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
          ],
        });
      } else {
        console.warn("⚠️ Skipping image due to invalid base64 or MIME type", {
          base64Preview: base64?.substring(0, 30),
          isBase64,
          isMimeTypeValid,
        });
      }
    }

    // Construct Gemini chat session from saved history
    const chat = genAI.chats.create({
      model: "gemini-1.5-pro",
      history: formattedHistory,
      config: {
        systemInstruction:
          " Be clear. Reply step by step with explanation the solution and Explain concepts in a easy to understand language. Your reply will be displayed on a mobile phone ,keep it mobile ui friendly ",
        temperature: 0.1, // adds more variation and personality
        topP: 0.5, // allows more diverse word choices
        maxTokens: 300, // enough for richer, friendly replies but still mobile-appropriate
      },
    });

    const response = await chat.sendMessage({ message: cleanMessage });

    const reply =
      response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sorry, I couldn't generate a response.";

    return res.status(200).json({
      message: reply,
    });
  }),

  //! generate image
  generateImage: asyncHandler(async (req, res) => {
    const { description, botId } = req.body;
    const userId = req.user.id;

    const cleanMessage =
      typeof description === "string" ? description.trim() : "";
    if (!cleanMessage) {
      return res
        .status(400)
        .json({ success: false, error: "Prompt is required." });
    }

    // prompt
    const prompt = `"${cleanMessage}"
    explain the image in 1-2 lines.
    if unable to understand description. Return reason for it ,`;

    // Call Gemini to generate image + response text
    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      config: {
        temperature: 1, // adds more variation and personality
        topP: 0.9, // allows more diverse word choices
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });

    let imageBase64 = null;
    let message = "";

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.text) {
        message += part.text;
      } else if (part.inlineData) {
        imageBase64 = part.inlineData.data;
      }
    }

    // Remove all line skips (newline characters)
    message = message.replace(/\n/g, "");

    if (!imageBase64) {
      return res.status(200).json({
        success: true,
        errorMessage: "Failed : No image was returned.",
        message: message,
      });
    }

    const buffer = Buffer.from(imageBase64, "base64");
    const imageHash = generateImageHash(buffer);

    // Upload to Cloudinary
    const uploadToCloudinary = () =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `Buddy-app/generated-images/${userId}`,
            resource_type: "image",
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );

        streamifier.createReadStream(buffer).pipe(stream);
      });

    const uploadResult = await uploadToCloudinary();

    let imageId;
    // Save in MongoDB only if not already present
    const existing = await Image.findOne({ userId, hash: imageHash });
    if (!existing) {
      imageId = await Image.create({
        url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
        userId,
        source: "generated",
        hash: imageHash,
      });
    }
    await Message.create({
      senderType: "model",
      message: message,
      image: imageId._id,
      userId,
      botId,
    });

    return res.status(200).json({
      success: true,
      message: message || "Image generated successfully.",
      imageUrl: uploadResult.secure_url,
    });
  }),

  //! get all generated images
  getAllGeneratedImages: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const images = await Image.find({ userId, source: "generated" }).select(
      "url"
    );
    res.status(200).json(images);
  }),

  //! read document
  readDocument: asyncHandler(async (req, res) => {
    const { description } = req.body;
    const file = req.file;
    const history = JSON.parse(req.body.history || "[]");

    if (!file || !description) {
      return res.status(400).json({
        success: false,
        message: "File and description are required.",
      });
    }

    const formattedHistory = await buildGeminiHistoryDocument({
      document: {
        mimeType: file.mimetype,
        base64: file.buffer.toString("base64"),
      },
      recentMessages: history,
    });

    // Construct Gemini chat session from saved history
    const chat = genAI.chats.create({
      model: "gemini-2.5-flash",
      history: formattedHistory,
      config: {
        maxTokens: 150, // enough for richer, friendly replies but still mobile-appropriate
      },
    });

    const response = await chat.sendMessage({ message: description });

    const rawReply =
      response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sorry, I couldn't generate a response.";

    const reply = typeof rawReply === "string" ? rawReply.trim() : rawReply;

    return res.status(200).json({
      success: true,
      message: reply,
    });
  }),
};

module.exports = toolCtrl;
