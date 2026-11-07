# Jarvis Assistente

Site estático no GitHub Pages + API privada em Cloudflare Workers + Google Gemini API.

## Arquitetura

- **Frontend:** GitHub Pages (index.html).
- **Backend:** Cloudflare Worker em worker/index.js.
- **IA:** Google Gemini API (modelo gemini-2.5-flash-lite).
- **Segredos:** a chave GEMINI_API_KEY fica no Cloudflare como Secret. Nunca coloque essa chave no HTML, JavaScript público ou GitHub.

## 1. Criar uma chave Gemini

1. Acesse https://aistudio.google.com/app/apikey.
2. Entre com sua conta Google e crie uma API key.
3. Copie a chave e guarde-a em local seguro. Não a envie no chat, não a publique no GitHub e não a coloque no site.
4. A disponibilidade gratuita, os modelos e os limites dependem da região e da conta. Consulte https://ai.google.dev/gemini-api/docs/pricing e https://aistudio.google.com/docs/rate-limits.

## 2. Publicar o backend no Cloudflare Workers

1. Crie/entre em uma conta em https://dash.cloudflare.com/.
2. Abra **Workers & Pages** e escolha **Create application → Create Worker**.
3. Dê o nome **jarvis-assistente-api** e crie o Worker.
4. Abra **Edit code** (Quick Edit). Substitua o código de exemplo pelo conteúdo completo de worker/index.js deste repositório e salve/deploy.
5. No Worker, abra **Settings → Variables and Secrets**.
6. Adicione **GEMINI_API_KEY** como tipo **Secret** e cole a chave do Google AI Studio.
7. Adicione **ALLOWED_ORIGIN** como variável de texto com exatamente:
   **https://juliomaster087-hub.github.io**
8. Clique em **Deploy** novamente para aplicar as configurações.

O endereço do Worker será parecido com https://jarvis-assistente-api.SUA-CONTA.workers.dev.

## 3. Conectar o site ao backend

1. Abra https://juliomaster087-hub.github.io/jarvis-assistente/.
2. Na caixa de conversa, clique em **Configurar conexão**.
3. Cole somente o endereço base do Worker, por exemplo https://jarvis-assistente-api.SUA-CONTA.workers.dev (não inclua /api/chat).
4. Envie uma mensagem. A primeira resposta real confirma a conexão.

O endereço do Worker é salvo apenas no armazenamento local desse navegador. Para usar em outro aparelho, repita a configuração nele.

## 4. Segurança e limites

- A chave Gemini só existe no backend como Secret; ela nunca é enviada ao navegador.
- O Worker aceita requisições apenas da origem do GitHub Pages configurada em ALLOWED_ORIGIN.
- O backend valida método, rota, tamanho do corpo, quantidade e tamanho das mensagens.
- **CORS não é autenticação e não impede chamadas diretas por scripts.** Antes de divulgar amplamente o serviço, configure uma regra de rate limiting no Cloudflare (por exemplo, limitar requisições por IP em /api/chat) e monitore o consumo/quota do Gemini. Não compartilhe publicamente o endereço do Worker como se fosse uma chave secreta.
- O nível gratuito do Gemini tem limites e condições; pode haver indisponibilidade ou cobrança se você mudar para um nível pago. Confira os painéis oficiais antes de usar em produção.
- O histórico e as memórias são persistidos no D1 por conta e podem ser recuperados em outro dispositivo após o login. As tarefas ainda ficam no armazenamento local do navegador.

## 5. Testar

- Health check: abra https://SEU-WORKER.workers.dev/health.
- Chat: envie uma mensagem pelo site.
- Erros 429: limite/quota do provedor; aguarde e confira o AI Studio.
- Erro de origem: confirme que ALLOWED_ORIGIN é exatamente https://juliomaster087-hub.github.io sem barra final.
- Erro de chave: confirme que GEMINI_API_KEY foi cadastrada como Secret e que o Worker foi publicado novamente.

## GitHub Pages

O frontend continua publicado pela branch main, pasta /(root). O backend não roda no GitHub Pages; ele é hospedado separadamente no Cloudflare Workers.


## Contas individuais (MVP multiusuário)

A versão atual adiciona cadastro e login por e-mail/senha, sessões revogáveis e dados de perfil isolados por usuário.

- **Banco:** Cloudflare D1 `jarvis-users`.
- **Autenticação:** senhas derivadas com PBKDF2-HMAC-SHA256 (310.000 iterações); tokens de sessão aleatórios de 256 bits. O banco armazena apenas SHA-256 do token, nunca o token bruto.
- **Sessões:** validade de 12 horas; o token fica em `sessionStorage` no navegador e é enviado no cabeçalho Authorization. Fechar a aba encerra o armazenamento local do token.
- **Abuso:** limite básico por IP/identidade em cadastro e login e limite por usuário/IP no chat, usando janelas de 15 minutos.
- **Privacidade:** cada chamada privada exige sessão válida. O histórico do chat e as memórias ficam no D1 e são filtrados pelo ID autenticado do usuário; contas diferentes não compartilham esses dados. As tarefas continuam locais neste MVP.
- **CORS:** somente a origem exata do GitHub Pages é permitida. CORS não substitui autenticação; todas as rotas privadas validam o token no Worker.
- **Memória no chat:** o painel do site permite salvar e excluir até 30 lembranças no navegador. A frase “Jarvis, lembre que ...” também adiciona uma lembrança. As lembranças são enviadas como contexto ao Gemini junto das últimas mensagens; no modo de teste sem login, ficam somente naquele navegador/dispositivo. Não salve senhas, dados financeiros ou informações sensíveis.
- **Histórico:** até 100 mensagens recentes são recuperadas ao entrar na conta, inclusive em outro dispositivo.
- **E-mail:** ainda não há verificação de endereço nem recuperação de senha.
- **Produção pública:** antes de divulgar amplamente, recomenda-se domínio próprio para API/site, verificação de e-mail, recuperação de senha, monitoramento/alertas de abuso e política de privacidade/termos. O token em sessionStorage é vulnerável a roubo em caso de XSS; manter o frontend livre de scripts não confiáveis e planejar autenticação por cookie HttpOnly em uma arquitetura same-site.

### Smoke test

Com Node.js 20+, execute:

```bash
JARVIS_API_URL=https://jarvis-assistente-api.likasousa2024.workers.dev node worker/test-api.mjs
```

O teste cria um usuário sintético com e-mail `jarvis-smoke-...`; remova esse registro de teste do D1 após a execução, se desejar.

O schema versionado está em `worker/migrations/0001_auth.sql` e `worker/migrations/0002_memory.sql`. A migração 0002 foi aplicada à instância D1 de produção `jarvis-users`. O Worker `jarvis-assistente-api` foi atualizado para persistir histórico e memórias, preservando os bindings `DB`, `ALLOWED_ORIGIN` e o Secret `GEMINI_API_KEY`.
