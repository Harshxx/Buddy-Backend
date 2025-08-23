const multer = require("multer");
const cloudinary = require("../utils/configCloudinary");
const Image = require("../models/imageModel");
const streamifier = require("streamifier");
const generateImageHash = require("../utils/generateImageHash");

// memory storage for fast access to image
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
      "image/bmp",
      "image/tiff",
      "image/avif",
      "image/x-icon",
      "image/heic",
      "image/heif",
    ];

    if (allowedTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Invalid image format."), false);
    }
  },
}).single("image");

const uploadImageAndExtractBase64 = async (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    if (!req.file) {
      req.savedImage = null;
      return next();
    }

    try {
      // file data
      const file = req.file;
      const fileBuffer = file.buffer;
      const base64 = fileBuffer.toString("base64");
      const hashedData = generateImageHash(fileBuffer);
      const userId = req.user?.id || "anonymous";

      //? later add index to mongoose
      // check if same image uploaded by user
      let image = await Image.findOne({
        userId,
        hash: hashedData,
      });

      if (image) {
        // Attach  inlineData for Gemini API
        req.savedImage = {
          inlineData: {
            data: base64,
            mimeType: file.mimetype,
          },
          _id: image._id,
        };
        return next();
      }

      // save image to db
      image = await Image.create({
        userId,
        hash: hashedData,
      });

      // Attach inlineData for Gemini API
      req.savedImage = {
        inlineData: {
          data: base64,
          mimeType: file.mimetype,
        },
        _id: image._id,
      };

      // ⏳ Asynchronously upload to Cloudinary (non-blocking)
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `Buddy-app/user-images/${userId}`,
          public_id:
            file.originalname
              .split(".")[0]
              .replace(/\s+/g, "_")
              .replace(/[^a-zA-Z0-9_-]/g, "") +
            "_" +
            Date.now(),
          transformation: [
            { width: 2048, height: 2048, crop: "limit", quality: "auto:best" },
          ],
        },
        async (err, result) => {
          if (!err && result) {
            image.url = result.secure_url;
            image.public_id = result.public_id;

            await image.save();
          }
        }
      );

      // Pipe buffer to cloudinary stream
      streamifier.createReadStream(file.buffer).pipe(stream);

      next();
    } catch (error) {
      console.error("Image upload failed:", error);
      req.savedImage = null;
      next(); // continue anyway, Gemini can still work
    }
  });
};

module.exports = uploadImageAndExtractBase64;
