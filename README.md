# Juris Notes — Assistente de Mapeamento Estruturado para Elaboração de Acórdãos

## 1. Contexto do Domínio e o Desafio Cognitivo

Esta aplicação foi desenvolvida para revolucionar o trabalho de **assistentes judiciais de gabinete em tribunais de segunda instância** (ex.: TRT). O Juris Notes atua como a ponte ideal entre a leitura humana do Inteiro Teor e a redação da minuta com auxílio de Inteligência Artificial.

### O Desafio da IA e o "Efeito Túnel" Humano
Fazer o upload de um processo em PDF de milhares de páginas diretamente para uma IA gera perda de contexto e invenção de fatos (alucinações). A IA precisa do recorte exato dos fatos, focado exclusivamente no *Efeito Devolutivo* (os tópicos que efetivamente foram objeto de recurso).

Por outro lado, o assessor humano muitas vezes sofre do **"efeito túnel"**: devido ao volume de trabalho, é comum ler o Recurso e saltar diretamente para a Sentença, perdendo a dimensão exata do conflito original (A Inicial e a Contestação) ou negligenciando a revaloração minuciosa das Provas. 

### A Solução: O Guia Metodológico Silencioso
O Juris Notes age como um "Fichário Inteligente" que inverte a lógica: o assessor humano faz a curadoria das provas guiado por uma interface que o educa visualmente, e a IA atua apenas na redação final. O aplicativo não proíbe saltos ou impõe travas burocráticas, mas utiliza cores, organização espacial e alertas sutis para incentivar uma análise cronológica e completa da lide, garantindo uma minuta blindada.

---

## 2. A Metodologia das 4 Fases e Zonas Visuais

Para combater a carga cognitiva e organizar o raciocínio jurídico, o Juris Notes divide o processo de extração e análise em **4 Fases Metodológicas Essenciais**. Cada fase possui um propósito lógico e uma identidade visual (cor) própria, que acompanha o recorte desde a captura até a exportação final:

### 🟦 FASE 1: O Recurso (O Filtro) — Cor: Azul
* **Propósito:** Delimitar a fronteira da atuação do Tribunal (Efeito Devolutivo). É aqui que identificamos exatamente do que a parte está reclamando.
* **Peças Típicas:** Recurso Ordinário, Recurso Adesivo, Contrarrazões.
* **Impacto Visual:** Cards extraídos nesta fase ganham um fundo azul suave. Eles sempre serão ordenados no topo do painel, pois são a lente através da qual todo o resto do processo será lido.

### 🟩 FASE 2: A Gênese (A Origem) — Cor: Verde
* **Propósito:** Compreender como a lide nasceu. Impede que o julgador seja surpreendido por inovações recursais (pedidos que não estavam na inicial) ou argumentos de defesa que não foram levantados na contestação.
* **Peças Típicas:** Petição Inicial, Contestação, Impugnação à Contestação.
* **Impacto Visual:** Fundo verde suave. Agrupa-se logo abaixo do recurso, estabelecendo o cenário original do conflito processual.

### 🟪 FASE 3: O Julgamento (A Sentença) — Cor: Roxo
* **Propósito:** Analisar o que o Juízo de 1º grau decidiu e quais foram os fundamentos adotados.
* **Peças Típicas:** Sentença, Sentença de Embargos de Declaração.
* **Impacto Visual:** Fundo roxo suave. Se o usuário tentar recortar a Sentença *antes* de ter passado pela Gênese (Fase 2), o sistema emite um alerta não-intrusivo sugerindo a leitura da Inicial/Contestação para evitar o "efeito túnel".

### 🟧 FASE 4: A Validação (As Provas) — Cor: Laranja
* **Propósito:** É o acervo probatório bruto. Onde a verdade real é confrontada com as alegações das fases anteriores.
* **Peças Típicas:** Prova Documental Genérica, Laudos Periciais, Quesitos, Oitivas de Audiência (Áudio/Transcrição).
* **Impacto Visual:** Fundo laranja. É a fase final de agrupamento, onde o assessor vincula a prova concreta às teses levantadas.

---

## 3. O Dashboard de Maturidade (Termômetro de Teses)

No topo da tela de Anotações, o sistema gera automaticamente um **Sumário de Teses**. Com a metodologia das 4 fases, esse sumário atua como um **Dashboard de Maturidade**:

1. **Preenchimento por Fases:** Cada tese criada no painel funciona como uma barra de progresso em formato de "vidro fosco". Se você atrelou a essa tese um recorte do Recurso (Azul) e da Sentença (Roxo), o fundo da tese exibirá um gradiente com essas duas cores.
2. **Visualização Rápida de Lacunas:** Basta olhar para o topo da tela para saber se uma tese está manca. (Ex: *Falta analisar as provas? A tese não terá a cor laranja.*)
3. **Tese Blindada (100%):** Quando o assessor agrupa elementos das 4 fases em uma mesma tese, o card atinge sua maturidade máxima. Ele ganha um efeito visual de **estrela giratória**, sinalizando que aquela tese está completa, segura e pronta para ser exportada para a Inteligência Artificial redigir.

---

## 4. Arquitetura da Aplicação

Aplicação **Client-Side Only (sem backend)**. Toda a lógica de leitura, extração e salvamento roda inteiramente no navegador do usuário, garantindo **Sigilo Judicial Absoluto** (os dados do processo nunca vão para um servidor na nuvem sem o consentimento do usuário via botão de exportação manual).

> ⚠️ **Restrição Crítica**: A aplicação usa a **File System Access API** (para backup transparente local). Funciona exclusivamente em navegadores baseados em Chromium (Google Chrome 86+, Microsoft Edge 86+, Opera). **Não suportado no Firefox e Safari.**

---

## 5. Funcionalidades e Evolução do Projeto

### v1.0 a v3.0 — Fundação e Extração
- Carregamento assíncrono de PDFs via PDF.js com renderização *lazy load*.
- Recorte de imagens, textos e mapeamento de audiências em MP3.
- Integração LLM (Exportação em Markdown otimizado) e Validação Anti-Corrupção SHA-256.

### v4.0 — Ergonomia e Nós de Ideia
- Fundo de leitura confortável (*Jasmine* e *Branco*).
- Separação entre a Prova Bruta (Main Card) e a Conclusão do Assessor (Nós de Ideia/Sub-anotações).

### v5.0 — Inteligência Metodológica e Zonas Visuais
- **Modal de Extração por Mini-Abas:** Categorização das peças em 4 fases metodológicas diretamente no momento do recorte.
- **Zonas Visuais de Cores:** Pintura automática do fundo dos cards (Azul, Verde, Roxo, Laranja) criando um mapa cognitivo da cronologia da lide.
- **Smart Sort (Reordenação Inteligente):** Independentemente da ordem em que o assessor lê o PDF, o sistema realoca o card automaticamente para a Zona (Fase) correta, garantindo que o Recurso fique acima da Sentença, e a Inicial fique entre eles.
- **Dashboard de Maturidade:** Indicador de completude (gradiente colorido e selo giratório) no Sumário de Teses.
- **Retrocompatibilidade Autônoma:** Backups antigos lidos pelo sistema deduzem a fase da peça pelo nome digitado no passado, colorindo e organizando os processos antigos instantaneamente sem retrabalho manual.

### v6.0 — Exportação Inteligente e Integração com o Mestre de Gabinete (Versão Atual)
- **Arquitetura "Roteiro do Diretor":** O arquivo exportado deixou de ser uma tentativa de resumo do processo e passou a funcionar como um *payload cognitivo estruturado*. Ele não entrega a "carne" dos fatos (que está nos PDFs do processo que o modelo externo já recebe), mas sim o "esqueleto": a matriz dialética, as premissas inconstroversas, a base legal vinculada, os comandos de estilo e o veredito pretendido — cada um em seu bloco arquitetural exato.
- **Mapeamento por Tags XML:** Os Nós de Ideia agora são triados automaticamente por intenção (`premissa`, `comando`, `texto`, `veredito`, `fundamentacao`) e ejetados para as tags XML correspondentes (`<comandos_para_a_minuta>`, `<base_legal_obrigatoria>`, `<decisao_magistrado_pretendida>`) que o modelo externo ("Mestre de Gabinete") está configurado para consumir.
- **Âncora de Fase Processual por Ideia:** Cada bloco de prova exportado agora declara explicitamente seu contexto processual (fase e polo), fornecendo ao LLM a referência narrativa para posicionar corretamente cada elemento dentro da estrutura da minuta (Relatório vs. Fundamentação vs. Dispositivo).
- **Fila de Download Sequencial Segura:** O download das imagens-prova passou de um mecanismo frágil de `setTimeout` acumulativo para uma fila `async/await` encadeada, eliminando colisões e falhas silenciosas em lotes com muitas imagens.
- **Nomenclatura de Arquivo Semântica:** O arquivo exportado passa a se chamar `Pacote_JurisNotes_[topico].md`, refletindo com precisão seu papel de pacote de dados estruturado, e não de minuta final.

---

## 6. Guia de Uso Rápido

### Iniciando a Extração
1. Clique em **Novo Processo** (ícone de arquivo) e carregue o PDF.
2. Salve o arquivo de backup `.json` (ele atualizará sozinho a cada ação).
3. Crie as abas dos tópicos recursais (ex: "Adicional de Insalubridade").
4. Selecione textos, recorte imagens ou áudios. No modal que se abrir, **escolha a Fase Metodológica (1 a 4)** correspondente à peça.

### Desenvolvendo a Tese e Exportando para a IA

1. Ao extrair os fatos, nomeie a tese clicando no círculo numérico do card (ex: "EPI não neutralizou agente"). Ela subirá para o Dashboard de Maturidade.
2. Continue extraindo provas, sentenças e iniciais, agrupando-as na tese criada. Observe o card no topo se preencher de cores.
3. Nos **Nós de Ideia** de cada card, use as intenções para direcionar o modelo externo:
   - **Premissa:** Um fato incontroverso que o LLM não deve questionar. Fica colado à prova no Markdown.
   - **Fundamentação:** Uma súmula, OJ ou artigo de lei que deve obrigatoriamente embasar aquele ponto.
   - **Veredito:** A conclusão pretendida pelo magistrado para aquela tese (provido/não provido, com ou sem ressalvas).
   - **Comando:** Instrução direta de estilo ou direcionamento para a redação daquele trecho da minuta.
   - **Texto:** Um trecho de redação que o assessor quer ver transcrito literalmente na minuta.
4. Quando a tese atingir a maturidade (ou estiver satisfeito), vá até a barra lateral e clique na **Seta para Cima** (Exportar). O sistema gerará:
   - Um arquivo `Pacote_JurisNotes_[topico].md` — o "Roteiro do Diretor".
   - Um arquivo `.png` por imagem-prova capturada, com nomenclatura idêntica à referência no Markdown.

5. No modelo externo configurado com o **Mestre de Gabinete** (ex.: Gem do Gemini), anexe **em conjunto**:
   - O arquivo `Pacote_JurisNotes_[topico].md` gerado pelo Juris Notes.
   - Os PDFs completos do processo relevantes ao tópico (Sentença, Recurso Ordinário, Contrarrazões).
   - As imagens-prova baixadas (se houver).

   > O modelo externo lerá o Markdown como seu roteiro arquitetural e buscará nos PDFs os detalhes de contexto das folhas referenciadas pelas âncoras `(Id X - fl Y)`. O assessor não precisa inserir nenhum prompt adicional: toda a instrução já está codificada dentro das tags do arquivo exportado.

---

## 7. Estrutura de Arquivos do Repositório (Módulos)

A base de código utiliza um padrão modular isolado, garantindo fácil manutenção:

| Arquivo | Responsabilidade |
|---------|------------------|
| `index.html` | Estrutura semântica, importação de dependências e modais metodológicos de abas. |
| `juris-core.css` | Variáveis globais, Z-Index, paletas e estrutura base responsiva. |
| `juris-workspace.css` | Sistema das Zonas Visuais (Cores por fase), Dashboard de Maturidade e UI do PDF. |
| `app.js` | Orquestrador global, Smart Sort (reordenação lógica) e motor de heurística metodológica. |
| `topics-manager.js` | Renderização do fichário, painel de teses (gradiente dinâmico de maturidade). |
| `backup-manager.js` | Persistência local (API de File System) e cálculo de Hashes Criptográficos. |
| `export-manager.js` | Geração do payload estruturado ("Roteiro do Diretor"): triagem de Nós de Ideia por intenção, montagem da Matriz Dialética com âncoras de fase processual, injeção nas tags XML do Mestre de Gabinete e fila sequencial de download de imagens-prova. |
| `audio-manager.js` | Controle de playback, marcação de tempos (Início/Fim) e classificação de oitivas. |
| `interaction-tools.js`| Wizards de captura, gerenciamento do `DOC_CONFIG` (com fases) e modais. |
| `annotation-actions.js`| CRUD de anotações, reordenação manual e lógica interativa dos cards. |
