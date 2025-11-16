# Frontend de teste — public/send.html

Arquivo simples para testar a rota `/baileys/send-message` do backend.

Como usar:

1. Inicie o servidor (por exemplo: `node src/server/app.js` ou `npm start` se configurado). Por padrão o servidor roda em `http://localhost:3000`.
2. Abra `public/send.html` no navegador. Você pode:
   - Abrir o arquivo diretamente (file://) — mas note que alguns navegadores bloqueiam fetch de file:// para http(s) por CORS.
   - Ou servir a pasta `public` com um servidor estático (recomendado). Exemplo rápido com Python:

```bash
# na pasta do projeto
python3 -m http.server 8080 --directory public
# depois abra http://localhost:8080/send.html
```

3. Preencha o número (ex: `5534999999999`) e a mensagem. Clique em Enviar.

Notas:
- A implementação do frontend usa uma requisição GET com query params para `/baileys/send-message` porque a rota no backend do projeto parece esperar query strings.
- Se o backend não permitir requisições cross-origin (CORS), você pode:
  - Servir o `send.html` do mesmo host/porta do backend (adicione um middleware estático no Express), ou
  - Habilitar CORS no backend (instalar `cors` e usar `app.use(cors())`).

Se quiser que eu integre essa página ao Express para servir automaticamente, posso editar `src/server/app.js` e adicionar rotas estáticas e/ou um endpoint POST mais moderno."
