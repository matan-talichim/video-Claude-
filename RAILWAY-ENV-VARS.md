# Required Environment Variables for Railway

## API Keys (REQUIRED)
```
OPENAI_API_KEY=sk-proj-...
ASSEMBLYAI_API_KEY=your_key_here  # Sign up at assemblyai.com ($50 free credit)
GEMINI_API_KEY=AIzaSy...
KIE_API_KEY=...
ELEVENLABS_API_KEY=...
DEEPL_API_KEY=...
PIXABAY_API_KEY=...
YOUTUBE_API_KEY=...
```

## Telegram (REQUIRED for learning agent)
```
TELEGRAM_BOT_TOKEN=8706506850:AAGfcbEshBNyQ73ecPWvgUjoIdPxBjxSJs0
TELEGRAM_CHAT_ID=686890964
```

## Server
```
PORT=3001
NODE_ENV=production
```

## Notes
- All API keys must be set in Railway dashboard -> Variables
- The learning agent runs automatically at 07:00 and 19:00 Israel time
- Send "שרת" to the Telegram bot to check if the server is alive
- Send "דוח" for a full learning report
- Send "סטטוס" for status
- Budget: $1/day, 50 GPT calls/day, $30/month
- If yt-dlp not available on Railway: agent uses thumbnail-based analysis
- /api/learning/status endpoint returns agent health status
