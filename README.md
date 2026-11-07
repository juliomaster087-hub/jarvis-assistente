# Jarvis Assistente

Site estático responsivo para apresentar o projeto Jarvis, com demonstração de conversa local e lista de tarefas.

## O que está incluído

- Página inicial responsiva em português.
- Navegação adaptada para celular.
- Seção de recursos e demonstração interativa.
- Respostas de exemplo no chat (não conectado a uma IA externa).
- Lista de tarefas com armazenamento local no navegador (`localStorage`).
- Ícone SVG e metadados básicos para compartilhamento.

## Como publicar no GitHub Pages

1. Abra **Settings** neste repositório.
2. Acesse **Pages**.
3. Em **Build and deployment**, selecione **Deploy from a branch**.
4. Escolha a branch **main** e a pasta **/(root)**.
5. Clique em **Save** e aguarde o GitHub concluir a publicação.

O endereço público será exibido na seção **Pages**. Para um repositório de usuário/projeto, normalmente o endereço tem o formato `https://juliomaster087-hub.github.io/jarvis-assistente/`.

## Como testar localmente

Abra o arquivo `index.html` em um navegador moderno. Não é necessário instalar dependências nem executar um servidor.

## Privacidade e limitações

A lista de tarefas é armazenada apenas no armazenamento local do navegador usado para acessar o site. A demonstração de conversa usa respostas predefinidas no próprio JavaScript: ela não envia mensagens a um servidor nem representa uma conexão real com um modelo de IA.

## Próximas evoluções possíveis

- Conectar um backend seguro a um provedor de IA (nunca colocar chaves secretas no HTML público).
- Adicionar autenticação e sincronização de tarefas entre dispositivos.
- Criar uma área administrativa e testes automatizados.
