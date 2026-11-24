# Reel editorial

Instalação inicial em Linux, macOS ou WSL com Python 3.11+, Node.js, curl,
Chromium, FFmpeg e FFprobe.

```sh
npm install --prefix scripts/reel
python scripts/run_reel.py --url https://www.canva.com/newsroom/news/canva-mcp-update/
```

O comando gera `article.md`, `social.md`, `reel.mp4` e `execution.log` em um
novo diretório de `build/reel/`. As afirmações são atribuídas à fonte original
e conservam o idioma do anúncio. A saída é destinada à revisão editorial.

O render usa vídeo ou imagem da fonte, com captura da página real como
alternativa. Para reproduzir uma captura oficial em ambiente sem acesso à
fonte, use `--snapshot DIR`. O diretório deve conter `source.html`,
`media.json` com a chave `url` e o arquivo de mídia original com o nome
`media`. O log indica quando o comando usou esse modo. Use `--browser` para
selecionar uma instalação específica do Chromium.

O histórico padrão está em `build/reel/assets/used_memes.json`. Passe
`--assets` para compartilhar o histórico usado pelo guard existente. A
composição editorial usa somente o material da fonte e registra a exportação
com uma lista vazia de reações.
