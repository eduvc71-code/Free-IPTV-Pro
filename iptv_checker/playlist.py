import re


class Playlist:
    def __init__(self, content=None):
        self.channels = []
        if content:
            self.parse(content)

    def parse(self, content):
        lines = content.splitlines()
        current_extinf = None

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if line.startswith('#EXTINF:'):
                current_extinf = line
            elif not line.startswith('#') and current_extinf:
                # Extraemos atributos comunes de forma opcional
                logo_match = re.search(r'tvg-logo="([^"]*)"', current_extinf, re.IGNORECASE)
                logo = logo_match.group(1) if logo_match else ""

                group_match = re.search(r'group-title="([^"]*)"', current_extinf, re.IGNORECASE)
                group = group_match.group(1) if group_match else ""

                # El nombre del canal es lo que viene tras la última coma
                name_match = re.search(r',([^,]+)$', current_extinf)
                name = name_match.group(1).strip() if name_match else "Unknown Channel"

                channel = {
                    "name": name,
                    "logo": logo,
                    "group": group,
                    "url": line
                }
                self.channels.append(channel)
                current_extinf = None

    def get_urls(self):
        return [channel["url"] for channel in self.channels]

    def get_channels(self):
        return self.channels

    def add_channels(self, channels):
        self.channels.extend(channels)

    def to_m3u(self, group_title=None):
        m3u_content = "#EXTM3U\n"
        for channel in self.channels:
            group = group_title or channel.get("group", "")
            group_str = f' group-title="{group}"' if group else ""
            logo_str = f' tvg-logo="{channel["logo"]}"' if channel.get("logo") else ""
            m3u_content += f'#EXTINF:-1{logo_str}{group_str},{channel["name"]}\n{channel["url"]}\n'
        return m3u_content
