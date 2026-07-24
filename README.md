# Torneio Mensal de Gakuran — placar em tempo real

Este pacote possui dois sites conectados ao mesmo placar:

- `index.html`: placar público, somente leitura, para os jogadores.
- `admin.html`: painel do organizador, protegido por login.

A hospedagem pode ser feita gratuitamente no **GitHub Pages**. Como o GitHub Pages hospeda apenas arquivos estáticos, a sincronização em tempo real e a proteção contra alterações são feitas pelo **Firebase Realtime Database + Firebase Authentication**.

## O que mudou

- A tabela principal sempre começa nas **oitavas de final** e segue para quartas, semifinais e decisões.
- Com 20 a 40 jogadores, o sistema cria uma ou duas etapas de **classificatórias** para chegar aos 16 classificados.
- As classificatórias aparecem em uma área ampla acima da tabela principal.
- Toda alteração feita no painel administrativo aparece automaticamente no placar público.
- O placar público não possui botões de edição.
- As regras do Firebase permitem escrita somente para o UID do administrador.

## 1. Criar o projeto no Firebase

1. Acesse `https://console.firebase.google.com/` e crie um projeto.
2. Na tela inicial do projeto, clique no ícone **Web (`</>`)** e registre um aplicativo.
3. O Firebase mostrará um objeto chamado `firebaseConfig`. Guarde esses dados.

Documentação oficial: `https://firebase.google.com/docs/web/setup`

## 2. Criar o Realtime Database

1. No menu do Firebase, abra **Build > Realtime Database**.
2. Clique em **Create Database**.
3. Escolha uma região e conclua a criação.
4. Não deixe o banco permanentemente em modo de teste; as regras seguras serão publicadas no passo 5.

Documentação oficial: `https://firebase.google.com/docs/database/web/start`

## 3. Criar a conta do administrador

1. Abra **Build > Authentication**.
2. Em **Sign-in method**, ative **Email/Password**.
3. Abra a aba **Users** e adicione sua conta de administrador.
4. Copie o **UID** dessa conta.

Não coloque sua senha em nenhum arquivo do GitHub. Ela será usada apenas na tela de login.

Documentação oficial: `https://firebase.google.com/docs/auth/web/password-auth`

## 4. Preencher `firebase-config.js`

Abra `firebase-config.js` e substitua todos os textos de exemplo pelos dados reais do seu aplicativo Firebase.

Também substitua:

```js
export const ADMIN_UID = "COLE_SEU_UID_AQUI";
```

pelo UID copiado no passo anterior.

O `firebaseConfig` pode ficar público. A segurança não depende de esconder esse objeto; depende das regras do banco e da autenticação.

## 5. Publicar as regras de segurança

1. Abra o arquivo `database.rules.json`.
2. Troque `COLE_SEU_UID_AQUI` pelo mesmo UID usado em `firebase-config.js`.
3. No Firebase, abra **Realtime Database > Rules**.
4. Cole o conteúdo de `database.rules.json` e clique em **Publish**.

As regras deixam o placar visível para todos, mas permitem alterações somente para a conta com o UID definido:

```json
{
  "rules": {
    "gakuran": {
      "current": {
        ".read": true,
        ".write": "auth != null && auth.uid === 'SEU_UID_REAL'"
      }
    }
  }
}
```

Documentação oficial: `https://firebase.google.com/docs/database/security`

## 6. Hospedar no GitHub Pages

1. Crie um repositório novo no GitHub.
2. Envie **todos os arquivos desta pasta para a raiz do repositório**.
3. No repositório, abra **Settings > Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**.
5. Selecione a branch `main` e a pasta `/ (root)`.
6. Salve e aguarde o GitHub publicar o endereço.

Os endereços serão semelhantes a:

- Placar público: `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`
- Administração: `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/admin.html`

Compartilhe apenas o primeiro endereço com os jogadores. Mesmo que alguém descubra `admin.html`, não conseguirá salvar alterações sem entrar na conta cujo UID foi autorizado nas regras.

## 7. Primeiro uso

1. Abra `admin.html` pelo endereço do GitHub Pages.
2. Entre com o e-mail e a senha cadastrados no Firebase Authentication.
3. Cadastre de 20 a 40 jogadores.
4. Clique em **Sortear e gerar tabela**.
5. Abra `index.html` em outro aparelho ou aba para confirmar a atualização em tempo real.

## Arquivos principais

- `index.html` — página pública.
- `viewer.js` — conexão e atualização da página pública.
- `admin.html` — painel administrativo.
- `admin.js` — cadastro, sorteio e resultados.
- `tournament-core.js` — regras da chave eliminatória.
- `tournament-ui.js` — desenho das classificatórias e da tabela.
- `firebase-client.js` — conexão com Firebase.
- `firebase-config.js` — dados do seu projeto e UID autorizado.
- `database.rules.json` — regras de segurança para copiar no Firebase.
- `styles.css` — aparência dos dois sites.

## Observações de segurança

- Nunca coloque a senha do administrador no código.
- Use uma senha forte na conta do Firebase.
- Mantenha o UID correto tanto em `firebase-config.js` quanto nas regras do banco.
- O bloqueio real de escrita acontece no servidor do Firebase; esconder botões no site público é apenas uma camada visual.
