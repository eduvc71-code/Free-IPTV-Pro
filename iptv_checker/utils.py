import asyncio
import os
import re

import aiohttp
import logging

logger = logging.getLogger(__name__)

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}


def read_playlist_urls(filepath):
    playlist_urls = {}
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as file:
        for line in file:
            line = line.strip()
            if not line or line.startswith('#') or ':' not in line:
                continue
            country, url = line.split(':', 1)
            url = url.strip()
            # Acepta URLs http/https o rutas a archivos locales existentes
            if not (url.startswith(('http://', 'https://')) or os.path.exists(url)):
                logger.warning(f"Invalid URL or path for {country}: {url}")
                continue
            playlist_urls[country.strip()] = url
    return playlist_urls


async def download_playlist(url):
    # Si es un archivo local en disco
    if os.path.exists(url):
        try:
            with open(url, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()
        except Exception as e:
            logger.error(f"Error reading local file {url}: {e}")
            return ""

    # Si es una URL web
    timeout = aiohttp.ClientTimeout(total=15)
    async with aiohttp.ClientSession(headers=DEFAULT_HEADERS, timeout=timeout) as session:
        try:
            async with session.get(url) as response:
                if response.status == 200:
                    return await response.text(errors='ignore')
                else:
                    logger.error(f"Failed to download playlist from {url}: HTTP {response.status}")
        except aiohttp.ClientError as e:
            logger.error(f"Client error while downloading playlist from {url}: {e}")
        except asyncio.TimeoutError:
            logger.error(f"Timeout while downloading playlist from {url}")

    return ""


def create_index_m3u():
    index_content = "#EXTM3U\n"
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_dir = os.path.join(base_dir, 'output')

    if not os.path.exists(output_dir):
        return

    # Diccionario para agrupar canales
    grouped_channels = {}

    for root, _, files in os.walk(output_dir):
        for file in files:
            if file.endswith('.m3u') and file != 'index.m3u':
                file_path = os.path.join(root, file)
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    lines = content.splitlines()[1:]
                    for i in range(0, len(lines), 2):
                        if i + 1 >= len(lines):
                            break
                        extinf_line = lines[i]
                        url_line = lines[i + 1]

                        group_match = re.search(r'group-title="([^"]+)"', extinf_line)
                        group_title = group_match.group(1) if group_match else "Other"

                        channel_info = f'{extinf_line}\n{url_line}\n'
                        if group_title not in grouped_channels:
                            grouped_channels[group_title] = []
                        grouped_channels[group_title].append(channel_info)

    # Ordenar grupos alfabéticamente
    for group_title in sorted(grouped_channels):
        for channel_info in grouped_channels[group_title]:
            index_content += channel_info

    index_path = os.path.join(output_dir, 'index.m3u')
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(index_content)

    print(f"Index file created at {index_path}")
