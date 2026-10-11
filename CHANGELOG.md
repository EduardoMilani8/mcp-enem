# Histórico de versões

As mudanças que importam para quem usa o mcp-enem, da mais recente para a mais
antiga.

## 0.1.1 (11/10/2026)

Nenhuma mudança no funcionamento do servidor.

- README reescrito para quem nunca usou um servidor MCP: instalação em três
  passos, exemplos do que pedir, perguntas frequentes e solução de problemas.
- A instalação recomendada passa a usar `mcp-enem@latest`, que busca a versão
  mais recente sempre que o Claude inicia.

## 0.1.0 (11/10/2026)

Primeira versão pública.

### Ferramentas

- `listar_provas`: anos (2009 a 2023), áreas e idiomas disponíveis.
- `buscar_questoes`: sorteia questões por ano, área e palavras-chave, sem o
  gabarito. Sem ano, completa a quantidade pedida com mais de uma prova.
- `obter_questao`: uma questão específica, pelo ano e número.
- `corrigir_resposta`: confere com o gabarito oficial e grava a tentativa, com
  a matéria e o assunto.
- `ver_gabarito`: mostra a resposta certa sem gravar nada.
- `desfazer_ultima_tentativa`: remove o último registro do histórico.
- `ver_desempenho`: acertos e erros no geral, nos últimos 7 dias, por área,
  por matéria e por assunto.
- `revisar_erros`: questões erradas que ainda não foram acertadas.

### Roteiros

- `simulado_rapido`, `revisao_dos_erros`, `estudar_assunto` e `como_estou`.

### Funcionamento

- Cada prova é baixada uma vez e guardada na máquina; depois disso funciona
  sem internet.
- O histórico de respostas fica só na máquina de quem usa.
- As imagens das questões são anexadas à resposta, com limite de quantidade,
  de tamanho e de tempo de espera.
- O servidor se identifica nas requisições à enem.dev com o nome, a versão e o
  endereço do projeto.
