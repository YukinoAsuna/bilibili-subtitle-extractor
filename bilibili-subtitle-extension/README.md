# Bilibili Subtitle Extractor Chrome Extension

Local Chrome extension for exporting subtitles already loaded on the current Bilibili video page.

## Install

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select this folder.

## Use

1. Open a Bilibili video page.
2. Turn on subtitles in the player.
3. Play for a few seconds so subtitles appear on screen.
4. Click the extension icon.
5. Click `Extract current page`.
6. Check the preview, then download `TXT`, `SRT`, or `JSON`.

## How It Works

The extension scans the page's loaded Network resources for `aisubtitle.hdslb.com` subtitle URLs, then keeps only URLs that match the current video's `aid/cid`.

This mirrors the manual DevTools workflow:

1. Open subtitles.
2. Find the `aisubtitle.hdslb.com` request.
3. Copy the subtitle URL.
4. Download and convert the JSON body.

## Notes

- It does not run speech recognition.
- It only exports subtitles that Bilibili has already loaded.
- If extraction fails, refresh the video page, turn subtitles on, play for a few seconds, then retry.
