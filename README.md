# Espeto & Breja — Cardápios Digitais Multiestabelecimento

Plataforma criada do zero para que vários estabelecimentos tenham, cada um, sua conta, seu painel e seu cardápio público em `/cardapio/<slug>`.

**Identidade visual fixa:** preto, laranja, vermelho e branco. Cada dono personaliza apenas logo, nome, mensagem de boas-vindas, descrição, WhatsApp e endereço.

**Stack:** HTML5 + CSS3 + JavaScript puro · Supabase (PostgreSQL, Auth, RLS, Storage) · Node.js sem dependências (servidor estático) · Render · GitHub.

---

## 1. Arquitetura

```
Navegador ──HTTPS──► Render (server.js)          → entrega HTML/CSS/JS e /config.js
    │
    └──HTTPS──────► Supabase
                     ├─ Auth      → cadastro, login, recuperação de senha (JWT)
                     ├─ Postgres  → tabelas protegidas por RLS
                     │    └─ cardapio_publico(slug) → única porta de leitura anônima
                     └─ Storage   → bucket "imagens/<estabelecimento_id>/…"
```

- **A segurança fica no banco.** O navegador fala direto com o Supabase usando apenas a chave *anon/publishable*. Cada requisição leva o JWT do usuário e as políticas RLS decidem o que ele pode ver ou alterar. Mesmo que alguém modifique o JavaScript ou envie IDs de outro estabelecimento, o banco recusa.
- **Visitantes anônimos não acessam as tabelas.** O cardápio público usa a função `cardapio_publico(slug)`, que devolve só os campos necessários (sem `owner_id`, datas ou IDs internos) e apenas de estabelecimentos publicados.
- **O servidor Node** só entrega arquivos e injeta a configuração pública. Ele **se recusa a iniciar** se receber uma chave `service_role`/`sb_secret_`. Também envia cabeçalhos de segurança (CSP, nosniff, etc.).
- **Persistência:** tudo fica no Supabase; o Render não guarda dados, então reinícios e novos deploys não perdem nada.

## 2. Arquivos

```
espeto-e-breja/
├── server.js                 Servidor HTTP (rotas, /config.js, cabeçalhos de segurança)
├── package.json              Scripts start/dev (Node ≥ 20, sem dependências)
├── render.yaml               Blueprint do Render
├── .env.example              Modelo de variáveis de ambiente
├── supabase/
│   ├── schema.sql            Tabelas, índices, restrições, gatilhos, RLS, função pública, Storage
│   └── testes-seguranca.sql  Testes automáticos de isolamento (terminam em ROLLBACK)
└── public/
    ├── index.html            Página inicial da plataforma
    ├── login.html            Login
    ├── cadastro.html         Criação de conta
    ├── recuperar-senha.html  Pedido de link de recuperação
    ├── nova-senha.html       Definição da nova senha (link do e-mail)
    ├── painel.html           Painel administrativo
    ├── cardapio.html         Cardápio público
    ├── 404.html, favicon.svg
    ├── css/style.css         Identidade visual + layout responsivo
    └── js/
        ├── app.js            Cliente Supabase e utilitários (escape de HTML, upload, erros)
        ├── auth.js           Lógica das telas de autenticação
        ├── index.js          Página inicial
        ├── painel.js         Painel: estabelecimento, categorias, produtos, QR Code
        └── cardapio.js       Renderização do cardápio público
```

## 3. Banco de dados

| Tabela | Destaques |
|---|---|
| `profiles` | `id` = `auth.users.id`; criado automaticamente no cadastro (gatilho) |
| `estabelecimentos` | `owner_id` preenchido com `auth.uid()`; `slug` único e validado; cores em `#RRGGBB`; `ativo` = publicado |
| `categorias` | ligada ao estabelecimento; `ordem` e `ativo` |
| `produtos` | `preco numeric(10,2) ≥ 0`; FK composta garante que a categoria é **do mesmo** estabelecimento; ao excluir a categoria o produto fica “sem categoria” |

Exclusões em cascata: apagar um estabelecimento apaga suas categorias e produtos.

## 4. Configuração do Supabase (passo a passo)

1. Crie um projeto em <https://supabase.com> (região São Paulo, `sa-east-1`, é a mais próxima).
2. **SQL Editor → New query** → cole todo o `supabase/schema.sql` → **Run**. O script pode ser executado novamente sem perder dados.
3. **Valide a segurança:** nova query com `supabase/testes-seguranca.sql` → **Run**. Deve aparecer `✅ TODOS OS TESTES PASSARAM`. Nada é gravado (o script termina em `ROLLBACK`).
4. **Authentication → URL Configuration** (obrigatório — sem isso o link do e-mail leva para `localhost` e “não segue em diante”)
   - *Site URL:* `https://SEU-APP.onrender.com`
   - *Redirect URLs:* `https://SEU-APP.onrender.com/**` e `http://localhost:3000/**`
5. **Authentication → Sign In / Providers → Email → Confirm email**
   - **Para começar, deixe DESLIGADO.** O cadastro já entra direto no painel.
   - O envio de e-mail padrão do Supabase só entrega para membros da sua equipe no Supabase e tem limite de poucos e-mails por hora. Para clientes reais, ligue *Confirm email* só depois de configurar um SMTP próprio no passo 6.
6. **Authentication → Emails → SMTP Settings:** configure um SMTP próprio (Resend, Brevo, Gmail SMTP etc.) antes de ligar a confirmação de e-mail.
7. Opcional: traduza os modelos de e-mail em **Authentication → Emails → Templates**.
8. **Project Settings → API:** copie a *Project URL* e a chave **anon / publishable**.
   ⚠️ **Nunca** copie a `service_role` / *secret* para o projeto.

O bucket `imagens` é criado pelo `schema.sql`: público para leitura (as fotos aparecem no cardápio), limite de 2 MB, apenas JPG/PNG/WebP, e escrita permitida só na pasta do próprio estabelecimento.

## 5. Rodar localmente

```bash
cp .env.example .env      # preencha SUPABASE_URL e SUPABASE_ANON_KEY
npm run dev               # http://localhost:3000
```

## 6. GitHub e Render

```bash
git init && git add . && git commit -m "Espeto & Breja: versão inicial"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/espeto-e-breja.git
git push -u origin main
```

No Render: **New → Blueprint** → selecione o repositório (o `render.yaml` cria o serviço) → preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` → **Apply**.
Alternativa manual: **New → Web Service**, runtime Node, build `npm install`, start `npm start`, health check `/health`.

Depois do primeiro deploy, volte ao passo 4 da seção do Supabase e confira se a *Site URL* usa o endereço final do Render (ou seu domínio próprio).

> Plano gratuito do Render: o serviço “dorme” após um período sem acesso e leva alguns segundos para acordar. Os dados não são afetados, pois ficam no Supabase.

## 7. Roteiro de validação por etapa

| Etapa | Como validar |
|---|---|
| 1. Banco | `testes-seguranca.sql` retorna “TODOS OS TESTES PASSARAM” |
| 2. Servidor | `/health` responde `{"ok":true}`; `/config.js` mostra a URL e a chave **anon** |
| 3. Cadastro | Criar conta → e-mail de confirmação → link leva ao painel |
| 4. Login/logout | Entrar, sair; abrir `/painel` deslogado redireciona para `/login` |
| 5. Recuperação | “Esqueci minha senha” → e-mail → `/nova-senha` → entrar com a nova senha |
| 6. Estabelecimento | Criar “Espeto & Breja”, enviar logo, escrever a mensagem, salvar e recarregar a página |
| 7. Categorias | Criar, renomear, ocultar, reordenar e excluir |
| 8. Produtos | Criar com foto e preço, editar, pausar, destacar, reordenar, excluir |
| 9. Cardápio | Despublicado: link mostra “não encontrado” (o dono vê a prévia). Publicado: abre sem login; produto pausado aparece como “Indisponível” |
| 10. Isolamento | Criar uma 2ª conta (“Espeto do Sérgio”): ela não vê nada do primeiro estabelecimento |
| 11. QR Code | Baixar o PNG e escanear com o celular |
| 12. Persistência | Fazer um novo deploy no Render e confirmar que tudo continua lá |

## 8. Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| Cria a conta e fica parado em “Enviamos um link…” | *Confirm email* ligado e o e-mail não chega. Desligue *Confirm email* (passo 5) ou configure SMTP (passo 6). |
| Ao entrar aparece “Confirme seu e-mail” | Mesma causa acima. Use “Reenviar link”, ou confirme manualmente em **Authentication → Users → … → Confirm email**. |
| O link do e-mail abre `localhost` ou dá erro | *Site URL* e *Redirect URLs* não apontam para o Render (passo 4). |
| “As tabelas não existem no Supabase” / “Erro no banco ao criar o usuário” | Rode o `supabase/schema.sql` inteiro no SQL Editor. |
| A tela mostra “O arquivo /config.js não foi carregado” | O site foi publicado como *Static Site* ou aberto direto do computador. Publique como **Web Service** (Node) com as variáveis de ambiente. |
| “Chave do Supabase inválida” | `SUPABASE_ANON_KEY` errada no Render. Use a chave **anon/publishable** do mesmo projeto da `SUPABASE_URL`. |

Qualquer outro erro agora aparece em vermelho na tela. Envie o texto exato para facilitar o diagnóstico.

## 9. Segurança — resumo

- RLS ligado em todas as tabelas; cada operação verifica `auth.uid()` no banco.
- `anon` sem nenhum privilégio nas tabelas; leitura pública só via `cardapio_publico()`.
- `owner_id` não pode ser forjado nem transferido (políticas `WITH CHECK`).
- Produto não pode apontar para categoria de outro estabelecimento (FK composta).
- Storage: escrita restrita à pasta `<estabelecimento_id>/` do dono; tipos e tamanho limitados.
- Todo texto vindo do banco é escapado antes de ir para o HTML; URLs de imagem aceitam só `http(s)`.
- CSP restritiva; o servidor bloqueia chaves secretas e travessia de diretórios.
