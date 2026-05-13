/* ================================================
   interaction-tools.js  —  v1.0
   Ferramentas interativas de captura e classificação.

   Responsabilidades:
   - Wizard de Recorte de Imagem (state-machine de 3 estados)
   - Popup de Classificação de Texto
   - Event Listeners do Overlay de Recorte

   Dependências externas (definidas em app.js, carregado após):
   - topicos[], currentPage           → leitura/escrita de estado global
   - salvarAnotacao(), renderizarTopicos(), exibirToast()  → chamadas de serviço
   ================================================ */

/* ================================================
   REFERÊNCIA AO OVERLAY (DOM já disponível: script no fim do <body>)
   ================================================ */
const overlay = document.getElementById('crop-overlay');

/* ================================================
   ESTADO DO WIZARD DE RECORTE
   ================================================ */
let modoRecorteAtivo         = false;
let startX, startY;
let cropBox                  = null;
let _wizardTopicoSelecionado = null;  // ID do tópico confirmado no Passo 1
let _wizardImagemCapturada   = null;  // Data URL base64 do recorte confirmado
let _ultimoTopicoUsadoId     = null;  // Memória inteligente: pré-seleciona na próxima abertura

/* ================================================
   ESTADO DO POPUP DE CLASSIFICAÇÃO
   ================================================ */
let pendingTipo     = null;   // Tipo da extração pendente: 'texto' | 'imagem'
let pendingConteudo = null;   // Conteúdo bruto da extração pendente

// --- CONFIGURAÇÃO CENTRAL DE DOCUMENTOS ---
const DOC_CONFIG = [
    { label: 'Petição Inicial',           polo: 'Parte Autora', tipo: 'auto'   },
    { label: 'Contestação',               polo: 'Parte Ré',     tipo: 'auto'   },
    { label: 'Impugnação à Contestação',  polo: 'Parte Autora', tipo: 'auto'   },
    { label: 'Recurso Ordinário',         polo: null,           tipo: 'dual'   },
    { label: 'Recurso Adesivo',           polo: null,           tipo: 'dual'   },
    { label: 'Contrarrazões',             polo: null,           tipo: 'dual'   },
    { label: 'Quesitos',                  polo: null,           tipo: 'dual'   },
    { label: 'Quesitos Complementares',   polo: null,           tipo: 'dual'   },
    { label: 'Sentença',                  polo: 'Juízo',        tipo: 'neutro' },
    { label: 'Sentença de Embargos de Declaração', polo: 'Juízo', tipo: 'neutro' },
    { label: 'Laudo Pericial',            polo: 'Perito',       tipo: 'neutro' },
];

let _docSelecionado = null;
let _isWizardContext = false;
let _pendingTargetIndex = null;

function renderizarListaDocumentos(containerId, context) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    DOC_CONFIG.forEach(doc => {
        const btn = document.createElement('button');
        btn.className = `doc-btn ${doc.tipo === 'dual' ? 'dual' : doc.tipo === 'neutro' ? 'neutro' : ''}`;
        btn.textContent = doc.label;
        btn.onclick = (e) => {
            e.stopPropagation();
            selecionarDocumento(doc.label, doc.polo || 'DUAL', context);
        };
        container.appendChild(btn);
    });
}

function toggleAgruparPopup() {
    const agrupar = document.querySelector('input[name="modo_agrupar_popup"]:checked').value === 'agrupar';
    const input = document.getElementById('input-ideia-popup');
    input.style.display = agrupar ? 'block' : 'none';
    if(agrupar) input.focus();
}

function toggleAgruparWizard() {
    const agrupar = document.querySelector('input[name="modo_agrupar_wizard"]:checked').value === 'agrupar';
    const input = document.getElementById('input-ideia-wizard');
    input.style.display = agrupar ? 'block' : 'none';
    if(agrupar) input.focus();
}

function processarAgrupamento(topicoId, inputId) {
    const isWizard = inputId.includes('wizard');
    const radioName = isWizard ? 'modo_agrupar_wizard' : 'modo_agrupar_popup';
    
    if (document.querySelector(`input[name="${radioName}"]:checked`).value === 'agrupar') {
        const topico = topicos.find(t => t.id === topicoId);
        const numero = parseInt(document.getElementById(inputId).value, 10);
        
        if (isNaN(numero) || numero < 1 || numero > topico.anotacoes.length) {
            exibirToast(`Número inválido. O tópico tem ${topico.anotacoes.length} ideia(s).`, 'erro');
            return false;
        }
        return numero - 1; // Retorna índice base 0
    }
    return null;
}

function selecionarDocumento(docLabel, polo, context) {
    const topicoId = context === 'popup' ? document.getElementById('seletor-topico').value : _wizardTopicoSelecionado;
    if (!topicoId) { exibirToast('Selecione o tópico de destino primeiro.', 'aviso'); return; }

    const inputId = context === 'popup' ? 'input-ideia-popup' : 'input-ideia-wizard';
    const targetIndex = processarAgrupamento(topicoId, inputId);
    if (targetIndex === false) return;

    _pendingTargetIndex = targetIndex;

    if (polo === 'DUAL') {
        _docSelecionado = docLabel;
        _isWizardContext = (context === 'wizard');
        document.getElementById(`${context}-step-doc`).style.display = 'none';
        document.getElementById(`${context}-doc-selecionado`).textContent = docLabel;
        document.getElementById(`${context}-step-polo`).style.display = 'block';
    } else {
        executarSalvamento(docLabel, polo, topicoId, _pendingTargetIndex, context);
    }
}

function confirmarPolo(polo, event) {
    if(event) event.stopPropagation();
    const context = _isWizardContext ? 'wizard' : 'popup';
    const topicoId = context === 'popup' ? document.getElementById('seletor-topico').value : _wizardTopicoSelecionado;
    executarSalvamento(_docSelecionado, polo, topicoId, _pendingTargetIndex, context);
}

function voltarParaDocumentos(context, event) {
    if(event) event.stopPropagation();
    document.getElementById(`${context}-step-polo`).style.display = 'none';
    document.getElementById(`${context}-step-doc`).style.display = 'block';
    _docSelecionado = null;
}

function executarSalvamento(docLabel, polo, topicoId, targetIndex, context) {
    if (context === 'popup') {
        const comentario = document.getElementById('comentario-input').value.trim();
        salvarAnotacao(pendingTipo, pendingConteudo, docLabel, polo, topicoId, comentario, targetIndex);
        fecharPopupClassificacao();
    } else {
        _ultimoTopicoUsadoId = topicoId;
        const comentario = document.getElementById('crop-comment-input').value.trim();
        salvarAnotacao('imagem', _wizardImagemCapturada, docLabel, polo, topicoId, comentario, targetIndex);
        fecharTudoWizard();
    }
}

/* ================================================
   WIZARD DE RECORTE DE IMAGEM
   State-machine de 3 estados:
   IDLE → PASSO_1 (seleção de tópico) →
   RECORTANDO (overlay ativo) → PASSO_2 (confirmação)
   ================================================ */

/**
 * PASSO 0 — Ponto de entrada.
 * Abre o Passo 1 do wizard (seleção de tópico).
 * Bloqueia a interface com o backdrop.
 */
function iniciarRecorteWizard() {
    if (topicos.length === 0) {
        exibirToast('Crie pelo menos um Tópico Recursal antes de realizar recortes.', 'aviso');
        return;
    }

    const select = document.getElementById('crop-topic-select');
    select.innerHTML = '<option value="">Selecione o Tópico...</option>';
    topicos.forEach(t => select.appendChild(new Option(t.nome, t.id)));

    // Memória inteligente: pré-seleciona o último tópico utilizado
    if (_ultimoTopicoUsadoId) select.value = _ultimoTopicoUsadoId;

    document.getElementById('wizard-backdrop').style.display  = 'block';
    document.getElementById('crop-wizard-step1').style.display = 'flex';
}

/**
 * PASSO 1 → RECORTANDO.
 * Valida o tópico selecionado, fecha o Passo 1 e ativa o overlay de recorte.
 */
function avancarParaRecorte() {
    const topicoId = document.getElementById('crop-topic-select').value;
    if (!topicoId) {
        exibirToast('Selecione um tópico para continuar.', 'aviso');
        return;
    }

    _wizardTopicoSelecionado = topicoId;
    document.getElementById('crop-wizard-step1').style.display = 'none';
    document.getElementById('wizard-backdrop').style.display   = 'none';

    modoRecorteAtivo = true;
    const r = document.getElementById('pdf-container').getBoundingClientRect();
    overlay.style.position = 'fixed';
    overlay.style.left     = r.left   + 'px';
    overlay.style.top      = r.top    + 'px';
    overlay.style.width    = r.width  + 'px';
    overlay.style.height   = r.height + 'px';
    overlay.style.display  = 'block';

    document.querySelectorAll('.textLayer').forEach(l => l.style.pointerEvents = 'none');
    document.getElementById('btn-ferramenta-recorte').classList.add('ativo');
    exibirToast('Tópico confirmado. Arraste o mouse sobre o documento para recortar.', 'sucesso');
}

/**
 * RECORTANDO → IDLE.
 * Esconde o overlay e restaura os event listeners do texto.
 */
function desativarOverlayRecorte() {
    modoRecorteAtivo = false;
    overlay.style.display = 'none';
    document.getElementById('btn-ferramenta-recorte').classList.remove('ativo');
    document.querySelectorAll('.textLayer').forEach(l => l.style.pointerEvents = 'auto');
}

/**
 * RECORTANDO → PASSO_2.
 * Desativa o overlay e exibe o Passo 2 com a pré-visualização da imagem.
 */
function abrirConfirmacaoRecorteWizard() {
    desativarOverlayRecorte();
    document.getElementById('crop-preview-img').src = _wizardImagemCapturada;
    document.getElementById('crop-comment-input').value = '';
    
    // NOVO: Resetar modal e popular seletor com o tópico escolhido no Passo 1
    document.querySelector('input[name="modo_agrupar_wizard"][value="nova"]').checked = true;
    toggleAgruparWizard();
    
    renderizarListaDocumentos('lista-docs-wizard', 'wizard');

    document.getElementById('wizard-backdrop').style.display = 'block';
    document.getElementById('crop-wizard-step2').style.display = 'flex';
}

/**
 * PASSO_2 → IDLE.
 * Salva a anotação com o polo selecionado e encerra o wizard.
 */
function finalizarRecorteWizard(polo) {
    const comentario = document.getElementById('crop-comment-input').value.trim();
    _ultimoTopicoUsadoId = _wizardTopicoSelecionado;
    
    let targetIndex = null;
    if (document.querySelector('input[name="modo_agrupar_wizard"]:checked').value === 'agrupar') {
        targetIndex = document.getElementById('seletor-ideia-wizard').value;
    }

    salvarAnotacao('imagem', _wizardImagemCapturada, polo, _wizardTopicoSelecionado, comentario, targetIndex);
    fecharTudoWizard();
}

/**
 * PASSO_2 → RECORTANDO.
 * Volta ao overlay sem retornar ao Passo 1: o tópico já foi escolhido.
 */
function refazerRecorteArea() {
    document.getElementById('crop-wizard-step2').style.display = 'none';
    document.getElementById('wizard-backdrop').style.display   = 'none';
    avancarParaRecorte();
}

/**
 * QUALQUER ESTADO → IDLE.
 * Cancela o wizard por completo, fechando todos os painéis e limpando o estado.
 */
function cancelarRecorteWizard() {
    fecharTudoWizard();
    desativarOverlayRecorte();
}

/** Utilitário interno: fecha os painéis visuais e zera as variáveis de estado. */
function fecharTudoWizard() {
    document.getElementById('crop-wizard-step1').style.display = 'none';
    document.getElementById('crop-wizard-step2').style.display = 'none';
    document.getElementById('wizard-backdrop').style.display   = 'none';
    _wizardTopicoSelecionado = null;
    _wizardImagemCapturada   = null;
}

/* ================================================
   POPUP DE CLASSIFICAÇÃO DE TEXTO
   ================================================ */

function fecharPopupClassificacao() {
    const popup = document.getElementById('classification-popup');
    popup.style.display = 'none';

    document.getElementById('popup-step-polo').style.display = 'none';
    document.getElementById('popup-step-doc').style.display = 'block';
    document.getElementById('input-ideia-popup').value = '';

    const txtArea = document.getElementById('comentario-input');
    if (txtArea) {
        txtArea.style.display = 'none';
        txtArea.value = '';
    }
    pendingTipo = null;
    pendingConteudo = null;
    if (window.getSelection) window.getSelection().removeAllRanges();
}

function exibirPopupClassificacao(tipo, conteudo) {
    if (topicos.length === 0) {
        exibirToast('Crie pelo menos um Tópico Recursal.', 'aviso'); return;
    }
    pendingTipo = tipo;
    pendingConteudo = conteudo;

    const select = document.getElementById('seletor-topico');
    select.innerHTML = '<option value="">Selecione o Tópico...</option>';
    topicos.forEach(t => select.appendChild(new Option(t.nome, t.id)));

    document.getElementById('agrupamento-popup-box').style.display = 'none';
    document.querySelector('input[name="modo_agrupar_popup"][value="nova"]').checked = true;
    toggleAgruparPopup();

    renderizarListaDocumentos('lista-docs-popup', 'popup');

    const popup = document.getElementById('classification-popup');
    popup.style.display = 'flex';
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%, -50%)';

    const txtArea = document.getElementById('comentario-input');
    txtArea.value = '';
    if (tipo === 'imagem') {
        txtArea.style.display = 'block';
        requestAnimationFrame(() => requestAnimationFrame(() => txtArea.focus()));
    } else {
        txtArea.style.display = 'none';
    }
}

document.getElementById('seletor-topico').addEventListener('change', (e) => {
    const box = document.getElementById('agrupamento-popup-box');
    box.style.display = e.target.value ? 'flex' : 'none';
});

/* ================================================
   EVENT LISTENERS PERMANENTES DO OVERLAY DE RECORTE
   ================================================ */

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

    const cropW = parseFloat(cropBox.style.width);
    const cropH = parseFloat(cropBox.style.height);

    if (cropW < 5 || cropH < 5) {
        cropBox.remove();
        cropBox = null;
        return;
    }

    const overlayRect = overlay.getBoundingClientRect();
    const cropLeft = parseFloat(cropBox.style.left) + overlayRect.left;
    const cropTop  = parseFloat(cropBox.style.top)  + overlayRect.top;

    const cropCenterX = cropLeft + cropW / 2;
    const cropCenterY = cropTop  + cropH / 2;

    let targetContainer = null;
    document.querySelectorAll('.pdf-page-container').forEach(container => {
        const r = container.getBoundingClientRect();
        if (cropCenterX >= r.left && cropCenterX <= r.right &&
            cropCenterY >= r.top  && cropCenterY <= r.bottom) {
            targetContainer = container;
        }
    });

    if (!targetContainer) {
        cropBox.remove();
        cropBox = null;
        exibirToast('Selecione uma área dentro de uma página do documento.', 'aviso');
        desativarOverlayRecorte();
        return;
    }

    const canvas = targetContainer.querySelector('canvas');
    if (!canvas) {
        cropBox.remove();
        cropBox = null;
        exibirToast('Página ainda sendo renderizada. Aguarde um instante e tente novamente.', 'aviso');
        return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const relX = cropLeft - canvasRect.left;
    const relY = cropTop  - canvasRect.top;

    const srcX = Math.max(0, relX);
    const srcY = Math.max(0, relY);
    const srcW = Math.min(cropW - Math.max(0, -relX), canvasRect.width  - srcX);
    const srcH = Math.min(cropH - Math.max(0, -relY), canvasRect.height - srcY);

    if (srcW <= 0 || srcH <= 0) {
        cropBox.remove();
        cropBox = null;
        exibirToast('Selecione uma área dentro da página do documento.', 'aviso');
        desativarOverlayRecorte();
        return;
    }

    const scaleX = canvas.width  / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;

    const recorteCanvas = document.createElement('canvas');
    recorteCanvas.width  = Math.round(srcW * scaleX);
    recorteCanvas.height = Math.round(srcH * scaleY);

    try {
        recorteCanvas.getContext('2d').drawImage(
            canvas,
            Math.round(srcX * scaleX), Math.round(srcY * scaleY),
            recorteCanvas.width,       recorteCanvas.height,
            0, 0,
            recorteCanvas.width,       recorteCanvas.height
        );
        const imageDataUrl = recorteCanvas.toDataURL('image/png');

        currentPage = parseInt(targetContainer.dataset.pageNumber);

        _wizardImagemCapturada = imageDataUrl;
        abrirConfirmacaoRecorteWizard();
    } catch (err) {
        console.error('Erro ao processar recorte:', err);
        exibirToast('Erro ao processar o recorte. Tente novamente.', 'erro');
    }

    cropBox.remove();
    cropBox = null;
    desativarOverlayRecorte();
});
