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

    const cleanMessage = typeof text === "string" ? text.trim() : "";
    if (!cleanMessage && !file) {
      return res.status(400).json({
        error: "Either a message or an image is required.",
      });
    }

    // Prepare history
    const recentMessages = Array.isArray(history) ? history : [];
    const formattedHistory = [];
    for (const msg of recentMessages) {
      const parts = [];
      if (msg.message?.trim()) parts.push({ text: msg.message.trim() });
      if (
        msg.image?.inlineData?.data &&
        msg.image.inlineData.mimeType?.startsWith("image/")
      ) {
        parts.push({
          inlineData: {
            mimeType: msg.image.inlineData.mimeType,
            data: msg.image.inlineData.data,
          },
        });
      }
      if (parts.length > 0) {
        formattedHistory.push({
          role: msg.senderType === "user" ? "user" : "model",
          parts,
        });
      }
    }

    // Handle uploaded file
    let currentFilePart = null;
    if (file?.buffer && file?.mimetype?.startsWith("image/")) {
      currentFilePart = {
        inlineData: {
          mimeType: file.mimetype,
          data: file.buffer.toString("base64"),
        },
      };
    }

    // Build final user parts
    const userParts = [];
    if (cleanMessage) userParts.push({ text: cleanMessage });
    if (currentFilePart) userParts.push(currentFilePart);

    const systemInstruction =
      "Be clear.Your are a math expert Reply step by step with explanation of the solution and explain concepts in an easy to understand language. Your reply will be displayed on a mobile phone, keep it mobile UI friendly.";

    const { GoogleGenAI } = require("@google/genai");
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    try {
      const contents = [
        { role: "user", parts: [{ text: systemInstruction }] },
        ...formattedHistory,
        { role: "user", parts: userParts.length ? userParts : [{ text: "" }] },
      ];

      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        generationConfig: {
          temperature: 0.1,
          topP: 0.5,
          maxOutputTokens: 600,
        },

        thinkingConfig: {
          // thinkingBudget: 1024,
          // Turn off thinking:
          // thinkingBudget: 0
          // Turn on dynamic thinking:
          thinkingBudget: -1,
        },
      });

      // ✅ Safely extract reply
      let reply = null;
      try {
        reply = response.text()?.trim();
      } catch {
        const parts = response?.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find((p) => p?.text);
        reply = textPart?.text?.trim() || null;
      }

      if (!reply) {
        console.warn(
          "⚠️ Gemini returned empty response:",
          JSON.stringify(response, null, 2)
        );
        reply = "Sorry, I couldn't generate a solution this time.";
      }

      return res.status(200).json({ message: reply });
    } catch (err) {
      console.error("Gemini generate error:", err);
      return res.status(500).json({
        error: "Failed to generate response. Try again later.",
      });
    }
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

    try {
      // ✅ Call Imagen 4.0 to generate images
      const response = await genAI.models.generateImages({
        model: "imagen-4.0-generate-001",
        prompt: cleanMessage,
        config: {
          numberOfImages: 1, // you can increase to 2–4 for variations
        },
      });

      if (!response.generatedImages?.length) {
        return res.status(200).json({
          success: false,
          errorMessage: "No image was returned.",
        });
      }

      // Extract the first image
      const generatedImage = response.generatedImages[0];
      const imgBytes = generatedImage.image.imageBytes;

      if (!imgBytes) {
        return res.status(200).json({
          success: false,
          errorMessage: "Image data missing in response.",
        });
      }

      // Convert base64 → buffer
      const buffer = Buffer.from(imgBytes, "base64");
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

      // Save in DB if new
      let imageDoc = await Image.findOne({ userId, hash: imageHash });
      if (!imageDoc) {
        imageDoc = await Image.create({
          url: uploadResult.secure_url,
          public_id: uploadResult.public_id,
          userId,
          source: "generated",
          hash: imageHash,
        });
      }

      // Save message record
      await Message.create({
        senderType: "model",
        message: cleanMessage, // using prompt as message
        image: imageDoc._id,
        userId,
        botId,
      });

      return res.status(200).json({
        success: true,
        message: "Image generated successfully.",
        imageUrl: uploadResult.secure_url,
      });
    } catch (err) {
      console.error("Imagen 4.0 generation error:", err);
      return res.status(500).json({
        success: false,
        error: "Internal server error. Try again later.",
      });
    }
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
