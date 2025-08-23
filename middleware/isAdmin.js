const UserModal = require("../models/userModel");

const isAdmin = async (req, res, next) => {
  const userId = req.user.id;
  const user = await UserModal.findById({ _id: userId });
  if (!user || !user.isAdmin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
};

module.exports = isAdmin;
