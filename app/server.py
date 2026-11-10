import asyncio
import os
import re
import json
import logging
from aiohttp import web, ClientSession, ClientTimeout
import aiohttp
from iptv_checker.playlist import Playlist
from iptv_checker.checker import IPTVChecker
from iptv_checker.utils import download_playlist, read_playlist_urls, create_index_m3u, DEFAULT_HEADERS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("IPTVServer")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(BASE_DIR, 'output')
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Estado de tareas de verificación
verification_tasks = {}


async def index_handler(request):
    return web.FileResponse(os.path.join(STATIC_DIR, 'index.html'))


async def get_countries_handler(request):
    playlists_path = os.path.join(BASE_DIR, 'playlists.txt')
    playlists = read_playlist_urls(playlists_path)
    result = [{"name": country, "url": url} for country, url in playlists.items()]
    return web.json_response(result)


async def get_saved_lists_handler(request):
    files = []
    if os.path.exists(OUTPUT_DIR):
        for f in os.listdir(OUTPUT_DIR):
            if f.endswith('.m3u'):
                path = os.path.join(OUTPUT_DIR, f)
                files.append({
                    "filename": f,
                    "size": os.path.getsize(path),
                    "modified": os.path.getmtime(path)
                })
    return web.json_response(files)


async def load_saved_list_handler(request):
    filename = request.match_info.get('filename')
    safe_name = os.path.basename(filename)
    path = os.path.join(OUTPUT_DIR, safe_name)
    if not os.path.exists(path):
        return web.json_response({"error": "Archivo no encontrado"}, status=404)

    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    playlist = Playlist(content)
    return web.json_response({
        "name": safe_name,
        "channels": playlist.get_channels()
    })


async def load_playlist_handler(request):
    data = await request.json()
    source_type = data.get('source_type')
    name = data.get('name', 'Lista IPTV')
    content = ""

    if source_type == 'country':
        url = data.get('url')
        name = data.get('country', name)
        content = await download_playlist(url)

    elif source_type == 'url':
        url = data.get('url')
        content = await download_playlist(url)

    elif source_type == 'xtream':
        server = data.get('server', '').rstrip('/')
        user = data.get('username', '')
        pwd = data.get('password', '')
        fmt = data.get('format', 'ts')
        if not server.startswith(('http://', 'https://')):
            server = "http://" + server
        url = f"{server}/get.php?username={user}&password={pwd}&type=m3u_plus&output={fmt}"
        content = await download_playlist(url)

    elif source_type == 'raw':
        content = data.get('content', '')

    if not content:
        return web.json_response({"error": "No se pudo obtener la lista de canales"}, status=400)

    playlist = Playlist(content)
    channels = playlist.get_channels()
    return web.json_response({
        "name": name,
        "total": len(channels),
        "channels": channels
    })


async def start_verification_handler(request):
    data = await request.json()
    channels = data.get('channels', [])
    name = data.get('name', 'Lista')
    task_id = f"task_{int(asyncio.get_event_loop().time() * 1000)}"

    verification_tasks[task_id] = {
        "status": "running",
        "progress": 0,
        "total": len(channels),
        "active_channels": [],
        "current_name": name
    }

    asyncio.create_task(run_background_verification(task_id, name, channels))
    return web.json_response({"task_id": task_id})


async def run_background_verification(task_id, name, channels):
    task_info = verification_tasks[task_id]
    semaphore = asyncio.Semaphore(100)
    checker = IPTVChecker(name, "", semaphore)

    active = []
    total = len(channels)
    done_count = 0

    async with ClientSession(headers=DEFAULT_HEADERS) as session:
        async def verify_single(ch):
            nonlocal done_count
            res = await checker.check_channel(session, ch)
            done_count += 1
            task_info["progress"] = done_count
            if res:
                active.append(res)
                task_info["active_channels"] = list(active)

        tasks = [verify_single(c) for c in channels]
        await asyncio.gather(*tasks)

    task_info["status"] = "completed"
    task_info["active_channels"] = active

    # Guardar automáticamente la lista verificada en output
    safe_name = re.sub(r'[\\/*?:"<>| ]+', '_', name).strip('_') or "lista_activa"
    filename = f"{safe_name}.m3u"
    output_path = os.path.join(OUTPUT_DIR, filename)

    p = Playlist()
    p.add_channels(active)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(p.to_m3u(group_title=name))

    create_index_m3u()


async def get_verification_status_handler(request):
    task_id = request.match_info.get('task_id')
    task = verification_tasks.get(task_id)
    if not task:
        return web.json_response({"error": "Tarea no encontrada"}, status=404)
    return web.json_response(task)


async def stream_proxy_handler(request):
    """Proxy local para evitar problemas de CORS o cabeceras faltantes al reproducir streams."""
    url = request.query.get('url')
    if not url:
        return web.Response(status=400, text="URL parameter required")

    try:
        session = ClientSession(headers=DEFAULT_HEADERS)
        timeout = ClientTimeout(total=None, connect=10)
        resp = await session.get(url, timeout=timeout)

        headers = {}
        for k, v in resp.headers.items():
            if k.lower() in ['content-type', 'content-length', 'accept-ranges']:
                headers[k] = v

        # Permitir CORS a nivel local
        headers['Access-Control-Allow-Origin'] = '*'
        headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'

        response = web.StreamResponse(status=resp.status, headers=headers)
        await response.prepare(request)

        async for chunk in resp.content.iter_chunked(16384):
            await response.write(chunk)

        await session.close()
        return response
    except Exception as e:
        logger.error(f"Error en proxy de stream {url}: {e}")
        return web.Response(status=502, text=f"Proxy error: {e}")


def create_app():
    app = web.Application()
    app.router.add_get('/', index_handler)
    app.router.add_get('/api/countries', get_countries_handler)
    app.router.add_get('/api/saved-lists', get_saved_lists_handler)
    app.router.add_get('/api/load-saved/{filename}', load_saved_list_handler)
    app.router.add_post('/api/load-playlist', load_playlist_handler)
    app.router.add_post('/api/verify-playlist', start_verification_handler)
    app.router.add_get('/api/verification-status/{task_id}', get_verification_status_handler)
    app.router.add_get('/api/proxy', stream_proxy_handler)
    app.router.add_static('/static/', STATIC_DIR)
    return app


if __name__ == '__main__':
    web.run_app(create_app(), host='127.0.0.1', port=5050)
