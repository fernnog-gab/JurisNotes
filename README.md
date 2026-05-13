````markdown
# Mapeamento de Inteiro Teor — Assistente de Elaboração de Minutas de Acórdão

## 1. Contexto do Domínio

Esta aplicação foi desenvolvida para auxiliar **assistentes judiciais de gabinete em tribunais de segunda instância** (ex.: TRT — Tribunal Regional do Trabalho) na elaboração de minutas de voto de acórdão.

### O Fluxo de Trabalho Judicial

O processo de elaboração de um acórdão em segunda instância segue uma rotina estruturada:

1. **Recebimento do recurso**: O processo chega ao gabinete do desembargador/relator já com um recurso interposto (ex.: Recurso Ordinário, Agravo de Instrumento).
2. **Análise do Inteiro Teor**: O assistente lê integralmente o processo judicial em formato PDF, que pode conter centenas de páginas entre petições, decisões, atas de audiência e provas documentais.
3. **Delimitação do Efeito Devolutivo**: A análise é guiada pelos **tópicos recursais** — as matérias efetivamente impugnadas pelo recorrente. O tribunal só pode julgar aquilo que foi objeto de recurso (princípio do efeito devolutivo, art. 1.013, CPC). Cada tópico recursal corresponde a uma tese jurídica distinta (ex.: admissibilidade formal do recurso, preliminar de nulidade, mérito — dano moral, mérito — horas extras, honorários advocatícios).
4. **Extração de Anotações**: Para cada tópico, o assistente extrai do PDF os trechos relevantes: fundamentos da sentença recorrida, argumentos do recorrente, contrarrazões e provas documentais.
5. **Estruturação para IA (Prompting)**: Direcionamento inteligente das informações coletadas, estruturando-as com a melhor eficácia possível para nortear a construção e redação lógica por meio de um modelo de Inteligência Artificial externo (LLM).
6. **Redação da Minuta**: Com base nas anotações processadas e roteirizadas, consolida-se a minuta final do voto, que seguirá a estrutura: relatório → admissibilidade → mérito (tópico a tópico) → dispositivo.

### Por que esta aplicação existe

Ferramentas genéricas (Word, PDF readers) não refletem esse modelo mental. A análise de um processo extenso resulta em dezenas de anotações dispersas sem hierarquia. Esta aplicação resolve esse problema ao vincular cada extração a um **tópico recursal** específico, criando um fichário estruturado e limpo diretamente do PDF, perfeitamente compatível com pipelines de IA generativa.

---

## 2. Arquitetura da Aplicação

### Stack Técnica

A aplicação é intencionalmente **monolítica no front-end e sem dependências de servidor**. Toda a lógica roda no navegador, sem backend, sem banco de dados remoto e sem necessidade de deploy além de um servidor de arquivos estáticos.

| Arquivo       | Responsabilidade |
|---------------|------------------|
| `index.html`  | Estrutura do DOM, declaração de componentes e import dos scripts |
| `styles.css`  | Toda a apresentação visual: layout minimalista, pílulas de notificação |
| `app.js`      | Estado global da aplicação, controle de fluxo e inicialização |
| `js/`         | Lógicas modularizadas (Anotações, PDF, Áudio e Backup) |

### Dependências Externas (CDN)

- **PDF.js v2.16.105** (`cdnjs.cloudflare.com`): renderização de PDFs no canvas com camada de texto selecionável.
- **File System Access API** (nativa do Chromium): leitura e escrita de arquivos locais sem upload para servidor.

### Compatibilidade de Navegadores

> ⚠️ **Restrição Crítica**: A **File System Access API** é suportada apenas em navegadores baseados em Chromium (Google Chrome 86+, Microsoft Edge 86+, Opera). **Firefox e Safari não suportam esta API nativamente com gravação direta**. A aplicação deve ser utilizada preferencialmente no Chrome ou Edge.

---

## 3. Modelo de Dados

O estado central da aplicação é o array `topicos[]`, serializado como JSON no arquivo de backup. As renderizações visuais suportam a sintaxe de formatação segura (Markdown `**negrito**`).

```json
[
  {
    "id": "topico-1719000000000",
    "nome": "Admissibilidade",
    "cor": "#25527f",
    "anotacoes": [
      {
        "tipo": "texto",
        "polo": "Parte Autora",
        "pagina": 12,
        "timestamp": 1719000001000,
        "conteudo": "O **recurso** foi interposto tempestivamente, conforme fl. 320."
      }
    ]
  }
]
````

* * *

## 4\. Funcionalidades de Destaque

-   **Carregamento Otimizado**: PDF com lazy loading via IntersectionObserver, suportando processos gigantes (1000+ páginas).
-   **Gestão de Sessões Locais**: Criação forçada de backup e auto-save invisível. Retomada de processo por validação de *hash* SHA-256 do arquivo original.
-   **Interface UI/UX Minimalista**: Sem poluição visual, pop-ups sutis no formato pílula, foco integral na leitura.
-   **Edição Avançada e Segurança**: Textos editáveis com atalho `Ctrl+B` para negrito, traduzidos por um parser que neutraliza vulnerabilidades XSS.
-   **Diagnóstico de Paginação**: Transparência no contador de páginas totais vs. físicas para pareamento com softwares Desktop (Foxit/Acrobat).
-   **Módulo de Oitivas (Áudio)**: Inserção de recortes temporais de audiências anexadas aos tópicos.

* * *

## 5\. Guia de Uso

### Fluxo: Novo Processo

1.  Clique no ícone **Novo Processo** (documento com `+`) na barra lateral.
2.  Selecione o arquivo PDF do Inteiro Teor.
3.  O sistema carregará o PDF e solicitará onde salvar o arquivo de backup (`.json`). **Não pule esta etapa**.
4.  Na aba **Anotações**, crie os Tópicos Recursais usando o botão **+**.
5.  Na aba **Processo**, selecione um trecho de texto e use a ferramenta `T`, ou ative a tesoura para recortes de imagem.
6.  Direcione a anotação para o **Tópico** correspondente e vincule o polo processual.
7.  Use o modal de **Editar** na anotação caso queira grifar termos em **Negrito**.

### Fluxo: Retomar Processo Existente

1.  Clique no ícone **Retomar Processo** (ícone de pasta).
2.  Selecione o arquivo `.json` de backup da sessão anterior.
3.  O sistema restaurará todos os tópicos e solicitará o PDF original, validando a integridade do arquivo.
4.  O trabalho retoma exatamente de onde parou.
