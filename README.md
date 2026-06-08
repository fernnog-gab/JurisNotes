# Juris Notes — Assistente de Mapeamento Estruturado para Elaboração de Acórdãos

## 1. Contexto do Domínio e o Desafio Cognitivo

Esta aplicação foi desenvolvida para revolucionar o trabalho de **assistentes judiciais de gabinete em tribunais de segunda instância** (ex.: TRT). O Juris Notes atua como a ponte ideal entre a leitura humana do Inteiro Teor e a redação da minuta com auxílio de Inteligência Artificial.

### O Desafio da IA e o "Efeito Túnel" Humano
Fazer o upload de um processo em PDF de milhares de páginas diretamente para uma IA gera perda de contexto e invenção de fatos (alucinações). A IA precisa do recorte exato dos fatos, focado exclusivamente no *Efeito Devolutivo* (os tópicos que efetivamente foram objeto de recurso).

Por outro lado, o assessor humano muitas vezes sofre do **"efeito túnel"**: devido ao volume de trabalho, é comum ler o Recurso e saltar diretamente para a Sentença, perdendo a dimensão exata do conflito original (A Inicial e a Contestação) ou negligenciando a revaloração minuciosa das Provas. 

### A Solução: O Guia Metodológico Silencioso
O Juris Notes age como um "Fichário Inteligente" que inverte a lógica: o assessor humano faz a curadoria das provas guiado por uma interface que o educa visualmente, e a IA atua apenas na redação final. O aplicativo não proíbe saltos ou impõe travas burocráticas, mas utiliza cores, organização espacial e alertas sutis para incentivar uma análise cronológica e completa da lide, garantindo uma minuta blindada.

---

## 2. A Metodologia das 4 Fases e Zonas Visuais (Fluxo Padrão - Recurso Ordinário)

Para combater a carga cognitiva e organizar o raciocínio jurídico, o sistema divide a extração em **4 Fases Metodológicas Essenciais**. Cada fase possui um propósito lógico e uma identidade visual (cor):

### 🟦 FASE 1: O Recurso (O Filtro) — Cor: Azul
* **Propósito:** Delimitar a fronteira da atuação do Tribunal (Efeito Devolutivo). Identificamos exatamente do que a parte reclama.
* **Peças Típicas:** Recurso Ordinário, Recurso Adesivo, Contrarrazões.
* **Impacto Visual:** Sempre ordenados no topo do painel. É a lente através da qual o resto do processo será lido.

### 🟩 FASE 2: A Gênese (A Origem) — Cor: Verde
* **Propósito:** Compreender como a lide nasceu. Impede surpresas por inovações recursais ou argumentos não levantados na contestação.
* **Peças Típicas:** Petição Inicial, Contestação, Impugnação à Contestação.

### 🟪 FASE 3: O Julgamento (A Sentença) — Cor: Roxo
* **Propósito:** Analisar o que o Juízo de 1º grau decidiu e quais foram os fundamentos adotados.
* **Peças Típicas:** Sentença.

### 🟧 FASE 4: A Validação (As Provas) — Cor: Laranja
* **Propósito:** É o acervo probatório bruto. Onde a verdade real é confrontada com as alegações.
* **Peças Típicas:** Prova Documental Genérica, Laudos Periciais, Oitivas de Audiência (Áudio/Transcrição).

### O Dashboard de Maturidade (Termômetro de Teses - RO)
No fluxo padrão, cada tese possui uma barra de progresso em "vidro fosco". Se a tese agrupa elementos de todas as fases metodológicas essenciais (ex: Recurso + Sentença + Provas), o card se preenche de cores e atinge sua maturidade máxima, ganhando um efeito de **estrela giratória** (sinalizando que está segura para exportação).

---

## 3. Mudança de Paradigma: Arquitetura em Hub e Ecossistemas Isolados

Com a maturação da ferramenta, percebeu-se que **diferentes incidentes processuais exigem "vieses cognitivos" completamente diferentes** por parte do assessor. O fluxo de um Recurso Ordinário (RO) não atende à dinâmica restrita dos Embargos de Declaração (ED). 

Para acomodar isso de forma segura, o Juris Notes adotou uma **Arquitetura em Hub (Estado de Transição)**:

* **O Hub de Entrada (`/`):** Uma tela inicial de *Onboarding* onde o usuário declara a natureza da sua análise (Recurso Ordinário vs. Embargos de Declaração) antes de carregar o processo.
* **Silos Funcionais Isolados (`/ro` e `/ed`):** A aplicação foi dividida em diretórios independentes. Atualmente, a pasta `/ed` é um clone da principal, mas receberá adaptações cirúrgicas exclusivas (poda de ferramentas de mérito e novas intenções de IA). Essa separação garante que possamos inovar no fluxo de embargos sem risco de quebrar ou engessar o sistema maduro do RO.
* **Ecossistemas de Backup Próprios:** Cada painel gera e lê seu próprio arquivo `.json` de backup e possui sua própria estrutura de formatação para IA, evitando contaminação de dados entre incidentes processuais distintos.

---

## 4. Metodologia Adaptada: O Incidente de Embargos de Declaração (ED)

Quando o sistema entra no **"Modo ED"**, as 4 cores são mantidas, mas a cognição por trás delas sofre uma mutação para atuar como uma **Lente de Auditoria Estrita**. Em ED, não se discute a justiça da decisão, mas sim a sua higidez estrutural.

*(Nota: A atribuição de cores neste módulo se dará por um "Modal de Classificação" em desenvolvimento, onde o usuário define os critérios da peça extraída e o sistema aplica a cor lógica).*

### 🟦 FASE 1: A Lente de Auditoria (O Escopo do Vício) — Cor: Azul
* **Propósito:** Delimitar estritamente qual é a falha estrutural alegada (Omissão, Contradição ou Erro Material). 
* **A "Mágica" Cognitiva:** O card Azul atua como uma viseira para o assessor. Qualquer argumento subsequente que tente rediscutir a justiça da decisão (fuga de escopo) será mentalmente barrado, pois não responde ao recorte Azul.

### 🟩 FASE 2: O Limite da Provocação (A Gênese) — Cor: Verde
* **Propósito:** Confirmar o prequestionamento ou a provocação original. O juízo não pode ser omisso sobre algo que nunca lhe foi pedido. (Recortes da Inicial, Contestação ou RO originário).
* **A "Mágica" Cognitiva:** Se o assessor não encontrar nada para colorir de Verde, a tese cai por inovação recursal. A prova visual da inovação é a própria ausência da cor Verde.

### 🟪 FASE 3: O Alvo da Crítica (A Decisão Embargada) — Cor: Roxo
* **Propósito:** Isolar a fundamentação sob ataque para auditar se o vício apontado no recorte Azul realmente existe. (Acórdão ou Sentença embargada).
* **A "Mágica" Cognitiva (A Dinâmica da Contradição):** Se a Fase 1 (Azul) alegou *Contradição*, o assessor é forçado a extrair dois recortes Roxos conflitantes da decisão. O visual de **um card Roxo brigando com outro card Roxo** evidencia que a contradição é interna. Contradição com a prova (Roxo vs. Laranja) é denunciada visualmente como incabível.

### 🟧 FASE 4: A Prova Material do Vício (Validação Restrita) — Cor: Laranja
* **Propósito:** Comprovar documentalmente apenas erros materiais evidentes (ex: data trocada) ou ignorância de jurisprudência vinculante.
* **A "Mágica" Cognitiva (O Guardrail - A definir):** O sistema monitorará a extração. Se o assessor fizer recortes extensos de provas fáticas na cor Laranja, surgirá um alerta: *"Atenção: Em ED, a reavaliação de provas fáticas configura rejulgamento do mérito."*

### Dashboard de Maturidade Dinâmico em ED *(Em desenvolvimento)*
No Modo ED, a estrela de 100% obedece a **fórmulas lógicas exclusivas** de acordo com o vício alegado:
* **Omissão:** Maturidade = Azul + Verde + Roxo *(A prova Laranja é dispensável)*.
* **Contradição:** Maturidade = Azul + Roxo + Roxo *(Confronto de premissas do juiz)*.
* **Erro Material:** Maturidade = Azul + Roxo + Laranja *(Evidência cirúrgica do erro)*.

---

## 5. Arquitetura Geral da Aplicação

Aplicação **Client-Side Only (sem backend)**. Toda a lógica de leitura, extração e salvamento roda inteiramente no navegador do usuário, garantindo **Sigilo Judicial Absoluto** (os dados do processo nunca vão para um servidor na nuvem sem o consentimento do usuário via botão de exportação manual).

> ⚠️ **Restrição Crítica**: A aplicação usa a **File System Access API** (para backup transparente local). Funciona exclusivamente em navegadores baseados em Chromium (Google Chrome 86+, Microsoft Edge 86+, Opera). **Não suportado no Firefox e Safari.**

> 🛡️ **Gestão de Mídia Local**: Para manter a leveza do arquivo de backup (`.json`) e garantir o sigilo, os PDFs e arquivos de áudio (`.mp3`) **não** são embutidos dentro dele. O sistema salva apenas as coordenadas geométricas e temporais via Hashes. Ao retomar uma sessão, o usuário precisa apontar novamente para os arquivos originais em sua máquina.

---

## 6. Funcionalidades e Evolução do Projeto

### v1.0 a v3.0 — Fundação e Extração
- Carregamento assíncrono de PDFs via PDF.js com renderização *lazy load*.
- Recorte de imagens, textos e mapeamento de audiências em MP3.
- Integração LLM (Exportação em Markdown) e Validação Anti-Corrupção SHA-256.

### v4.0 — Ergonomia e Nós de Ideia
- Fundo de leitura confortável (*Jasmine* e *Branco*).
- Separação entre a Prova Bruta (Main Card) e a Conclusão do Assessor (Nós de Ideia/Sub-anotações).

### v5.0 — Inteligência Metodológica e Zonas Visuais
- **Modal de Extração por Mini-Abas:** Categorização das peças nas 4 fases diretamente no momento do recorte.
- **Smart Sort (Reordenação Inteligente):** O sistema realoca o card automaticamente para a Zona (Fase) correta, independentemente da ordem em que o assessor lê o PDF.
- **Dashboard de Maturidade Padrão:** Indicador de completude de teses no RO.

### v6.0 — Arquitetura Hub, Modo ED e Integração Mestre de Gabinete (Atual)
- **Hub e Silos Separados:** Divisão entre o ambiente Padrão (RO) e o ambiente restrito para Embargos de Declaração (ED).
- **Arquitetura "Roteiro do Diretor":** O arquivo exportado funciona como um *payload cognitivo estruturado*, entregando o "esqueleto" (matriz dialética) para o LLM via tags XML.
- **Fila de Download Sequencial Segura:** Download de imagens-prova via fila assíncrona encadeada.

---

## 7. Guia de Uso Rápido

### Iniciando a Extração
1. Escolha a natureza do incidente (RO ou ED) no **Hub de Entrada**.
2. Clique em **Novo Processo** e carregue o PDF.
3. Salve o arquivo de backup `.json` (ele atualizará sozinho a cada ação).
4. Crie as abas dos tópicos recursais (ou vícios alegados).
5. Selecione textos, recorte imagens ou áudios e classifique a fase correspondente no modal.

### Retomando um Processo em Andamento (Backup)
1. Escolha o módulo correto (RO ou ED).
2. Clique em **Retomar Processo** e selecione o arquivo `.json`.
3. Carregue o arquivo PDF correspondente (validado via Hash SHA-256).
4. **Reconectando Áudios (MP3):** Clique no **ícone de microfone laranja pulsante** para reanexar os áudios locais por questões de segurança do navegador.

### Desenvolvendo a Tese e Exportando para a IA
1. Extraia e agrupe os recortes sob as teses criadas. Observe o Dashboard de Maturidade sinalizar o progresso ou apontar falhas cognitivas.
2. Nos **Nós de Ideia**, classifique a intenção (Premissa, Fundamentação, Veredito, etc.).
3. Clique em **Exportar** (Seta para Cima) para gerar o pacote (`.md` estruturado + imagens).
4. No modelo externo (ex: Gemini/ChatGPT), faça o upload do Pacote, dos PDFs e das imagens em conjunto.

---

## 8. Estrutura de Arquivos do Repositório (Por Silo)

Cada diretório (`/ro` e `/ed`) possui sua própria estrutura modular espelhada, garantindo isolamento:

| Arquivo | Responsabilidade |
|---------|------------------|
| `index.html` | Estrutura semântica, importação de dependências e modais. |
| `juris-core.css` | Variáveis globais, Z-Index, paletas e estrutura base responsiva. |
| `juris-workspace.css` | Sistema das Zonas Visuais (Cores), Dashboard e UI do PDF. |
| `app.js` | Orquestrador global, Smart Sort e motor heurístico. |
| `topics-manager.js` | Renderização do fichário, painel de teses (maturidade). |
| `backup-manager.js` | Persistência local (API File System) e Hashes Criptográficos. |
| `export-manager.js` | Geração do payload estruturado e injeção de tags XML para o LLM. |
| `audio-manager.js` | Controle de playback, reconexão de MP3 e marcações. |
| `interaction-tools.js`| Wizards de captura, configuração das fases (DOC_CONFIG) e modais. |
| `annotation-actions.js`| CRUD de anotações e reordenação manual de cards. |
