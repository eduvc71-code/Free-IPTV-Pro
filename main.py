import asyncio
import os
import sys
import subprocess
import re

from iptv_checker.checker import IPTVChecker
from iptv_checker.utils import read_playlist_urls, create_index_m3u
from iptv_checker.xtream_tester import check_xtream_file, format_output_block, format_m3u_line

# Configuración por defecto
DEFAULT_CONCURRENCY = 150
DEFAULT_TIMEOUT = 8

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
    print_banner()
    print(f"{BOLD}--- SOPORTE Y TESTER PARA XTREAM CODES / PANELES IPTV ---{RESET}\n")
    print("1. Pegar URL completa de Xtream Codes (Verificar canales)")
    print("2. Asistente manual (Servidor, Usuario y Contraseña)")
    print(f"{GREEN}3. 📋 TESTEAR ARCHIVO .TXT CON MÚLTIPLES URLs/SERVIDORES XTREAM{RESET}")
    print("   (Verifica estado, fecha inicio, vencimiento y filtra solo activos)")
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

        xtream_url = f"{server}/get.php?username={user}&password={password}&type=m3u_plus&output={fmt}"
        name = input(f"\n{CYAN}Nombre para el archivo resultante (ej. Mi_Xtream): {RESET}").strip()
        if not name:
            name = "Mi_Xtream"

        print(f"\n{GREEN}URL generada:{RESET} {xtream_url}")
        asyncio.run(run_single_checker(name, xtream_url))
        pause()

    elif sub_choice == '3':
        test_xtream_txt_menu()


def test_xtream_txt_menu():
    print_banner()
    print(f"{BOLD}--- VALIDADOR DE SERVIDORES Y CUENTAS XTREAM (.TXT) ---{RESET}\n")
    print("Ingresa la ruta de tu archivo .txt (o arrástralo a esta ventana):")
    print("(Si dejas en blanco, buscará 'servidores_xtream.txt' en esta carpeta)\n")

    filepath = input(f"{CYAN}> {RESET}").strip().strip('"').strip("'")
    if not filepath:
        filepath = os.path.join(os.path.dirname(__file__), 'servidores_xtream.txt')

    if not os.path.exists(filepath):
        print(f"\n{RED}[!] Archivo no encontrado: {filepath}{RESET}")
        print("Crea un archivo de texto con las URLs de Xtream Codes y vuelve a intentarlo.")
        pause()
        return

    active_servers = asyncio.run(check_xtream_file(filepath))

    print(f"\n{BOLD}{'=' * 65}{RESET}")
    print(f"{GREEN}{BOLD}RESULTADOS: SERVIDORES ACTIVOS Y VÁLIDOS ({len(active_servers)}){RESET}")
    print(f"{BOLD}{'=' * 65}{RESET}\n")

    if not active_servers:
        print(f"{RED}[!] No se encontraron servidores activos o válidos en el archivo.{RESET}")
        pause()
        return

    output_dir = os.path.join(os.path.dirname(__file__), 'output')
    os.makedirs(output_dir, exist_ok=True)
    report_path = os.path.join(output_dir, 'servidores_xtream_activos.txt')
    m3u_list_path = os.path.join(output_dir, 'cuentas_activas_m3u.txt')

    report_lines = []
    m3u_urls = []

    for s in active_servers:
        block = format_output_block(s)
        print(block)
        report_lines.append(block)
        m3u_urls.append(format_m3u_line(s))

    with open(report_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(report_lines) + "\n")

    with open(m3u_list_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(m3u_urls) + "\n")

    print(f"\n{GREEN}[✓] Informe detallado guardado en: {report_path}{RESET}")
    print(f"{GREEN}[✓] URLs M3U activas guardadas en: {m3u_list_path}{RESET}")
    pause()


def menu_custom_url():
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
        subprocess.run(['open', output_dir])
    else:
        subprocess.run(['xdg-open', output_dir])
    print(f"\n{GREEN}[✓] Carpeta abierta: {output_dir}{RESET}")
    pause()


def build_android_apk():
    print_banner()
    print(f"{BOLD}--- COMPILACIÓN Y GENERACIÓN DE APK ANDROID (FREE-IPTV PRO) ---{RESET}\n")
    bat_path = os.path.join(os.path.dirname(__file__), 'compilar_apk.bat')
    if os.path.exists(bat_path):
        subprocess.run([bat_path], shell=True)
    else:
        print(f"{RED}[!] No se encontró el archivo compilar_apk.bat{RESET}")
        pause()


def run_local_web_server():
    print_banner()
    print(f"{BOLD}--- INICIANDO SERVIDOR WEB / REPRODUCTOR LOCAL ---{RESET}\n")
    server_script = os.path.join(os.path.dirname(__file__), 'app', 'server.py')
    print(f"{CYAN}Abriendo reproductor en tu navegador web (http://localhost:8080)...{RESET}")
    if sys.platform == 'win32':
        import webbrowser
        webbrowser.open('http://localhost:8080')
    subprocess.run([sys.executable, server_script])


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
