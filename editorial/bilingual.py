"""Generate English editorial pages during Pages build, preserving canonical PT inputs.

Translations are explicit, revision-bound and never silently reused after an edit.
No network calls, credentials, or changes to the existing editorial generator.
"""
import argparse
import copy
import json
import re
import shutil
import tempfile
from pathlib import Path

from . import sitegen

ROOT = Path(__file__).resolve().parents[1]
PT = "https://verticelabs.me/observatorio/"
EN = "https://verticelabs.me/en/observatory/"
TRANSLATIONS = ROOT / "editorial/translations/en.json"
TEXT_FIELDS = ("title", "category", "sector", "summary", "what_changed",
               "who_is_affected", "how_to_adapt", "brazil_note", "limitations",
               "business_opportunity")
LABELS = {
    'lang="pt-BR"': 'lang="en"',
    'content="pt_BR"': 'content="en_US"',
    '"inLanguage": "pt-BR"': '"inLanguage": "en"',
    'Vértice Intelligence. Inteligência aplicada para empresas.': 'Vértice Intelligence. Applied intelligence for businesses.',
    'Pular para o conteúdo': 'Skip to content',
    'Menu da Vértice': 'Vértice navigation',
    'Vértice Labs, início': 'Vértice Labs, home',
    '>Ferramentas<': '>Tools<',
    '>Soluções<': '>Solutions<',
    'href="/observatorio/" aria-current="page">Observatório': 'href="/en/observatory/" aria-current="page">Observatory',
    'Navegação editorial': 'Editorial navigation',
    '>Arquivo<': '>Archive<',
    'Ferramentas Vértice Labs': 'Vértice Labs tools',
    '>Observatório<': '>Observatory<',
    'Arquivo editorial': 'Editorial archive',
    'Buscar matéria': 'Search articles',
    'Palavra-chave': 'Keyword',
    'Categoria<select': 'Category<select',
    'Setor<select': 'Sector<select',
    '>Todas<': '>All<',
    '>Todos<': '>All<',
    'Só favoritos': 'Favorites only',
    'Nenhuma matéria corresponde aos filtros.': 'No articles match your filters.',
    'Limpar filtros': 'Clear filters',
    'Ler matéria': 'Read article',
    'Salvar nos favoritos:': 'Save to favorites:',
    '>Salvar<': '>Save<',
    'Data do fato': 'Event date',
    'Verificado em': 'Verified on',
    'Redação Vértice Intelligence': 'Vértice Intelligence editorial team',
    'Edição de ': 'Edition of ',
    'Ficha da matéria': 'Article details',
    '>Verificação<': '>Verification<',
    'Confiança na evidência': 'Evidence confidence',
    '>Setor<': '>Sector<',
    'País de referência': 'Region',
    'Consultar fontes': 'View sources',
    'O que mudou': 'What changed',
    'Quem é afetado': 'Who is affected',
    'Disponibilidade no Brasil a confirmar': 'Availability in Brazil not confirmed',
    'Aplicação no Brasil confirmada': 'Availability in Brazil confirmed',
    'Disponibilidade por país não se aplica': 'Country-specific availability not applicable',
    'Três ações práticas': 'Three practical steps',
    '>Limitações<': '>Limitations<',
    'Hipótese comercial': 'Business hypothesis',
    'Sinal comercial documentado': 'Documented business signal',
    '>Abrir ': '>Open ',
    'Fontes consultadas': 'Sources',
    'Histórico e correções': 'History and corrections',
    'Ver histórico editorial': 'View editorial history',
    'A edição estreia com a primeira matéria aprovada pela redação.': 'The first English edition is awaiting translation.',
}


def add_languages(html, pt, en, language):
    tags = (f'<link rel="alternate" hreflang="pt-BR" href="{pt}">\n'
            f'<link rel="alternate" hreflang="en" href="{en}">\n'
            f'<link rel="alternate" hreflang="x-default" href="{en}">\n')
    if tags not in html:
        html = html.replace("</head>", tags + "</head>", 1)
    if '/assets/vl-nav.css' not in html:
        html = html.replace("</head>", '<link rel="stylesheet" href="/assets/vl-nav.css">\n'
                            '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
                            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
                            '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&amp;family=Space+Grotesk:wght@400;500;600;700&amp;display=swap" rel="stylesheet">\n</head>', 1)
    english = language == "en"
    home = "/" if english else "/pt/"
    observatory = "/en/observatory/" if english else "/observatorio/"
    menu = "Vértice navigation" if english else "Menu da Vértice"
    brand = "Vértice Labs, home" if english else "Vértice Labs, início"
    tools = "Tools" if english else "Ferramentas"
    news = "Observatory" if english else "Observatório"
    solutions = "Solutions (PT)" if english else "Soluções"
    engineering = "Engineering" if english else "Engenharia (EN)"
    diagnostic = "Free diagnosis (PT)" if english else "Diagnóstico grátis"
    nav = f'''<nav class="vl-nav vl-unified-nav" aria-label="{menu}">
  <div class="vl-nav-inner">
    <a class="vl-wordmark" href="{home}" aria-label="{brand}">Vértice<span>Labs</span></a>
    <div class="vl-nav-links">
      <a href="{home}">{tools}</a>
      <a href="{observatory}" aria-current="page">{news}</a>
      <a href="/solucoes/">{solutions}</a>
      <a href="/en/">{engineering}</a>
      <a href="{pt}" lang="pt-BR" hreflang="pt-BR">PT</a>
      <a href="{en}" lang="en" hreflang="en">EN</a>
      <a class="vl-nav-cta" href="/raio-x-vendas/">{diagnostic}</a>
    </div>
  </div>
</nav>'''
    html, count = re.subn(r'<nav class="vl-nav(?: vl-unified-nav)?"[^>]*>[\\s\\S]*?</nav>', lambda _: nav, html, count=1)
    if count != 1:
        raise ValueError("Missing editorial navigation")
    return html


def translated(record, entry):
    r = copy.deepcopy(record)
    if entry.get("revision") != r["updated_at"]:
        return None
    for key in TEXT_FIELDS:
        r[key] = entry[key]
        if not r[key]:
            raise ValueError(f"Empty English translation: {r['slug']}:{key}")
    if len(r["how_to_adapt"]) != 3:
        raise ValueError("English article requires three steps")
    for source, title in zip(r["sources"], entry["source_titles"], strict=True):
        source["title"] = title
    for item, note in zip(r["history"], entry["history_notes"], strict=True):
        item["note"] = note
    r["social_package"]["rss"] = {"title": r["title"], "summary": r["summary"]}
    return r


def build(output):
    output = Path(output)
    pt = output / "observatorio"
    if not (pt / "index.html").is_file():
        raise ValueError("Portuguese editorial output missing")
    manifest = json.loads((pt / "edicoes.json").read_text(encoding="utf-8"))
    translations = json.loads(TRANSLATIONS.read_text(encoding="utf-8"))
    records = []
    for slug in sorted(manifest):
        if not sitegen.SLUG.fullmatch(slug):
            raise ValueError("Invalid manifest slug")
        record = json.loads((ROOT / "editorial/records" / f"{slug}.json").read_text(encoding="utf-8"))
        if record["content_status"] not in sitegen.PUBLIC:
            raise ValueError("Non-public record in publication manifest")
        entry = translations.get(slug)
        result = translated(record, entry) if entry else None
        if result:
            records.append(result)
        else:
            print(f"::warning::English translation missing or outdated: {slug}")
    # Reuse the deterministic site template; these overrides exist only in this process.
    sitegen.BASE = EN
    sitegen.PITCH = "What changed. Who is affected. What to do now."
    sitegen.MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    sitegen.EVENTS = {"announcement":"Announcement", "release":"Release", "effective":"Effective date",
                      "forecast":"Forecast", "educational":"Archive guide"}
    sitegen.STATES = {"candidate":"Story selected", "verified":"Verification", "draft":"Draft",
                      "approved":"Editorial approval", "published":"Publication", "updated":"Update"}
    sitegen.TOOLS = {"/raio-x-vendas/":"Sales diagnostic", "/n1/":"N1", "/tuning/":"Pre-Dyno Terminal",
                     "/solucoes/":"Business implementation"}
    sitegen.confidence = lambda r: {"high":"High", "moderate":"Moderate"}[r["evidence_level"]]
    target = output / "en/observatory"
    sitegen.build(records, target)
    slug_set = {r["slug"] for r in records}
    for page in sorted(target.rglob("index.html")):
        slug = page.parent.name if page.parent != target else ""
        suffix = slug + "/" if slug else ""
        html = page.read_text(encoding="utf-8")
        for old, new in LABELS.items():
            html = html.replace(old, new)
        html = re.sub(r'(\d+) matérias?</span>', lambda m: m[1] + (" article" if m[1] == "1" else " articles") + "</span>", html)
        html = html.replace("Observatório Vértice Labs", "Vértice Labs Observatory")
        html = add_languages(html, PT + suffix, EN + suffix, "en")
        page.write_text(html, encoding="utf-8")
    for slug in ["", *sorted(slug_set)]:
        suffix = slug + "/" if slug else ""
        page = pt / slug / "index.html"
        html = page.read_text(encoding="utf-8")
        page.write_text(add_languages(html, PT + suffix, EN + suffix, "pt"), encoding="utf-8")
    # Keep favorites shared across both languages; localize dynamic labels.
    js = target / "assets/site.js"
    text = js.read_text(encoding="utf-8")
    for old, new in (('"pt-BR"', '"en"'), ('"1 matéria"', '"1 article"'),
                     ('" matérias"', '" articles"'), ('"Salvo"', '"Saved"'), ('"Salvar"', '"Save"')):
        text = text.replace(old, new)
    js.write_text(text, encoding="utf-8")
    feed = target / "feed.xml"
    feed.write_text(feed.read_text(encoding="utf-8").replace("<language>pt-BR</language>", "<language>en</language>"), encoding="utf-8")
    # Route links from the English Astro catalog without modifying any source or PT route.
    for page in [output / "index.html", *(output / "en").rglob("index.html")]:
        if not page.is_file() or target in page.parents:
            continue
        html = page.read_text(encoding="utf-8")
        if re.search(r'<html\b[^>]*\blang=["\x27]en["\x27]', html):
            page.write_text(html.replace('href="/observatorio/"', 'href="/en/observatory/"'), encoding="utf-8")
    robots = output / "robots.txt"
    original = robots.read_text(encoding="utf-8") if robots.exists() else ""
    sitemap = f"Sitemap: {EN}sitemap.xml"
    if sitemap not in original.splitlines():
        robots.write_text(original.rstrip() + "\n" + sitemap + "\n", encoding="utf-8")
    for slug in ["", *sorted(slug_set)]:
        suffix = slug + "/" if slug else ""
        a = (target / slug / "index.html").read_text(encoding="utf-8")
        b = (pt / slug / "index.html").read_text(encoding="utf-8")
        assert f'rel="canonical" href="{EN}{suffix}"' in a
        assert f'rel="canonical" href="{PT}{suffix}"' in b
        assert f'hreflang="en" href="{EN}{suffix}"' in b
        assert f'hreflang="pt-BR" href="{PT}{suffix}"' in a
        assert '<html lang="en">' in a
    print(f"English Observatory: {len(records)} published translations; {len(manifest)-len(records)} pending.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            shutil.copytree(ROOT / "observatorio", out / "observatorio")
            build(out)
    elif args.output:
        build(args.output)
    else:
        parser.error("provide --output or --check")


if __name__ == "__main__":
    main()
