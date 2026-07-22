# Bilibili & YouTube Subtitle Extractor

Tools for extracting subtitles that already exist on Bilibili and YouTube video pages. This includes Bilibili AI subtitles, YouTube creator captions, YouTube auto-generated captions, and YouTube auto-translations.

This repository contains two workflows:

- `bilibili-subtitle-extension/`: a local Chrome extension for Bilibili and YouTube.
- `extract_bilibili_subtitle.py`: a Python script that can extract from a video URL, BV id, or a direct `aisubtitle.hdslb.com` subtitle URL.

The tool does not perform speech recognition. It only exports subtitles that Bilibili has already generated or loaded.

## Chrome Extension

Install locally:

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select the `bilibili-subtitle-extension` folder.

Use:

For Bilibili:

1. Open a Bilibili video page.
2. Turn on subtitles in the player and play for a few seconds.
3. Click the extension icon, then click `读取当前页面`.
4. Confirm the preview is correct, then download `TXT`, `SRT`, or `JSON`.

For YouTube:

1. Open a YouTube watch or Shorts page that has CC.
2. Click the extension icon, then click `读取当前页面`.
3. Choose a creator/manual or auto-generated source track.
4. Keep the original language or choose a YouTube auto-translation language.
5. Click `抽取所选字幕`, check the preview, then download `TXT`, `SRT`, or `JSON`.

For Bilibili, the extension follows the same path as manually copying the subtitle URL from DevTools Network: it reads the loaded `aisubtitle.hdslb.com` URL that matches the current video `aid/cid`.

For YouTube, it reads the current player's caption track list, lets the user select the source and optional translation, then downloads YouTube's timed-text JSON and converts it locally.

## Python Script

Extract from a Bilibili video URL:

```powershell
python .\extract_bilibili_subtitle.py "https://www.bilibili.com/video/BV1uwTS66Eqg/"
```

If Bilibili requires login for the subtitle API, either provide a local `cookie.txt` file or use a direct subtitle URL copied from DevTools Network:

```powershell
python .\extract_bilibili_subtitle.py "https://aisubtitle.hdslb.com/bfs/ai_subtitle/..."
```

Outputs are written to `output/` as:

- `.txt`: plain text
- `.srt`: subtitle file with timestamps
- `.json`: original Bilibili subtitle JSON

## Privacy Notes

Do not commit or share:

- `cookie.txt`
- Chrome extension `.pem` private keys
- subtitle output files if you do not have rights to redistribute them

Only download or redistribute subtitles when you have permission to do so.
