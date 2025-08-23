const express = require("express");
const mongoose = require("mongoose");
const userRouter = require("./routes/v1/userRoute");
const errorHandler = require("./middleware/errorHandler");
const botRouter = require("./routes/v1/botRoutes");
const messageRouter = require("./routes/v1/messageRoute");
const { getImageAsBase64 } = require("./utils/geminiManager");
const toolRouter = require("./routes/v1/toolRoutes");
require("dotenv").config();
const cors = require("cors");
const supportRouter = require("./routes/v1/supportRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

//! connect mongoose
mongoose
  .connect(
    process.env.MONGO_URL ||
      `mongodb+srv://${process.env.MONGO_USER_NAME}:${process.env.MONGO_USER_PASS}@cluster.tlonw2c.mongodb.net/?retryWrites=true&w=majority&appName=Cluster`
  )
  .then(() => {
    console.log("Connected to DB");
  })
  .catch((err) => {
    console.log(err);
  });

//! middleware
app.use(express.json());

//! config cors
app.use(cors()); // 👈 Allow all origins

//! routes
app.use("/api/v1/user", userRouter);
app.use("/api/v1/bot", botRouter);
app.use("/api/v1/message", messageRouter);
app.use("/api/v1/tool", toolRouter);
app.use("/api/v1/support", supportRouter);

//! error handling middleware
app.use(errorHandler);

//! start server
app.listen(PORT, () => {
  console.log(`Server is running on port http://localhost:${PORT}/api/v1`);
});
