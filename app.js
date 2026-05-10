/* ================================================
   ESTADO GLOBAL DA APLICAÇÃO
   ================================================ */
let fileHandleBackup = null;   // Handle do File System Access API para escrita do backup
let topicos          = [];     // Array primário: [{ id, nome, cor, anotacoes: [] }]
let pdfDoc           = null;   // Documento PDF carregado pelo PDF.js
let currentPage      = 1;      // Página visível atual (atualizada pelo IntersectionObserver)
let modoRetomada     = false;  // Flag: true quando restaurando sessão existente (evita recriar backup)

let modoRecorteAtivo = false;
let startX, startY;
let cropBox          = null;

let pendingTipo      = null;   // Tipo da extração pendente: 'texto' | 'imagem'
let pendingConteudo  = null;   // Conteúdo bruto da extração pendente
let pdfObserver      = null;   // IntersectionObserver para lazy loading

/* ================================================
   PALETA DE CORES DOS TÓPICOS
   Cores sequenciais para identificação visual rápida.
   Podem ser expandidas sem quebrar a lógica (módulo pelo comprimento).
   ================================================ */
const CORES_TOPICOS = [
    '#25527f', // Azul institucional
    '#2e7d32', // Verde
    '#b71c1c', // Vermelho
    '#f57c00', // Laranja
    '#6a1b9a', // Roxo
    '#00695c', // Verde-azulado
    '#4e342e'  // Marrom
];

/* ================================================
   GERENCIAMENTO DE INTERFACE (ABAS)
   ================================================ */
function trocarAba(aba) {
    document.getElementById('pdf-container').style.display    = aba === 'leitura'   ? 'flex'  : 'none';
    document.getElementById('history-container').style.display = aba === 'historico' ? 'block' : 'none';
    document.getElementById('tab-leitura').classList.toggle('active',   aba === 'leitura');
    document.getElementById('tab-historico').classList.toggle('active', aba === 'historico');
}

/* ================================================
   TOAST DE FEEDBACK NÃO-INTRUSIVO
   Substitui alert() e mudanças forçadas de aba.
   tipo: 'sucesso' (verde) | 'aviso' (laranja) | 'erro' (vermelho)
   ================================================ */
function exibirToast(mensagem, tipo = 'sucesso') {
    const toast = document.getElementById('toast-feedback');
    toast.textContent = mensagem;
    toast.className   = `toast-feedback toast-${tipo} visivel`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('visivel'), 2800);
}

/* ================================================
   UTILITÁRIO: ATUALIZAR INDICADOR DE STATUS DO BACKUP
   ================================================ */
function atualizarStatusBackup(texto, ativa = false) {
    const el = document.getElementById('status-backup');
    el.textContent = texto;
    el.classList.toggle('ativa', ativa);
}

/* ================================================
   UTILITÁRIO: HABILITAR FERRAMENTAS APÓS PDF CARREGADO
   ================================================ */
function habilitarFerramentasDeTrabalho() {
    document.getElementById('btn-ferramenta-recorte').disabled = false;
    document.getElementById('btn-ferramenta-texto').disabled   = false;
    document.getElementById('btn-novo-topico').disabled        = false;
}

/* ================================================
   API DE SISTEMA DE ARQUIVOS — CRIAR BACKUP (NOVO PROCESSO)
   Abre o diálogo para escolha do local de salvamento.
   Chamada automaticamente ao final do carregamento de um novo PDF.
   ================================================ */
async function iniciarSessaoSalvamento() {
    try {
        const options = {
            suggestedName: 'backup_processo.json',
            types: [{
                description: 'Arquivo de Backup JSON',
                accept: { 'application/json': ['.json'] }
            }]
        };
        fileHandleBackup = await window.showSaveFilePicker(options);
        atualizarStatusBackup('Sessão Ativa ✓', true);
        await salvarBackupAutomatico(); // Salva estrutura inicial (array vazio)
        exibirToast('Sessão iniciada. Backup automático ativo.');
    } catch (err) {
        if (err.name !== 'AbortError') {
            exibirToast('Erro ao criar o arquivo de backup. Verifique as permissões do navegador.', 'erro');
        }
        // Se o usuário cancelar o diálogo, a sessão continua sem backup (dados apenas em memória).
    }
}

/* ================================================
   API DE SISTEMA DE ARQUIVOS — RETOMAR PROCESSO EXISTENTE
   Fluxo:
   1. Abre o .json de backup e restaura topicos[] em memória.
   2. Solicita permissão de escrita para o arquivo aberto (auto-save).
   3. Define a flag modoRetomada para que carregarPDF() não recrie o backup.
   4. Dispara o input de PDF para o usuário selecionar o Inteiro Teor correspondente.
   ================================================ */
async function retomarProcesso() {
    try {
        // Passo 1: Abrir o arquivo de backup JSON
        const [handle] = await window.showOpenFilePicker({
            types: [{
                description: 'Arquivo de Backup JSON',
                accept: { 'application/json': ['.json'] }
            }]
        });

        // Passo 2: Ler e parsear os dados
        const arquivo = await handle.getFile();
        const texto   = await arquivo.text();
        let dadosRestaurados;

        try {
            dadosRestaurados = JSON.parse(texto);
        } catch {
            exibirToast('O arquivo selecionado não é um backup válido.', 'erro');
            return;
        }

        if (!Array.isArray(dadosRestaurados)) {
            exibirToast('Formato de backup inválido. O arquivo pode estar corrompido.', 'erro');
            return;
        }

        // Passo 3: Solicitar permissão de escrita para continuar o auto-save
        const permissao = await handle.requestPermission({ mode: 'readwrite' });

        // Passo 4: Restaurar estado em memória
        topicos          = dadosRestaurados;
        fileHandleBackup = handle;
        modoRetomada     = true;

        atualizarStatusBackup(
            permissao === 'granted' ? 'Sessão Restaurada ✓' : 'Restaurada (somente leitura)',
            true
        );

        renderizarTopicos();
        habilitarFerramentasDeTrabalho();
        trocarAba('historico');
        exibirToast('Anotações restauradas. Selecione agora o PDF do processo.');

        // Passo 5: Solicitar o PDF correspondente ao backup
        document.getElementById('pdf-upload').click();

    } catch (err) {
        modoRetomada = false;
        if (err.name !== 'AbortError') {
            exibirToast('Erro ao restaurar a sessão. Verifique o arquivo selecionado.', 'erro');
        }
    }
}

/* ================================================
   API DE SISTEMA DE ARQUIVOS — SALVAR BACKUP AUTOMÁTICO
   Serializa exclusivamente topicos[] (estado primário).
   Chamada silenciosamente após cada nova anotação ou criação de tópico.
   ================================================ */
async function salvarBackupAutomatico() {
    if (!fileHandleBackup) {
        console.warn('Nenhum arquivo de backup ativo. Dados apenas em memória.');
        return;
    }
    try {
        const writable = await fileHandleBackup.createWritable();
        await writable.write(JSON.stringify(topicos, null, 2));
        await writable.close();
        console.log('Backup atualizado silenciosamente.');
    } catch (err) {
        console.error('Falha no backup automático:', err);
    }
}

/* ================================================
   FLUXO: NOVO PROCESSO
   Ponto de entrada do onchange do input de PDF quando iniciando nova análise.
   - Pede confirmação se há sessão ativa com dados.
   - Reseta o estado global.
   - Chama carregarPDF(), que ao final dispara iniciarSessaoSalvamento().
   ================================================ */
async function novoProcesso(event) {
    // Proteção contra perda de dados: confirmar se há sessão ativa
    if ((topicos.length > 0 || pdfDoc) && !modoRetomada) {
        const continuar = confirm(
            'Iniciar um novo processo irá apagar as anotações em memória não salvas.\n\nDeseja continuar?'
        );
        if (!continuar) {
            event.target.value = ''; // Descarta a seleção do arquivo
            return;
        }
        // Reset do estado
        topicos          = [];
        fileHandleBackup = null;
        renderizarTopicos();
        atualizarStatusBackup('Aguardando...');
    }

    await carregarPDF(event);
}

/* ================================================
   CARREGAMENTO DO PDF E LAZY LOADING
   Responsabilidades:
   - Validar o arquivo selecionado.
   - Inicializar o PDF.js e criar os placeholders de página.
   - Configurar o IntersectionObserver para lazy rendering.
   - Ao concluir: se modoRetomada=true, apenas notifica;
     se novo processo, dispara iniciarSessaoSalvamento().
   ================================================ */
function carregarPDF(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        exibirToast('Selecione um arquivo PDF válido.', 'erro');
        return;
    }

    const fileReader = new FileReader();
    fileReader.onload = function () {
        const typedarray = new Uint8Array(this.result);

        pdfjsLib.getDocument(typedarray).promise
            .then(async pdf => {
                pdfDoc = pdf;
                console.log('PDF carregado. Total de páginas:', pdf.numPages);

                habilitarFerramentasDeTrabalho();

                const wrapper = document.getElementById('pdf-wrapper');
                wrapper.innerHTML = '';
                wrapper.style.display = 'flex';
                document.getElementById('pdf-placeholder').style.display = 'none';

                // Configura o IntersectionObserver para lazy rendering e rastreamento de página atual
                if (pdfObserver) pdfObserver.disconnect();
                pdfObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        const pageNum = parseInt(entry.target.dataset.pageNumber);

                        if (entry.isIntersecting && entry.intersectionRatio > 0.4) {
                            currentPage = pageNum;
                        }
                        if (entry.isIntersecting && entry.target.dataset.loaded === 'false') {
                            renderizarPaginaElemento(pageNum, entry.target);
                            entry.target.dataset.loaded = 'true';
                        }
                    });
                }, {
                    root: document.getElementById('pdf-container'),
                    rootMargin: '600px 0px',
                    threshold: [0, 0.5]
                });

                // Usa a primeira página para definir as dimensões dos placeholders
                const firstPage    = await pdf.getPage(1);
                const viewportCSS  = firstPage.getViewport({ scale: 1.5 });

                for (let i = 1; i <= pdf.numPages; i++) {
                    const pageContainer = document.createElement('div');
                    pageContainer.className        = 'pdf-page-container';
                    pageContainer.dataset.pageNumber = i;
                    pageContainer.dataset.loaded   = 'false';
                    pageContainer.style.cssText    = `
                        width: ${viewportCSS.width}px;
                        height: ${viewportCSS.height}px;
                        position: relative;
                        margin-bottom: 24px;
                        background-color: white;
                        box-shadow: var(--shadow-md);
                    `;
                    wrapper.appendChild(pageContainer);
                    pdfObserver.observe(pageContainer);
                }

                // Gestão de sessão pós-carregamento do PDF
                if (modoRetomada) {
                    // Retomada: dados já restaurados, apenas volta para leitura
                    modoRetomada = false;
                    trocarAba('leitura');
                    exibirToast('PDF carregado. Sessão retomada com sucesso.');
                } else {
                    // Novo processo: forçar criação do arquivo de backup
                    // Encadeado diretamente no .then(), sem setTimeout
                    exibirToast('PDF carregado! Defina onde salvar o arquivo de backup da sessão.');
                    await iniciarSessaoSalvamento();
                }
            })
            .catch(err => {
                console.error('Erro ao processar PDF:', err);
                exibirToast('Erro ao ler o PDF. Verifique a integridade do arquivo.', 'erro');
            });
    };
    fileReader.readAsArrayBuffer(file);
}

/* ================================================
   RENDERIZAÇÃO DINÂMICA (PÁGINA INDIVIDUAL)
   Renderiza o canvas HD e a camada de texto selecionável
   apenas quando a página entra no viewport (lazy loading).
   ================================================ */
async function renderizarPaginaElemento(num, container) {
    if (!pdfDoc) return;

    const page = await pdfDoc.getPage(num);
    const dpr  = window.devicePixelRatio || 1;

    const viewportHD  = page.getViewport({ scale: 1.5 * dpr });
    const viewportCSS = page.getViewport({ scale: 1.5 });

    container.style.width  = viewportCSS.width  + 'px';
    container.style.height = viewportCSS.height + 'px';

    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    canvas.width  = viewportHD.width;
    canvas.height = viewportHD.height;
    canvas.style.cssText = 'width:100%; height:100%; display:block;';

    const textLayer = document.createElement('div');
    textLayer.className  = 'textLayer';
    textLayer.style.cssText = `width:${viewportCSS.width}px; height:${viewportCSS.height}px;`;

    container.appendChild(canvas);
    container.appendChild(textLayer);

    await page.render({ canvasContext: ctx, viewport: viewportHD }).promise;

    const textContent = await page.getTextContent();
    pdfjsLib.renderTextLayer({
        textContent,
        container:  textLayer,
        viewport:   viewportCSS,
        textDivs:   []
    });
}

/* ================================================
   GESTÃO DE TÓPICOS RECURSAIS
   ================================================ */

/**
 * Abre um prompt para o usuário nomear o novo tópico,
 * valida duplicatas e o adiciona ao array topicos[].
 */
function criarTopicoPrompt() {
    const nome = prompt('Digite o nome do Tópico Recursal:\n(ex: Admissibilidade, Mérito — Dano Moral, Honorários)');
    if (!nome || !nome.trim()) return;

    const nomeLimpo  = nome.trim();
    const duplicado  = topicos.some(t => t.nome.toLowerCase() === nomeLimpo.toLowerCase());

    if (duplicado) {
        exibirToast(`Já existe um tópico com o nome "${nomeLimpo}".`, 'aviso');
        return;
    }

    const cor = CORES_TOPICOS[topicos.length % CORES_TOPICOS.length];
    topicos.push({
        id:       'topico-' + Date.now(),
        nome:     nomeLimpo,
        cor,
        anotacoes: []
    });

    renderizarTopicos();
    salvarBackupAutomatico();
    trocarAba('historico');
    exibirToast(`Tópico "${nomeLimpo}" criado.`);
}

/**
 * Re-renderiza completamente a lista de tópicos na aba Anotações.
 *
 * CORREÇÃO CRÍTICA: Captura o estado open/closed de cada accordion
 * ANTES de limpar o DOM e o restaura após a reconstrução.
 * Isso evita que rerenders colapem painéis abertos pelo usuário.
 */
function renderizarTopicos() {
    const lista = document.getElementById('lista-marcacoes');

    // Captura o estado open/closed ANTES de limpar o DOM
    const jaRenderizado = lista.querySelector('.topic-accordion') !== null;
    const openIds = new Set(
        [...lista.querySelectorAll('.topic-content.open')].map(el => el.id)
    );

    lista.innerHTML = '';

    if (topicos.length === 0) {
        lista.innerHTML = `
            <p class="empty-state">
                Nenhum tópico criado.<br>
                Use o botão <strong>+</strong> na barra lateral para criar um Tópico Recursal.
            </p>
        `;
        return;
    }

    topicos.forEach(t => {
        const contentId = `content-${t.id}`;

        // Lógica de abertura inicial vs. rerenders:
        // - Primeiro render: abre tópicos que já têm anotações (ex.: restauração de backup).
        // - Rerenders subsequentes: preserva exatamente o estado anterior.
        const isOpen = jaRenderizado ? openIds.has(contentId) : t.anotacoes.length > 0;

        const acc = document.createElement('div');
        acc.className = 'topic-accordion';
        acc.dataset.topicoId = t.id;
        acc.innerHTML = `
            <div class="topic-header" style="border-left-color: ${t.cor}" onclick="toggleTopico('${t.id}')">
                <span>${t.nome}</span>
                <span class="badge-count" id="badge-${t.id}">${t.anotacoes.length}</span>
            </div>
            <div class="topic-content ${isOpen ? 'open' : ''}" id="${contentId}"></div>
        `;
        lista.appendChild(acc);

        const contentEl = document.getElementById(contentId);
        t.anotacoes.forEach(a => contentEl.appendChild(criarCardAnotacao(a)));
    });
}

/**
 * Alterna a classe 'open' do conteúdo de um accordion pelo ID do tópico.
 */
function toggleTopico(id) {
    document.getElementById(`content-${id}`).classList.toggle('open');
}

/**
 * Fábrica de cards de anotação — separa a criação do DOM da lógica de renderização.
 * Reutilizado tanto na renderização completa quanto futuramente em appends incrementais.
 */
function criarCardAnotacao(anotacao) {
    const card = document.createElement('div');
    card.className = 'annotation-card';

    const classePolo   = anotacao.polo === 'Parte Autora' ? 'tag-autora' : 'tag-re';
    const ts           = new Date(anotacao.timestamp).toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit'
    });
    const htmlConteudo = anotacao.tipo === 'texto'
        ? `<p>"${anotacao.conteudo}"</p>`
        : `<img src="${anotacao.conteudo}" alt="Recorte capturado — Pág. ${anotacao.pagina}">`;

    card.innerHTML = `
        <div class="annotation-card-header">
            <span class="${classePolo}">[${anotacao.polo}]</span>
            <span class="tag-timestamp">${ts} — Pág. ${anotacao.pagina}</span>
        </div>
        ${htmlConteudo}
    `;
    return card;
}

/* ================================================
   CAPTURA MANUAL DE TEXTO SELECIONADO
   ================================================ */
function capturarTrechoSelecionado() {
    const selection    = window.getSelection();
    const selecaoTexto = selection.toString().trim();

    if (selecaoTexto.length > 5) {
        const range = selection.getRangeAt(0);
        const rect  = range.getBoundingClientRect();
        exibirPopupClassificacao('texto', selecaoTexto, rect.left, rect.bottom + 10);
    } else {
        exibirToast('Selecione um trecho válido no documento antes de usar esta ferramenta.', 'aviso');
    }
}

/* ================================================
   MODO RECORTE (CAPTURA DE IMAGEM DE CANVAS)
   ================================================ */
function alternarModoRecorte() {
    modoRecorteAtivo = !modoRecorteAtivo;

    const overlay    = document.getElementById('crop-overlay');
    const btn        = document.getElementById('btn-ferramenta-recorte');
    const textLayers = document.querySelectorAll('.textLayer');

    overlay.style.display = modoRecorteAtivo ? 'block' : 'none';
    textLayers.forEach(l => { l.style.pointerEvents = modoRecorteAtivo ? 'none' : 'auto'; });
    btn.classList.toggle('ativo', modoRecorteAtivo);
}

/* ================================================
   POPUP DE CLASSIFICAÇÃO
   Exibe o popup com o seletor de tópico populado dinamicamente.
   CORREÇÃO: seletor-topico está DENTRO do popup no HTML.
   ================================================ */
function exibirPopupClassificacao(tipo, conteudo, clientX, clientY) {
    if (topicos.length === 0) {
        exibirToast('Crie pelo menos um Tópico Recursal antes de extrair informações.', 'aviso');
        return;
    }

    pendingTipo     = tipo;
    pendingConteudo = conteudo;

    // Popula o seletor com os tópicos atuais
    const select = document.getElementById('seletor-topico');
    select.innerHTML = '<option value="">Selecione o Tópico...</option>';
    topicos.forEach(t => {
        const opt = document.createElement('option');
        opt.value       = t.id;
        opt.textContent = t.nome;
        select.appendChild(opt);
    });

    const popup = document.getElementById('classification-popup');
    popup.style.display = 'flex';

    // Posicionamento: garante que o popup não saia da viewport
    const W = 230, H = 190;
    const x = Math.min(clientX + 12, window.innerWidth  - W - 12);
    const y = Math.min(clientY + 12, window.innerHeight - H - 12);
    popup.style.left = x + 'px';
    popup.style.top  = y + 'px';
}

function classificarESalvar(polo) {
    const select   = document.getElementById('seletor-topico');
    const topicoId = select.value;

    if (!topicoId) {
        exibirToast('Selecione o tópico de destino antes de salvar.', 'aviso');
        return;
    }
    if (pendingTipo && pendingConteudo) {
        salvarAnotacao(pendingTipo, pendingConteudo, polo, topicoId);
    }
    fecharPopupClassificacao();
}

function fecharPopupClassificacao() {
    document.getElementById('classification-popup').style.display = 'none';
    pendingTipo     = null;
    pendingConteudo = null;
    if (window.getSelection) window.getSelection().removeAllRanges();
}

/* ================================================
   PERSISTÊNCIA DE ANOTAÇÕES
   CORREÇÃO: não troca de aba automaticamente (evita regressão de UX).
   Usa toast não-intrusivo como feedback.
   ================================================ */
function salvarAnotacao(tipo, conteudo, polo, topicoId) {
    const topicoAlvo = topicos.find(t => t.id === topicoId);
    if (!topicoAlvo) return;

    topicoAlvo.anotacoes.push({
        tipo,
        polo,
        pagina:    currentPage,
        timestamp: Date.now(),
        // Para imagens, armazena o data URL base64 completo
        conteudo:  conteudo
    });

    renderizarTopicos();      // Re-render com preservação do estado dos accordions
    salvarBackupAutomatico(); // Serializa topicos[] no arquivo de backup
    exibirToast(`Anotação salva em "${topicoAlvo.nome}".`);
    // Não troca de aba: o usuário permanece na leitura para continuar a análise.
}

/* ================================================
   EVENT LISTENERS PERMANENTES (DOM)
   ================================================ */
const overlay = document.getElementById('crop-overlay');

overlay.addEventListener('mousedown', function (e) {
    const rect = overlay.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    if (cropBox) cropBox.remove();
    cropBox = document.createElement('div');
    cropBox.id = 'crop-box';
    cropBox.style.cssText = `left:${startX}px; top:${startY}px; width:0; height:0;`;
    overlay.appendChild(cropBox);
});

overlay.addEventListener('mousemove', function (e) {
    if (!cropBox) return;
    const rect = overlay.getBoundingClientRect();
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;
    cropBox.style.width  = Math.abs(curX - startX) + 'px';
    cropBox.style.height = Math.abs(curY - startY) + 'px';
    cropBox.style.left   = Math.min(startX, curX)  + 'px';
    cropBox.style.top    = Math.min(startY, curY)  + 'px';
});

overlay.addEventListener('mouseup', function (e) {
    if (!cropBox) return;

    const cropW = parseInt(cropBox.style.width);
    const cropH = parseInt(cropBox.style.height);

    if (cropW < 5 || cropH < 5) {
        cropBox.remove();
        cropBox = null;
        return;
    }

    const canvas = document.querySelector(
        `.pdf-page-container[data-page-number="${currentPage}"] canvas`
    );
    if (!canvas) {
        cropBox.remove();
        cropBox = null;
        alternarModoRecorte();
        return;
    }

    const dpr = window.devicePixelRatio || 1;
    const sx  = parseInt(cropBox.style.left) * dpr;
    const sy  = parseInt(cropBox.style.top)  * dpr;
    const sw  = cropW * dpr;
    const sh  = cropH * dpr;

    const recorteCanvas = document.createElement('canvas');
    recorteCanvas.width  = sw;
    recorteCanvas.height = sh;

    try {
        recorteCanvas.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
        const imageDataUrl = recorteCanvas.toDataURL('image/png');
        exibirPopupClassificacao('imagem', imageDataUrl, e.clientX, e.clientY);
    } catch (err) {
        // Coordenadas relativas ao scroll do container serão corrigidas no Roadmap v3
        console.warn('Ajuste de coordenadas em desenvolvimento para scroll do container.', err);
        exibirToast('Recorte fora do canvas renderizado. Role a página e tente novamente.', 'aviso');
    }

    cropBox.remove();
    cropBox = null;
    alternarModoRecorte();
});

// Fechar popup ao clicar fora dele
document.addEventListener('click', function (e) {
    const popup = document.getElementById('classification-popup');
    if (
        popup.style.display === 'flex' &&
        !popup.contains(e.target) &&
        !e.target.closest('.icon-btn')
    ) {
        fecharPopupClassificacao();
    }
});

// Fechar popup e desativar modo recorte com Escape
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        fecharPopupClassificacao();
        if (modoRecorteAtivo) alternarModoRecorte();
    }
});
