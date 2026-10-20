# Conecta — blog social com autenticação

Projeto de demonstração front-end em HTML/CSS/JavaScript com Supabase Auth, PostgreSQL, Row Level Security (RLS), Storage e Realtime.

## Funcionalidades
- Cadastro e login por e-mail e senha.
- Confirmação de e-mail e recuperação de senha (configuráveis no Supabase).
- Feed de publicações com texto e imagem.
- Comentários por publicação.
- Sala comunitária de mensagens em tempo real.
- Exclusão de próprias publicações.
- Layout responsivo para celular e desktop.

## Configuração
1. Crie um projeto em https://supabase.com/.
2. Abra **SQL Editor** e execute o arquivo `schema.sql`.
3. Em **Project Settings → API**, copie a Project URL e a chave publicável/anon (nunca a `service_role`).
4. Em `app.js`, substitua `COLE_AQUI_A_URL_DO_PROJETO` e `COLE_AQUI_A_CHAVE_ANON_PUBLICA`.
5. Em **Authentication → URL Configuration**, configure a URL do site e as Redirect URLs usadas para confirmação e recuperação.
6. Em **Authentication → Providers → Email**, mantenha Email habilitado e configure confirmação obrigatória de e-mail conforme sua política.
7. Sirva os arquivos por um servidor local ou hospede em HTTPS. Não abra `index.html` por `file://` para testar fluxos de autenticação.

## Prevenção de e-mails duplicados
O cadastro é feito pelo Supabase Auth, que mantém identidade única por e-mail conforme a configuração de autenticação. A validação do navegador não é a barreira de segurança; a autoridade é o servidor. Não crie uma tabela paralela de senhas nem armazene senhas em texto puro. Respostas de cadastro podem ser genéricas para reduzir enumeração de contas.

## Segurança antes de produção
- A chave pública/anon pode estar no navegador; a `service_role` nunca.
- RLS está habilitado e cada escrita verifica `auth.uid()`.
- Configure rate limits, SMTP confiável, confirmação de e-mail, política de senha e proteção contra abuso no Supabase.
- Adicione CAPTCHA/Turnstile no cadastro se houver risco de automação.
- O bucket deste exemplo é público para simplificar exibição das imagens. Se as imagens precisarem ser privadas, use bucket privado e URLs assinadas.
- A verificação de MIME no cliente é contornável. Em produção, revalide conteúdo real da imagem no servidor, remova metadados se necessário, e implemente limites por usuário.
- Configure CSP e outros cabeçalhos de segurança no provedor de hospedagem.
- Para chat privado entre duas pessoas, crie conversas com membros explícitos e políticas RLS que validem a participação; a sala incluída aqui é comunitária e visível a qualquer usuário autenticado.
- Implemente moderação, denúncia, bloqueio de usuários, retenção/exclusão de dados e termos de uso antes de abrir ao público.
- O esquema inicial deve ser revisado e testado em um projeto de staging antes de ser aplicado a um sistema existente.
