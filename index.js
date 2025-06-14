const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { pipeline } = require("stream");
const { promisify } = require("util");

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
    // 1. Get file info from terabox API
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

    // 2. Get download link
    const linkRes = await axios.post(
      "https://teradl-api.dapuntaratya.com/generate_link",
      { uk, shareid, timestamp, sign, fs_id },
      { headers: { "Content-Type": "application/json" } }
    );

    const linkData = linkRes.data;
    const videoUrl = linkData?.download_link?.url_2 || linkData?.download_link?.url_1;
    if (!videoUrl) return res.status(400).json({ error: "No download link found" });

    // 3. If telegram mode & file is large, download + compress
    if (telegram === "true" && size > MAX_TELEGRAM_SIZE) {
      console.log("📥 Downloading using axios and pipeline...");

      const tempDir = path.join(__dirname, "temp");
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

      const timestamp = Date.now();
      const inputPath = path.join(tempDir, `input_${timestamp}.mp4`);
      const outputPath = path.join(tempDir, `output_${timestamp}.mp4`);

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

      // ✅ Compress with ffmpeg
      console.log("⚙️ Compressing...");
      try {
        await new Promise((resolve, reject) => {
          const cmd = `ffmpeg -i "${inputPath}" -vcodec libx264 -crf 28 -preset veryfast "${outputPath}" -y`;
          exec(cmd, (err) => {
            if (err) return reject(err);
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

    // 4. If small file or not telegram, return video URL
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
