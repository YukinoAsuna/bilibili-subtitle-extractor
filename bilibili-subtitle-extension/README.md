# Bilibili & YouTube Subtitle Extractor Chrome Extension

Local Chrome extension for exporting subtitles from the current Bilibili or YouTube video page.

## Install

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select this folder.

## Use

### Bilibili

1. Open a Bilibili video page.
2. Turn on subtitles and play for a few seconds.
3. Click the extension icon and `读取当前页面`.
4. Check the preview, then download `TXT`, `SRT`, or `JSON`.

### YouTube

1. Open a YouTube watch or Shorts page that has CC.
2. Click the extension icon and `读取当前页面`.
3. Select a creator/manual or auto-generated source track.
4. Optionally select a YouTube auto-translation language.
5. Click `抽取所选字幕`.
6. Check the preview, then download `TXT`, `SRT`, or `JSON`.

## How It Works

On Bilibili, the extension scans the page's loaded Network resources for `aisubtitle.hdslb.com` subtitle URLs, then keeps only URLs that match the current video's `aid/cid`.

This mirrors the manual DevTools workflow:

1. Open subtitles.
2. Find the `aisubtitle.hdslb.com` request.
3. Copy the subtitle URL.
4. Download and convert the JSON body.

On YouTube, it reads the current player's caption track metadata. The selected timed-text track is fetched as JSON3, normalized to a common segment format, and converted locally. Auto-translation is requested from the selected source track, so translating a creator caption and translating an auto-generated caption remain separate choices.

## Notes

- It does not run speech recognition.
- It only exports captions that the video platform already provides.
- If Bilibili extraction fails, refresh the page, turn subtitles on, play for a few seconds, then retry.
- If YouTube extraction fails, refresh the video page, confirm that CC is available, then retry.
