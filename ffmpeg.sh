#!/bin/bash

echo "🔧 Installing ffmpeg..."

mkdir -p bin

curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz
tar -xf ffmpeg.tar.xz --strip-components=1 -C bin

chmod +x bin/ffmpeg
echo "✅ ffmpeg installed in ./bin/ffmpeg"
