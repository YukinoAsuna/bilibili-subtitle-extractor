#!/usr/bin/env python3
import argparse
import html
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)


def request_json(url, cookie=None, referer=None):
    headers = {"User-Agent": USER_AGENT}
    if cookie:
        headers["Cookie"] = cookie
    if referer:
        headers["Referer"] = referer
    req = Request(url, headers=headers)
    with urlopen(req, timeout=30) as resp:
        text = resp.read().decode("utf-8")
    return json.loads(text)


def parse_bvid(value):
    match = re.search(r"(BV[0-9A-Za-z]+)", value)
    if not match:
        raise ValueError("没有从输入中找到 BV 号")
    return match.group(1)


def sanitize_filename(value):
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:120] or "bilibili_subtitle"


def format_timestamp(seconds, sep=","):
    milliseconds = int(round(seconds * 1000))
    hours, rem = divmod(milliseconds, 3600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, millis = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}{sep}{millis:03d}"


def body_to_srt(body):
    blocks = []
    for index, item in enumerate(body, 1):
        start = format_timestamp(float(item["from"]))
        end = format_timestamp(float(item["to"]))
        content = html.unescape(str(item.get("content", ""))).strip()
        blocks.append(f"{index}\n{start} --> {end}\n{content}")
    return "\n\n".join(blocks) + "\n"


def body_to_txt(body):
    lines = []
    previous = None
    for item in body:
        content = html.unescape(str(item.get("content", ""))).strip()
        if content and content != previous:
            lines.append(content)
            previous = content
    return "\n".join(lines) + "\n"


def save_subtitle_outputs(subtitle_json, output_dir, stem, subtitle_label="subtitle"):
    body = subtitle_json.get("body", [])
    if not body:
        raise RuntimeError("字幕 JSON 中没有 body 字幕内容。")

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = sanitize_filename(stem)

    json_path = output_dir / f"{stem}.json"
    txt_path = output_dir / f"{stem}.txt"
    srt_path = output_dir / f"{stem}.srt"

    json_path.write_text(json.dumps(subtitle_json, ensure_ascii=False, indent=2), encoding="utf-8")
    txt_path.write_text(body_to_txt(body), encoding="utf-8")
    srt_path.write_text(body_to_srt(body), encoding="utf-8")

    print(f"字幕：{subtitle_label}")
    print(f"片段数：{len(body)}")
    print(f"TXT：{txt_path}")
    print(f"SRT：{srt_path}")
    print(f"JSON：{json_path}")


def load_cookie(args):
    if args.cookie:
        return args.cookie.strip()
    if args.cookie_file:
        return Path(args.cookie_file).read_text(encoding="utf-8").strip()
    default_cookie_file = Path("cookie.txt")
    if default_cookie_file.exists():
        return default_cookie_file.read_text(encoding="utf-8").strip()
    return os.environ.get("BILI_COOKIE", "").strip()


def pick_subtitle(subtitles, language):
    if not subtitles:
        return None
    if language:
        for subtitle in subtitles:
            if subtitle.get("lan") == language or subtitle.get("lan_doc") == language:
                return subtitle
    for subtitle in subtitles:
        lan = subtitle.get("lan", "")
        if lan in {"ai-zh", "zh-CN", "zh-Hans", "zh"}:
            return subtitle
    return subtitles[0]


def main():
    parser = argparse.ArgumentParser(description="提取 B 站已有字幕/AI 字幕为 TXT 和 SRT")
    parser.add_argument("url_or_bvid", help="B 站视频链接或 BV 号")
    parser.add_argument("-o", "--output-dir", default="output", help="输出目录，默认 output")
    parser.add_argument("--cookie", help="从浏览器复制的 B 站 Cookie")
    parser.add_argument("--cookie-file", help="Cookie 文本文件路径；默认也会读取当前目录 cookie.txt")
    parser.add_argument("--language", help="指定字幕语言，例如 ai-zh、zh-CN")
    args = parser.parse_args()

    if "aisubtitle.hdslb.com" in args.url_or_bvid or "/bfs/ai_subtitle/" in args.url_or_bvid:
        subtitle_json = request_json(args.url_or_bvid)
        parsed = urlparse(args.url_or_bvid)
        stem = Path(parsed.path).stem or "bilibili_subtitle"
        save_subtitle_outputs(subtitle_json, args.output_dir, stem, "直接字幕 URL")
        return

    bvid = parse_bvid(args.url_or_bvid)
    referer = f"https://www.bilibili.com/video/{bvid}/"
    cookie = load_cookie(args)

    view_url = f"https://api.bilibili.com/x/web-interface/view?bvid={quote(bvid)}"
    view = request_json(view_url, cookie=cookie, referer=referer)
    if view.get("code") != 0:
        raise RuntimeError(f"获取视频信息失败：{view.get('message')}")

    data = view["data"]
    aid = data["aid"]
    cid = data["pages"][0]["cid"]
    title = data.get("title") or bvid

    player_url = f"https://api.bilibili.com/x/player/v2?aid={aid}&cid={cid}"
    player = request_json(player_url, cookie=cookie, referer=referer)
    if player.get("code") != 0:
        raise RuntimeError(f"获取播放器信息失败：{player.get('message')}")

    player_data = player.get("data", {})
    subtitles = player_data.get("subtitle", {}).get("subtitles", [])
    subtitle = pick_subtitle(subtitles, args.language)
    if not subtitle:
        if player_data.get("need_login_subtitle"):
            raise RuntimeError(
                "这个视频的字幕需要登录态。请登录 B 站后复制 Cookie，保存到 cookie.txt，"
                "或运行时传 --cookie。"
            )
        raise RuntimeError("没有找到可下载字幕。可能该视频未开放字幕，或接口规则已变化。")

    subtitle_url = subtitle.get("subtitle_url") or subtitle.get("ai_subtitle_url")
    if not subtitle_url:
        raise RuntimeError(f"找到字幕条目，但没有字幕 URL：{subtitle}")
    if subtitle_url.startswith("//"):
        subtitle_url = "https:" + subtitle_url

    print(f"视频：{title}")
    save_subtitle_outputs(
        subtitle_json=request_json(subtitle_url, cookie=cookie, referer=referer),
        output_dir=args.output_dir,
        stem=f"{bvid} {title}",
        subtitle_label=subtitle.get("lan_doc") or subtitle.get("lan"),
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"错误：{exc}", file=sys.stderr)
        sys.exit(1)
