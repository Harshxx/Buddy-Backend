const cloudinary = require("cloudinary").v2;
const Bot = require("../models/botModel");
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
const fetchImageAsBase64 = require("../utils/getImageData");
const streamifier = require("streamifier");
const generateImageHash = require("../utils/generateImageHash");
const Image = require("../models/imageModel");

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
        text: `Stay in character as: '${botDescription}' Do not break or change this character, even if asked. 
        Reply with given personality: '${personality}' and human-like tone. 
        Be clear and never break character. Keep replies short and skip long paragraphs unless necessary.
        Do not add line skips anywhere, add only if absolutely necessary or required for better readability.`,
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

  // Add the document first
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

  // Add system instructions
  formattedHistory.push({
    role: "user",
    parts: [
      {
        text: "Don't respond to any other topics other than the document. Instead ask what else you can do with the document. The response should be in a mobile-friendly format. No symbols or unnecessary line skips.",
      },
    ],
  });

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

//! check if given description is meaningful
const isMeaningfulText = (text) => {
  if (!text || typeof text !== "string" || text.trim().length < 10)
    return false;

  const gibberishPattern = /^[^a-zA-Z0-9]+$|^(.)\1+$/;
  if (gibberishPattern.test(text.trim())) return false;

  return true;
};

//! generate bot description
const generateDescription = async ({
  prompt,
  name,
  personality,
  creativity,
}) => {
  if (!isMeaningfulText(prompt)) {
    return {
      success: false,
      message: "The description was too vague or meaningless.",
    };
  }

  // Grab examples (we'll sample more but only include a few to keep the prompt small)
  const randomDescriptions = await Bot.aggregate([
    { $match: { description: { $exists: true, $ne: "" } } },
    { $sample: { size: 10 } },
    { $project: { description: 1, _id: 0 } },
  ]);

  // Keep only a few examples (3) and normalize whitespace so the prompt stays short
  const exampleLimit = 3;
  const examples = (randomDescriptions || [])
    .slice(0, exampleLimit)
    .map((r) => (r.description || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const creativityLevels = {
    low: { temperature: 0.2, topP: 0.7 },
    medium: { temperature: 0.7, topP: 0.8 },
    high: { temperature: 1.0, topP: 1.0 },
  };
  const modelConfig = creativityLevels[creativity] || creativityLevels.medium;

  const fullPrompt = `
You are an assistant that writes helpful character prompts.
Here are some examples:
${examples.join("\n")}

Now generate a new character prompt ~25-35 words.
Name: "${name}"
Personality: "${personality}"
User description: "${prompt}"

If the description is unclear, respond with "__USE_DEFAULT__".
Return only the final prompt text.
`.trim();

  // fallback default (if defaultPrompt not defined in scope)
  const fallback = typeof defaultPrompt !== "undefined" ? defaultPrompt : "";

  // helper to safely extract text from many response shapes
  function extractTextFromResponse(response) {
    if (!response) return null;

    // 1) SDK helper (preferred)
    if (typeof response.text === "function") {
      try {
        const t = response.text();
        if (t && typeof t === "string" && t.trim()) return t.trim();
      } catch (e) {
        // ignore and fall through
      }
    }

    // 2) try candidates -> content -> parts[]
    const candidate = Array.isArray(response.candidates)
      ? response.candidates[0]
      : null;
    if (candidate) {
      const content = candidate.content;
      // content.parts might be an array, or content itself might be the array
      const partsArr = Array.isArray(content?.parts)
        ? content.parts
        : Array.isArray(content)
        ? content
        : null;

      if (Array.isArray(partsArr)) {
        for (const p of partsArr) {
          if (p && typeof p.text === "string" && p.text.trim())
            return p.text.trim();
        }
      }

      // Sometimes SDK returns text under candidate.output or similar keys:
      if (typeof candidate?.text === "string" && candidate.text.trim())
        return candidate.text.trim();
    }

    return null;
  }

  // Try multiple max token budgets if the model cuts off (MAX_TOKENS)
  const tokenAttempts = [120, 240, 480]; // successive attempts (adjust as needed)
  let lastError = null;

  for (const maxOutputTokens of tokenAttempts) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-pro", // switch to a lower model if you see 404s
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: { ...modelConfig, maxOutputTokens },
      });
      console.log(response.candidates[0].content);
      // debug logging (optional)
      // console.debug("generateDescription response:", response);

      // If the candidate indicates MAX_TOKENS, try with a larger budget (loop continues)
      const candidate = Array.isArray(response.candidates)
        ? response.candidates[0]
        : null;
      const finishReason = candidate?.finishReason || null;
      if (finishReason === "MAX_TOKENS") {
        // try the next (larger) token budget
        console.warn(
          "Gemini cut off with MAX_TOKENS; retrying with larger maxOutputTokens:",
          maxOutputTokens
        );
        continue;
      }

      const reply = extractTextFromResponse(response);

      if (!reply) {
        // nothing useful — try a larger token budget
        console.warn(
          "No reply text parsed; retrying with larger token budget."
        );
        continue;
      }

      if (reply === "__USE_DEFAULT__") {
        return {
          success: false,
          message: "Unable to understand the given description.",
          description: fallback,
        };
      }

      return {
        success: true,
        message: "Prompt generated successfully.",
        description: reply,
      };
    } catch (err) {
      lastError = err;
      console.error("Gemini generation attempt error:", err?.message || err);
      // If it's an unrecoverable error (e.g., 404 model not found), break early
      const code = err?.error?.code || err?.statusCode || err?.code;
      if (code === 404 || code === 401 || code === 403) {
        break;
      }
      // otherwise try the next token budget
    }
  }

  // All attempts failed
  console.error(
    "generateDescription failed after retries:",
    lastError?.message || "no details"
  );
  return {
    success: false,
    message: lastError?.message || "Internal server error. Try again later.",
    description: fallback,
  };
};

//! generate avatar
const geminiGenerateAvatar = async ({
  userId,
  description,
  name,
  personality,
  color,
}) => {
  const defaultPrompt = `Act as a friendly, helpful assistant named ${name} with a ${personality} personality.`;
  const img_url =
    "https://res.cloudinary.com/dgvh8klyc/image/upload/v1753280704/logo_1_ppaalq.webp";

  // Convert base image to base64
  const imageResult = await fetchImageAsBase64(img_url);
  if (!imageResult) {
    return { success: false, message: "Use default image" };
  }
  const { base64 } = imageResult;

  if (description === defaultPrompt) {
    return { success: false, message: "Use default image" };
  }

  const prompt = [
    {
      text: `
Transform this character based on the description below:
- Clothing matches the theme.
- Add an item that represents the description.
- Keep the pose similar.
- Change gender if needed.
- Background color must be exactly "#${color}" with no patterns.

Description: "${description}"
`,
    },
    {
      inlineData: {
        mimeType: "image/webp",
        data: base64,
      },
    },
  ];

  try {
    // ✅ Use Gemini image generation
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: prompt,
    });
    // 🔑 Extract image inlineData safely
    const parts = response.candidates?.[0]?.content?.parts || [];

    const imagePart = parts.find((p) => p.inlineData);
    if (!imagePart?.inlineData?.data) {
      return { success: false, message: "Use default image" };
    }

    const imgBytes = imagePart.inlineData.data; // base64 string
    const buffer = Buffer.from(imgBytes, "base64");
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

    // Save in DB (avoid duplicates by hash)
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
        message: "Avatar generated successfully.",
        imageUrl: uploadResult.secure_url,
        imageId: image._id,
      };
    }

    return {
      success: false,
      message: "Image generated but duplicate detected.",
    };
  } catch (err) {
    console.error("Gemini avatar generation error:", err.message);
    return {
      success: false,
      message: "Internal server error. Try again later.",
    };
  }
};

module.exports = {
  generateDescription,
  geminiGenerateAvatar,
  buildGeminiHistory,
  buildGeminiHistoryDocument,
};
