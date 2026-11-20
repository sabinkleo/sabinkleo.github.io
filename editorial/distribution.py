"""Build a local, reviewable distribution kit. This module makes no requests."""

from dataclasses import dataclass
import json
from pathlib import Path
from urllib.parse import urlencode, urlsplit


BASE = "https://verticelabs.me/observatorio/"
CAROUSEL = tuple(f"carousel/{n:02}.png" for n in range(1, 7))
STORIES = tuple(f"stories/{n:02}.png" for n in range(1, 4))
VIDEO = ("reel.mp4", "legendas.srt")


@dataclass(frozen=True)
class Channel:
    priority: int
    medium: str
    copy: str
    assets: tuple[str, ...]
    handoff: str


CHANNELS = {
    "site": Channel(0, "", "rss", (), "Revisar HTML, data, crédito e URL permanente no PR."),
    "rss": Channel(0, "", "rss", (), "Conferir título, resumo e link em feed.xml após o deploy."),
    "google-search": Channel(0, "", "search", (), "O proprietário pode enviar o sitemap pelo Search Console após conferir a publicação."),
    "linkedin": Channel(0, "organic_social", "linkedin", (), "Revisar no perfil autorizado e conferir a prévia do link."),
    "tiktok": Channel(0, "organic_video", "shorts", VIDEO, "Confirmar acesso à conta. Revisar audiência, legenda e destino do link disponível no perfil."),
    "whatsapp-status": Channel(0, "status", "whatsapp", STORIES, "Selecionar a audiência autorizada e adicionar o link ao Status."),
    "whatsapp": Channel(0, "mensagem", "whatsapp", (), "Compartilhar manualmente em conversa que tenha solicitado o material."),
    "instagram": Channel(1, "organic_social", "instagram", CAROUSEL, "Revisar o carrossel em ordem e inserir as descrições das imagens."),
    "instagram-reels": Channel(1, "organic_video", "shorts", VIDEO, "Revisar áudio, legenda e destino do link disponível no perfil."),
    "instagram-stories": Channel(1, "story", "whatsapp", STORIES, "Adicionar enquete na primeira tela e sticker do link na última."),
    "facebook": Channel(1, "organic_social", "instagram", CAROUSEL, "Conferir o destino da publicação e a prévia da primeira imagem."),
    "threads": Channel(1, "organic_social", "short", (), "Revisar texto e link no perfil escolhido."),
    "youtube-shorts": Channel(1, "organic_video", "shorts", VIDEO, "Conferir título, legenda, visibilidade e destino disponível no canal."),
    "dev": Channel(1, "syndication", "excerpt", (), "Avaliar pertinência técnica. Usar a URL original como canonical na edição do post."),
    "hashnode": Channel(1, "syndication", "excerpt", (), "Avaliar pertinência técnica e preencher a URL canônica original no editor."),
    "pinterest": Channel(2, "organic_social", "pin", (CAROUSEL[0],), "Inserir o link como destino do Pin e a descrição da capa como texto alternativo."),
    "newsletter": Channel(2, "email", "newsletter", (), "Enviar exclusivamente à lista com opt-in ativo e opção de descadastro."),
    "comunidades": Channel(2, "referral", "excerpt", (), "Escolher uma discussão pertinente e conferir as regras locais antes de compartilhar."),
    "product-hunt": Channel(2, "referral", "launch", (), "Somente para lançamento próprio verificável. Revisar regras, demonstração e destino do produto."),
    "hacker-news": Channel(2, "referral", "launch", (), "Somente para lançamento próprio demonstrável. Conferir a pertinência para Show HN e a demonstração pública."),
}


def article_url(record, channel):
    original = f"{BASE}{record['slug']}/"
    medium = CHANNELS[channel].medium
    if not medium:
        return original
    query = urlencode({"utm_source": channel, "utm_medium": medium, "utm_campaign": record["slug"]})
    return f"{original}?{query}"


def compose(record, template, url):
    package = record["social_package"]
    if template in package["captions"]:
        return f"{package['captions'][template]}\n\n{url}"
    if template == "rss":
        return f"{package['rss']['title']}\n\n{package['rss']['summary']}\n\n{url}"
    if template == "search":
        return f"Sitemap\n{BASE}sitemap.xml\n\nURL canônica\n{url}"
    if template == "short":
        return f"{record['title']}\n\n{url}"
    if template == "pin":
        return f"{record['title']}\n\n{record['summary']}\n\n{url}"
    if template == "newsletter":
        return f"Assunto: {record['title']}\n\n{record['summary']}\n\n{record['how_to_adapt'][0]}\n\nLeia a análise completa\n{url}"
    if template == "excerpt":
        return f"{record['title']}\n\n{record['summary']}\n\n{record['how_to_adapt'][0]}\n\nLimites da análise\n{record['limitations']}\n\nArtigo com fontes\n{url}"
    if template == "launch":
        return f"{record['title']}\n\n{record['summary']}\n\nDemonstração\nhttps://verticelabs.me{record['related_tool']}\n\nContexto técnico\n{url}"
    raise ValueError(f"Unknown channel template {template}")


def own_release(record):
    """Gate launch venues on a first-party release and an exact source for its tool."""
    expected = record["related_tool"].rstrip("/")
    return record["event_type"] == "release" and any(
        source["kind"] == "primary"
        and urlsplit(source["url"]).hostname == "verticelabs.me"
        and urlsplit(source["url"]).path.rstrip("/") == expected
        for source in record["sources"]
    )


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def export(record, output: Path):
    """Export channel drafts from an already validated editorial record to output/canais."""
    if record["content_status"] not in {"approved", "published", "updated"}:
        raise ValueError("Channel drafts require an approved editorial record")
    destination = Path(output) / "canais"
    destination.mkdir(parents=True, exist_ok=True)
    canonical = article_url(record, "site")
    alt = {}
    for group, paths in (("carousel", CAROUSEL), ("stories", STORIES)):
        for path, card in zip(paths, record["social_package"][group], strict=True):
            alt[path] = card["alt"]
    write_json(destination / "alt.json", alt)
    write_json(destination / "fontes.json", [
        {key: source[key] for key in ("title", "publisher", "date", "url")}
        for source in record["sources"]
    ])
    entries = {}
    for name, channel in CHANNELS.items():
        url = article_url(record, name)
        path = destination / f"{name}.txt"
        eligible = channel.copy != "launch" or own_release(record)
        entries[name] = {
            "prioridade": f"P{channel.priority}", "estado": "aguarda_revisao" if eligible else "fora_de_escopo",
            "texto": path.name if eligible else None, "arquivos": channel.assets if eligible else (),
            "destino": url if eligible else None, "revisao": channel.handoff,
        }
        if eligible:
            path.write_text(compose(record, channel.copy, url) + "\n", encoding="utf-8")
        else:
            path.unlink(missing_ok=True)
    write_json(destination / "manifest.json", {
        "artigo": canonical, "arquivos_relativos_a": "diretório da matéria",
        "textos_relativos_a": "canais/", "canais": entries,
    })
    return destination
