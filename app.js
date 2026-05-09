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
   CARREGAMENTO DO PDF
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
            .then(pdf => {
                pdfDoc = pdf;
                console.log('PDF carregado. Total de páginas:', pdf.numPages);
                
                // Habilita as ferramentas na barra lateral
                document.getElementById('btn-ferramenta-recorte').disabled = false;
                document.getElementById('btn-ferramenta-texto').disabled = false;
                
                renderizarPagina(1);
            })
            .catch(err => {
                console.error('Erro ao processar PDF:', err);
                alert('Ocorreu um erro ao ler o Inteiro Teor. Verifique se o arquivo não está protegido por senha.');
            });
    };
    fileReader.readAsArrayBuffer(file);
}

/* ================================================
   RENDERIZAÇÃO DE PÁGINA
   ================================================ */
async function renderizarPagina(num) {
    if (!pdfDoc) return;
    currentPage = num;

    const page = await pdfDoc.getPage(num);
    const dpr = window.devicePixelRatio || 1;

    const viewportHD  = page.getViewport({ scale: 1.5 * dpr });
    const viewportCSS = page.getViewport({ scale: 1.5 });

    const canvas = document.getElementById('pdf-canvas');
    const ctx    = canvas.getContext('2d');

    canvas.width  = viewportHD.width;
    canvas.height = viewportHD.height;
    canvas.style.width  = viewportCSS.width  + 'px';
    canvas.style.height = viewportCSS.height + 'px';

    const wrapper = document.getElementById('pdf-wrapper');
    wrapper.style.width  = viewportCSS.width  + 'px';
    wrapper.style.height = viewportCSS.height + 'px';

    await page.render({ canvasContext: ctx, viewport: viewportHD }).promise;

    const textContent = await page.getTextContent();
    const textLayer   = document.getElementById('text-layer');
    textLayer.innerHTML = ''; 

    pdfjsLib.renderTextLayer({
        textContent: textContent,
        container:   textLayer,
        viewport:    viewportCSS,
        textDivs:    []
    });

    document.getElementById('pdf-placeholder').style.display = 'none';
    wrapper.style.display = 'block';
}

/* ================================================
   CAPTURA MANUAL DE TEXTO SELECIONADO
   ================================================ */
function capturarTrechoSelecionado() {
    const selection = window.getSelection();
    const selecaoTexto = selection.toString().trim();
    
    if (selecaoTexto.length > 5) {
        // Calcula as coordenadas exatas da seleção do usuário
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Posiciona o popup ligeiramente abaixo da seleção
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
    const textLayer = document.getElementById('text-layer');
    const btn       = document.getElementById('btn-ferramenta-recorte');

    overlay.style.display = modoRecorteAtivo ? 'block' : 'none';
    textLayer.style.pointerEvents = modoRecorteAtivo ? 'none' : 'auto';

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

    const canvas = document.getElementById('pdf-canvas');
    const dpr    = window.devicePixelRatio || 1;

    const sx = parseInt(cropBox.style.left) * dpr;
    const sy = parseInt(cropBox.style.top)  * dpr;
    const sw = cropW * dpr;
    const sh = cropH * dpr;

    const recorteCanvas = document.createElement('canvas');
    recorteCanvas.width  = sw;
    recorteCanvas.height = sh;
    recorteCanvas.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

    const imageDataUrl = recorteCanvas.toDataURL('image/png');

    cropBox.remove();
    cropBox = null;

    alternarModoRecorte();
    exibirPopupClassificacao('imagem', imageDataUrl, e.clientX, e.clientY);
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
