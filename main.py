import asyncio
import os
import sys
import subprocess
import re

# Salida UTF-8 robusta: sin esto, Windows (cp1252) revienta al imprimir
# los caracteres de la interfaz (✓, ✗, emojis) si no se arranca con chcp 65001.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# ============================================================
# iptv_checker es una HERRAMIENTA LOCAL (no se versiona en el repo
# ni forma parte de la APK). Si no esta presente, el menu sigue
# funcionando para el resto de opciones.
# ============================================================
try:
    from iptv_checker.checker import IPTVChecker
    from iptv_checker.utils import read_playlist_urls, create_index_m3u
    from iptv_checker.xtream_tester import (
        check_xtream_file, format_output_block, format_m3u_line, build_m3u_url,
    )
    from iptv_checker.verifier import build_ssl_context
    CHECKER_AVAILABLE = True
except ImportError as _e:
    CHECKER_AVAILABLE = False
    _CHECKER_ERROR = _e

# Configuración por defecto
DEFAULT_CONCURRENCY = 150
DEFAULT_TIMEOUT = 8
# Concurrencia de la verificación de canales de cuentas privadas:
# cada canal implica 1-2 peticiones, asi que vamos mas conservative
# para no provocar cortes (rate limit) en los paneles.
PRIVATE_CONCURRENCY = 60

# Colores de consola (ANSI)
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"


def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')


def print_banner():
    clear_screen()
    print(f"{CYAN}{BOLD}")
    print("=" * 65)
    print("      WORLD IPTV CHECKER - EDICIÓN AMÉRICA Y XTREAM CODES")
    print("=" * 65)
    print(f"{RESET}")


def pause():
    input(f"\n{YELLOW}Presiona ENTER para volver al menú principal...{RESET}")


def _base_dir():
    """Carpeta raiz del proyecto (donde vive main.py)."""
    return os.path.dirname(os.path.abspath(__file__))


def resolve_input_file(typed):
    """
    Resuelve el fichero que el usuario escribe.

    Acepta:
      - ruta absoluta o relativa al directorio actual
      - solo el nombre del fichero (ej. 'XLISTASSSSD.TXT') -> se busca en la raiz
      - sin extension -> se prueba con .txt
      - mayusculas/minusculas distintas -> se busca sin distinguir mayusculas
    Devuelve la ruta existente o None.
    """
    if not typed:
        return None
    typed = typed.strip().strip('"').strip("'")
    if not typed:
        return None

    base = _base_dir()
    candidatos = [typed]

    # Si es solo un nombre, probar en la raiz del proyecto
    if not os.path.isabs(typed) and os.sep not in typed and "/" not in typed:
        candidatos.append(os.path.join(base, typed))
        if not typed.lower().endswith(".txt"):
            candidatos.append(os.path.join(base, typed + ".txt"))
            candidatos.append(os.path.join(base, typed + ".TXT"))

    for c in candidatos:
        if os.path.isfile(c):
            return os.path.abspath(c)

    # Ultimo recurso: buscar por nombre ignorando mayusculas en la raiz
    if not os.path.isabs(typed) and os.sep not in typed:
        try:
            objetivo = os.path.basename(typed).lower()
            for nombre in os.listdir(base):
                if nombre.lower() == objetivo:
                    return os.path.join(base, nombre)
            # prefijo: 'XLISTASSSSD' -> 'XLISTASSSSD.TXT'
            for nombre in os.listdir(base):
                if nombre.lower().startswith(objetivo):
                    return os.path.join(base, nombre)
        except OSError:
            pass
    return None


def _aviso_sin_checker():
    print(f"{RED}[!] La herramienta 'iptv_checker' no esta disponible en esta carpeta.{RESET}")
    print(f"    {str(_CHECKER_ERROR)}")
    print(f"    Es una herramienta LOCAL: debe estar en '{_base_dir()}\\iptv_checker'.")
    pause()


async def run_single_checker(name, url, concurrency=DEFAULT_CONCURRENCY):
    semaphore = asyncio.Semaphore(concurrency)
    checker = IPTVChecker(name, url, semaphore)
    print(f"\n{CYAN}[*] Iniciando verificación de '{name}'...{RESET}")
    await checker.run()
    create_index_m3u()
    print(f"{GREEN}[✓] ¡Proceso completado para '{name}'!{RESET}")


async def run_multiple_checkers(playlist_dict, concurrency=DEFAULT_CONCURRENCY):
    semaphore = asyncio.Semaphore(concurrency)
    tasks = []
    print(f"\n{CYAN}[*] Preparando {len(playlist_dict)} listas con concurrencia de {concurrency}...{RESET}")
    for name, url in playlist_dict.items():
        checker = IPTVChecker(name, url, semaphore)
        tasks.append(checker.run())

    await asyncio.gather(*tasks)
    create_index_m3u()
    print(f"\n{GREEN}{BOLD}[✓] ¡Verificación masiva completada! Archivos guardados en 'output/' e 'index.m3u' actualizado.{RESET}")


def menu_americas():
    if not CHECKER_AVAILABLE:
        _aviso_sin_checker()
        return
    print_banner()
    americas_file = os.path.join(os.path.dirname(__file__), 'playlists.txt')
    if not os.path.exists(americas_file):
        print(f"{RED}[!] No se encontró el archivo playlists.txt{RESET}")
        pause()
        return

    playlists = read_playlist_urls(americas_file)
    countries = list(playlists.keys())

    print(f"{BOLD}Países del Continente Americano disponibles ({len(countries)} en total):{RESET}\n")

    # Mostrar en columnas
    for i, country in enumerate(countries, 1):
        print(f"{CYAN}{i:2d}.{RESET} {country:<30}", end="\n" if i % 2 == 0 else " ")

    print(f"\n\n{YELLOW}Opciones:{RESET}")
    print(f"  {BOLD}T{RESET} - Verificar TODOS los países de América juntos")
    print(f"  {BOLD}1-{len(countries)}{RESET} - Ingresa el número de un país específico")
    print(f"  {BOLD}0{RESET} - Volver al menú principal\n")

    choice = input(f"{BOLD}Elige una opción: {RESET}").strip()
    if choice == '0':
        return
    elif choice.upper() == 'T':
        asyncio.run(run_multiple_checkers(playlists))
        pause()
    elif choice.isdigit() and 1 <= int(choice) <= len(countries):
        selected_country = countries[int(choice) - 1]
        selected_url = playlists[selected_country]
        asyncio.run(run_single_checker(selected_country, selected_url))
        pause()
    else:
        print(f"{RED}[!] Opción inválida.{RESET}")
        pause()


def menu_xtream():
    if not CHECKER_AVAILABLE:
        _aviso_sin_checker()
        return
    print_banner()
    print(f"{BOLD}--- SOPORTE Y TESTER PARA XTREAM CODES / PANELES IPTV ---{RESET}\n")
    print("1. Pegar URL completa de Xtream Codes (Verificar canales)")
    print("2. Asistente manual (Servidor, Usuario y Contraseña)")
    print(f"{GREEN}3. 📋 PROCESAR ARCHIVO .TXT DE CUENTAS XTREAM{RESET}")
    print(f"   {GREEN}-> Valida las cuentas y genera en output/ las listas REALES y VERIFICADAS{RESET}")
    print("0. Volver\n")

    sub_choice = input(f"{BOLD}Elige una opción: {RESET}").strip()
    if sub_choice == '1':
        url = input(f"\n{CYAN}Pega la URL de tu lista Xtream Codes:{RESET}\n> ").strip()
        if not url.startswith(('http://', 'https://')):
            print(f"{RED}[!] La URL debe comenzar con http:// o https://{RESET}")
            pause()
            return
        name = input(f"{CYAN}Nombre para guardar esta lista (ej. Mi_IPTV): {RESET}").strip()
        if not name:
            name = "Xtream_IPTV"
        asyncio.run(run_single_checker(name, url))
        pause()

    elif sub_choice == '2':
        server = input(f"\n{CYAN}Servidor / Host (ej. http://servidor.com:8080): {RESET}").strip()
        server = server.rstrip('/')
        if not server.startswith(('http://', 'https://')):
            server = "http://" + server

        user = input(f"{CYAN}Usuario: {RESET}").strip()
        password = input(f"{CYAN}Contraseña: {RESET}").strip()

        print(f"\n{YELLOW}Formato de flujo preferido:{RESET}")
        print("1. MPEG-TS (.ts) - Mayor compatibilidad con direct streams")
        print("2. HLS (.m3u8) - Segmentado")
        fmt_choice = input("Elige (1 o 2, por defecto 1): ").strip()
        fmt = "m3u8" if fmt_choice == "2" else "ts"

        xtream_url = f"{server}/get.php?username={user}&password=***&type=m3u_plus&output={fmt}"
        name = input(f"\n{CYAN}Nombre para el archivo resultante (ej. Mi_Xtream): {RESET}").strip()
        if not name:
            name = "Mi_Xtream"

        print(f"\n{GREEN}URL generada:{RESET} {xtream_url}")
        asyncio.run(run_single_checker(name, xtream_url))
        pause()

    elif sub_choice == '3':
        test_xtream_txt_menu()


def test_xtream_txt_menu():
    """
    Procesa un fichero .txt con cuentas Xtream y genera en 'output/' los
    ficheros REALES y VERIFICADOS de cada lista privada:

      output/<host>_<usuario>.m3u   -> solo los canales que responden de verdad
      output/status/<host>_<usuario>.json -> informe de vigencia
      output/servidores_xtream_activos.txt -> estado de cada cuenta
      output/cuentas_activas_m3u.txt      -> URLs M3U de las cuentas vivas
      output/index.m3u            -> indice global de todo lo verificado
    """
    if not CHECKER_AVAILABLE:
        _aviso_sin_checker()
        return
    print_banner()
    print(f"{BOLD}--- VALIDAR CUENTAS XTREAM Y GENERAR LISTAS VERIFICADAS ---{RESET}\n")
    print("Escribe el nombre de tu archivo .txt con las cuentas (ej. XLISTASSSSD.TXT)")
    print("o arrastra el archivo a esta ventana. Si dejas en blanco se usa")
    print("'servidores_xtream.txt' de esta carpeta.\n")

    typed = input(f"{CYAN}> {RESET}").strip()
    if not typed:
        typed = os.path.join(_base_dir(), 'servidores_xtream.txt')

    filepath = resolve_input_file(typed)
    if not filepath:
        print(f"\n{RED}[!] No se encontró el archivo: {typed}{RESET}")
        print(f"    Busqué en el directorio actual y en: {_base_dir()}")
        pause()
        return

    print(f"{GREEN}[✓] Archivo: {filepath}{RESET}\n")

    # Formato de salida de las listas
    print(f"{YELLOW}Formato de las listas a generar:{RESET}")
    print(f"  {BOLD}1{RESET}. HLS (.m3u8)  {GREEN}- recomendado para la app Android/TV{RESET}")
    print(f"  {BOLD}2{RESET}. MPEG-TS (.ts) - para reproductores que aceptan TS directo\n")
    fmt_choice = input(f"{BOLD}Elige (1 o 2, por defecto 1): {RESET}").strip()
    output_format = "ts" if fmt_choice == "2" else "m3u8"

    print(f"\n{CYAN}[*] Validando las cuentas del panel...{RESET}")
    active_servers = asyncio.run(check_xtream_file(filepath))

    print(f"\n{BOLD}{'=' * 65}{RESET}")
    print(f"{GREEN}{BOLD}CUENTAS ACTIVAS Y VÁLIDAS: {len(active_servers)}{RESET}")
    print(f"{BOLD}{'=' * 65}{RESET}\n")

    # ---- Los 2 ficheros de siempre se escriben SIEMPRE (tambien con 0 cuentas),
    #      para que nunca te queden datos obsoletos de una ejecucion anterior.
    output_dir = os.path.join(_base_dir(), 'output')
    os.makedirs(output_dir, exist_ok=True)
    report_path = os.path.join(output_dir, 'servidores_xtream_activos.txt')
    m3u_list_path = os.path.join(output_dir, 'cuentas_activas_m3u.txt')

    report_lines = []
    m3u_urls = []
    for s in active_servers:
        report_lines.append(format_output_block(s))
        m3u_urls.append(format_m3u_line(s))

    if active_servers:
        for s in active_servers:
            print(format_output_block(s))

    with open(report_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(report_lines) + "\n")
    with open(m3u_list_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(m3u_urls) + "\n")

    print(f"\n{GREEN}[✓] Estado de cuentas: {report_path}{RESET}")
    print(f"{GREEN}[✓] URLs M3U de cuentas vivas: {m3u_list_path}{RESET}")

    if not active_servers:
        print(f"\n{RED}[!] Ninguna cuenta del archivo esta activa o es valida.{RESET}")
        print("    (Ninguna devolvio 'auth=1' y estado 'active' en su panel)")
        print(f"{YELLOW}    Los 2 ficheros se han escrito VACIOS (sin datos obsoletos).{RESET}")
        pause()
        return

    # ---- Generar las playlists REALES y VERIFICADAS de cada cuenta ----
    print(f"\n{BOLD}{'=' * 65}{RESET}")
    print(f"{CYAN}{BOLD}GENERANDO LISTAS VERIFICADAS DE CADA CUENTA ({output_format}){RESET}")
    print(f"{BOLD}{'=' * 65}{RESET}\n")

    print(f"{YELLOW}Se descargará la lista y se verificará CADA canal (1-2 peticiones por canal).{RESET}")
    print(f"{YELLOW}Con {len(active_servers)} cuenta(s) puede tardar varios minutos.{RESET}")
    if len(active_servers) > 1:
        seguir = input(f"{BOLD}¿Continuar con las {len(active_servers)} cuentas? (s/n): {RESET}").strip().lower()
        if seguir not in ('s', 'si', 'sí', 'y', 'yes', ''):
            print(f"{YELLOW}[i] Saltando la generación de listas.{RESET}")
            pause()
            return

    muestra_txt = input(f"{BOLD}¿Verificar solo los primeros N canales por cuenta? "
                        f"(0 = todos, ej. 30): {RESET}").strip()
    muestra = int(muestra_txt) if muestra_txt.isdigit() and int(muestra_txt) > 0 else None
    if muestra:
        print(f"{YELLOW}    Muestra: {muestra} canales por cuenta (verificacion rapida){RESET}")

    asyncio.run(generar_listas_verificadas(active_servers, output_format, muestra=muestra))

    # Indice global
    try:
        create_index_m3u()
    except Exception as e:
        print(f"{YELLOW}[!] No se pudo actualizar el índice: {e}{RESET}")

    print(f"\n{GREEN}{BOLD}[✓] LISTAS VERIFICADAS GENERADAS EN:{RESET}")
    print(f"{GREEN}    {output_dir}{RESET}")
    print(f"{YELLOW}    Cada cuenta viva tiene su .m3u con SOLO los canales que responden,")
    print(f"{YELLOW}    y su informe de vigencia en output/status/.{RESET}")
    pause()


async def generar_listas_verificadas(active_servers, output_format, muestra=None):
    """
    Para cada cuenta viva descarga su lista REAL y verifica canal a canal.

    Usa el Player API del panel (solo canales EN VIVO) en lugar del M3U+,
    porque el M3U+ mezcla TV, peliculas y series (decenas de miles de
    entradas, casi todas VOD que la app no reproduce y que ademas devuelven
    HTTP 503 y ralentizan la verificacion).

    La concurrencia se ADAPTA a los limites de la cuenta (max_connections):
    abrir mas streams de los permitidos hace que el panel deje de responder.

    Escribe output/<host>_<usuario>.m3u y output/status/<host>_<usuario>.json
    """
    import aiohttp
    from iptv_checker.utils import DEFAULT_HEADERS
    from iptv_checker.xtream_tester import fetch_live_streams, get_account_limits

    connector = aiohttp.TCPConnector(ssl=build_ssl_context(insecure=False), limit=32)
    session = aiohttp.ClientSession(
        headers=DEFAULT_HEADERS,
        connector=connector,
        timeout=aiohttp.ClientTimeout(total=30),
    )

    try:
        for s in active_servers:
            nombre = f"{s['server_host']}_{s['username']}"

            # Limites reales de la cuenta -> concurrencia segura.
            # El panel cuenta CADA stream abierto como conexion, asi que solo
            # podemos abrir (max_connections - active_cons) a la vez.
            max_conn, active = await get_account_limits(session, s['base_url'],
                                                         s['username'], s['password'])
            try:
                active_n = int(active) if active is not None else 0
            except (TypeError, ValueError):
                active_n = 0
            if max_conn:
                try:
                    max_n = int(max_conn)
                except (TypeError, ValueError):
                    max_n = 2
                libres = max(0, max_n - active_n)
                concurrencia = max(1, min(PRIVATE_CONCURRENCY, libres))
                print(f"{CYAN}[*] {nombre}: la cuenta admite {max_n} conexion(es) "
                      f"(ya activas: {active_n}) -> libres: {libres} "
                      f"-> verificando con {concurrencia} en paralelo{RESET}")
            else:
                concurrencia = 2
                print(f"{CYAN}[*] {nombre}: sin datos de limites; verificando con "
                      f"{concurrencia} en paralelo (conservador){RESET}")

            semaphore = asyncio.Semaphore(concurrencia)

            async def provider(s=s):
                ch = await fetch_live_streams(session, s['base_url'], s['username'],
                                              s['password'], output_format)
                if muestra:
                    ch = ch[:muestra]
                return ch

            checker = IPTVChecker(nombre, s['m3u_url'], semaphore, session=session,
                                  insecure=False, timeout=15.0,
                                  channels_provider=provider)
            try:
                await checker.run()
                pct = checker.stats.get("vivos", 0)
                tot = checker.stats.get("total", 0)
                if tot:
                    print(f"{GREEN}[✓] {nombre}: {pct}/{tot} canales reales verificados "
                          f"({100.0 * pct / tot:.1f}%){RESET}")
                else:
                    print(f"{YELLOW}[!] {nombre}: la lista no devolvió canales{RESET}")
            except Exception as e:
                print(f"{RED}[!] {nombre}: error al verificar -> {e}{RESET}")
    finally:
        await session.close()


def menu_custom_url():
    if not CHECKER_AVAILABLE:
        _aviso_sin_checker()
        return
    print_banner()
    print(f"{BOLD}--- VERIFICAR URL M3U EXTERNA ---{RESET}\n")
    url = input(f"{CYAN}Pega la URL pública o privada de la lista (.m3u / .m3u8):{RESET}\n> ").strip()
    if not url.startswith(('http://', 'https://')):
        print(f"{RED}[!] Debe ser un enlace válido HTTP o HTTPS.{RESET}")
        pause()
        return

    name = input(f"{CYAN}Nombre descriptivo para la lista: {RESET}").strip()
    if not name:
        name = "Lista_Externa"

    asyncio.run(run_single_checker(name, url))
    pause()


def menu_local_file():
    if not CHECKER_AVAILABLE:
        _aviso_sin_checker()
        return
    print_banner()
    print(f"{BOLD}--- VERIFICAR ARCHIVO M3U LOCAL ---{RESET}\n")
    print("Puedes arrastrar y soltar el archivo .m3u directamente aquí, o escribir su ruta:")
    file_path = input(f"{CYAN}> {RESET}").strip().strip('"').strip("'")

    if not os.path.exists(file_path):
        print(f"{RED}[!] El archivo no existe: {file_path}{RESET}")
        pause()
        return

    name = input(f"{CYAN}Nombre descriptivo para la lista de salida: {RESET}").strip()
    if not name:
        name = os.path.splitext(os.path.basename(file_path))[0]

    asyncio.run(run_single_checker(name, file_path))
    pause()


def open_output_folder():
    output_dir = os.path.join(os.path.dirname(__file__), 'output')
    os.makedirs(output_dir, exist_ok=True)
    if sys.platform == 'win32':
        os.startfile(output_dir)
    elif sys.platform == 'darwin':
        subprocess.run(['open', output_dir], check=True)
    else:
        subprocess.run(['xdg-open', output_dir], check=True)
    print(f"\n{GREEN}[✓] Carpeta abierta: {output_dir}{RESET}")
    pause()


def build_android_apk():
    print_banner()
    print(f"{BOLD}--- COMPILACIÓN Y GENERACIÓN DE APK ANDROID (FREE-IPTV PRO) ---{RESET}\n")
    bat_path = os.path.join(os.path.dirname(__file__), 'compilar_apk.bat')
    if os.path.exists(bat_path):
        subprocess.run([bat_path], shell=True, check=True)
    else:
        print(f"{RED}[!] No se encontró el archivo compilar_apk.bat{RESET}")
        pause()


def run_local_web_server():
    print_banner()
    print(f"{BOLD}--- INICIANDO SERVIDOR WEB / REPRODUCTOR LOCAL ---{RESET}\n")
    server_script = os.path.join(os.path.dirname(__file__), 'app', 'server.py')
    print(f"{CYAN}Abriendo reproductor en tu navegador web (http://localhost:5050)...{RESET}")
    if sys.platform == 'win32':
        import webbrowser
        webbrowser.open('http://localhost:5050')
    subprocess.run([sys.executable, server_script], check=True)


def main():
    while True:
        print_banner()
        print(f"{BOLD}SELECCIONA UNA ACCIÓN:{RESET}\n")
        print(f"  {GREEN}1.{RESET} 🌎 {BOLD}Listas del Continente Americano{RESET} (Filtrado por países)")
        print(f"  {GREEN}2.{RESET} 🔑 {BOLD}Verificar Xtream Codes / Panel IPTV{RESET} (Credenciales usuario/clave)")
        print(f"  {GREEN}3.{RESET} 🌐 {BOLD}Verificar URL M3U Externa{RESET} (Cualquier enlace de internet)")
        print(f"  {GREEN}4.{RESET} 📁 {BOLD}Verificar Archivo M3U Local{RESET} (Archivo en tu computadora)")
        print(f"  {GREEN}5.{RESET} 📂 {BOLD}Abrir Carpeta de Resultados ('output/'){RESET}")
        print(f"  {CYAN}6.{RESET} 📱 {BOLD}Compilar / Generar APK Móvil Android{RESET} (Free-IPTV Pro)")
        print(f"  {YELLOW}7.{RESET} 🌐 {BOLD}Iniciar Servidor Web y Reproductor Local{RESET}")
        print(f"  {RED}0.{RESET} 🚪 {BOLD}Salir{RESET}\n")

        option = input(f"{BOLD}Ingresa tu opción (0-7): {RESET}").strip()

        if option == '1':
            menu_americas()
        elif option == '2':
            menu_xtream()
        elif option == '3':
            menu_custom_url()
        elif option == '4':
            menu_local_file()
        elif option == '5':
            open_output_folder()
        elif option == '6':
            build_android_apk()
        elif option == '7':
            run_local_web_server()
        elif option == '0':
            print(f"\n{CYAN}¡Hasta pronto!{RESET}\n")
            break
        else:
            print(f"{RED}[!] Opción no reconocida.{RESET}")
            pause()


if __name__ == "__main__":
    main()
