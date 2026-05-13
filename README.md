# Mapeamento de Inteiro Teor — Assistente de Elaboração de Minutas de Acórdão

## 1. Contexto do Domínio

Esta aplicação foi desenvolvida para auxiliar **assistentes judiciais de gabinete em tribunais de segunda instância** (ex.: TRT — Tribunal Regional do Trabalho) na elaboração de minutas de voto de acórdão.

### O Fluxo de Trabalho Judicial

O processo de elaboração de um acórdão em segunda instância segue uma rotina estruturada:

1. **Recebimento do recurso**: O processo chega ao gabinete do desembargador/relator já com um recurso interposto (ex.: Recurso Ordinário, Agravo de Instrumento).
2. **Análise do Inteiro Teor**: O assistente lê integralmente o processo judicial em formato PDF, que pode conter centenas de páginas entre petições, decisões, atas de audiência e provas documentais.
3. **Delimitação do Efeito Devolutivo**: A análise é guiada pelos **tópicos recursais** — as matérias efetivamente impugnadas pelo recorrente. O tribunal só pode julgar aquilo que foi objeto de recurso (princípio do efeito devolutivo, art. 1.013, CPC). Cada tópico recursal corresponde a uma tese jurídica distinta (ex.: admissibilidade formal do recurso, preliminar de nulidade, mérito — dano moral, mérito — horas extras, honorários advocatícios).
4. **Extração de Anotações**: Para cada tópico, o assistente extrai do PDF os trechos relevantes: fundamentos da sentença recorrida, argumentos do recorrente, contrarrazões e provas documentais.
5. **Redação da Minuta**: Com base nas anotações organizadas por tópico, o assistente redige a minuta do voto, que seguirá a estrutura: relatório → admissibilidade → mérito (tópico a tópico) → dispositivo.

### Por que esta aplicação existe

Ferramentas genéricas (Word, PDF readers) não refletem esse modelo mental. A análise de um processo extenso resulta em dezenas de anotações dispersas sem hierarquia. Esta aplicação resolve esse problema ao vincular cada extração a um **tópico recursal** específico, criando um fichário estruturado diretamente do PDF.

---

## 2. Arquitetura da Aplicação

### Stack Técnica

A aplicação é intencionalmente **monolítica e sem dependências de servidor**. Toda a lógica roda no navegador, sem backend, sem banco de dados remoto e sem necessidade de deploy além de um servidor de arquivos estáticos (GitHub Pages compatível).

| Arquivo       | Responsabilidade |
|---------------|------------------|
| `index.html`  | Estrutura do DOM, declaração de componentes e import dos scripts |
| `styles.css`  | Toda a apresentação visual: layout, componentes, estados interativos |
| `app.js`      | Estado global da aplicação, lógica de negócio, event listeners |

### Dependências Externas (CDN)

- **PDF.js v2.16.105** (`cdnjs.cloudflare.com`): renderização de PDFs no canvas com camada de texto selecionável.
- **File System Access API** (nativa do Chromium): leitura e escrita de arquivos locais sem upload para servidor.

### Compatibilidade de Navegadores

> ⚠️ **Restrição Crítica**: A **File System Access API** (`showSaveFilePicker`, `showOpenFilePicker`) é suportada apenas em navegadores baseados em Chromium (Google Chrome 86+, Microsoft Edge 86+, Opera). **Firefox e Safari não suportam esta API**. A aplicação deve ser utilizada exclusivamente no Chrome ou Edge.

---

## 3. Modelo de Dados

O estado central da aplicação é o array `topicos[]`, serializado como JSON no arquivo de backup.

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
        "conteudo": "O recurso foi interposto tempestivamente, conforme certidão de fl. 320."
      }
    ]
  },
  {
    "id": "topico-1719000005000",
    "nome": "Mérito — Dano Moral",
    "cor": "#2e7d32",
    "anotacoes": []
  }
]
```

**Regras do modelo:**
- `tipo`: `"texto"` (trecho copiado) ou `"imagem"` (base64 de recorte de canvas).
- `polo`: `"Parte Autora"` ou `"Parte Ré"` — identifica qual lado do processo originou a informação.
- `pagina`: página corrente do PDF no momento da extração.
- `conteudo`: para imagens, armazena o data URL base64 completo.

---

## 4. Funcionalidades por Versão

### v1.0 — Fundação (Inicial)
- [x] Carregamento de PDF com lazy loading (IntersectionObserver)
- [x] Camada de texto selecionável sobre o canvas do PDF (PDF.js TextLayer)
- [x] Captura de texto selecionado
- [x] Recorte de área do canvas (modo crop)
- [x] Popup de classificação por polo processual (Parte Autora / Parte Ré)
- [x] Histórico de anotações em lista plana
- [x] Backup automático via File System Access API

### v2.0 — Gestão de Sessões e Tópicos Recursais (Versão Atual)
- [x] **Novo Processo**: carrega um PDF e imediatamente força a criação do arquivo de backup vinculado
- [x] **Retomar Processo**: abre um backup `.json` existente, restaura os tópicos e solicita o PDF correspondente
- [x] **Tópicos Recursais**: painéis expansíveis (accordion) com sistema de cores automático
- [x] **Roteamento de anotações**: toda extração é obrigatoriamente vinculada a um tópico
- [x] **Preservação de estado do accordion**: rerenders não colapsam painéis abertos pelo usuário
- [x] **Toast de feedback**: notificações não-intrusivas substituem `alert()` e mudanças forçadas de aba
- [x] **Validação de tópico duplicado**: impede criação de tópicos com o mesmo nome

### Roadmap (Funcionalidades Futuras)
- [ ] **Drag & Drop entre tópicos**: reclassificação visual de anotações erroneamente categorizadas
- [ ] **Exportador de Esqueleto de Minuta** (`.docx`/`.txt`): compilar tópicos como H1/H2 e anotações como bullet points
- [ ] **Anotação por imagem em digitalizações**: ajuste de coordenadas do canvas para captura correta em páginas sem texto extraível (OCR ou captura posicional relativa ao container)
- [ ] **Estado persistente via IndexedDB**: migrar imagens base64 do JSON para IndexedDB, aliviando o tamanho do arquivo de backup
- [ ] **Edição e exclusão de anotações**: ações contextuais nos cards do histórico
- [ ] **Contador de tópicos na aba**: badge numérico na aba "Anotações" indicando total de anotações

---

## 5. Guia de Uso

### Fluxo: Novo Processo

1. Clique no ícone **Novo Processo** (ícone de documento com `+`) na barra lateral.
2. Selecione o arquivo PDF do Inteiro Teor.
3. O sistema carregará o PDF e imediatamente solicitará onde salvar o arquivo de backup (`.json`). **Não pule esta etapa** — é a âncora de toda a sessão.
4. Na aba **Anotações**, clique no botão **+** para criar os Tópicos Recursais (ex.: "Admissibilidade", "Mérito — Dano Moral", "Honorários").
5. Na aba **Processo**, selecione um trecho de texto e clique no ícone **T** (Gerar Anotação a Partir de Texto), ou ative o modo de recorte com o ícone de tesoura para capturar imagens.
6. No popup de classificação, selecione o **Tópico de destino** e o **polo processual**.
7. A anotação é salva automaticamente no tópico e o backup é atualizado.

### Fluxo: Retomar Processo Existente

1. Clique no ícone **Retomar Processo** (ícone de pasta) na barra lateral.
2. Selecione o arquivo `.json` de backup da sessão anterior.
3. O sistema restaurará todos os tópicos e anotações.
4. Uma segunda solicitação abrirá o seletor de arquivo para você indicar o PDF do Inteiro Teor correspondente.
5. O trabalho retoma de onde parou.

### Atalhos de Teclado

| Tecla   | Ação |
|---------|------|
| `Esc`   | Fecha o popup de classificação / desativa o modo de recorte |

---

## 6. Limitações Conhecidas

| Limitação | Causa | Status |
|-----------|-------|--------|
| Não funciona no Firefox/Safari | File System Access API não suportada | Limitação de plataforma — sem solução prevista |
| Recorte de imagem pode descolar em PDFs com scroll | Coordenadas do canvas não compensam o scroll do container pai | Roadmap v3 |
| Backup pode ficar grande com muitas imagens | Imagens base64 têm overhead de ~33% sobre o binário | Roadmap: migrar para IndexedDB |
| Sem autenticação ou controle de acesso | Aplicação local, sem backend | Fora do escopo |

---

## 7. Estrutura de Arquivos do Repositório

```
/
├── index.html      # Estrutura HTML da aplicação
├── styles.css      # Estilos visuais
├── app.js          # Lógica da aplicação
└── README.md       # Este arquivo
```

---

## 8. Considerações para Desenvolvedores

- **Não há build step**: os arquivos são servidos diretamente. Qualquer editor de texto é suficiente.
- **GitHub Pages**: basta apontar o Pages para a raiz da branch `main`. Nenhuma configuração adicional.
- **PDF.js**: a versão 2.16.105 foi fixada intencionalmente para estabilidade. Atualizações devem ser testadas, pois `renderTextLayer` mudou de assinatura na v3.x.
- **`carregarPDF` é assíncrono interno**: a função usa callbacks do `FileReader` internamente. O fluxo pós-carregamento é encadeado no `.then()` da promise do PDF.js, garantindo ordem de execução correta sem `setTimeout`.
