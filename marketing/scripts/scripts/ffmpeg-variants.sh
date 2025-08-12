#!/bin/bash

# FFmpeg scripts for generating video variants with subtitles
# Requires: ffmpeg with libass for subtitles

set -euo pipefail

INPUT_VIDEO="$1"
INPUT_SRT="$2"
OUTPUT_DIR="$3"

if [ $# -ne 3 ]; then
    echo "Usage: $0 <input_video> <input_srt> <output_dir>"
    echo "Example: $0 video.mp4 subtitles.srt ./variants"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Get video properties
eval $(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,duration \
  -of default=noprint_wrappers=1 "$INPUT_VIDEO")

echo "Input video: ${width}x${height}"

# Subtitle style for all variants
SUBTITLE_STYLE="FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=0,Alignment=2,MarginV=20"

# 9:16 variant (TikTok, Reels, Shorts)
echo "Creating 9:16 variant..."
ffmpeg -i "$INPUT_VIDEO" -vf "
  crop=in_h*9/16:in_h:(in_w-in_h*9/16)/2:0,
  scale=1080:1920:flags=lanczos,
  subtitles='$INPUT_SRT':force_style='$SUBTITLE_STYLE'
" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k \
  -movflags +faststart -y "$OUTPUT_DIR/variant_9x16.mp4"

# 1:1 variant (Instagram Feed, Facebook)
echo "Creating 1:1 variant..."
ffmpeg -i "$INPUT_VIDEO" -vf "
  crop=in_h:in_h:(in_w-in_h)/2:0,
  scale=1080:1080:flags=lanczos,
  subtitles='$INPUT_SRT':force_style='$SUBTITLE_STYLE'
" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k \
  -movflags +faststart -y "$OUTPUT_DIR/variant_1x1.mp4"

# 16:9 variant (YouTube, X/Twitter)
echo "Creating 16:9 variant..."
if [ "$width" -ge "$height" ]; then
    # Already landscape, just scale and add subtitles
    ffmpeg -i "$INPUT_VIDEO" -vf "
      scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease,
      pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,
      subtitles='$INPUT_SRT':force_style='$SUBTITLE_STYLE'
    " -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k \
      -movflags +faststart -y "$OUTPUT_DIR/variant_16x9.mp4"
else
    # Portrait video - add blur background
    ffmpeg -i "$INPUT_VIDEO" -vf "
      split[original][blur];
      [blur]scale=1920:1080:flags=lanczos,boxblur=20:20[blurred];
      [original]scale=1920:-2:flags=lanczos[scaled];
      [blurred][scaled]overlay=(W-w)/2:(H-h)/2,
      subtitles='$INPUT_SRT':force_style='$SUBTITLE_STYLE'
    " -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k \
      -movflags +faststart -y "$OUTPUT_DIR/variant_16x9.mp4"
fi

# Generate thumbnails
echo "Generating thumbnails..."
ffmpeg -i "$OUTPUT_DIR/variant_9x16.mp4" -ss 00:00:01 -vframes 1 -q:v 2 "$OUTPUT_DIR/thumb_9x16.jpg"
ffmpeg -i "$OUTPUT_DIR/variant_1x1.mp4" -ss 00:00:01 -vframes 1 -q:v 2 "$OUTPUT_DIR/thumb_1x1.jpg"
ffmpeg -i "$OUTPUT_DIR/variant_16x9.mp4" -ss 00:00:01 -vframes 1 -q:v 2 "$OUTPUT_DIR/thumb_16x9.jpg"

echo "Variants created successfully in $OUTPUT_DIR"
ls -la "$OUTPUT_DIR"