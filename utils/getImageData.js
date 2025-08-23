const axios = require("axios");
const { fileTypeFromBuffer } = require("file-type"); // Optional but recommended

const fetchImageAsBase64 = async (url) => {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
    });

    const buffer = Buffer.from(response.data);

    // Detect MIME type
    const type = await fileTypeFromBuffer(buffer);
    const mimeType = type?.mime || "image/png"; // fallback

    // Convert to base64
    const base64 = buffer.toString("base64");

    return {
      mimeType,
      base64,
    };
  } catch (err) {
    console.error("Error fetching image:", err.message);
    return null;
  }
};

module.exports = fetchImageAsBase64;
