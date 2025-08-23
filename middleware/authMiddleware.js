const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

const isAuthenticated = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.user = payload; // attach user ID to request
    next();
  } catch (err) {
    res.status(401).json({ error: "Token invalid or expired" });
  }
};

module.exports = isAuthenticated;
