import os
import io
import uuid
import tempfile
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import boto3
from botocore.config import Config
from pypdf import PdfReader
from openai import AzureOpenAI

app = FastAPI(title="LMS Content Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------

# MinIO / S3 client
s3 = boto3.client(
    "s3",
    endpoint_url=os.getenv("MINIO_ENDPOINT", "http://localhost:9000"),
    aws_access_key_id=os.getenv("MINIO_ACCESS_KEY", "lms_minio"),
    aws_secret_access_key=os.getenv("MINIO_SECRET_KEY", "lms_minio_secret"),
    config=Config(signature_version="s3v4"),
    region_name="us-east-1",
)

BUCKET = os.getenv("MINIO_BUCKET", "lms-content")

# Azure OpenAI client
ai = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
    api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview"),
)
DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-5-chat")

# Course service URL for updating module content
COURSE_SERVICE = os.getenv("COURSE_SERVICE_URL", "http://localhost:3002")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "content-service"}


# ---------------------------------------------------------------------------
# Ensure bucket exists
# ---------------------------------------------------------------------------

def ensure_bucket():
    try:
        s3.head_bucket(Bucket=BUCKET)
    except Exception:
        try:
            s3.create_bucket(Bucket=BUCKET)
        except Exception:
            pass  # Bucket may already exist in concurrent starts


# ---------------------------------------------------------------------------
# PDF extraction helper
# ---------------------------------------------------------------------------

def extract_pdf_text(file_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(file_bytes))
    text_parts = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            text_parts.append(t)
    return "\n\n".join(text_parts)


# ---------------------------------------------------------------------------
# AI summarization helper
# ---------------------------------------------------------------------------

def summarize_content(raw_text: str, max_chars: int = 8000) -> str:
    """Ask Azure OpenAI to summarize long content into structured module text."""
    if len(raw_text) < 500:
        return raw_text

    snippet = raw_text[:max_chars]
    response = ai.chat.completions.create(
        model=DEPLOYMENT,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert instructional designer. "
                    "Summarize the provided content into clear, well-structured learning material. "
                    "Keep the key concepts, examples, and facts. Use Markdown headings and bullet points."
                ),
            },
            {"role": "user", "content": snippet},
        ],
        temperature=0.3,
        max_tokens=2000,
    )
    return response.choices[0].message.content or raw_text


# ---------------------------------------------------------------------------
# POST /content/upload — upload a PDF or file, extract text, store in MinIO
# ---------------------------------------------------------------------------

@app.post("/content/upload")
async def upload_content(
    file: UploadFile = File(...),
    course_id: str = Form(...),
    module_title: str = Form(...),
    summarize: bool = Form(False),
):
    file_bytes = await file.read()
    file_ext = Path(file.filename or "file").suffix.lower()
    object_key = f"courses/{course_id}/{uuid.uuid4()}{file_ext}"

    # Upload raw file to MinIO
    ensure_bucket()
    s3.put_object(
        Bucket=BUCKET,
        Key=object_key,
        Body=file_bytes,
        ContentType=file.content_type or "application/octet-stream",
    )
    file_url = f"{os.getenv('MINIO_ENDPOINT', 'http://localhost:9000')}/{BUCKET}/{object_key}"

    # Extract text from PDF
    extracted_text = ""
    if file_ext == ".pdf":
        try:
            extracted_text = extract_pdf_text(file_bytes)
        except Exception as e:
            extracted_text = f"[PDF extraction failed: {e}]"

    # Optionally summarize with AI
    transcript = extracted_text
    if summarize and extracted_text:
        try:
            transcript = summarize_content(extracted_text)
        except Exception as e:
            transcript = extracted_text  # Fall back to raw text

    return {
        "data": {
            "object_key": object_key,
            "file_url":   file_url,
            "file_size":  len(file_bytes),
            "content_type": file.content_type,
            "transcript": transcript[:5000] if transcript else "",  # Truncate for response
            "transcript_length": len(transcript),
        }
    }


# ---------------------------------------------------------------------------
# POST /content/youtube — extract metadata from a YouTube URL
# ---------------------------------------------------------------------------

class YouTubeRequest(BaseModel):
    url: str
    course_id: str


@app.post("/content/youtube")
async def process_youtube(req: YouTubeRequest):
    """Extract YouTube video metadata for use as a course module."""
    import re
    import yt_dlp
    import httpx as _httpx

    # Extract video ID once — used by both yt-dlp and oEmbed fallback
    vid_match = re.search(r'(?:v=|youtu\.be/)([a-zA-Z0-9_\-]{11})', req.url)
    video_id  = vid_match.group(1) if vid_match else None

    ydl_opts = {
        "quiet":         True,
        "skip_download": True,
        "no_warnings":   True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=False)

        transcript = ""
        subtitles = info.get("automatic_captions", {}) or info.get("subtitles", {})
        if "en" in subtitles:
            transcript = f"[Transcript available for: {info.get('title')}]"

        return {
            "data": {
                "video_id":    info.get("id"),
                "title":       info.get("title"),
                "description": (info.get("description") or "")[:1000],
                "duration":    info.get("duration"),
                "thumbnail":   info.get("thumbnail"),
                "channel":     info.get("uploader"),
                "embed_url":   f"https://www.youtube.com/embed/{info.get('id')}",
                "transcript":  transcript,
            }
        }
    except Exception as yt_err:
        # ── oEmbed fallback ───────────────────────────────────────────────────
        # Works for any public YouTube video, no API key, no JS runtime needed.
        # Returns title, channel, thumbnail — enough for course creation.
        if video_id:
            try:
                async with _httpx.AsyncClient(timeout=10) as client:
                    r = await client.get(
                        "https://www.youtube.com/oembed",
                        params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"},
                    )
                if r.status_code == 200:
                    oe = r.json()
                    return {
                        "data": {
                            "video_id":    video_id,
                            "title":       oe.get("title", ""),
                            "description": "",
                            "duration":    None,
                            "thumbnail":   oe.get("thumbnail_url", ""),
                            "channel":     oe.get("author_name", ""),
                            "embed_url":   f"https://www.youtube.com/embed/{video_id}",
                            "transcript":  "",
                        }
                    }
            except Exception:
                pass  # fall through to the original error
        raise HTTPException(status_code=400, detail=f"Failed to process YouTube URL: {yt_err}")


# ---------------------------------------------------------------------------
# POST /content/text — store raw text content, optionally AI-summarize
# ---------------------------------------------------------------------------

class TextContentRequest(BaseModel):
    course_id: str
    title: str
    text: str
    summarize: bool = False


@app.post("/content/text")
async def process_text(req: TextContentRequest):
    """Store and optionally summarize raw text content."""
    text = req.text
    if req.summarize and len(text) > 200:
        try:
            text = summarize_content(text)
        except Exception:
            pass

    # Store in MinIO as .md file
    ensure_bucket()
    object_key = f"courses/{req.course_id}/{uuid.uuid4()}.md"
    s3.put_object(
        Bucket=BUCKET,
        Key=object_key,
        Body=text.encode("utf-8"),
        ContentType="text/markdown",
    )

    return {
        "data": {
            "object_key": object_key,
            "transcript": text,
            "length": len(text),
        }
    }


# ---------------------------------------------------------------------------
# POST /content/rss — parse a podcast RSS feed, return episode list
# ---------------------------------------------------------------------------

class RSSRequest(BaseModel):
    url: str
    max_episodes: int = 10


@app.post("/content/rss")
async def parse_rss_feed(req: RSSRequest):
    """Parse a podcast RSS feed and return a list of episodes for module creation."""
    import feedparser

    try:
        feed = feedparser.parse(req.url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch RSS feed: {e}")

    if not feed or not feed.feed:
        raise HTTPException(status_code=400, detail="No valid RSS feed found at the provided URL")

    episodes = []
    for entry in feed.entries[: req.max_episodes]:
        # Find first audio enclosure
        audio_url = ""
        for link in entry.get("links", []):
            if "audio" in link.get("type", ""):
                audio_url = link.get("href", "")
                break
        # Fallback: check enclosures
        if not audio_url:
            for enc in entry.get("enclosures", []):
                if "audio" in enc.get("type", ""):
                    audio_url = enc.get("href", enc.get("url", ""))
                    break

        # Parse iTunes duration (HH:MM:SS or MM:SS or seconds)
        duration_secs = 0
        raw_duration = getattr(entry, "itunes_duration", "") or entry.get("itunes_duration", "")
        if raw_duration:
            parts = str(raw_duration).strip().split(":")
            try:
                if len(parts) == 3:
                    duration_secs = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                elif len(parts) == 2:
                    duration_secs = int(parts[0]) * 60 + int(parts[1])
                else:
                    duration_secs = int(parts[0])
            except (ValueError, IndexError):
                duration_secs = 0

        episodes.append({
            "title":        entry.get("title", "Episode"),
            "description":  (entry.get("summary", "") or "")[:500],
            "audio_url":    audio_url,
            "duration_secs": duration_secs,
            "pub_date":     entry.get("published", ""),
            "guid":         entry.get("id", ""),
        })

    feed_title = feed.feed.get("title", "Unknown Podcast")
    return {
        "data": {
            "title":        feed_title,
            "description":  (feed.feed.get("description", "") or "")[:500],
            "episode_count": len(episodes),
            "episodes":     episodes,
        }
    }


# ---------------------------------------------------------------------------
# GET /content/{object_key:path} — retrieve stored content text
# ---------------------------------------------------------------------------

@app.get("/content/{object_key:path}")
async def get_content(object_key: str):
    try:
        response = s3.get_object(Bucket=BUCKET, Key=object_key)
        body = response["Body"].read()
        return {"data": {"text": body.decode("utf-8", errors="replace")}}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Content not found: {e}")


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("CONTENT_SERVICE_PORT", 3003))
    uvicorn.run("src.main:app", host="0.0.0.0", port=port, reload=True)
