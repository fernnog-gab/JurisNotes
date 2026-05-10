/* ================================================
   ESTADO GLOBAL DA APLICAÇÃO
   ================================================ */
let fileHandleBackup  = null;   
let historicoAnotacoes = [];    
let pdfDoc             = null;  
let currentPage        = 1;     

let modoRecorteAtivo = false;
let startX, startY;
let cropBox = null;

let pendingTipo     = null;
let pendingConteudo = null;
let pdfObserver     = null;

/* ================================================
   GERENCIAMENTO DE INTERFACE (ABAS)
   ================================================ */
function trocarAba(aba) {
    document.getElementById('pdf-container').style.display = aba === 'leitura' ? 'flex' : 'none';
    document.getElementById('history-container').style.display = aba === 'historico' ? 'block' : 'none';
    document.getElementById('tab-leitura').classList.toggle('active', aba === 'leitura');
    document.getElementById('tab-historico').classList.toggle('active', aba === 'historico');
}

/* ================================================
   API DE SISTEMA DE ARQUIVOS (BACKUP)
   ================================================ */
async function iniciarSessaoSalvamento() {
    try {
        const options = {
            suggestedName: 'backup_anotacoes.json',
            types: [{
                description: 'Arquivo de Backup JSON',
                accept: { 'application/json': ['.json'] }
            }]
        };
        fileHandleBackup = await window.showSaveFilePicker(options);

        const statusEl = document.getElementById('status-backup');
        statusEl.textContent = 'Sessão Ativa ✓';
        statusEl.classList.add('ativa');

        alert('Sessão iniciada! Todas as marcações serão salvas automaticamente neste arquivo.');
    } catch (err) {
        if (err.name !== 'AbortError') {
            alert('Erro ao criar arquivo de backup. Verifique as permissões do navegador.');
        }
    }
}

async function salvarBackupAutomatico() {
    if (!fileHandleBackup) {
        console.warn('Nenhuma sessão ativa. Dados apenas na memória RAM.');
        return;
    }
    try {
        const writable = await fileHandleBackup.createWritable();
        await writable.write(JSON.stringify(historicoAnotacoes, null, 2));
        await writable.close();
        console.log('Backup atualizado silenciosamente.');
    } catch (err) {
        console.error('Falha no backup automático:', err);
    }
}

/* ================================================
   CARREGAMENTO DO PDF E LAZY LOADING
   ================================================ */
function carregarPDF(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        alert('Por favor, selecione um arquivo PDF válido.');
        return;
    }

    const fileReader = new FileReader();
    fileReader.onload = function () {
        const typedarray = new Uint8Array(this.result);

        pdfjsLib.getDocument(typedarray).promise
            .then(async pdf => {
                pdfDoc = pdf;
                console.log('PDF carregado. Total de páginas:', pdf.numPages);
                
                document.getElementById('btn-ferramenta-recorte').disabled = false;
                document.getElementById('btn-ferramenta-texto').disabled = false;
                
                const wrapper = document.getElementById('pdf-wrapper');
                wrapper.innerHTML = ''; 
                wrapper.style.display = 'flex';
                document.getElementById('pdf-placeholder').style.display = 'none';

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

                const firstPage = await pdf.getPage(1);
                const viewportCSS = firstPage.getViewport({ scale: 1.5 });

                for (let i = 1; i <= pdf.numPages; i++) {
                    const pageContainer = document.createElement('div');
                    pageContainer.className = 'pdf-page-container';
                    pageContainer.dataset.pageNumber = i;
                    pageContainer.dataset.loaded = 'false';
                    
                    pageContainer.style.width = viewportCSS.width + 'px';
                    pageContainer.style.height = viewportCSS.height + 'px';
                    pageContainer.style.position = 'relative';
                    pageContainer.style.marginBottom = '24px';
                    pageContainer.style.backgroundColor = 'white';
                    pageContainer.style.boxShadow = 'var(--shadow-md)';

                    wrapper.appendChild(pageContainer);
                    pdfObserver.observe(pageContainer);
                }
            })
            .catch(err => {
                console.error('Erro ao processar PDF:', err);
                alert('Ocorreu um erro ao ler o Inteiro Teor. Verifique a integridade do arquivo.');
            });
    };
    fileReader.readAsArrayBuffer(file);
}

/* ================================================
   RENDERIZAÇÃO DINÂMICA (PÁGINA INDIVIDUAL)
   ================================================ */
async function renderizarPaginaElemento(num, container) {
    if (!pdfDoc) return;

    const page = await pdfDoc.getPage(num);
    const dpr = window.devicePixelRatio || 1;

    const viewportHD  = page.getViewport({ scale: 1.5 * dpr });
    const viewportCSS = page.getViewport({ scale: 1.5 });

    container.style.width = viewportCSS.width + 'px';
    container.style.height = viewportCSS.height + 'px';

    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');

    canvas.width  = viewportHD.width;
    canvas.height = viewportHD.height;
    canvas.style.width  = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';

    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    textLayer.style.width = viewportCSS.width + 'px';
    textLayer.style.height = viewportCSS.height + 'px';

    container.appendChild(canvas);
    container.appendChild(textLayer);

    await page.render({ canvasContext: ctx, viewport: viewportHD }).promise;

    const textContent = await page.getTextContent();
    pdfjsLib.renderTextLayer({
        textContent: textContent,
        container:   textLayer,
        viewport:    viewportCSS,
        textDivs:    []
    });
}

/* ================================================
   CAPTURA MANUAL DE TEXTO SELECIONADO
   ================================================ */
function capturarTrechoSelecionado() {
    const selection = window.getSelection();
    const selecaoTexto = selection.toString().trim();
    
    if (selecaoTexto.length > 5) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        const posX = rect.left; 
        const posY = rect.bottom + 10; 
        
        exibirPopupClassificacao('texto', selecaoTexto, posX, posY);
    } else {
        alert("Aviso: Por favor, selecione previamente um trecho válido no documento antes de acionar a ferramenta de extração.");
    }
}

/* ================================================
   MODO RECORTE (CAPTURA DE IMAGEM)
   ================================================ */
function alternarModoRecorte() {
    modoRecorteAtivo = !modoRecorteAtivo;

    const overlay   = document.getElementById('crop-overlay');
    const btn       = document.getElementById('btn-ferramenta-recorte');
    
    const textLayers = document.querySelectorAll('.textLayer');

    overlay.style.display = modoRecorteAtivo ? 'block' : 'none';
    
    textLayers.forEach(layer => {
        layer.style.pointerEvents = modoRecorteAtivo ? 'none' : 'auto';
    });

    btn.classList.toggle('ativo', modoRecorteAtivo);
}

/* ================================================
   POPUP DE CLASSIFICAÇÃO (CHIPS)
   ================================================ */
function exibirPopupClassificacao(tipo, conteudo, clientX, clientY) {
    pendingTipo     = tipo;
    pendingConteudo = conteudo;

    const popup   = document.getElementById('classification-popup');
    popup.style.display = 'flex';

    const W = 220, H = 130;
    const x = Math.min(clientX + 12, window.innerWidth  - W - 12);
    const y = Math.min(clientY + 12, window.innerHeight - H - 12);
    
    popup.style.left = x + 'px';
    popup.style.top  = y + 'px';
}

function classificarESalvar(polo) {
    if (pendingTipo && pendingConteudo) {
        salvarAnotacao(pendingTipo, pendingConteudo, polo);
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
   ================================================ */
function salvarAnotacao(tipo, conteudo, polo) {
    const lista      = document.getElementById('lista-marcacoes');
    const classePolo = polo === 'Parte Autora' ? 'tag-autora' : 'tag-re';
    const timestamp  = new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit'
    });

    const card = document.createElement('div');
    card.className = 'annotation-card';

    const htmlConteudo = tipo === 'texto'
        ? `<p>"${conteudo}"</p>`
        : `<img src="${conteudo}" alt="Recorte capturado do processo — Pág. ${currentPage}">`;

    card.innerHTML = `
        <div class="annotation-card-header">
            <span class="${classePolo}">[${polo}]</span>
            <span class="tag-timestamp">${timestamp} — Pág. ${currentPage}</span>
        </div>
        ${htmlConteudo}
    `;

    lista.prepend(card);

    historicoAnotacoes.push({
        tipo,
        polo,
        pagina:    currentPage,
        timestamp: Date.now(),
        conteudo:  tipo === 'texto' ? conteudo : '[imagem_base64]'
    });

    salvarBackupAutomatico();
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
    cropBox.style.cssText = `left:${startX}px; top:${startY}px; width:0px; height:0px;`;
    overlay.appendChild(cropBox);
});

overlay.addEventListener('mousemove', function (e) {
    if (!cropBox) return;
    const rect   = overlay.getBoundingClientRect();
    const curX   = e.clientX - rect.left;
    const curY   = e.clientY - rect.top;
    cropBox.style.width  = Math.abs(curX - startX) + 'px';
    cropBox.style.height = Math.abs(curY - startY) + 'px';
    cropBox.style.left   = Math.min(startX, curX) + 'px';
    cropBox.style.top    = Math.min(startY, curY) + 'px';
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

    // Lógica provisória: capturará o que está visível na tela em relação à área
    // Será aprimorada na próxima atualização matemática
    const container = document.querySelector(`.pdf-page-container[data-page-number="${currentPage}"] canvas`);
    if(!container) {
         cropBox.remove();
         cropBox = null;
         alternarModoRecorte();
         return;
    }

    const dpr    = window.devicePixelRatio || 1;
    const sx = parseInt(cropBox.style.left) * dpr;
    const sy = parseInt(cropBox.style.top)  * dpr;
    const sw = cropW * dpr;
    const sh = cropH * dpr;

    const recorteCanvas = document.createElement('canvas');
    recorteCanvas.width  = sw;
    recorteCanvas.height = sh;
    
    try {
        recorteCanvas.getContext('2d').drawImage(container, sx, sy, sw, sh, 0, 0, sw, sh);
        const imageDataUrl = recorteCanvas.toDataURL('image/png');
        exibirPopupClassificacao('imagem', imageDataUrl, e.clientX, e.clientY);
    } catch(err) {
        console.warn("Ajuste de coordenadas em desenvolvimento para rolagem infinita.", err);
    }

    cropBox.remove();
    cropBox = null;
    alternarModoRecorte();
});

document.addEventListener('click', function (e) {
    const popup = document.getElementById('classification-popup');
    if (popup.style.display === 'flex' && !popup.contains(e.target) && !e.target.closest('.icon-btn')) {
        fecharPopupClassificacao();
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        fecharPopupClassificacao();
        if (modoRecorteAtivo) alternarModoRecorte();
    }
});
