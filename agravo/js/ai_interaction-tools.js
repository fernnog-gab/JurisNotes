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

window.toggleModoFoco = function(ativar) {
    const pdfContainer = document.getElementById('pdf-container');
    if (pdfContainer) {
        if (ativar) pdfContainer.classList.add('pdf-foco-ativo');
        else pdfContainer.classList.remove('pdf-foco-ativo');
    }
};

// --- CONFIGURAÇÃO CENTRAL DE DOCUMENTOS ---
const DOC_CONFIG = [
    // FASE 1 — ESCOPO
    { label: 'Agravo de Instrumento',                polo: 'Agravante',   tipo: 'auto', fase: 1 },
    { label: 'Contraminuta ao Agravo',               polo: 'Agravado',    tipo: 'auto', fase: 1 },
    
    // FASE 2 — PROVOCAÇÃO (Recurso Originário Trancado)
    { label: 'Recurso Ordinário (Trancado)',         polo: 'Agravante',   tipo: 'auto', fase: 2 },
    { label: 'Agravo de Petição (Trancado)',         polo: 'Agravante',   tipo: 'auto', fase: 2 },
    
    // FASE 3 — DECISÃO
    { label: 'Despacho Denegatório (1ª Instância)',  polo: 'Juízo',       tipo: 'auto', fase: 3 },
    { label: 'Despacho de Admissibilidade',          polo: 'Juízo',       tipo: 'auto', fase: 3 },
    { label: 'Decisão Monocrática do Relator',       polo: 'Tribunal',    tipo: 'auto', fase: 3 },
    { label: 'Acórdão do Colegiado (TRT)',           polo: 'Tribunal',    tipo: 'auto', fase: 3 },
    { label: 'Outras Decisões Interlocutórias',      polo: 'Tribunal',    tipo: 'auto', fase: 3 },
    
    // FASE 4 — VALIDAÇÃO (Provas de Pressupostos)
    { label: 'Guia de Recolhimento (Custas/GFIP)',   polo: 'Agravante',   tipo: 'auto', fase: 4 },
    { label: 'Comprovante Bancário',                 polo: 'Agravante',   tipo: 'auto', fase: 4 },
    { label: 'Certidão de Intimação/Prazo',          polo: 'Secretaria',  tipo: 'auto', fase: 4 },
    { label: 'Certidão de Publicação',               polo: 'Secretaria',  tipo: 'auto', fase: 4 },
    { label: 'Documentos do Juízo',                  polo: 'Juízo',       tipo: 'auto', fase: 4 },
    { label: 'Atos da Secretaria / Termos',          polo: 'FLEX',        tipo: 'dual', fase: 4 },
    { label: 'Procuração / Substabelecimento',       polo: 'FLEX',        tipo: 'dual', fase: 4 },
    { label: 'Manifestações das Partes',             polo: 'FLEX',        tipo: 'dual', fase: 4 },
    { label: 'Prova Documental Genérica',            polo: 'FLEX',        tipo: 'dual', fase: 4, isGenerico: true }
];

let _docSelecionado = null;
let _isWizardContext = false;
let _pendingTargetIndex = null;
let _wizardVicioSelecionado = null; // Variável global de transporte para o vício

function renderizarFasesModais(context) {
    const tabsContainer = document.getElementById(`${context}-phase-tabs`);
    const listContainer = document.getElementById(`lista-docs-${context}`);
    if (!tabsContainer || !listContainer) return;
    
    const fases = [
        { id: 1, nome: '1. Escopo' },
        { id: 2, nome: '2. Provocação' },
        { id: 3, nome: '3. Decisão' },
        { id: 4, nome: '4. Validação' }
    ];

    tabsContainer.innerHTML = '';
    fases.forEach(f => {
        const btn = document.createElement('button');
        btn.className = `phase-tab-btn`;
        btn.textContent = f.nome;
        btn.onclick = (e) => {
            e.stopPropagation();
            Array.from(tabsContainer.children).forEach(b => b.className = 'phase-tab-btn');
            btn.classList.add(`active-f${f.id}`);
            
            listContainer.innerHTML = '';
            DOC_CONFIG.filter(doc => doc.fase === f.id).forEach(doc => {
                const docBtn = document.createElement('button');
                docBtn.className = `doc-btn ${doc.tipo}`;
                docBtn.textContent = doc.label;
                docBtn.onclick = (e) => { e.stopPropagation(); selecionarDocumento(doc.label, doc.polo || 'DUAL', context); };
                listContainer.appendChild(docBtn);
            });
        };
        tabsContainer.appendChild(btn);
    });
}

function toggleAgruparPopup() {
    const isAgrupar = document.querySelector('input[name="modo_agrupar_popup"]:checked').value === 'agrupar';
    document.getElementById('input-ideia-popup').style.display = isAgrupar ? 'block' : 'none';
    document.getElementById('vicio-popup-select').style.display = isAgrupar ? 'none' : 'block';
    if(isAgrupar) document.getElementById('input-ideia-popup').focus();
}

function toggleAgruparWizard() {
    const isAgrupar = document.querySelector('input[name="modo_agrupar_wizard"]:checked').value === 'agrupar';
    document.getElementById('input-ideia-wizard').style.display = isAgrupar ? 'block' : 'none';
    document.getElementById('vicio-wizard-select').style.display = isAgrupar ? 'none' : 'block';
    if(isAgrupar) document.getElementById('input-ideia-wizard').focus();
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
    if (targetIndex === false) return; // Erro validado pelo input de agrupamento

    _pendingTargetIndex = targetIndex;
    _wizardVicioSelecionado = null;

    // NOVO: Validação Antecipada. Trava ANTES de pedir polo.
    if (targetIndex === null) {
        const vicioSelectId = context === 'popup' ? 'vicio-popup-select' : 'vicio-wizard-select';
        const vicio = document.getElementById(vicioSelectId).value;
        if (!vicio) {
            exibirToast('Por favor, classifique o Vício Alegado antes de prosseguir.', 'erro');
            return; // Bloqueia fluxo
        }
        _wizardVicioSelecionado = vicio;
    }

    const conf = DOC_CONFIG.find(d => d.label === docLabel);

    // TRATAMENTO PARA PROVAS GENÉRICAS (Desambiguação Semântica)
    let nomeDocumentoFinal = docLabel;
    if (conf && conf.isGenerico) {
        const descricao = window.prompt("Especifique o nome deste documento genérico (Ex: Edital de Praça, Carta Precatória):", "");
        if (descricao === null) return; // Usuário cancelou
        nomeDocumentoFinal = descricao.trim() ? `Documento: ${descricao.trim()}` : 'Prova Documental (Não Especificada)';
    }

    if (polo === 'DUAL' || polo === 'FLEX') {
        _docSelecionado = nomeDocumentoFinal; 
        _isWizardContext = (context === 'wizard');
        
        const isExecucao = conf && conf.isExecucao;
        const targetDocText = context === 'popup' ? 'popup-doc-selecionado' : 'wizard-doc-selecionado';
        const targetContainer = context === 'popup' ? 'popup-polo-buttons-container' : 'wizard-polo-buttons-container';
        
        document.getElementById(targetDocText).innerText = nomeDocumentoFinal;
        
        let htmlBotoes = '';

        if (polo === 'FLEX') {
            // Nova ramificação FLEX: Atende Conhecimento e Execução simultaneamente
            htmlBotoes += `<button class="chip-btn chip-autora" onclick="confirmarPolo('Parte Autora / Agravante', event)">✔ P. Autora / Agravante</button>`;
            htmlBotoes += `<button class="chip-btn chip-re" onclick="confirmarPolo('Parte Ré / Agravada', event)">✔ P. Ré / Agravada</button>`;
            htmlBotoes += `<button class="chip-btn chip-exequente" onclick="confirmarPolo('Parte Exequente', event)">✔ Parte Exequente</button>`;
            htmlBotoes += `<button class="chip-btn chip-executada" onclick="confirmarPolo('Parte Executada', event)">✔ Parte Executada</button>`;
            htmlBotoes += `<button class="chip-btn chip-juizo" onclick="confirmarPolo('Terceiro / Secretaria', event)">🏛️ Terceiro / Secretaria</button>`;
        } else {
            // Preservação Estrita do Comportamento DUAL Legado (Proteção contra Regressões)
            if (isExecucao) {
                htmlBotoes += `<button class="chip-btn chip-exequente" onclick="confirmarPolo('Parte Exequente', event)">✔ Parte Exequente</button>`;
                htmlBotoes += `<button class="chip-btn chip-executada" onclick="confirmarPolo('Parte Executada', event)">✔ Parte Executada</button>`;
                htmlBotoes += `<button class="chip-btn chip-juizo" onclick="confirmarPolo('Juízo / Tribunal', event)">🏛️ Juízo / Tribunal</button>`;
                htmlBotoes += `<button class="chip-btn chip-auxiliar" onclick="confirmarPolo('Auxiliar da Justiça', event)">⚖️ Auxiliar da Justiça</button>`;
            } else {
                htmlBotoes += `<button class="chip-btn chip-autora" onclick="confirmarPolo('Parte Autora', event)">✔ Parte Autora</button>`;
                htmlBotoes += `<button class="chip-btn chip-re" onclick="confirmarPolo('Parte Ré', event)">✔ Parte Ré</button>`;
            }
        }
        
        if (context === 'popup') {
            htmlBotoes += `<button class="chip-btn chip-cancelar" onclick="voltarParaDocumentos('popup', event)">← Voltar</button>`;
        } else {
            htmlBotoes += `<div class="wizard-actions" style="margin-top: 0;"><button class="chip-btn chip-cancelar" onclick="voltarParaDocumentos('wizard', event)">← Voltar</button></div>`;
        }

        document.getElementById(targetContainer).innerHTML = htmlBotoes;
        document.getElementById(`${context}-step-doc`).style.display = 'none';
        document.getElementById(`${context}-step-polo`).style.display = 'block';
    } else {
        executarSalvamento(nomeDocumentoFinal, polo, topicoId, _pendingTargetIndex, context);
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
    // 1. Identificar a fase via DOC_CONFIG centralizado
    const conf = DOC_CONFIG.find(d => d.label === docLabel);
    const faseNova = conf ? conf.fase : 4;

    // 2. Middleware (Guardrail Client-Side para AI)
    if (faseNova === 4 && targetIndex === null) {
        // Isenta documentos classificados como 'dual' (Manifestações etc.)
        const isExtensoPermitido = conf && conf.tipo === 'dual';
        
        if (!isExtensoPermitido && pendingTipo === 'texto' && pendingConteudo && pendingConteudo.length > 500) {
             exibirToast("⚠️ AI Guardrail: Cuidado. Certifique-se de extrair dados objetivos. Evite extrair mérito de peças nesta fase.", "aviso");
        }
    }

    // 3. Execução normal e delegação ao core
    if (context === 'popup') {
        const comentario = document.getElementById('comentario-input').value.trim();
        salvarAnotacao(pendingTipo, pendingConteudo, docLabel, polo, topicoId, comentario, targetIndex, null, _wizardVicioSelecionado);
        fecharPopupClassificacao();
    } else {
        _ultimoTopicoUsadoId = topicoId;
        const comentario = document.getElementById('crop-comment-input').value.trim();
        salvarAnotacao('imagem', _wizardImagemCapturada, docLabel, polo, topicoId, comentario, targetIndex, null, _wizardVicioSelecionado);
        fecharTudoWizard();
    }
    _wizardVicioSelecionado = null; // Libera memória
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
    window.toggleModoFoco(true);
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

    // NOVO: Remove o desfoque do documento para garantir precisão no recorte
    window.toggleModoFoco(false);

    modoRecorteAtivo = true;
    const r = document.getElementById('pdf-container').getBoundingClientRect();
    overlay.style.position = 'fixed';
    overlay.style.left     = r.left   + 'px';
    overlay.style.top      = r.top    + 'px';
    overlay.style.width    = r.width  + 'px';
    overlay.style.height   = r.height + 'px';
    overlay.style.display  = 'block';

    // CORREÇÃO ARQUITETURAL: Desativa a camada de texto E a camada de links (annotationLayer).
    // A highlightLayer NÃO é alterada aqui para respeitar seu estado CSS base.
    document.querySelectorAll('.textLayer, .annotationLayer').forEach(l => l.style.pointerEvents = 'none');
    
    document.getElementById('btn-ferramenta-recorte').classList.add('ativo');
    exibirToast('Tópico confirmado. Arraste o mouse sobre o documento para recortar.', 'sucesso');
}

/**
 * RECORTANDO → IDLE.
 * Esconde o overlay e restaura os event listeners do texto e dos links.
 */
function desativarOverlayRecorte() {
    modoRecorteAtivo = false;
    overlay.style.display = 'none';
    document.getElementById('btn-ferramenta-recorte').classList.remove('ativo');
    
    // RESTAURAÇÃO: Devolve a interatividade APENAS para as camadas que foram bloqueadas.
    document.querySelectorAll('.textLayer, .annotationLayer').forEach(l => l.style.pointerEvents = 'auto');
}

/**
 * RECORTANDO → PASSO_2.
 * Desativa o overlay e exibe o Passo 2 com a pré-visualização da imagem.
 */
function abrirConfirmacaoRecorteWizard() {
    desativarOverlayRecorte();
    
    // NOVO: Reativa o desfoque para centralizar a atenção cognitiva no formulário
    window.toggleModoFoco(true);

    document.getElementById('crop-preview-img').src = _wizardImagemCapturada;
    document.getElementById('crop-comment-input').value = '';
    
    // NOVO: Resetar modal e popular seletor com o tópico escolhido no Passo 1
    document.querySelector('input[name="modo_agrupar_wizard"][value="nova"]').checked = true;
    toggleAgruparWizard();
    
    renderizarFasesModais('wizard');
    const tabsWizard = document.getElementById('wizard-phase-tabs');
    if(tabsWizard && tabsWizard.firstElementChild) tabsWizard.firstElementChild.click();

    const topicoObj = topicos.find(t => t.id === _wizardTopicoSelecionado);
    const wizardHeader = document.getElementById('wizard-topic-color-feedback');
    if(topicoObj && wizardHeader) {
        wizardHeader.style.backgroundColor = topicoObj.cor;
        wizardHeader.style.height = '6px';
    }

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
    window.toggleModoFoco(false);
    document.getElementById('crop-wizard-step1').style.display = 'none';
    document.getElementById('crop-wizard-step2').style.display = 'none';
    document.getElementById('wizard-backdrop').style.display   = 'none';
    
    // LIMPEZA DE ESTADO DE COMPONENTES
    const vicioWizard = document.getElementById('vicio-wizard-select');
    if (vicioWizard) vicioWizard.value = ''; // FIX: State Leakage Evitado

    _wizardTopicoSelecionado = null;
    _wizardImagemCapturada   = null;
    
    // NOVO: Prevenção de State Leakage
    if (typeof _tempHighlightState !== 'undefined') {
        _tempHighlightState.rects = null;
        _tempHighlightState.paginaFisica = null;
    }
}

/* ================================================
   POPUP DE CLASSIFICAÇÃO DE TEXTO
   ================================================ */

function fecharPopupClassificacao() {
    window.toggleModoFoco(false);
    const popup = document.getElementById('classification-popup');
    popup.style.display = 'none';

    document.getElementById('popup-step-polo').style.display = 'none';
    document.getElementById('popup-step-doc').style.display = 'block';
    
    // LIMPEZA DE ESTADO DE COMPONENTES
    document.getElementById('input-ideia-popup').value = '';
    document.getElementById('vicio-popup-select').value = ''; // FIX: State Leakage Evitado

    const txtArea = document.getElementById('comentario-input');
    if (txtArea) {
        txtArea.style.display = 'none';
        txtArea.value = '';
    }
    pendingTipo = null;
    pendingConteudo = null;
    
    // NOVO: Limpa o estado global geométrico com segurança
    if (typeof _tempHighlightState !== 'undefined') {
        _tempHighlightState.rects = null;
        _tempHighlightState.paginaFisica = null;
    }
    
    if (window.getSelection) window.getSelection().removeAllRanges();
    
    const header = document.getElementById('popup-topic-color-feedback');
    if(header) header.style.height = '0';
}

function exibirPopupClassificacao(tipo, conteudo) {
    window.toggleModoFoco(true);
    if (topicos.length === 0) {
        exibirToast('Crie pelo menos um Tópico Recursal.', 'aviso'); return;
    }
    pendingTipo = tipo;
    pendingConteudo = conteudo;

    const select = document.getElementById('seletor-topico');
    select.innerHTML = '<option value="">Selecione o Tópico...</option>';
    topicos.forEach(t => {
        const opt = new Option(t.nome, t.id);
        opt.dataset.cor = t.cor;
        select.appendChild(opt);
    });

    document.getElementById('agrupamento-popup-box').style.display = 'none';
    document.querySelector('input[name="modo_agrupar_popup"][value="nova"]').checked = true;
    toggleAgruparPopup();

    renderizarFasesModais('popup');
    const tabsPopup = document.getElementById('popup-phase-tabs');
    if(tabsPopup && tabsPopup.firstElementChild) tabsPopup.firstElementChild.click();

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
    // 1. Controla exibição do agrupamento
    const box = document.getElementById('agrupamento-popup-box');
    box.style.display = e.target.value ? 'flex' : 'none';
    
    // 2. Controla o feedback visual de cor desacoplado (lê data-cor injetado na option)
    const header = document.getElementById('popup-topic-color-feedback');
    const selectedOpt = e.target.options[e.target.selectedIndex];
    
    if (e.target.value && selectedOpt.dataset.cor) {
        header.style.backgroundColor = selectedOpt.dataset.cor;
        header.style.height = '6px';
    } else {
        header.style.height = '0';
        header.style.backgroundColor = 'transparent';
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
        // CORREÇÃO: Removido desativarOverlayRecorte() para não quebrar o fluxo.
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
        // CORREÇÃO: Removido desativarOverlayRecorte() para não quebrar o fluxo.
        return;
    }

    // --- CAPTURA DE COORDENADAS PARA O CRACHÁ ---
    const containerRect = targetContainer.getBoundingClientRect();
    _tempHighlightState.rects = [{
        top: cropTop - containerRect.top,
        left: cropLeft - containerRect.left,
        width: cropW,
        height: cropH
    }];
    _tempHighlightState.paginaFisica = parseInt(targetContainer.dataset.pageNumber);
    // ------------------------------------------------

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

/* ================================================
   ATALHOS DE TECLADO E ACESSIBILIDADE
   ================================================ */
document.addEventListener('keydown', function(e) {
    // Se a tecla for ESC e o overlay de recorte estiver ativo, abortamos o processo
    if (e.key === 'Escape' && modoRecorteAtivo) {
        // Limpa o quadrado em progresso, se houver
        if (cropBox) {
            cropBox.remove();
            cropBox = null;
        }
        // Restaura todo o estado, desliga o foco e remove o overlay
        cancelarRecorteWizard();
        exibirToast('Recorte cancelado.', 'info');
    }
});

/* ================================================
   MÓDULO: GERADOR DE CONTEXTO ESTRUTURADO (IA)
   ================================================ */

// Função utilitária de Debounce para proteger o Main Thread
function _debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Lógica principal de auto-save com Debounce de 800ms
window.salvarRascunhoContextoDebounced = _debounce(function() {
    try {
        const minuta = document.getElementById('ctx-minuta-anterior').value;
        const rascunho = document.getElementById('ctx-rascunho-ia').value;
        sessionStorage.setItem('juris_ctx_minuta', minuta);
        sessionStorage.setItem('juris_ctx_rascunho', rascunho);
    } catch (e) {
        console.warn('Falha ao acessar sessionStorage:', e);
    }
}, 800);

window.abrirModalGeradorContexto = function() {
    if (!window.ExportManager) return;

    // Inversão de Controle: Pede ao Facade
    const dadosTopico = ExportManager.obterDadosDoTopicoAtivo();

    if (!dadosTopico) {
        exibirToast('Selecione um tópico com provas estruturadas antes de gerar o contexto.', 'aviso');
        return;
    }

    const tagProcesso = document.getElementById('tag-numero-processo');
    const numProcesso = tagProcesso ? (tagProcesso.textContent.trim() || 'Não informado') : 'Não informado';

    // Preenchimento de DOM
    document.getElementById('ctx-metadados').value = `Processo: ${numProcesso}\nTópico: ${dadosTopico.nome}`;
    document.getElementById('ctx-diretrizes').value = dadosTopico.markdown;

    // Restauração Segura do Cache
    try {
        document.getElementById('ctx-minuta-anterior').value = sessionStorage.getItem('juris_ctx_minuta') || '';
        document.getElementById('ctx-rascunho-ia').value = sessionStorage.getItem('juris_ctx_rascunho') || '';
    } catch (e) { /* Ignora se bloqueado por modo anônimo estrito */ }

    document.getElementById('gerador-contexto-backdrop').style.display = 'block';
    document.getElementById('modal-gerador-contexto').style.display = 'flex';
};

window.fecharModalGeradorContexto = function() {
    document.getElementById('gerador-contexto-backdrop').style.display = 'none';
    document.getElementById('modal-gerador-contexto').style.display = 'none';
};

window.gerarECopiarContexto = function() {
    // --- NOVO BLOCO DE SEGURANÇA PADRONIZADO ---
    if (window.BalancaManager && !window.BalancaManager.executarGuardrailDeTarefas('copiar o pacote para a IA')) {
        exibirToast('Cópia interrompida pelo usuário.', 'aviso');
        return; // Impede a concatenação e a cópia para o clipboard
    }
    // --- FIM DO NOVO BLOCO ---

    const btn = document.getElementById('btn-copiar-contexto');
    const originalText = btn.innerHTML;
    
    // Concatenação Inteligente
    let outputFinal = "";
    const minuta = document.getElementById('ctx-minuta-anterior').value.trim();
    if (minuta) outputFinal += "== MINUTA_ATUAL ==\n" + minuta + "\n\n";
    
    outputFinal += "== METADADOS E TÓPICO ==\n" + document.getElementById('ctx-metadados').value.trim() + "\n\n";
    outputFinal += "== DIRETRIZES ==\n" + document.getElementById('ctx-diretrizes').value.trim() + "\n\n";
    
    const rascunho = document.getElementById('ctx-rascunho-ia').value.trim();
    if (rascunho) outputFinal += "== RASCUNHO BASE ==\n" + rascunho + "\n";

    // Modifica UI para estado de processamento
    btn.innerHTML = "⏳ Copiando...";
    btn.style.opacity = "0.8";

    // Fallback de segurança para APIs de Clipboard restritas
    if (!navigator.clipboard) {
        executarCopiaFallback(outputFinal, btn, originalText);
        return;
    }

    navigator.clipboard.writeText(outputFinal).then(() => {
        btn.innerHTML = "✅ Copiado!";
        btn.style.backgroundColor = "#2e7d32"; 
        btn.style.opacity = "1";
        exibirToast('Pacote copiado! Cole no seu Chat IA.', 'sucesso');
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.backgroundColor = "var(--trt-blue)";
            fecharModalGeradorContexto();
        }, 1200);
        
    }).catch(err => {
        console.error('Falha na Clipboard API:', err);
        executarCopiaFallback(outputFinal, btn, originalText);
    });
};

function executarCopiaFallback(texto, btn, originalText) {
    btn.innerHTML = "⚠️ Falha ao Copiar";
    btn.style.backgroundColor = "#d32f2f";
    btn.style.opacity = "1";
    exibirToast('Permissão negada. Copie manualmente (Ctrl+A, Ctrl+C).', 'erro');
    
    // Retorna visual do botão após 3s, mas NÃO fecha o modal
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.backgroundColor = "var(--trt-blue)";
    }, 3000);
}
