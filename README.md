# 〚東京〛M A N J I — Torneio de Gakuran V3

Atualização do site público e do painel administrativo.

## Principais mudanças

- Mínimo reduzido para **4 participantes** e máximo mantido em **40**.
- Site público agora também recebe **candidaturas**.
- Ficha: nome e sobrenome, Roblox, idade, nacionalidade, altura e 1 ou 2 estilos.
- Cada grupo/luta possui um **mini placar**.
- O vencedor precisa marcar **2 pontos**: resultado 2×0 ou 2×1.
- Round 1 usa o Estilo 1; Round 2 usa o Estilo 2 ou repete o primeiro; no Round 3 o jogador escolhe um dos estilos cadastrados.
- Botão para desfazer o último round em caso de erro ou bug.
- Candidaturas aparecem no painel do administrador para aprovar ou recusar.
- O administrador pode abrir ou fechar as inscrições.
- Novo visual preto, dourado, vermelho e rosa, com correntes e a identidade **〚東京〛M A N J I**.

## Funcionamento das fases

- **4 jogadores:** começa nas semifinais.
- **5 a 8 jogadores:** começa nas quartas, com folgas quando necessário.
- **9 jogadores:** uma luta de acesso define os 8 das quartas.
- **10 a 16 jogadores:** começa nas oitavas, com folgas quando necessário.
- **17 a 32 jogadores:** todos lutam na Fase Eliminatória; vencedores e melhores derrotados pelo placar completam os 16 das oitavas.
- **34 a 40 jogadores:** todos lutam na Eliminatória 1; 32 avançam e disputam a Eliminatória Final; os 16 vencedores vão às oitavas.

### Por que acima de 16 precisa ser uma quantidade par?

Em luta 1 contra 1, uma quantidade ímpar sempre deixaria alguém sem adversário. Como a regra escolhida exige que **todos participem da fase eliminatória**, o painel bloqueia o sorteio quando houver número ímpar acima de 16. Nesse caso, deixe uma pessoa como reserva ou aprove mais uma candidatura.

### Repescagem pelo placar

Entre 17 e 31 jogadores, uma única rodada de lutas produz menos de 16 vencedores. Para chegar exatamente aos 16 das oitavas sem deixar ninguém sem lutar, o sistema completa as vagas com os melhores derrotados:

1. quem perdeu por 2×1 fica acima de quem perdeu por 2×0;
2. empates restantes usam a ordem sorteada como desempate.

## Atualizar o GitHub Pages

Este pacote foi feito para substituir os arquivos do repositório existente.

**Importante: não apague nem substitua o seu `firebase-config.js` atual.** Ele contém a conexão que já está funcionando. O pacote inclui apenas `firebase-config.example.js` como exemplo.

Envie/substitua no repositório:

- `index.html`
- `admin.html`
- `viewer.js`
- `admin.js`
- `tournament-core.js`
- `tournament-ui.js`
- `firebase-client.js`
- `styles.css`
- `database.rules.json`
- pasta `assets`
- `.nojekyll`

Depois do commit, o GitHub Pages atualizará automaticamente.

## Publicar as novas regras do Firebase

O formulário público precisa de novas regras para aceitar candidaturas sem permitir que visitantes mexam no placar.

1. Abra `database.rules.json`.
2. Troque todas as ocorrências de `COLE_SEU_UID_AQUI` pelo UID do seu administrador.
3. No Firebase Console, abra **Realtime Database > Rules**.
4. Cole o conteúdo e clique em **Publish**.

As regras fazem o seguinte:

- qualquer pessoa pode ler o placar;
- apenas o administrador pode alterar o torneio;
- visitantes podem somente criar uma candidatura quando as inscrições estiverem abertas;
- visitantes não podem ler, editar ou apagar candidaturas;
- apenas o administrador vê e remove as candidaturas.

## Links

- Site público: `https://nightbird7o.github.io/torneio-gakuran/`
- Administração: `https://nightbird7o.github.io/torneio-gakuran/admin.html`

## Segurança

O formulário público pode receber spam. Para um torneio pequeno, aprovar manualmente já evita que inscrições falsas entrem na tabela. Para proteção mais forte, pode-se adicionar Firebase App Check em uma atualização futura.
