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

function toggleAgruparPopup() {
    const agrupar = document.querySelector('input[name="modo_agrupar_popup"]:checked').value === 'agrupar';
    document.getElementById('seletor-ideia-popup').style.display = agrupar ? 'block' : 'none';
}

function toggleAgruparWizard() {
    const agrupar = document.querySelector('input[name="modo_agrupar_wizard"]:checked').value === 'agrupar';
    document.getElementById('seletor-ideia-wizard').style.display = agrupar ? 'block' : 'none';
}

function popularSelectIdeias(topicoId, selectId, radioName) {
    const select = document.getElementById(selectId);
    select.innerHTML = '';
    const topico = topicos.find(t => t.id === topicoId);
    const radios = document.querySelectorAll(`input[name="${radioName}"]`);
    
    if (!topico || !topico.anotacoes || topico.anotacoes.length === 0) {
        select.innerHTML = '<option value="">(Nenhuma ideia criada ainda)</option>';
        radios[0].checked = true;
        radios[1].disabled = true;
        select.style.display = 'none';
        return;
    }
    
    radios[1].disabled = false;
    topico.anotacoes.forEach((an, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        const prev = an.tipo === 'texto' ? an.conteudo.substring(0, 35) + '...' : '[Imagem Recortada]';
        opt.textContent = `Nº ${idx + 1} — ${an.polo} (fl. ${an.pagina}) — ${prev}`;
        select.appendChild(opt);
    });
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
    popularSelectIdeias(_wizardTopicoSelecionado, 'seletor-ideia-wizard', 'modo_agrupar_wizard');

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

function exibirPopupClassificacao(tipo, conteudo, clientX, clientY) {
    if (topicos.length === 0) {
        exibirToast('Crie pelo menos um Tópico Recursal antes de extrair informações.', 'aviso');
        return;
    }

    pendingTipo     = tipo;
    pendingConteudo = conteudo;

    const select = document.getElementById('seletor-topico');
    select.innerHTML = '<option value="">Selecione o Tópico...</option>';
    topicos.forEach(t => {
        const opt = document.createElement('option');
        opt.value       = t.id;
        opt.textContent = t.nome;
        select.appendChild(opt);
    });

    document.getElementById('agrupamento-popup-box').style.display = 'none';
    document.querySelector('input[name="modo_agrupar_popup"][value="nova"]').checked = true;
    toggleAgruparPopup();

    const popup = document.getElementById('classification-popup');

    popup.style.display    = 'flex';
    popup.style.visibility = 'hidden';

    const { width: popupW, height: popupH } = popup.getBoundingClientRect();

    let x = clientX + 12;
    let y = clientY + 12;

    if (x + popupW > window.innerWidth)  x = window.innerWidth  - popupW - 12;
    if (y + popupH > window.innerHeight) y = clientY - popupH - 12;
    if (y < 0) y = 8;
    if (x < 0) x = 8;

    popup.style.left = x + 'px';
    popup.style.top  = y + 'px';

    const txtArea = document.getElementById('comentario-input');
    txtArea.value = '';
    if (tipo === 'imagem') {
        txtArea.style.display = 'block';
        requestAnimationFrame(() => requestAnimationFrame(() => txtArea.focus()));
    } else {
        txtArea.style.display = 'none';
    }

    popup.style.visibility = 'visible';
}

function classificarESalvar(polo) {
    const topicoId = document.getElementById('seletor-topico').value;
    if (!topicoId) { exibirToast('Selecione o tópico de destino.', 'aviso'); return; }

    let targetIndex = null;
    if (document.querySelector('input[name="modo_agrupar_popup"]:checked').value === 'agrupar') {
        targetIndex = document.getElementById('seletor-ideia-popup').value;
    }

    if (pendingTipo && pendingConteudo) {
        const comentario = document.getElementById('comentario-input').value.trim();
        salvarAnotacao(pendingTipo, pendingConteudo, polo, topicoId, comentario, targetIndex);
    }
    fecharPopupClassificacao();
}

function fecharPopupClassificacao() {
    document.getElementById('classification-popup').style.display = 'none';

    const txtArea = document.getElementById('comentario-input');
    if (txtArea) {
        txtArea.style.display = 'none';
        txtArea.value = '';
    }

    pendingTipo     = null;
    pendingConteudo = null;
    if (window.getSelection) window.getSelection().removeAllRanges();
}

document.getElementById('seletor-topico').addEventListener('change', (e) => {
    const topicoId = e.target.value;
    const box = document.getElementById('agrupamento-popup-box');
    if (topicoId) {
        box.style.display = 'flex';
        popularSelectIdeias(topicoId, 'seletor-ideia-popup', 'modo_agrupar_popup');
    } else {
        box.style.display = 'none';
    }
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
