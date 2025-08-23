const mongoose = require("mongoose");

const BotSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    description: {
      type: String,
      required: true,
    },
    userDescription: {
      type: String,
      required: true,
    },
    personality: {
      type: String,
      default: "",
    },
    image: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Image",
      default: null,
    },
    color: {
      type: String,
      default: "#adedf1",
    },
    creativity: {
      type: String,
      default: "medium",
      enum: ["low", "medium", "high"],
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-format before save
BotSchema.pre("save", function (next) {
  if (this.personality) {
    this.personality = this.personality.trim().toLowerCase();
  }
  if (this.description) {
    this.description = this.description.trim(); // preserve casing
  }
  next();
});

module.exports = mongoose.model("Bot", BotSchema);
