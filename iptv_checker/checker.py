import aiohttp
import asyncio
import logging
import os
import re
import m3u8
from .playlist import Playlist
from .utils import download_playlist, DEFAULT_HEADERS

# Настройка логгера
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class IPTVChecker:
    def __init__(self, country_name, playlist_url, semaphore):
        self.country_name = country_name
        self.playlist_url = playlist_url
        self.available_channels = []
        self.semaphore = semaphore

    async def check_channels(self, playlist_content):
        playlist = Playlist(playlist_content)
        channels_to_check = playlist.get_channels()
        tasks = []
        async with aiohttp.ClientSession(headers=DEFAULT_HEADERS) as session:
            for i, channel in enumerate(channels_to_check):
                tasks.append(self.check_channel(session, channel))
                if (i + 1) % 10 == 0 or i + 1 == len(channels_to_check):
                    logger.info(f"Parsed {i + 1} channels, {len(channels_to_check) - (i + 1)} remaining.")
            results = await asyncio.gather(*tasks)
        self.available_channels = [channel for channel in results if channel]
        logger.info(f"Checked {len(channels_to_check)} channels, {len(self.available_channels)} are available.")

    async def check_channel(self, session, channel):
        async with self.semaphore:
            url = channel["url"]
            try:
                timeout = aiohttp.ClientTimeout(total=8, connect=5)
                async with session.get(url, timeout=timeout, allow_redirects=True) as response:
                    if response.status == 200:
                        content_type = response.headers.get('Content-Type', '').lower()
                        # Verificación para listas HLS (.m3u8)
                        if 'mpegurl' in content_type or url.split('?')[0].endswith('.m3u8'):
                            try:
                                playlist_content = await response.text(errors='ignore')
                                m3u_playlist = m3u8.loads(playlist_content, uri=str(response.url))
                                if m3u_playlist.segments:
                                    segment_url = m3u_playlist.segments[0].absolute_uri
                                    if await self.check_segment(session, segment_url):
                                        logger.info(f"Canal '{channel['name']}' disponible (HLS).")
                                        return channel
                                    else:
                                        return None
                                elif m3u_playlist.playlists:
                                    for p in m3u_playlist.playlists:
                                        nested_url = p.absolute_uri
                                        if await self.check_playlist(session, nested_url):
                                            logger.info(f"Canal '{channel['name']}' disponible (Master HLS).")
                                            return channel
                                    return None
                                else:
                                    return channel
                            except Exception:
                                return channel
                        else:
                            # Flujo directo / Xtream Codes (.ts, .mp4, octet-stream, etc.)
                            # Leemos solo 1KB para verificar que emite datos sin saturar memoria ni tiempo de espera
                            chunk = await response.content.read(1024)
                            if chunk and len(chunk) > 0:
                                logger.info(f"Canal '{channel['name']}' disponible (Stream directo / Xtream).")
                                return channel
                            else:
                                logger.warning(f"Canal '{channel['name']}' envió flujo vacío.")
                                return None
                    else:
                        logger.warning(f"Canal '{channel['name']}' no disponible (HTTP {response.status}).")
                        return None
            except Exception as e:
                logger.error(f"Error verificando canal '{channel['name']}': {e}")
                return None

    async def check_segment(self, session, segment_url):
        try:
            async with session.get(segment_url, timeout=10) as response:
                if response.status == 200:
                    return True
                else:
                    logger.warning(f"Segment {segment_url} is not available. Status code: {response.status}")
                    return False
        except Exception as e:
            logger.error(f"Error checking segment {segment_url}: {e}")
            return False

    async def check_playlist(self, session, playlist_url):
        try:
            async with session.get(playlist_url, timeout=10) as response:
                if response.status == 200:
                    return True
                else:
                    logger.warning(f"Nested playlist {playlist_url} is not available. Status code: {response.status}")
                    return False
        except Exception as e:
            logger.error(f"Error checking nested playlist {playlist_url}: {e}")
            return False

    def create_new_playlist(self):
        playlist = Playlist()
        playlist.add_channels(self.available_channels)
        logger.info(f"Total available channels to save: {len(self.available_channels)}")
        return playlist.to_m3u(group_title=self.country_name)

    async def run(self):
        logger.info(f"Iniciando verificación para '{self.country_name}' desde: {self.playlist_url}")
        playlist_content = await download_playlist(self.playlist_url)
        if not playlist_content:
            logger.warning(f"No se pudo obtener contenido para '{self.country_name}'.")
            return

        await self.check_channels(playlist_content)

        if not self.available_channels:
            logger.info(f"No se encontraron canales disponibles para '{self.country_name}'.")
            return

        new_playlist_content = self.create_new_playlist()

        # Opciones de guardado compatibles con Windows y Xtream Codes
        current_dir = os.path.dirname(os.path.abspath(__file__))
        output_dir = os.path.join(current_dir, '..', 'output')
        os.makedirs(output_dir, exist_ok=True)

        safe_name = re.sub(r'[\\/*?:"<>| ]+', '_', self.country_name).strip('_')
        if not safe_name:
            safe_name = "lista_iptv"
        filename = f"{safe_name}.m3u"
        output_path = os.path.join(output_dir, filename)

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(new_playlist_content)
        logger.info(f"Lista guardada con éxito ({len(self.available_channels)} canales activos) en: {output_path}")
