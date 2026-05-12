/* ================================================
   ESTADO GLOBAL DA APLICAÇÃO
   ================================================ */
let topicos              = [];     // Array primário: [{ id, nome, cor, anotacoes: [] }]
let pdfDoc               = null;   // Documento PDF carregado pelo PDF.js
let currentPage          = 1;      // Página visível atual (atualizada pelo IntersectionObserver)
let modoRetomada         = false;  // Flag: true quando restaurando sessão existente (evita recriar backup)
let _encerrarTimer       = null;   // ID do setTimeout de confirmação do botão Encerrar
let _encerrarConfirmando = false;  // Flag: aguardando segundo clique para confirmar encerramento

let modoRecorteAtivo         = false;
let startX, startY;
let cropBox                  = null;

// — Estado do Wizard de Recorte ——————————————————————————————
let _wizardTopicoSelecionado = null;  // ID do tópico confirmado no Passo 1
let _wizardImagemCapturada   = null;  // Data URL base64 do recorte confirmado
let _ultimoTopicoUsadoId     = null;  // Memória inteligente: pré-seleciona na próxima abertura

let pendingTipo      = null;   // Tipo da extração pendente: 'texto' | 'imagem'
let pendingConteudo  = null;   // Conteúdo bruto da extração pendente
let pdfObserver      = null;   // IntersectionObserver para lazy loading

/* ================================================
   PALETA DE CORES E RENDERIZAÇÃO
   Gerenciada pelo módulo isolado TopicsManager (topics-manager.js)
   ================================================ */

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
   Inclui o botão Encerrar Sessão, que permanece
   desabilitado até que uma sessão esteja ativa.
   ================================================ */
function habilitarFerramentasDeTrabalho() {
    document.getElementById('btn-ferramenta-recorte').disabled = false;
    document.getElementById('btn-ferramenta-texto').disabled   = false;
    document.getElementById('btn-novo-topico').disabled        = false;
    document.getElementById('btn-encerrar-sessao').disabled    = false;
}

/* ================================================
   ENCERRAR SESSÃO
   Padrão de confirmação em dois cliques (sem confirm()):
   - 1º clique: estado "confirmando" — botão pulsa, toast orienta,
     timer de 3s cancela automaticamente se não houver 2º clique.
   - 2º clique (dentro de 3s): executa o encerramento completo.
   ================================================ */
function encerrarSessao() {
    const btn = document.getElementById('btn-encerrar-sessao');

    if (!_encerrarConfirmando) {
        // — Primeiro clique: solicitar confirmação ——
        _encerrarConfirmando = true;
        btn.classList.add('confirmando');
        btn.title = 'Clique novamente para confirmar';
        exibirToast('Clique novamente no botão para confirmar o encerramento da sessão.', 'aviso');

        _encerrarTimer = setTimeout(() => {
            _encerrarConfirmando = false;
            btn.classList.remove('confirmando');
            btn.title = 'Encerrar Sessão';
        }, 3000);
        return;
    }

    // — Segundo clique: executar encerramento ———————
    clearTimeout(_encerrarTimer);
    _encerrarConfirmando = false;

    // Desativar modo recorte e wizard se estiverem ativos
    if (modoRecorteAtivo) desativarOverlayRecorte();
    fecharTudoWizard();

    // Fechar popup de classificação se aberto
    fecharPopupClassificacao();

    // Reset de estado
    topicos      = [];
    pdfDoc       = null;
    modoRetomada = false;
    BackupManager.encerrar();

    if (pdfObserver) {
        pdfObserver.disconnect();
        pdfObserver = null;
    }

    // Reset visual
    const wrapper = document.getElementById('pdf-wrapper');
    wrapper.innerHTML    = '';
    wrapper.style.display = 'none';
    document.getElementById('pdf-placeholder').style.display = 'flex';
    document.getElementById('pdf-upload').value              = '';

    // Desabilitar todas as ferramentas de trabalho
    ['btn-ferramenta-recorte', 'btn-ferramenta-texto', 'btn-novo-topico', 'btn-encerrar-sessao']
        .forEach(id => {
            const el = document.getElementById(id);
            el.disabled = true;
            el.classList.remove('confirmando', 'ativo');
        });
    btn.title = 'Encerrar Sessão';

    renderizarTopicos();
    atualizarStatusBackup('Aguardando...', false);
    trocarAba('leitura');
    exibirToast('Sessão encerrada. Sistema pronto para novo processo.', 'sucesso');
}

/* ================================================
   API DE SISTEMA DE ARQUIVOS — CRIAR BACKUP (NOVO PROCESSO)
   Usa o processoId registrado pelo BackupManager para
   sugerir o nome do arquivo com a nomenclatura padrão.
   ================================================ */
async function iniciarSessaoSalvamento() {
    const processoId = BackupManager.getProcessoId();
    try {
        const options = {
            suggestedName: `${processoId || 'backup_processo'}.json`,
            types: [{
                description: 'Arquivo de Backup — Mapeamento de Inteiro Teor',
                accept: { 'application/json': ['.json'] }
            }]
        };
        const handle = await window.showSaveFilePicker(options);
        BackupManager.setFileHandle(handle);
        atualizarStatusBackup('Sessão Ativa ✓', true);
        await salvarBackupAutomatico(); // Grava estrutura inicial (array vazio)
        exibirToast('Sessão iniciada. Backup automático ativo.');
    } catch (err) {
        if (err.name !== 'AbortError') {
            exibirToast('Erro ao criar o arquivo de backup. Verifique as permissões do navegador.', 'erro');
        }
    }
}

/* ================================================
   API DE SISTEMA DE ARQUIVOS — RETOMAR PROCESSO EXISTENTE
   Fluxo:
   1. Abre o .json de backup via showOpenFilePicker.
   2. BackupManager.carregarJson() lê, valida e desempacota
      (suporta formato legado v1.0 e atual v2.x).
   3. Restaura topicos[] e define modoRetomada = true.
   4. Dispara o input de PDF para o usuário selecionar o Inteiro Teor.
   5. carregarPDF() verificará o hash SHA-256 antes de aceitar o PDF.
   ================================================ */
async function retomarProcesso() {
    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{
                description: 'Arquivo de Backup — Mapeamento de Inteiro Teor',
                accept: { 'application/json': ['.json'] }
            }]
        });

        // Lê, valida e desempacota o JSON (suporta formatos v1.0 e v2.x)
        let pacote;
        try {
            pacote = await BackupManager.carregarJson(handle);
        } catch {
            exibirToast('O arquivo selecionado não é um backup válido ou está corrompido.', 'erro');
            return;
        }

        // Solicitar permissão de escrita para continuar o auto-save
        const permissao = await handle.requestPermission({ mode: 'readwrite' });

        // Restaurar estado em memória
        topicos      = pacote.dados;
        modoRetomada = true;

        const isLegado = pacote.metadata.versaoApp === '1.0';
        const msgHash  = isLegado
            ? ' Backup legado: PDF aceito sem verificação de integridade.'
            : ' O PDF será validado por assinatura digital SHA-256.';

        atualizarStatusBackup(
            permissao === 'granted' ? 'Sessão Restaurada ✓' : 'Restaurada (sem auto-save)',
            true
        );

        renderizarTopicos();
        habilitarFerramentasDeTrabalho();
        trocarAba('historico');
        exibirToast(`Anotações restauradas.${msgHash} Selecione agora o PDF do processo.`);

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
   Delega toda a lógica de serialização e escrita ao
   BackupManager, que mantém a referência ao arquivo.
   ================================================ */
async function salvarBackupAutomatico() {
    if (!BackupManager.isAtivo()) {
        console.warn('BackupManager: nenhum arquivo de backup ativo. Dados apenas em memória.');
        return;
    }
    try {
        await BackupManager.salvar(topicos);
        console.log('Backup atualizado silenciosamente.');
    } catch (err) {
        console.error('Falha no backup automático:', err);
        exibirToast('Não foi possível atualizar o backup automático.', 'aviso');
    }
}

/* ================================================
   FLUXO: NOVO PROCESSO
   ================================================ */
async function novoProcesso(event) {
    if ((topicos.length > 0 || pdfDoc) && !modoRetomada) {
        const continuar = confirm(
            'Iniciar um novo processo irá apagar as anotações em memória não salvas.\n\nDeseja continuar?'
        );
        if (!continuar) {
            event.target.value = '';
            return;
        }
        topicos = [];
        BackupManager.encerrar(); // Substitui: fileHandleBackup = null
        renderizarTopicos();
        atualizarStatusBackup('Aguardando...');
    }

    await carregarPDF(event);
}

/* ================================================
   CARREGAMENTO DO PDF E LAZY LOADING
   Novidades v2.1:
   - onload é agora async para suportar await do hash.
   - NOVO PROCESSO: BackupManager.iniciarSessao() calcula
     o hash SHA-256 e registra o processoId antes do
     diálogo de salvamento.
   - RETOMAR: BackupManager.validarPdf() compara o hash
     do PDF apresentado com o hash gravado no backup.
     Hash inválido → toast de erro + nova tentativa automática.
     Backup legado (sem hash) → aceito em modo de confiança.
   ================================================ */
function carregarPDF(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        exibirToast('Selecione um arquivo PDF válido.', 'erro');
        return;
    }

    const fileReader = new FileReader();

    fileReader.onload = async function () {
        const arrayBuffer = this.result;

        // — VALIDAÇÃO CHAVE-CADEADO (apenas na retomada) ——————————
        if (modoRetomada) {
            const hashValido = await BackupManager.validarPdf(arrayBuffer);

            if (!hashValido) {
                const idEsperado = BackupManager.getProcessoId() || 'desconhecido';
                exibirToast(
                    `PDF incorreto. Este backup pertence ao processo "${idEsperado}". Selecione o arquivo correto.`,
                    'erro'
                );
                event.target.value = '';
                // Mantém modoRetomada = true para nova tentativa;
                // reabre o seletor após 1.5s para o usuário ler o toast.
                setTimeout(() => document.getElementById('pdf-upload').click(), 1500);
                return;
            }
        }

        // — NOVO PROCESSO: registrar sessão no BackupManager ———————
        if (!modoRetomada) {
            await BackupManager.iniciarSessao(file.name, arrayBuffer);
        }

        // — CARREGAMENTO DO PDF.js ——————————————————————————————————
        // SubtleCrypto não detacha o ArrayBuffer, portanto a criação
        // do Uint8Array abaixo é sempre segura após os awaits acima.
        const typedarray = new Uint8Array(arrayBuffer);

        pdfjsLib.getDocument(typedarray).promise
            .then(async pdf => {
                pdfDoc = pdf;
                console.log('PDF carregado. Total de páginas:', pdf.numPages);

                habilitarFerramentasDeTrabalho();

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
                    root:       document.getElementById('pdf-container'),
                    rootMargin: '600px 0px',
                    threshold:  [0, 0.5]
                });

                const firstPage   = await pdf.getPage(1);
                const viewportCSS = firstPage.getViewport({ scale: 1.5 });

                for (let i = 1; i <= pdf.numPages; i++) {
                    const pageContainer = document.createElement('div');
                    pageContainer.className          = 'pdf-page-container';
                    pageContainer.dataset.pageNumber = i;
                    pageContainer.dataset.loaded     = 'false';
                    pageContainer.style.cssText      = `
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

                // — Gestão de sessão pós-carregamento ——————————————
                if (modoRetomada) {
                    modoRetomada = false;
                    trocarAba('leitura');
                    exibirToast('PDF validado e carregado. Sessão retomada com sucesso. ✓');
                } else {
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

   const cor = TopicsManager.obterCor(topicos.length);
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
 * Delega a renderização do fichário para o módulo gestor isolado.
 */
function renderizarTopicos() {
    TopicsManager.renderizarFichario(topicos);
}

// Funções de UI antigas removidas. Lógica assumida pelo TopicsManager.

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

    document.getElementById('wizard-backdrop').style.display = 'block';
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
    document.getElementById('wizard-backdrop').style.display  = 'none'; // backdrop some: usuário vê o PDF

    // Ativa o overlay de recorte (usa a referência global 'overlay' já declarada abaixo)
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
 * Usada internamente pelo wizard e externamente pelo encerramento de sessão/Escape.
 */
function desativarOverlayRecorte() {
    modoRecorteAtivo = false;
    overlay.style.display = 'none';
    document.getElementById('btn-ferramenta-recorte').classList.remove('ativo');
    document.querySelectorAll('.textLayer').forEach(l => l.style.pointerEvents = 'auto');
}

/**
 * RECORTANDO → PASSO_2.
 * Chamada pelo handler mouseup após a geração bem-sucedida do canvas.
 * Desativa o overlay e exibe o Passo 2 com a pré-visualização da imagem.
 */
function abrirConfirmacaoRecorteWizard() {
    desativarOverlayRecorte();
    document.getElementById('crop-preview-img').src    = _wizardImagemCapturada;
    document.getElementById('crop-comment-input').value = '';
    document.getElementById('wizard-backdrop').style.display   = 'block';
    document.getElementById('crop-wizard-step2').style.display = 'flex';
}

/**
 * PASSO_2 → IDLE.
 * Salva a anotação com o polo selecionado e encerra o wizard.
 */
function finalizarRecorteWizard(polo) {
    const comentario = document.getElementById('crop-comment-input').value.trim();
    _ultimoTopicoUsadoId = _wizardTopicoSelecionado; // Persiste memória para próxima abertura
    salvarAnotacao('imagem', _wizardImagemCapturada, polo, _wizardTopicoSelecionado, comentario);
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
 * Chamada pelo botão Cancelar, pela tecla Escape e pelo clique no backdrop.
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

    // — Posicionamento Inteligente ——————————————————————————————————————
    // 1. Renderiza invisível para que o motor de layout calcule as dimensões reais.
    //    Ordem obrigatória: display ANTES de visibility, pois display:none
    //    impede qualquer cálculo de layout.
    popup.style.display    = 'flex';
    popup.style.visibility = 'hidden';

    // 2. getBoundingClientRect() force-reflui o layout e retorna medidas reais.
    const { width: popupW, height: popupH } = popup.getBoundingClientRect();

    // 3. Ponto de ancoragem inicial: deslocado 12px do cursor.
    let x = clientX + 12;
    let y = clientY + 12;

    // 4. Colisão com borda direita.
    if (x + popupW > window.innerWidth) {
        x = window.innerWidth - popupW - 12;
    }

    // 5. Colisão com borda inferior: joga o popup para CIMA do cursor.
    if (y + popupH > window.innerHeight) {
        y = clientY - popupH - 12;
    }

    // 6. Segurança final: impede que o popup saia pelo topo ou pela esquerda.
    if (y < 0) y = 8;
    if (x < 0) x = 8;

    // 7. Aplica posição e torna visível atomicamente.
    popup.style.left       = x + 'px';
    popup.style.top        = y + 'px';

    // Controla visibilidade do campo de comentário conforme o tipo de anotação.
    // Apenas recortes de imagem exibem o textarea — anotações de texto não o utilizam.
    const txtArea = document.getElementById('comentario-input');
    txtArea.value = '';
    if (tipo === 'imagem') {
        txtArea.style.display = 'block';
        // requestAnimationFrame duplo: garante que o layout foi calculado
        // pelo browser antes do focus() (compatível com Firefox e Safari).
        requestAnimationFrame(() => requestAnimationFrame(() => txtArea.focus()));
    } else {
        txtArea.style.display = 'none';
    }

    popup.style.visibility = 'visible';
}

function classificarESalvar(polo) {
    const select     = document.getElementById('seletor-topico');
    const topicoId   = select.value;

    if (!topicoId) {
        exibirToast('Selecione o tópico de destino antes de salvar.', 'aviso');
        return;
    }

    if (pendingTipo && pendingConteudo) {
        // Captura o comentário do usuário. Para anotações de texto,
        // o textarea está oculto e seu valor é '' por garantia do fechar().
        const comentario = document.getElementById('comentario-input').value.trim();

        // Dispara a promessa sem bloquear a execução (Fire and Forget)
        salvarAnotacao(pendingTipo, pendingConteudo, polo, topicoId, comentario);
    }

    // UI responde instantaneamente (UX fluida)
    fecharPopupClassificacao();
}

function fecharPopupClassificacao() {
    document.getElementById('classification-popup').style.display = 'none';

    // Oculta e limpa o textarea para não vazar estado na próxima abertura.
    const txtArea = document.getElementById('comentario-input');
    if (txtArea) {
        txtArea.style.display = 'none';
        txtArea.value = '';
    }

    pendingTipo     = null;
    pendingConteudo = null;
    if (window.getSelection) window.getSelection().removeAllRanges();
}

/* ================================================
   PERSISTÊNCIA DE ANOTAÇÕES
   CORREÇÃO: não troca de aba automaticamente (evita regressão de UX).
   Usa toast não-intrusivo como feedback.
   ================================================ */
async function salvarAnotacao(tipo, conteudo, polo, topicoId, comentario = '') {
    const topicoAlvo = topicos.find(t => t.id === topicoId);
    if (!topicoAlvo) return;

    // Extração invisível em background
    const pjeId = await extrairIdPjeDaPagina(currentPage);

    topicoAlvo.anotacoes.push({
        tipo,
        polo,
        pagina:     currentPage,
        timestamp:  Date.now(),
        // Para imagens, armazena o data URL base64 completo
        conteudo:   conteudo,
        pjeId:      pjeId, // Identificador gravado na persistência
        comentario: comentario // Nova propriedade. Ausente em backups antigos = '' por default.
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

    const cropW = parseFloat(cropBox.style.width);
    const cropH = parseFloat(cropBox.style.height);

    if (cropW < 5 || cropH < 5) {
        cropBox.remove();
        cropBox = null;
        return;
    }

    const overlayRect = overlay.getBoundingClientRect();

    // Converte as coordenadas do cropBox (relativas ao overlay) para viewport.
    const cropLeft = parseFloat(cropBox.style.left) + overlayRect.left;
    const cropTop  = parseFloat(cropBox.style.top)  + overlayRect.top;

    // Encontra o container de página pelo centro do retângulo desenhado.
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
        desativarOverlayRecorte(); // ← cancela o modo sem fechar o wizard inteiro
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

    // Coordenadas do recorte relativas ao canvas (em CSS pixels).
    const relX = cropLeft - canvasRect.left;
    const relY = cropTop  - canvasRect.top;

    // Clamp: garante que o recorte não ultrapasse os limites do canvas.
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

    // Escala de CSS pixels para pixels internos do canvas (renderizado em HD).
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

        // Sincroniza currentPage com a página efetivamente fotografada.
        currentPage = parseInt(targetContainer.dataset.pageNumber);

        // — MUDANÇA PRINCIPAL: entrega a imagem ao wizard, não ao popup antigo —
        _wizardImagemCapturada = imageDataUrl;
        abrirConfirmacaoRecorteWizard(); // Desativa overlay e abre Passo 2
    } catch (err) {
        console.error('Erro ao processar recorte:', err);
        exibirToast('Erro ao processar o recorte. Tente novamente.', 'erro');
    }

    cropBox.remove();
    cropBox = null;
    // desativarOverlayRecorte() já foi chamado por abrirConfirmacaoRecorteWizard()
    // em caso de sucesso; em caso de erro no catch, desfaz o modo igualmente.
    desativarOverlayRecorte();
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
        fecharPopupClassificacao(); // Fecha o popup de texto, se estiver aberto
        cancelarRecorteWizard();    // Fecha o wizard e desativa o overlay (seguro chamar mesmo em IDLE)
    }
});

/* ================================================
   GERENCIAMENTO DE ANOTAÇÕES
   Menu contextual, exclusão e reordenamento.
   ================================================ */

/** Referência à anotação cujo menu está aberto. */
let _menuAnotacaoCtx = null;

/**
 * Abre o menu de ações posicionado junto ao cursor,
 * com detecção de colisão para não sair da viewport.
 * Chamado pelo onclick da badge numérica no topics-manager.js.
 *
 * @param {string} topicoId  - ID do tópico pai.
 * @param {number} index     - Índice da anotação no array anotacoes[].
 * @param {MouseEvent} event - Evento de clique nativo.
 */
function abrirMenuAnotacao(topicoId, index, event) {
    // Impede que o clique feche o menu imediatamente via o listener global abaixo.
    event.stopPropagation();

    _menuAnotacaoCtx = { topicoId, index };

    const menu = document.getElementById('annotation-context-menu');

    // Renderiza invisível para medir as dimensões reais antes de posicionar.
    menu.style.display    = 'flex';
    menu.style.visibility = 'hidden';

    const { width: mW, height: mH } = menu.getBoundingClientRect();

    let x = event.clientX + 10;
    let y = event.clientY - 10;

    // Colisão com borda direita.
    if (x + mW > window.innerWidth)  x = window.innerWidth  - mW - 8;
    // Colisão com borda inferior.
    if (y + mH > window.innerHeight) y = window.innerHeight - mH - 8;
    // Segurança: não sai pelo topo ou pela esquerda.
    if (y < 0) y = 8;
    if (x < 0) x = 8;

    menu.style.left       = x + 'px';
    menu.style.top        = y + 'px';
    menu.style.visibility = 'visible';
}

/** Fecha o menu ao clicar em qualquer ponto fora dele. */
document.addEventListener('click', function () {
    const menu = document.getElementById('annotation-context-menu');
    if (menu) menu.style.display = 'none';
});

/**
 * Remove a anotação referenciada pelo contexto do menu,
 * renumerando automaticamente as subsequentes.
 */
function excluirAnotacao() {
    if (!_menuAnotacaoCtx) return;

    const { topicoId, index } = _menuAnotacaoCtx;
    const topico = topicos.find(t => t.id === topicoId);

    // Guarda nula: o tópico pode ter sido excluído enquanto o menu estava aberto.
    if (!topico) {
        exibirToast('Tópico não encontrado. Recarregue a sessão.', 'erro');
        return;
    }

    // Confirmação em dois cliques: reutiliza o padrão já estabelecido
    // no botão "Encerrar Sessão" do app, sem alert() bloqueante.
    // Para exclusão de anotação, um confirm() é aceitável dado o volume
    // reduzido de frequência dessa ação.
    if (!confirm('Excluir esta anotação? A ação não pode ser desfeita.')) return;

    topico.anotacoes.splice(index, 1);

    renderizarTopicos();
    salvarBackupAutomatico();
    exibirToast('Anotação excluída. Lista renumerada automaticamente.', 'sucesso');
    _menuAnotacaoCtx = null;
}

/**
 * Move a anotação para uma nova posição dentro do mesmo tópico,
 * deslocando os itens intermediários para preencher a lacuna.
 */
function reordenarAnotacao() {
    if (!_menuAnotacaoCtx) return;

    const { topicoId, index } = _menuAnotacaoCtx;
    const topico = topicos.find(t => t.id === topicoId);

    if (!topico) {
        exibirToast('Tópico não encontrado. Recarregue a sessão.', 'erro');
        return;
    }

    const posAtual = index + 1;
    const total    = topico.anotacoes.length;

    if (total <= 1) {
        exibirToast('Este tópico possui apenas uma anotação. Nada a reordenar.', 'aviso');
        return;
    }

    const entrada = prompt(
        `Posição atual: ${posAtual} de ${total}\n\nMover para qual posição? (1 – ${total})`
    );

    // Usuário cancelou o prompt.
    if (entrada === null || entrada.trim() === '') return;

    const novaPos = parseInt(entrada, 10);

    if (isNaN(novaPos) || novaPos < 1 || novaPos > total) {
        exibirToast(`Posição inválida. Digite um número entre 1 e ${total}.`, 'erro');
        return;
    }

    // Feedback claro quando a posição solicitada é a atual.
    if (novaPos === posAtual) {
        exibirToast('A anotação já se encontra nessa posição.', 'aviso');
        return;
    }

    // Array.splice: extrai da posição velha e reinsere na nova.
    // O índice base-0 da nova posição é `novaPos - 1`.
    const [item] = topico.anotacoes.splice(index, 1);
    topico.anotacoes.splice(novaPos - 1, 0, item);

    renderizarTopicos();
    salvarBackupAutomatico();
    exibirToast(`Anotação movida da posição ${posAtual} para ${novaPos}.`, 'sucesso');
    _menuAnotacaoCtx = null;
}

/* ================================================
   NAVEGAÇÃO DIRETA DE PÁGINA
   ================================================ */
function irParaPagina() {
    const input = document.getElementById('goto-page-input');
    const pageNum = parseInt(input.value, 10);
    
    if (!pdfDoc) {
        exibirToast('Carregue um documento primeiro.', 'aviso');
        return;
    }
    
    if (isNaN(pageNum) || pageNum < 1 || pageNum > pdfDoc.numPages) {
        exibirToast(`Página inválida. Digite um número entre 1 e ${pdfDoc.numPages}.`, 'erro');
        return;
    }

    const pageContainer = document.querySelector(`.pdf-page-container[data-page-number="${pageNum}"]`);
    if (pageContainer) {
        pageContainer.scrollIntoView({ behavior: 'smooth' });
    }
}

// Suporte para acionamento via tecla Enter
document.getElementById('goto-page-input')?.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') irParaPagina();
});

/* ================================================
   EXTRATOR DE IDENTIFICADOR PJe (BACKGROUND)
   ================================================ */
const _pjeIdCache = {}; // Cache de processamento

async function extrairIdPjeDaPagina(pageNum) {
    if (_pjeIdCache[pageNum]) return _pjeIdCache[pageNum];
    
    try {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const fullText = textContent.items.map(item => item.str).join(' ');
        
        // Regex aprimorada: captura 7 ou mais caracteres alfanuméricos após a hora
        const regexPje = /\d{2}:\d{2}:\d{2}\s*-\s*([a-f0-9]{7,})\b/i;
        const match = fullText.match(regexPje);
        
        const id = match ? match[1].toLowerCase() : null;
        _pjeIdCache[pageNum] = id;
        return id;
    } catch (err) {
        console.error('Falha ao extrair texto para ID do PJe:', err);
        return null;
    }
}

/* ================================================
   MAPA MENTAL — ENTRADA E CONFIRMAÇÃO DE SUB-ANOTAÇÕES
   Substitui prompt() por painel inline não-bloqueante,
   consistente com o padrão visual da aplicação.
   ================================================ */

/**
 * Abre (ou fecha, se já aberto para o mesmo card) o painel
 * de entrada de sub-anotação inline, logo abaixo do card clicado.
 * @param {string} topicoId      - ID do tópico ativo.
 * @param {number} anotacaoIndex - Índice do card principal no array.
 * @param {Element} btn          - Referência ao botão clicado (via 'this').
 */
function adicionarSubAnotacao(topicoId, anotacaoIndex, btn) {
    const existing = document.getElementById('sub-input-active');

    // Toggle: clique no mesmo "+" fecha o painel
    if (existing) {
        const mesmoCont = existing.dataset.forTopico === topicoId &&
                          existing.dataset.forIndex  === String(anotacaoIndex);
        existing.remove();
        if (mesmoCont) return;
    }

    const painel = document.createElement('div');
    painel.id                   = 'sub-input-active';
    painel.className            = 'sub-input-panel';
    painel.dataset.forTopico    = topicoId;
    painel.dataset.forIndex     = anotacaoIndex;
    painel.innerHTML = `
        <textarea id="sub-input-text"
                  class="sub-input-textarea"
                  placeholder="Digite a observação secundária..."
                  rows="3"></textarea>
        <div class="sub-input-actions">
            <button class="sub-input-btn-confirm"
                    onclick="confirmarSubAnotacao('${topicoId}', ${anotacaoIndex})">
                ✔ Confirmar
            </button>
            <button class="sub-input-btn-cancel"
                    onclick="document.getElementById('sub-input-active').remove()">
                ✕ Cancelar
            </button>
        </div>`;

    // Insere o painel imediatamente após o .timeline-item do card clicado.
    // Se já houver .sub-annotations-container após o item, o painel entra antes do conector.
    const timelineItem = btn.closest('.timeline-item');
    timelineItem.parentNode.insertBefore(painel, timelineItem.nextSibling);

    document.getElementById('sub-input-text').focus();
}

/**
 * Lê o texto do painel inline, salva no array de estado e re-renderiza.
 * @param {string} topicoId      - ID do tópico ativo.
 * @param {number} anotacaoIndex - Índice do card principal no array.
 */
function confirmarSubAnotacao(topicoId, anotacaoIndex) {
    const textarea = document.getElementById('sub-input-text');
    const texto    = textarea ? textarea.value.trim() : '';

    if (!texto) {
        exibirToast('Digite uma observação antes de confirmar.', 'aviso');
        return;
    }

    const topico   = topicos.find(t => t.id === topicoId);
    if (!topico) return;

    const anotacao = topico.anotacoes[anotacaoIndex];

    // Retrocompatibilidade: backups anteriores não têm a chave subAnotacoes
    if (!anotacao.subAnotacoes) anotacao.subAnotacoes = [];

    anotacao.subAnotacoes.push({ texto, timestamp: Date.now() });

    document.getElementById('sub-input-active').remove();
    renderizarTopicos();
    salvarBackupAutomatico();
    exibirToast('Observação secundária vinculada com sucesso.', 'sucesso');
}
