const Message = require("../models/messageModel");
const deleteImage = require("../utils/deleteImage");

const deleteImagesFromMessages = async (messages) => {
  await Promise.all(
    messages.map(async (msg) => {
      const img = msg.image;
      if (img?.public_id && img?._id) {
        const success = await deleteImage(img.public_id, img._id);
        if (!success) {
          console.warn("Image deletion failed for", img._id);
        }
      }
    })
  );
};

const deleteMessagesByUserAndBot = async (userId, botId) => {
  if (!userId || !botId) {
    throw new Error("Both userId and botId are required to delete messages.");
  }
  const messages = await Message.find({ userId, botId })
    .select("_id image") // Only fetch needed fields from Message
    .populate({
      path: "image",
      select: "public_id", // Only needed field from Image; _id is included by default
      options: { lean: true }, // Makes population faster by skipping Mongoose document wrappers
    })
    .lean(); // Convert Message documents to plain JS objects

  //loop through message and delete images
  deleteImagesFromMessages(messages);

  await Message.deleteMany({ userId, botId });
};
const deleteMessagesByUser = async (userId) => {
  if (!userId) {
    throw new Error("userId is required to delete messages.");
  }
  const messages = await Message.find({ userId })
    .select("_id image") // Only fetch needed fields from Message
    .populate({
      path: "image",
      select: "public_id", // Only needed field from Image; _id is included by default
      options: { lean: true }, // Makes population faster by skipping Mongoose document wrappers
    })
    .lean(); // Convert Message documents to plain JS objects

  //loop through message and delete images
  deleteImagesFromMessages(messages);

  await Message.deleteMany({ userId });
};

const deleteSingleMessageById = async (userId, messageId) => {
  if (!userId || !messageId) {
    throw new Error(
      "Both userId and messageId are required to delete a message."
    );
  }
  const message = await Message.findOne({ _id: messageId, userId })
    .select("_id image") // Only fetch needed fields from Message
    .populate({
      path: "image",
      select: "public_id", // Only needed field from Image; _id is included by default
      options: { lean: true }, // Makes population faster by skipping Mongoose document wrappers
    })
    .lean(); // Convert Message documents to plain JS objects
  if (message) {
    //delete associated image if exists
    await deleteImagesFromMessages([message]);
    await Message.deleteOne({ _id: messageId, userId });
  } else {
    throw new Error("Message not found or does not belong to the user.");
  }
};

module.exports = {
  deleteMessagesByUserAndBot,
  deleteMessagesByUser,
  deleteSingleMessageById,
};
