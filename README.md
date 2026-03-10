# Monitor de Preços de Compras

Site simples para monitorar preços dos produtos que você precisa comprar.

## Funcionalidades

- Cadastro de produtos com observação
- Categoria do produto (eletrodoméstico, móvel, eletrônico, outros)
- Foto do produto no cadastro
- Registro de preços por data e loja
- Histórico por produto
- Resumo com melhor oportunidade
- Busca de produtos
- Persistência local no navegador (`localStorage`)

## Como usar localmente

1. Abra a pasta do projeto no VS Code.
2. Abra o arquivo `index.html` no navegador.

## Publicar gratuitamente (GitHub Pages)

1. Crie um repositório no GitHub.
2. Envie os arquivos (`index.html`, `styles.css`, `app.js`, `README.md`).
3. No GitHub, vá em **Settings > Pages**.
4. Em **Build and deployment**, selecione:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` e pasta `/ (root)`
5. Salve e aguarde o link ser gerado.

Seu site ficará em algo como:

`https://seu-usuario.github.io/nome-do-repositorio/`

## Outras opções grátis

- Netlify (arrastar e soltar a pasta)
- Vercel (importar repositório)
- Cloudflare Pages

## Observação

Os dados ficam salvos no navegador/dispositivo usado. Se limpar dados do navegador, os registros podem ser perdidos.
Imagens também são salvas no navegador, então prefira fotos leves para melhor desempenho no celular.

## Sincronizar entre celular e computador (banco grátis)

Use o Supabase (plano grátis) para guardar os dados na nuvem.

1. Crie um projeto em https://supabase.com.
2. No SQL Editor, rode:

```sql
create table if not exists public.shopping_lists (
  list_id text primary key,
  payload jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.shopping_lists enable row level security;

create policy "read_all" on public.shopping_lists
for select using (true);

create policy "insert_all" on public.shopping_lists
for insert with check (true);

create policy "update_all" on public.shopping_lists
for update using (true) with check (true);
```

3. Em **Project Settings > API**, copie:
   - Project URL
   - anon public key
4. No site publicado, abra a aba **Preços > Configurar nuvem (Supabase)** e preencha:
   - Supabase URL
   - Supabase Anon Key
   - ID da lista (use o mesmo no celular e computador)
5. Toque em **Salvar e conectar nuvem**.

Quando estiver ativo, o topo do site mostra status de sincronização na nuvem.
