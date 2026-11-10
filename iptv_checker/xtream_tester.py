import asyncio
import os
import re
import urllib.parse
from datetime import datetime
import aiohttp

XTREAM_HEADERS = {
    'User-Agent': 'IPTVSmartersPro/1.0.0 (Linux; Android 14)',
    'Accept': '*/*',
    'Connection': 'close'
}


def parse_xtream_line(line):
    """Extrae servidor, puerto, usuario y contraseña de una línea de texto o URL."""
    line = line.strip()
    if not line or line.startswith('#'):
        return None

    # Caso 1: URL con parámetros get.php?username=...&password=... o player_api.php?...
    if 'username=' in line and 'password=' in line:
        try:
            # Asegurar esquema
            if not line.startswith(('http://', 'https://')):
                line = 'http://' + line
            parsed = urllib.parse.urlparse(line)
            qs = urllib.parse.parse_qs(parsed.query)
            u = qs.get('username', [None])[0]
            p = qs.get('password', [None])[0]
            host = parsed.hostname
            scheme = parsed.scheme or 'http'
            port = parsed.port or (443 if scheme == 'https' else 80)
            if u and p and host:
                return {
                    'host': host,
                    'port': port,
                    'scheme': scheme,
                    'username': u.strip(),
                    'password': p.strip(),
                    'base_url': f"{scheme}://{host}:{port}"
                }
        except Exception:
            pass

    # Caso 2: URL de streaming directo /live/user/pass/... o /movie/user/pass/...
    m_live = re.search(r'^(https?://)?([^/:]+)(?::(\d+))?/(?:live|movie|series)/([^/]+)/([^/\.]+)', line)
    if m_live:
        proto, host, port, u, p = m_live.groups()
        scheme = proto.replace('://', '') if proto else 'http'
        port_num = int(port) if port else (443 if scheme == 'https' else 80)
        return {
            'host': host,
            'port': port_num,
            'scheme': scheme,
            'username': u.strip(),
            'password': p.strip(),
            'base_url': f"{scheme}://{host}:{port_num}"
        }

    # Caso 3: Formato plano host:puerto:usuario:clave o host:puerto usuario clave
    clean = re.sub(r'https?://', '', line)
    parts = re.split(r'[:,\s|]+', clean)
    if len(parts) >= 4:
        host = parts[0].strip()
        port_str = parts[1].strip()
        u = parts[2].strip()
        p = parts[3].strip()
        try:
            port_num = int(port_str)
            scheme = 'https' if port_num == 443 else 'http'
            return {
                'host': host,
                'port': port_num,
                'scheme': scheme,
                'username': u,
                'password': p,
                'base_url': f"{scheme}://{host}:{port_num}"
            }
        except ValueError:
            pass

    return None


def format_timestamp(ts):
    if not ts or str(ts).lower() in ('null', 'none', '0'):
        return "Ilimitado / Sin vencimiento"
    try:
        ts_int = int(ts)
        return datetime.fromtimestamp(ts_int).strftime('%d/%m/%Y')
    except Exception:
        return str(ts)


async def test_xtream_account(session, account_info, timeout_sec=8):
    """Consulta la API de Xtream Codes para validar credenciales y estado."""
    base_url = account_info['base_url']
    username = account_info['username']
    password = account_info['password']

    api_url = f"{base_url}/player_api.php?username={urllib.parse.quote(username)}&password={urllib.parse.quote(password)}"

    timeout = aiohttp.ClientTimeout(total=timeout_sec, connect=4)
    try:
        async with session.get(api_url, timeout=timeout, headers=XTREAM_HEADERS, allow_redirects=True) as resp:
            if resp.status != 200:
                return None

            try:
                data = await resp.json(content_type=None)
            except Exception:
                return None

            user_info = data.get('user_info', {})
            server_info = data.get('server_info', {})

            auth = user_info.get('auth')
            status = user_info.get('status', '')

            # Validar que esté autenticado y activo
            if auth != 1 or status.lower() != 'active':
                return None

            # Validar fecha de expiración y calcular días restantes
            exp_date_raw = user_info.get('exp_date')
            now_ts = datetime.now().timestamp()
            if exp_date_raw and str(exp_date_raw).isdigit():
                exp_ts = int(exp_date_raw)
                if exp_ts < now_ts:
                    # Cuenta vencida
                    return None
                diff_days = int((exp_ts - now_ts) // 86400)
                days_remaining = f"{diff_days} días restantes"
                expiry_date = format_timestamp(exp_ts)
            else:
                exp_ts = float('inf')
                diff_days = 999999
                days_remaining = "Ilimitado / Sin vencimiento"
                expiry_date = "Ilimitado"

            # Procesar datos para la devolución
            line_type = "Trial" if str(user_info.get('is_trial', '0')) == '1' else "Official"
            start_date = format_timestamp(user_info.get('created_at'))
            allowed_out = user_info.get('allowed_output_formats', ['m3u8', 'ts'])
            if isinstance(allowed_out, list):
                allowed_out_str = ", ".join(allowed_out)
            else:
                allowed_out_str = str(allowed_out)

            result = {
                'server_host': account_info['host'],
                'streaming_port': account_info['port'],
                'username': username,
                'password': password,
                'status': status,
                'line_type': line_type,
                'start_date': start_date,
                'expiry_date': expiry_date,
                'exp_ts': exp_ts,
                'diff_days': diff_days,
                'days_remaining': days_remaining,
                'allow_connection': user_info.get('max_connections', '1'),
                'active_connection': user_info.get('active_cons', '0'),
                'allowed_output': allowed_out_str,
                'm3u_url': f"{base_url}/get.php?username={username}&password={password}&type=m3u_plus&output=ts"
            }
            return result

    except Exception:
        return None


def format_output_block(res):
    """Bloque detallado pero sin datos redundantes para servidores_xtream_activos.txt."""
    return (
        f"Servidor: {res['server_host']}:{res['streaming_port']}\n"
        f"Usuario: {res['username']} | Clave: {res['password']}\n"
        f"Vencimiento: {res['expiry_date']} ({res['days_remaining']})\n"
        f"Fecha inicio: {res['start_date']} | Tipo: {res['line_type']}\n"
        f"Conexiones: {res['active_connection']} activas / {res['allow_connection']} permitidas | Formatos: {res['allowed_output']}\n"
        f"M3U URL: {res['m3u_url']}\n"
        f"----------------------------------------------------------------"
    )


def format_m3u_line(res):
    """Línea limpia y directa para el listado de cuentas activas M3U."""
    return f"[Vence: {res['expiry_date']} | {res['days_remaining']}] {res['m3u_url']}"


async def check_xtream_file(filepath, concurrency=30):
    """Lee el archivo .txt con URLs y devuelve solo los servidores activos válidos, ordenados de más a menos días."""
    if not os.path.exists(filepath):
        print(f"[!] Archivo no encontrado: {filepath}")
        return []

    accounts = []
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            acc = parse_xtream_line(line)
            if acc:
                accounts.append(acc)

    if not accounts:
        print("[!] No se encontraron URLs o credenciales válidas en el archivo.")
        return []

    print(f"\n[*] Analizando {len(accounts)} servidores con concurrencia de {concurrency}...")

    active_results = []
    semaphore = asyncio.Semaphore(concurrency)

    async with aiohttp.ClientSession() as session:
        async def worker(acc):
            async with semaphore:
                res = await test_xtream_account(session, acc)
                if res:
                    active_results.append(res)
                    print(f"\n[+] ACTIVO: {res['server_host']}:{res['streaming_port']} | User: {res['username']} | Vence: {res['expiry_date']} ({res['days_remaining']})")

        tasks = [worker(a) for a in accounts]
        await asyncio.gather(*tasks)

    # Ordenar de mayor vigencia (más días restantes) a menor vigencia
    active_results.sort(key=lambda x: x['exp_ts'], reverse=True)

    return active_results
