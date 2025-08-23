const crypto = require("crypto");

// hash function
function generateImageHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

module.exports = generateImageHash;
