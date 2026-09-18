# Importador gradual de livros e artigos

O importador envia documentos **sequencialmente pela API do Maia RAG**. Ele pode
rodar no checkout do projeto, enquanto o RAG instalado com systemd recebe os
arquivos. Não precisa acessar o SQLite nem os diretórios privados do serviço.
Não é necessário parar o chat; os modelos locais são compartilhados, portanto
é preferível importar quando houver pouca utilização.

Esta primeira versão aceita manifestos JSONL com arquivos locais, URLs diretas
ou artigos como texto. O adaptador para o dataset específico do Hugging Face
será definido quando soubermos o repositório, a revisão e os campos do dataset.
Não baixa a Wikipédia automaticamente e não interpreta Parquet/EPUB/HTML.

## Começar sem importar nada

Na raiz do checkout:

```bash
npm run import -- enqueue docs/examples/import.jsonl --dry-run
```

O modo de simulação valida o manifesto e a existência de arquivos locais, mas
não acessa a rede, não verifica o conteúdo de URLs e não cria uma fila.

## Manifesto

Um objeto JSON por linha. Escolha exatamente um campo de conteúdo:

```json
{"path":"./livros/manual.pdf","filename":"manual-python.pdf","title":"Manual de Python","language":"pt","license":"licença da edição","sourceUrl":"https://example.org/manual","version":"2026"}
{"text":"# Artigo\n\nConteúdo do artigo...","filename":"artigo.md","title":"Artigo","language":"es","sourceUrl":"https://example.org/artigo","license":"licença da fonte"}
{"url":"https://example.org/livro.pdf","filename":"livro.pdf","language":"en","license":"licença da edição"}
```

As URLs acima são ilustrativas. Use fontes que você selecionou e cuja licença
permita o uso pretendido. URLs precisam apontar diretamente ao documento,
sem login ou redirecionamentos. Para PDF por URL, informe `filename` com `.pdf`.
Arquivos locais podem ser PDF, Markdown ou texto; caminhos relativos são
resolvidos a partir do diretório do manifesto. PDFs digitalizados exigem OCR
externo antes da importação.

Campos opcionais: `title`, `author`, `language` (`pt`, `en`, `es`), `license`,
`sourceUrl`, `version`, `collectionId` (ID de uma coleção existente).
Todos ficam registrados na fila. Para artigos no campo `text`, os metadados
são incluídos no documento enviado. Para PDFs/arquivos/URLs, nesta versão os
metadados adicionais ficam **apenas no registro do importador**; não são
propagados como campos de citação ao RAG. Use nomes de arquivo descritivos.

## Importar em pequenas etapas

```bash
# Validar até 20 entradas; não enviar documentos.
npm run import -- enqueue ./meu-manifesto.jsonl --dry-run --limit 20

# Persistir as mesmas 20 entradas na fila.
npm run import -- enqueue ./meu-manifesto.jsonl --limit 20

# Enviar no máximo 5 documentos, um por vez.
npm run import -- run --limit 5

# Consultar contagens e erros.
npm run import -- status

# Continuar com os próximos 5.
npm run import -- run --limit 5
```

O limite padrão do enqueue é 100 registros; o run processa até 10 por execução.
Para ampliar uma amostra, execute enqueue com um limite maior sobre o mesmo
manifesto. Entradas idênticas já presentes não são reenfileiradas. Mudar nome,
metadados ou conteúdo cria outra entrada; a API ainda verifica duplicação pelo
hash do conteúdo. Uma URL/path idêntica **não detecta mudanças no arquivo**:
altere `version` para enfileirar uma nova edição. Documentos antigos no RAG
não são apagados nem substituídos automaticamente.

A classificação por IA é desativada para reduzir o custo por documento; a
extração, divisão em trechos e geração de embeddings continuam no RAG.

## Retomada e falhas

A fila fica em `./data/imports.sqlite`, relativa ao diretório de execução.
Use sempre o mesmo caminho absoluto com `--state /caminho/imports.sqlite` se
mudar de diretório. Enqueue, run e status aceitam essa opção. Ela não é o
banco de documentos do Maia RAG. Preserve o arquivo para manter o progresso.

Um worker adquire uma licença temporária exclusiva nessa fila. Outro worker
na mesma fila é recusado; após interrupção abrupta, aguarde até 60 segundos
para a licença expirar. Documentos que estavam em processamento retornam a
pending quando outro worker assume. Se o servidor já concluiu a ingestão,
o envio repetido será reconhecido como duplicado pronto.

Ctrl+C/SIGTERM pede parada após o documento atual. O timeout padrão é 10
minutos por documento, incluindo download e upload; o tamanho máximo é 50 MiB.
Pode ajustar `--timeout-ms` e `--max-bytes`. A API também aplica seu próprio
limite de upload. Um timeout no cliente não cancela necessariamente o trabalho
no servidor, por isso o worker para na primeira falha em vez de acumular tarefas.

Depois de verificar/resolver o erro:

```bash
npm run import -- run --retry-failed --limit 1
```

A opção reenfileira os registros failed; cada um recebe uma tentativa nessa
passagem. Não há loop automático de retries. Duplicados com status failed ou
processing no RAG não contam como sucesso: aguarde a conclusão ou resolva o
registro no RAG antes de tentar novamente. Registros failed podem precisar ser
removidos pela interface antes de um novo envio, devido à deduplicação atual.

## Limites desta versão

- Não controla o watcher da inbox nem outros clientes da API. Não alimente a
  inbox em paralelo se quiser limitar o total a uma ingestão por vez.
- Use apenas um arquivo de fila para o mesmo servidor. Filas diferentes não
  compartilham o bloqueio.
- PDFs são carregados em memória, limitados ao tamanho configurado.
- Download direto aceita HTTP(S) e rejeita redirecionamentos. O importador é
  uma ferramenta local para manifestos confiáveis, não um endpoint público.
- Não promete exatamente uma execução: retomadas podem reenviar um documento.
- Nenhum serviço de importação é instalado ou iniciado automaticamente.
