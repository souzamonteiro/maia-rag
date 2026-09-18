# Curadoria remota em rag.maiaplatform.org

Acesso público: HTTPS + senha individual no Nginx da VPS. A aplicação RAG e o
Maia Chat continuam com a configuração local existente. Todos os curadores
possuem as mesmas permissões; não há autorização por coleção nem logout próprio
na interface. Não reutilize senhas de outros serviços.

```text
Navegador → HTTPS/Basic Auth na VPS → WireGuard → Nginx privado :4311 → RAG 127.0.0.1:4310
Maia Chat/importador local → RAG 127.0.0.1:4310
```

O acesso privado confia na VPS e nos processos locais. Não publique as portas
4310/4311 na internet. Não adicione locais Nginx com `auth_basic off` na vhost
HTTPS: isso abriria caminhos sem autenticação. A senha é verificada na VPS e
removida do cabeçalho antes de encaminhar ao RAG. A aplicação não é modificada.

## 1. Gerar os arquivos no checkout

Substitua os IPs pelos endereços reais da sua VPN (os valores abaixo são exemplos).

```bash
python3 scripts/render-rag-nginx.py \
  --rag-ip 10.77.0.2 --vps-ip 10.77.0.1 \
  --output /tmp/maia-rag-nginx
```

Arquivos gerados: `rag-client.conf` para a máquina RAG e `rag-vps.conf` para a VPS.
O gerador apenas escreve arquivos; não publica o serviço nem modifica o DNS.
Faça backup de qualquer configuração existente antes de substituí-la.

## 2. Máquina do RAG

Instale Nginx se ainda não estiver disponível. Mantenha `MAIA_RAG_HOST=127.0.0.1`
na configuração do serviço. O endereço WireGuard precisa existir antes de
iniciar/recarregar Nginx.

```bash
sudo install -m 0644 /tmp/maia-rag-nginx/rag-client.conf /etc/nginx/sites-available/rag.maiaplatform.org
sudo ln -sfn /etc/nginx/sites-available/rag.maiaplatform.org /etc/nginx/sites-enabled/rag.maiaplatform.org
sudo nginx -t && sudo systemctl reload nginx
```

O listener vincula somente ao IP WireGuard e aceita somente o IP da VPS.
Se UFW estiver ativo, permita esse trajeto com seus IPs reais:

```bash
sudo ufw allow in on wg0 from 10.77.0.1 to 10.77.0.2 port 4311 proto tcp
```

Não habilite/reset o firewall sem revisar as regras de SSH e dos outros apps.
Não é necessário abrir 4310. Em hosts onde Nginx inicia antes da VPN, ajuste a
ordem de inicialização do serviço existente para depois de `wg-quick@wg0.service`.
Não reinicie indiscriminadamente o Nginx que atende os outros aplicativos.

## 3. VPS: DNS, senha e certificado

Crie o registro DNS A de `rag.maiaplatform.org` para o IP público da VPS.
Só publique AAAA se essa VPS também estiver preparada para IPv6.
Copie os arquivos gerados e `deploy/nginx/rag-acme.conf` para a VPS.

Em Ubuntu/Debian, as ferramentas são `nginx`, `apache2-utils` (htpasswd) e
`certbot`. Use o mesmo método de certificados já adotado no Maia Edge se houver.

Criar o arquivo de credenciais na VPS (grupo `www-data` no Ubuntu/Debian):

```bash
sudo test -e /etc/nginx/maia-rag.htpasswd || sudo install -o root -g www-data -m 0640 /dev/null /etc/nginx/maia-rag.htpasswd
sudo htpasswd /etc/nginx/maia-rag.htpasswd roberto
```

O primeiro comando preserva um arquivo existente. `htpasswd` solicita a senha
de forma interativa; não a
coloque na linha de comando. Para novos curadores ou troca de senha:

```bash
sudo htpasswd /etc/nginx/maia-rag.htpasswd outro-curador
```

Para revogar um usuário: `sudo htpasswd -D /etc/nginx/maia-rag.htpasswd usuario`.
Não use `htpasswd -c` para adicionar usuários: recriaria a lista.
Ajuste o grupo do arquivo caso o worker Nginx use outro usuário/grupo.

Se o certificado ainda não existir, instale primeiro a vhost temporária:

```bash
sudo mkdir -p /var/www/html
sudo install -m 0644 rag-acme.conf /etc/nginx/sites-available/rag.maiaplatform.org
sudo ln -sfn /etc/nginx/sites-available/rag.maiaplatform.org /etc/nginx/sites-enabled/rag.maiaplatform.org
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/html -d rag.maiaplatform.org
```

Essa vhost serve apenas o desafio ACME; o restante retorna 404. Configure o
reload do Nginx após renovação pelo mecanismo de deploy hooks já usado na VPS.
O certificado precisa existir antes de instalar a configuração HTTPS definitiva.

## 4. VPS: ativar acesso protegido

```bash
sudo install -m 0644 rag-vps.conf /etc/nginx/sites-available/rag.maiaplatform.org
sudo nginx -t && sudo systemctl reload nginx
```

Se a validação falhar, não recarregue: restaure o backup ou corrija o erro.
O domínio inteiro usa autenticação, incluindo API, originais e arquivos estáticos.
Apenas o desafio ACME em HTTP fica público. O proxy aceita uploads de até 101 MiB
para acomodar o limite de arquivo de 100 MiB e o multipart do RAG.

## 5. Verificar

Sem credenciais, ambos devem retornar **401**:

```bash
curl -I https://rag.maiaplatform.org/
curl -I https://rag.maiaplatform.org/api/documents
```

Com usuário (curl solicita a senha), a API deve responder normalmente:

```bash
curl --user roberto https://rag.maiaplatform.org/api/collections
```

No navegador, abra o domínio e autentique. Teste um upload pequeno, consulta,
e exclusão desse documento de teste. Confira que outra máquina na VPN não
consegue acessar o proxy :4311: apenas a VPS tem autorização.

Verifique que Maia Chat e importador locais continuam usando
`http://127.0.0.1:4310`. O importador atual não envia Basic Auth ao domínio
público; execute-o localmente ou use um túnel SSH autorizado para a porta local.

O proxy privado rejeita Origin de outros sites nas chamadas do navegador e a
VPS remove os cabeçalhos CORS permissivos recebidos da aplicação. Isso reduz o
risco de outro site usar credenciais Basic armazenadas pelo navegador. Esta
configuração não fornece MFA, permissões por coleção ou proteção contra scripts
maliciosos executados dentro da própria interface.
