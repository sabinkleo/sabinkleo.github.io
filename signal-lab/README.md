# Vértice Signal Lab — Observatório operacional

V1: `/signal-lab/` (GitHub Pages estático; sem banco, API, credenciais ou serviços pagos).

## Propósito

Converter capturas de anúncios, lançamentos de código aberto e programas de parceria em **hipóteses verificáveis**, avaliadas por retorno econômico por hora e exposição de capital. Não é uma central de cópia de anúncios: textos, marcas, screenshots e dados de terceiros não são republicados; registra-se somente o mecanismo, o contexto, a fonte e os próximos passos.

**Entrada → processo → saída**

1. Entrada: screenshot enviado, fonte primária oficial ou hipótese de mercado. Registrar data, fornecedor e alegação; origem publicitária não equivale a verificação.
2. Processo: confirmar fonte, separar fato de hipótese, classificar mecanismo, pontuar fatores 1–5 e definir teste falsificável.
3. Saída: uma entrada auditável em `signals.json`, shortlist local exportável, proposta de experimento, resultado observado ao fim da validação e decisão agir/validar/observar/arquivar.

## Como atualizar sem quebrar o site

- Adicionar/editar objeto em `signal-lab/signals.json` com ID único e URL HTTPS verificável; atualizar `updated_at`.
- Os campos `potential`, `speed`, `cash`, `repeat`, `proof` são **julgamentos editoriais** de 1 a 5, não medidas de mercado. O `score` é derivado por `20*(.30*potential+.25*speed+.20*cash+.15*repeat+.10*proof)`, arredondado para inteiro.
- Usar `evidence` = `oficial` somente quando a fonte primária confirme a **existência do recurso**, não a promessa de resultado; `interno` para ativo Vértice, `parcial` para checagem parcial, `anuncio` para alegações de anúncios.
- `phase` = `agir`, `testar`, `validar`, `observar`, `descartar`.
- O campo `claim` pode descrever o anúncio sem endossá-lo. `test` deve conter um teste pequeno; `risks` deve revelar custos, restrições e pendências.
- Rodar `python signal-lab/validate.py` da raiz. Caso tenha Node: `node --check signal-lab/app.js`.
- Enviar PR; fluxo CI `.github/workflows/signal-lab.yml` executa essas verificações em modificações do módulo.

## Atualizações contínuas — honestidade operacional

Um GitHub Pages estático **não monitora anúncios automaticamente** e não recebe imagens diretamente do ChatGPT.
O formulário **Criar pista no GitHub** prepara um rascunho de issue; o visitante precisa confirmar o envio no GitHub. Dados da shortlist ficam em `localStorage` do navegador e podem ser exportados como JSON. A exportação não transmite esses dados à Vértice.
Cada novo lote de screenshots pode se tornar um PR revisado. Pode-se adicionar depois uma integração com um feed oficial (sem scraping hostil) e CI programada, caso haja utilidade mensurável.

## V1: experimentos sugeridos

- **Fiscal**: wrapper B2B e regressão usando o código MIT da Receita (sem reproduzir toda a implementação); exigir validação fiscal antes de uso real.
- **Kiro**: oportunidade de reduzir custo de desenvolvimento com parceiro AWS, apenas se elegível; prazo da CodeBit 30/11/2026.
- **Distribuição**: validar custos e termos de revenda HelenaCRM/Saipos antes de comprar licenças.
- **Campanhas**: demonstrar importação de leads **sintéticos** e geração de textos com aprovação humana. Não disparar mensagens automaticamente nem importar listas sem consentimento.
- **Revenue OS**: instrumentar conversões reais após o PR de mensuração; um clique no WhatsApp não prova contato realizado.

## Escopo de segurança e privacidade

Sem trackers nesta rota V1; todas as interações são locais, exceto navegação voluntária a fontes/ao GitHub.
Não usar `innerHTML` com dados não escapados. Links externos requerem HTTPS e `rel=noopener noreferrer`. Não adicionar screenshots dos anunciantes ao repositório público.
Nenhum registro de contato, PII ou lead é coletado pelo Signal Lab.

## Comandos (Windows 10 / PowerShell)

```powershell
git clone https://github.com/sabinkleo/sabinkleo.github.io.git
cd sabinkleo.github.io
python signal-lab/validate.py
python -m http.server 8000
```

Abrir `http://localhost:8000/signal-lab/`. Abrir em `file://` não funciona porque o manifesto JSON é carregado por `fetch`.

Critérios de aceite:
- 17 sinais iniciais com fontes HTTPS, score reproduzível e nenhum ID duplicado; novos registros exigem validação.
- Busca, filtros, detalhes, shortlist e exportação funcionando.
- Simulador atualizando sem divisão por zero.
- Formulário criando um rascunho de issue, sem envio automático.
- Mobile responsivo e página inicial do domínio com link para o módulo.
- `/privacy/` não alterado.
