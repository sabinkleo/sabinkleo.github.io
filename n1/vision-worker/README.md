# N1 Visão — Gemini Worker

Protege a chave de API. GitHub Pages não oferece armazenamento secreto para chaves de backend.

## Deploy (Windows PowerShell)

1. Instale Node.js e autentique sua conta Cloudflare:

   npx wrangler login

2. Entre nesta pasta e configure secrets interativamente, sem gravar chaves no Git:

   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put OPERATOR_TOKEN

   Use um token de operador longo e aleatório, guardado em um gerenciador de senhas.
   Exemplo de geração local: [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

3. Publique:

   npx wrangler deploy

4. No https://verticelabs.me/n1/visao/ preencha:
   - Endpoint: https://n1-vision-verifier.<sua-conta>.workers.dev/verify
   - Token de operador criado acima.

## Segurança / limitações
- Antes de usar webcam, habilite HTTPS no domínio e permita câmera no navegador.
- Não instale token de operador no front-end nem publique GEMINI_API_KEY.
- Este endpoint usa token compartilhado; é MVP para turma restrita, não autenticação multiusuário.
- Antes de abrir ao público: Cloudflare Access, rate limits, quotas por usuário e auditoria de acesso.
- Fotos são enviadas para o serviço Google quando solicitado. Evite rostos e dados pessoais.
- O modelo oferece análise visual heurística, NÃO comprovação de furto ou autoria.
- Consulte cotas e preço atuais de Gemini API antes de uso intensivo.
- A análise depende da disponibilidade do modelo gemini-2.5-flash em sua chave/API.
