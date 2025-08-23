const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    botId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bot",
      required: true,
    },
    senderType: {
      type: String,
      enum: ["user", "model"],
      required: true,
    },
    message: {
      type: String,
      default: null,
    },
    image: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Image",
      default: null,
    },
  },
  { timestamps: true }
);

// Ensure at least one of message or image is provided
messageSchema.pre("validate", function (next) {
  const hasText =
    typeof this.message === "string" && this.message.trim().length > 0;
  const hasImageRef = !!this.image; // just check for ObjectId presence

  if (!hasText && !hasImageRef) {
    this.invalidate("message", "Either message or image must be provided.");
    this.invalidate("image", "Either message or image must be provided.");
  }

  next();
});

// ✅ This line prevents OverwriteModelError
module.exports =
  mongoose.models.Message || mongoose.model("Message", messageSchema);
