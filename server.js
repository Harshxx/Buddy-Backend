const express = require("express");
const mongoose = require("mongoose");
const userRouter = require("./routes/v1/userRoute");
const errorHandler = require("./middleware/errorHandler");
const botRouter = require("./routes/v1/botRoutes");
const messageRouter = require("./routes/v1/messageRoute");
const { getImageAsBase64 } = require("./utils/geminiManager");
const toolRouter = require("./routes/v1/toolRoutes");
const supportRouter = require("./routes/v1/supportRoutes");
require("dotenv").config();
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000; // Render default

//! connect mongoose
mongoose
  .connect(
    process.env.MONGO_URL ||
      `mongodb+srv://${process.env.MONGO_USER_NAME}:${process.env.MONGO_USER_PASS}@cluster.tlonw2c.mongodb.net/?retryWrites=true&w=majority&appName=Cluster`
  )
  .then(() => {
    console.log("✅ Connected to DB");
  })
  .catch((err) => {
    console.error("❌ DB connection error:", err);
  });

//! middleware
app.use(express.json());
app.use(cors()); // Allow all origins

//! health check route
app.get("/", (req, res) => {
  res.status(200).send("✅ Server is alive!");
});

//! routes
app.use("/api/v1/user", userRouter);
app.use("/api/v1/bot", botRouter);
app.use("/api/v1/message", messageRouter);
app.use("/api/v1/tool", toolRouter);
app.use("/api/v1/support", supportRouter);

//! error handling middleware
app.use(errorHandler);

//! start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server is running on http://0.0.0.0:${PORT}/api/v1`);
});
