# Juris Notes — Assistente de Mapeamento Estruturado para Elaboração de Acórdãos

## 1. Contexto do Domínio

Esta aplicação foi desenvolvida para revolucionar o trabalho de **assistentes judiciais de gabinete em tribunais de segunda instância** (ex.: TRT). O Juris Notes atua como a ponte ideal entre a leitura humana do Inteiro Teor e a redação da minuta com auxílio de Inteligência Artificial.

### O Desafio Atual: Por que a IA "Alucina" com Processos Judiciais?
Fazer o upload de um processo em PDF de 2.000 páginas diretamente para uma IA gera perda de contexto, respostas genéricas e invenção de fatos (alucinações). A maior dificuldade de usar Inteligência Artificial no Direito não é a tecnologia em si, mas **como a informação é entregue a ela**. A IA precisa do recorte exato dos fatos, focado exclusivamente no *Efeito Devolutivo* (os tópicos que efetivamente foram objeto de recurso).

### A Solução: O Fluxo de Trabalho Integrado (Humano na Curadoria, IA na Redação)
O Juris Notes age como um "Fichário Inteligente". Ele inverte a lógica: em vez de pedir para a máquina ler o processo e deduzir a tese, **o assessor humano faz a curadoria das provas e define a tese**. 

Com as recentes melhorias no sistema de exportação, o aplicativo agora constrói um "Mapa de Raciocínio" perfeito para leitura de máquinas. Quando o usuário agrupa um documento a uma ideia e dá a ela um título (uma Tese), o sistema formata um documento contendo:
1. A Tese Central delineada pelo assessor.
2. O trecho exato do documento (ou transcrição do áudio) que prova essa tese.
3. Eventuais provas agrupadas que corroboram ou contradizem o fato principal.

**O resultado prático:** Quando esse documento é colado em um modelo de IA externo, a máquina não precisa mais "adivinhar" o que aconteceu no processo. O assessor já fez o trabalho cognitivo complexo (interpretar a prova). A IA recebe um comando cristalino e foca apenas em usar sua fluidez linguística para **redigir** a fundamentação jurídica de forma estruturada, blindada contra alucinações.

---

## 2. Arquitetura da Aplicação

Aplicação **Client-Side Only (sem backend)**. Toda a lógica de leitura, extração e salvamento roda inteiramente no navegador do usuário, garantindo **Sigilo Judicial Absoluto** (os dados do processo nunca vão para um servidor na nuvem sem o consentimento do usuário via botão de exportação manual).

> ⚠️ **Restrição Crítica**: A aplicação usa a **File System Access API** (para backup transparente local). Funciona exclusivamente em navegadores baseados em Chromium (Google Chrome 86+, Microsoft Edge 86+, Opera). **Não suportado no Firefox e Safari.**

---

## 3. Funcionalidades e Evolução do Projeto

### v1.0 — Fundação
- Carregamento assíncrono de PDFs via PDF.js.
- Camada de texto selecionável e captura automatizada.
- Recorte de imagens diretamente no canvas do navegador.
- Backup local via File System Access API.

### v2.0 — Estruturação Jurídica
- Identificação por polo processual (Parte Autora, Parte Ré, Juízo, Perito).
- Painel de Tópicos Recursais (Abas).
- Ferramenta de Oitiva de Audiência (Mapeamento de MP3 com minutagem).

### v3.0 — Motor de IA e Mapa Mental
- Integração LLM (Exportação em Markdown otimizado para IA).
- Visualização em Mapa Mental Sinuoso: Conexões desenhadas com curvas de Bézier em SVG.
- Validação Anti-Corrupção: Assinatura matemática em SHA-256 dos PDFs para retomada segura de sessão.

### v4.0 — Ergonomia e Precisão Cognitiva (Versão Atual)
- **Modo Leitura Confortável**: Fundo do PDF carregado nativamente em tom *Jasmine*, com alternância rápida para *Branco* salva na memória do navegador.
- **Independência de Provas Agrupadas**: Provas correlacionadas agora possuem vida própria, com botões individuais para edição e adição de nós de ideia (sub-anotações) atreladas especificamente àquele recorte.
- **Reordenação Inteligente (Smart Move)**: Capacidade de mover uma prova agrupada, transformando-a em uma Nova Ideia autônoma, ou mesclando-a em outro conjunto de teses de forma visual e segura.
- **Painel de Teses e Legendas**: Ao clicar na numeração da ideia, o assessor descreve a tese central. O sistema gera um sumário no topo da página, facilitando a navegação periférica e elevando drasticamente a qualidade do contexto exportado para a IA.

---

## 4. Guia de Uso Rápido

### Iniciando a Extração
1. Clique em **Novo Processo** (ícone de arquivo) e carregue o PDF.
2. Salve o arquivo de backup `.json` (ele atualizará sozinho a cada ação).
3. Clique em **Novo Tópico** (ícone de linhas) para criar as abas das matérias do recurso.
4. Selecione textos, acione a tesoura para imagens ou o microfone para áudios, classificando os recortes nas abas.

### Organizando o Pensamento Jurídico (Preparando para a IA)
1. **Nomeando Teses**: Clique no círculo numérico de uma ideia gerada para nomear a Tese Jurídica. Ela aparecerá no painel de sumário no topo.
2. **Nós de Ideia**: Clique no ícone de adicionar (linhas) na base de qualquer card para inserir conclusões ou observações do assessor atreladas àquela prova.
3. **Agrupamento (Smart Move)**: Use o ícone de setas na base de um card para movê-lo de lugar ou agrupá-lo com outra prova que verse sobre a mesma tese.

### O Fluxo de Exportação para IA
1. Após finalizar a análise de um tópico (ex: "Dano Moral"), vá para a aba **Anotações**.
2. Clique no ícone de **Seta para Cima** (Exportar Tópico) na barra lateral.
3. Um arquivo `.md` será baixado. 
4. Abra o ChatGPT, Claude ou IA interna do Tribunal, anexe o arquivo `.md` e digite o comando:
   > *"Atue como Desembargador Relator. Com base no sumário de teses e nas evidências estruturadas no arquivo anexo, redija a fundamentação do voto para este tópico recursal. Não presuma fatos fora do documento."*

### Atalhos de Teclado Essenciais
| Comando | Ação |
|---------|------|
| `Esc` | Cancela modo recorte, fecha modais e menus. |
| `Ctrl + Enter` | Salva o card de observação secundária / Nó de Ideia. |
| `Ctrl + B` | Aplica negrito (formatação Markdown) no modal de edição de texto. |
| `Clique Simples` no N° da Folha | Copia a referência completa para a área de transferência (ex: *Id. a1b2c3d - fl. 45*). |
| `Shift + Clique` no N° da Folha | Abre o editor de metadados para ajustar/corrigir manualmente a numeração da página daquela extração. |

---

## 5. Estrutura de Arquivos do Repositório (Módulos)

A base de código utiliza um padrão modular isolado, garantindo fácil manutenção:

| Arquivo | Responsabilidade |
|---------|------------------|
| `index.html` | Estrutura semântica, importação de dependências e templates de modais de Tese e Smart Move. |
| `styles.css` | UI/UX, variáveis de temas (Fundo Jasmine), layout flexbox e design responsivo. |
| `app.js` | Orquestrador global, gestão de temas (localStorage), lazy-loading de PDF.js e menus. |
| `topics-manager.js` | Renderização do fichário, sumário de teses, barras de ação e motor de curvas em SVG. |
| `backup-manager.js` | Persistência local (API de File System) e cálculo de Hashes Criptográficos. |
| `export-manager.js` | Formatação algorítmica e injeção semântica de Teses para arquivos Markdown. |
| `audio-manager.js` | Controle de playback, marcação de tempos (Início/Fim) e classificação de oitivas. |
| `interaction-tools.js`| Wizards passo-a-passo, state-machine de recorte de canvas e popups flutuantes. |
| `annotation-actions.js`| CRUD de anotações, lógica de Reordenação Inteligente e modais textuais. |

---

## 6. Limitações Conhecidas

- **Imagens Pesadas**: Muitos recortes longos de imagens são salvos em Base64 dentro do `.json`, o que pode elevar o tamanho do backup (5MB a 15MB). Um mecanismo futuro migrará imagens pesadas para o `IndexedDB` do navegador.
- **Descolamento do Canvas**: Recortes rápidos enquanto o PDF ainda está carregando ou sofrendo scroll intenso podem gerar imagens levemente deslocadas. Aguarde o indicador da página parar de carregar antes de iniciar o recorte.
```
