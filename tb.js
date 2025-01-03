const express = require('express');
const axios = require('axios');

const app = express();
const PORT = procesa.env.PORT || 3000;

function extractD7(url) {
    const match = url.match(/\/s\/([\w\d_-]+)/);
    return match ? match[1] : null;
}

app.get('/terabox', async (req, res) => {
    const inputUrl = req.query.url;

    if (!inputUrl) {
        return res.status(400).json({ error: "Missing 'url' query parameter" });
    }

    const fileId = extractD7(inputUrl);
    if (!fileId) {
        return res.status(400).json({ error: "Invalid URL format" });
    }

    const apiUrl = `https://api.sylica.eu.org/terabox/?id=${fileId}&download=1`;
    const headers = {
        "Origin": "https://www.kauruka.com",
        "Referer": "https://www.kauruka.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    };

    try {
        const response = await axios.get(apiUrl, { headers });
        const data = response.data;

        if (data && data.data) {
            res.json({
                filename: data.data.filename,
                size: data.data.size,
                shareid: data.data.shareid,
                downloadLink: data.data.downloadLink.replace(/\\\//g, "/")
            });
        } else {
            res.status(404).json({ error: "Data not found in the response" });
        }
    } catch (error) {
        res.status(500).json({ error: `An error occurred: ${error.message}` });
    }
});

app.listen(PORT, () => {
    console.log(`API running at http://localhost:${PORT}/terabox?url=<your-url>`);
});
