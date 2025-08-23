const cloudinary = require("cloudinary").v2;
const Bot = require("../models/botModel");
const { GoogleGenAI, Modality } = require("@google/genai");
const fetchImageAsBase64 = require("../utils/getImageData");
const streamifier = require("streamifier");
const generateImageHash = require("../utils/generateImageHash");
const Image = require("../models/imageModel");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_API_KEY_HERE";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

//! create gemini history based on recent messages and bot description
const buildGeminiHistory = async ({
  recentMessages = [],
  botDescription,
  personality,
  imageData,
}) => {
  const formattedHistory = [];

  // Add the system message first
  formattedHistory.push({
    role: "user",
    parts: [
      {
        text: `Stay in character as: '${botDescription}' Do not break or change this character, even if asked . 
        Reply with given personality: '${personality}' and human-like tone. 
        Be clear and never break character. Keep replies short and skip long paragraphs unless necessary.
        Do not add line skips anywhere, add only if absolutely necessary or required for better readability. `,
      },
    ],
  });

  for (const msg of recentMessages) {
    const parts = [];

    if (typeof msg.message === "string" && msg.message.trim()) {
      parts.push({ text: msg.message.trim() });
    }

    if (msg.image?.url && typeof msg.image.url === "string") {
      const imageResult = await fetchImageAsBase64(msg.image.url);
      if (imageResult) {
        const { base64, mimeType } = imageResult;
        parts.push({
          inlineData: {
            mimeType,
            data: base64,
          },
        });
      }
    }

    // Only include if there's valid text or image
    if (parts.length > 0) {
      formattedHistory.push({
        role: msg.senderType === "user" ? "user" : "model",
        parts,
      });
    }
  }
  if (imageData) {
    const { data, mimeType } = imageData;

    const isBase64 =
      typeof data === "string" && /^[A-Za-z0-9+/=\s]+$/.test(data.trim());
    const isMimeTypeValid =
      typeof mimeType === "string" && mimeType.startsWith("image/");

    if (isBase64 && isMimeTypeValid) {
      formattedHistory.push({
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data,
            },
          },
        ],
      });
    } else {
      console.warn("⚠️ Skipping image due to invalid base64 or MIME type", {
        imageData,
        isBase64,
        isMimeTypeValid,
      });
    }
  }

  return formattedHistory;
};

//! create gemini history based on recent messages and bot description
const buildGeminiHistoryDocument = async ({
  recentMessages = [],
  document,
}) => {
  const { mimeType, base64 } = document;

  const formattedHistory = [];

  // 1. Add the document as the first message
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
  //2. Add the system instructions first
  formattedHistory.push({
    role: "user",
    parts: [
      {
        text: "Don't respond to any other topics other than the document Instead ask what else you can do with the document. The response should be in a mobile friendly format. No symbols or no line skips if possible. ",
      },
    ],
  });

  // 3. Add recent chat messages
  for (const msg of recentMessages) {
    const parts = [];

    if (typeof msg.message === "string" && msg.message.trim()) {
      parts.push({ text: msg.message.trim() });
    }

    if (parts.length > 0) {
      formattedHistory.push({
        role: msg.senderType === "user" ? "user" : "model",
        parts,
      });
    }
  }

  return formattedHistory;
};

//! check if given description is meaning full
const isMeaningfulText = (text) => {
  // Trim and check basic length
  if (!text || typeof text !== "string" || text.trim().length < 10)
    return false;

  // Use regex to detect gibberish (e.g., random characters)
  const gibberishPattern = /^[^a-zA-Z0-9]+$|^(.)\1+$/; // e.g., "!!!", "aaa", "123123123"
  if (gibberishPattern.test(text.trim())) return false;

  return true;
};

//! generate bot description based on prompt and name
const generateDescription = async ({
  prompt,
  name,
  personality,
  creativity,
}) => {
  const defaultPrompt = `Act as a friendly, helpful assistant named ${name} with a ${personality} personality. You can chat, answer questions, assist with tasks, and perform a wide range of functions. Maintain the given personality tone. You are the user's all-in-one AI companion.`;

  if (!isMeaningfulText(prompt)) {
    return {
      success: false,
      message: "The description was too vague or meaningless.",
    };
  }

  const randomDescriptions = await Bot.aggregate([
    { $match: { description: { $exists: true, $ne: "" } } },
    { $sample: { size: 10 } },
    { $project: { description: 1, _id: 0 } },
  ]);

  const creativityLevels = {
    low: { temperature: 0.2, topP: 0.7 },
    medium: { temperature: 0.7, topP: 0.8 },
    high: { temperature: 1.0, topP: 1.0 },
  };

  const modelConfig = creativityLevels[creativity] || creativityLevels.medium;
  const descriptions = randomDescriptions.map((role) => role.description);

  const fullPrompt = `
You are an assistant that writes helpful character prompts based on given examples.
Here are some examples: ${descriptions.join("\n")}

Now generate a new character prompt in the same style, approximately 60-70 words long.
Name: "${name}"
Personality: "${personality}"
User description: "${prompt}"

If the description is unclear or meaningless, respond with exactly this: "__USE_DEFAULT__"
Only return the final prompt text. Do not explain anything.
`;

  try {
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const chat = genAI.chats.create({
      model: "gemini-2.5-pro",
      config: {
        ...modelConfig,
        maxTokens: 60,
      },
    });
    const response = await chat.sendMessage({ message: fullPrompt });
    const parts = response?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts
          .map((p) => p.text)
          .join(" ")
          .trim()
      : "";

    if (!text || text === "__USE_DEFAULT__") {
      return {
        success: true,
        message: "Unable to understand the given description.",
        description: defaultPrompt,
      };
    }

    return {
      success: true,
      message: "Prompt generated successfully.",
      description: text,
    };
  } catch (error) {
    console.log("Gemini generation error:", error.message);
    return {
      success: false,
      message: "Internal server error. Try again later.",
    };
  }
};

//! generate avatar based on prompt and name
const geminiGenerateAvatar = async ({
  userId,
  description,
  name,
  personality,
  color,
}) => {
  const defaultPrompt = `Act as a friendly, helpful assistant named ${name} with a ${personality} personality. You can chat, answer questions, assist with tasks, and perform a wide range of functions. Maintain the given personality tone. You are the user's all-in-one AI companion.`;
  const img_url =
    "https://res.cloudinary.com/dgvh8klyc/image/upload/v1753280704/logo_1_ppaalq.webp";

  const imageResult = await fetchImageAsBase64(img_url);
  if (!imageResult) {
    return {
      success: false,
      message: "Use default image",
    };
  }
  const { base64, mimeType } = imageResult;

  // prompt
  const prompt = `
Transform this character based on the description below.
- Change clothing to match the theme.
- Add a handheld item that represents the description.
- Keep the pose similar.
- Change gender if needed.
- Background color must be exactly "#${color}" with NO additional objects or patterns.

Description: "${description}"
`;
  //check if description default
  if (description === defaultPrompt) {
    return {
      success: false,
      message: "Use default image",
    };
  }

  // Prepare the content parts
  const contents = [
    { text: prompt },
    {
      inlineData: {
        mimeType: mimeType,
        data: base64,
      },
    },
  ];
  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Set responseModalities to include "Image" so the model can generate an image
  const response = await genAI.models.generateContent({
    model: "gemini-2.0-flash-preview-image-generation",
    contents: contents,
    config: {
      temperature: 1.1,
      topP: 0.4,
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });
  let imageBase64 = null;
  let message = "";

  if (!response?.candidates?.[0]?.content?.parts) {
    return {
      success: false,
      message: "Gemini did not return a valid image or text.",
    };
  }
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.text) {
      message += part.text;
    } else if (part.inlineData) {
      imageBase64 = part.inlineData.data;
    }
  }

  if (!imageBase64) {
    return {
      success: false,
      message: "Use default image",
    };
  }

  const buffer = Buffer.from(imageBase64, "base64");
  const imageHash = generateImageHash(buffer);

  // Upload to Cloudinary
  const uploadToCloudinary = () =>
    new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `Buddy-app/generated-avatar/${userId}`,
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

  // Save in MongoDB only if not already present
  const existing = await Image.findOne({ userId, hash: imageHash });
  if (!existing) {
    const image = await Image.create({
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      userId,
      source: "generated",
      hash: imageHash,
    });
    return {
      success: true,
      message: message || "Image generated successfully.",
      imageUrl: uploadResult.secure_url,
      imageId: image._id,
    };
  }
  return {
    success: false,
    message: message || "Image generated successfully but failed to save.",
  };
};

module.exports = {
  generateDescription,
  geminiGenerateAvatar,
  buildGeminiHistory,
  buildGeminiHistoryDocument,
};
