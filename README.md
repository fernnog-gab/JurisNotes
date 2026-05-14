# Juris Notes — Assistente de Mapeamento Estruturado para Elaboração de Acórdãos

## 1. Contexto do Domínio

Esta aplicação foi desenvolvida para revolucionar o trabalho de **assistentes judiciais de gabinete em tribunais de segunda instância** (ex.: TRT), atuando como a ponte ideal entre a leitura do Inteiro Teor e a redação da minuta com auxílio de Inteligência Artificial.

### O Desafio Atual (Por que não usar a IA diretamente no PDF?)
Fazer o upload de um processo em PDF de 2.000 páginas diretamente para uma IA (como ChatGPT ou Claude) gera "alucinações", perda de contexto e respostas genéricas. A IA precisa do **recorte exato** dos fatos, focado exclusivamente no **Efeito Devolutivo** (os tópicos que efetivamente foram objeto de recurso).

### A Solução: O Fluxo de Trabalho Integrado Juris Notes + IA
O Juris Notes age como um "Fichário Inteligente" que permite ao humano fazer o que ele faz de melhor (interpretação jurídica e curadoria de provas) e prepara o terreno perfeito para a IA fazer o que ela faz de melhor (redação).

1. **Recepção e Análise**: O assistente carrega o PDF do processo (Inteiro Teor).
2. **Delimitação (Criação de Abas)**: Com base no recurso, o assistente cria Tópicos Recursais (ex: *Admissibilidade*, *Horas Extras*, *Dano Moral*).
3. **Extração Factual**: Ao ler o PDF, o assistente captura recortes de texto, imagens de documentos e até marcações de áudio de audiências, vinculando-os ao tópico correto com a identificação do polo (Autor/Réu/Juízo).
4. **Agrupamento e Mapa Mental**: O sistema permite criar sub-ideias e agrupar provas correlacionadas (ex: uma testemunha que contradiz um cartão de ponto).
5. **Geração de Contexto para IA (A Magia)**: Com o tópico montado, o usuário clica em **"Exportar para IA"**. O sistema gera um arquivo estruturado em *Markdown* ultra-otimizado.
6. **Redação Final**: O usuário cola esse arquivo em um LLM externo com um prompt ("Redija o voto deste tópico com base nestas provas..."). O resultado é uma minuta precisa, fundamentada e sem alucinações.

---

## 2. Arquitetura da Aplicação

Aplicação **Client-Side Only (sem backend)**. Toda a lógica de leitura, extração e salvamento roda inteiramente no navegador do usuário, garantindo **Sigilo Judicial Absoluto** (os dados do processo nunca vão para um servidor na nuvem sem o consentimento do usuário via botão de exportação).

### Compatibilidade Restrita
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

### v3.0 — Motor de IA e Design Orgânico (Versão Atual)
- **Integração LLM (Exportação MD)**: Compilação do tópico ativo em Markdown otimizado para leitura por máquinas e IAs generativas.
- **Visualização em Mapa Mental Sinuoso**: Conexões desenhadas com curvas de Bézier em SVG, criando linhas do tempo fluidas entre ideias principais, provas e sub-anotações.
- **Menu do Sistema (Gestão de Abas)**: Renomeação e exclusão segura de abas clicando no logo da aplicação.
- **Edição de Metadados (Shift+Click)**: Permite corrigir assimetrias de numeração de folhas entre o PDF carregado e o visualizado no PJe, garantindo citação precisa na minuta.
- **Validação Anti-Corrupção (Hash SHA-256)**: Assinatura matemática dos PDFs para garantir que o backup será retomado no documento correto.

---

## 4. Guia de Uso Rápido

### Iniciando a Extração
1. Clique em **Novo Processo** (ícone de arquivo) e carregue o PDF.
2. Salve o arquivo de backup `.json` (ele atualizará sozinho a cada ação).
3. Clique em **Novo Tópico** (ícone de linhas) para criar as abas das matérias do recurso.
4. Selecione textos, acione a tesoura para imagens ou o microfone para áudios, classificando os recortes nas abas.

### O Fluxo de Exportação para IA
1. Após finalizar a análise de um tópico (ex: "Dano Moral"), vá para a aba **Anotações**.
2. Clique no ícone de **Seta para Cima** (Exportar Tópico) na barra lateral.
3. Um arquivo `.md` será baixado. 
4. Abra o ChatGPT, Claude ou IA interna do Tribunal, anexe o arquivo `.md` e digite o comando:
   > *"Atue como Desembargador Relator. Com base nos fatos e provas extraídos neste documento, elabore a fundamentação do voto para este tópico recursal."*

### Atalhos de Teclado Essenciais
| Comando | Ação |
|---------|------|
| `Esc` | Cancela modo recorte, fecha modais e menus. |
| `Ctrl + Enter` | Salva o card de observação secundária. |
| `Ctrl + B` | Aplica negrito (formatação Markdown) no modal de edição de texto. |
| `Clique Simples` no N° da Folha | Copia a referência completa para a área de transferência (ex: *Id. a1b2c3d - fl. 45*). |
| `Shift + Clique` no N° da Folha | Abre o editor de metadados para ajustar/corrigir manualmente a numeração da página daquela extração. |

---

## 5. Estrutura de Arquivos do Repositório (Módulos)

A base de código foi refatorada para um padrão modular isolado, garantindo fácil manutenção:

| Arquivo | Responsabilidade |
|---------|------------------|
| `index.html` | Estrutura semântica, importação de dependências e templates de modais. |
| `styles.css` | UI/UX, variáveis corporativas (Azul TRT), layout flexbox e design responsivo. |
| `app.js` | Orquestrador global, lazy-loading de PDF.js e gestão de menus. |
| `topics-manager.js` | Renderização do fichário, cards e motor de curvas de Bézier em SVG. |
| `backup-manager.js` | Persistência local (API de File System) e cálculo de Hashes Criptográficos. |
| `export-manager.js` | Formatação algorítmica de arrays JSON para arquivos Markdown de contexto de IA. |
| `audio-manager.js` | Controle de playback, marcação de tempos (Início/Fim) e classificação de oitivas. |
| `interaction-tools.js`| Wizards passo-a-passo, state-machine de recorte de canvas e popups flutuantes. |
| `annotation-actions.js`| CRUD de anotações, modais de edição textual e injeção de Markdown (`**`). |

---

## 6. Limitações Conhecidas

- **Imagens Pesadas**: Muitos recortes longos de imagens são salvos em Base64 dentro do `.json`, o que pode elevar o tamanho do backup (5MB a 15MB). Um mecanismo futuro migrará imagens para o `IndexedDB`.
- **Descolamento do Canvas**: Recortes rápidos enquanto o PDF ainda está carregando ou sofrendo scroll intenso podem gerar imagens levemente deslocadas. Aguarde o indicador da página terminar de carregar.
