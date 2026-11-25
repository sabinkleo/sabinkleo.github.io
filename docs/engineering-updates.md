# Atualizações de engenharia

O laboratório em `/en/lab/` e os três diagnósticos em inglês usam guias estáticos revisados. Cada guia guarda o modelo que gerou o rascunho e a assinatura dos arquivos públicos usados como evidência. O navegador recebe apenas os textos publicados.

| Nível | Quando usar | Resultado |
| --- | --- | --- |
| 1 · Verificar | Em PR que altera instrumento, diagnóstico ou guia | Confere os campos e a assinatura da fonte. O CI do site também compila e exercita a interface. |
| 2 · Produzir com FreeLLM | Quando mudam as perguntas, controles ou indicadores | Gera rascunhos por projeto em um arquivo de revisão. O roteador pode selecionar o modelo ou receber um identificador explícito. |
| 3 · Corrigir com Astra | Quando a validação falha, o modelo inventa um controle ou a mudança exige código | Prepara um pacote com arquivos, assinaturas e testes de reprodução para a sessão Codex/Astra. |

## Comandos no checkout

```sh
python tools/engineering_update.py --level 1
python tools/codespace_engineering_update.py NOME_DO_CODESPACE --project dyno --model nemotron-3-ultra-550b
python tools/engineering_update.py --level 3 --project dyno
```

Use `gh codespace list` para selecionar o Codespace privado que contém o FreeLLMAPI configurado. O segundo comando usa seu login do GitHub CLI, envia apenas os arquivos públicos de engenharia e mantém a chave do roteador dentro do Codespace. A opção `--project all` processa os cinco guias. O Codespace tem seu próprio ciclo de cobrança e suspensão.

Com um gateway HTTPS já disponível, defina `FREELLM_BASE_URL` (terminando em `/v1`), `FREELLM_API_KEY` e opcionalmente `FREELLM_MODEL`. Execute `python tools/engineering_update.py --level 2`. O workflow **Engineering update levels** aceita as mesmas configurações por variável e segredo de Actions para essa modalidade.

Revise `build/engineering/lab-guides.json` contra os controles reais. Copie o resultado revisado para `src/data/lab-guides.json` e abra um PR. O nível 3 produz `build/engineering/astra-review.md` para revisão assistida. A seleção de Astra ocorre na sessão do operador.

## Publicação

O workflow **Publish Vértice Pages** monta o legado com Jekyll, acrescenta a saída Astro e conserva a home PT. A publicação usa o ambiente `github-pages`. Para refazer a publicação do estado atual, execute o workflow em `main`. Para reverter uma mudança, reverta seu commit em PR e confira o novo deploy.
