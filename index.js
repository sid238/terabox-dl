const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { promisify } = require("util");
const { pipeline } = require("stream");
const ffmpegPath = require("ffmpeg-static");

const streamPipeline = promisify(pipeline);
const app = express();
const PORT = process.env.PORT || 3000;
const MAX_TELEGRAM_SIZE = 50 * 1024 * 1024;

app.use(cors());

app.get("/api/download", async (req, res) => {
  const { teraboxUrl, telegram } = req.query;

  if (!teraboxUrl) {
    return res.status(400).json({ error: "Missing teraboxUrl parameter" });
  }

  try {
    // Step 1: Get file info
    const fileRes = await axios.post(
      "https://teradl-api.dapuntaratya.com/generate_file",
      { url: teraboxUrl },
      { headers: { "Content-Type": "application/json" } }
    );

    const fileData = fileRes.data;
    const file = fileData?.list?.[0];
    if (!file) return res.status(404).json({ error: "File not found" });

    const { name, size, fs_id } = file;
    const { uk, shareid, timestamp, sign } = fileData;

    // Step 2: Get download link
    const linkRes = await axios.post(
      "https://teradl-api.dapuntaratya.com/generate_link",
      { uk, shareid, timestamp, sign, fs_id },
      { headers: { "Content-Type": "application/json" } }
    );

    const linkData = linkRes.data;
    const videoUrl = linkData?.download_link?.url_2 || linkData?.download_link?.url_1;
    if (!videoUrl) return res.status(400).json({ error: "No download link found" });

    // Step 3: Telegram mode & file is large
    if (telegram === "true" && size > MAX_TELEGRAM_SIZE) {
      console.log("📥 Downloading using axios and pipeline...");

      const tempDir = "/tmp"; // Cloud-safe
      const time = Date.now();
      const inputPath = path.join(tempDir, `input_${time}.mp4`);
      const outputPath = path.join(tempDir, `output_${time}.mp4`);

      // Download file to /tmp
      try {
        const videoRes = await axios.get(videoUrl, {
          responseType: "stream",
          headers: {
            "User-Agent": "Mozilla/5.0",
            Referer: "https://www.terabox.com/",
          },
          timeout: 30000,
        });

        await streamPipeline(videoRes.data, fs.createWriteStream(inputPath));
        console.log("✅ Video downloaded:", inputPath);
      } catch (err) {
        return res.status(500).json({ error: "Failed to download video", details: err.message });
      }

      // Compress with ffmpeg-static
      console.log("⚙️ Compressing with ffmpeg-static...");
      try {
        await new Promise((resolve, reject) => {
          const ffmpeg = spawn(ffmpegPath, [
            "-i", inputPath,
            "-vcodec", "libx264",
            "-crf", "28",
            "-preset", "veryfast",
            outputPath,
            "-y"
          ]);

          ffmpeg.stderr.on("data", (data) => console.error(data.toString()));
          ffmpeg.on("close", (code) => {
            if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}`));
            resolve();
          });
        });
      } catch (err) {
        return res.status(500).json({ error: "Compression failed", details: err.message });
      }

      const compressedSize = fs.statSync(outputPath).size;
      if (compressedSize > MAX_TELEGRAM_SIZE) {
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
        return res.status(413).json({ error: "Compressed file still exceeds 50MB" });
      }

      return res.download(outputPath, name, () => {
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
      });
    }

    // Step 4: Small file or no telegram mode
    return res.json({
      name,
      size,
      videoUrl,
    });

  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
