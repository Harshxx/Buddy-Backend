const cloudinary = require("../utils/configCloudinary");
const Image = require("../models/imageModel");

const deleteImage = async (public_id, _id) => {
  if (!_id) {
    throw new Error("MongoDB image _id is required to delete the image.");
  }

  try {
    if (public_id?.trim()) {
      await cloudinary.uploader.destroy(public_id);
    }
    await Image.findByIdAndDelete(_id);
    return true;
  } catch (error) {
    console.error(
      `Failed to delete image _id: ${_id}, public_id: ${public_id}`,
      error
    );
    return false;
  }
};

module.exports = deleteImage;
