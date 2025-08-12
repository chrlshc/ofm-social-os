#!/usr/bin/env python3

import whisper
import sys
import json
from pathlib import Path
from datetime import timedelta

def seconds_to_srt_time(seconds):
    """Convert seconds to SRT timestamp format"""
    td = timedelta(seconds=seconds)
    hours = int(td.total_seconds() // 3600)
    minutes = int((td.total_seconds() % 3600) // 60)
    seconds = td.total_seconds() % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:06.3f}".replace('.', ',')

def generate_srt(segments, output_path):
    """Generate SRT file from Whisper segments"""
    with open(output_path, 'w', encoding='utf-8') as f:
        for i, segment in enumerate(segments, 1):
            start_time = seconds_to_srt_time(segment['start'])
            end_time = seconds_to_srt_time(segment['end'])
            text = segment['text'].strip()
            
            f.write(f"{i}\n")
            f.write(f"{start_time} --> {end_time}\n")
            f.write(f"{text}\n\n")

def main():
    if len(sys.argv) != 3:
        print("Usage: python generate-subtitles.py <video_file> <output_srt>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    output_srt = sys.argv[2]
    
    print(f"Loading Whisper model...")
    # Use base model for speed, can upgrade to 'small', 'medium', 'large' for accuracy
    model = whisper.load_model("base")
    
    print(f"Transcribing {video_path}...")
    result = model.transcribe(
        video_path,
        language=None,  # Auto-detect language
        task="transcribe",
        fp16=False,
        verbose=False
    )
    
    # Generate SRT
    generate_srt(result['segments'], output_srt)
    print(f"Generated subtitles: {output_srt}")
    
    # Also save metadata
    metadata = {
        'language': result.get('language', 'unknown'),
        'text': result['text'],
        'duration': result['segments'][-1]['end'] if result['segments'] else 0,
        'word_count': len(result['text'].split())
    }
    
    metadata_path = Path(output_srt).with_suffix('.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Language detected: {metadata['language']}")
    print(f"Duration: {metadata['duration']:.1f}s")
    print(f"Word count: {metadata['word_count']}")

if __name__ == "__main__":
    main()