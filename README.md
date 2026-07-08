# Bilibili Subtitle Extractor

Tools for extracting subtitles that already exist on a Bilibili video page, including Bilibili AI subtitles.

This repository contains two workflows:

- `bilibili-subtitle-extension/`: a local Chrome extension.
- `extract_bilibili_subtitle.py`: a Python script that can extract from a video URL, BV id, or a direct `aisubtitle.hdslb.com` subtitle URL.

The tool does not perform speech recognition. It only exports subtitles that Bilibili has already generated or loaded.

## Chrome Extension

Install locally:

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select the `bilibili-subtitle-extension` folder.

Use:

1. Open a Bilibili video page.
2. Turn on subtitles in the player and play for a few seconds.
3. Click the extension icon.
4. Click `Extract current page`.
5. Confirm the preview is correct, then download `TXT`, `SRT`, or `JSON`.

The extension follows the same path as manually copying the subtitle URL from DevTools Network: it reads the loaded `aisubtitle.hdslb.com` URL that matches the current video `aid/cid`.

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
