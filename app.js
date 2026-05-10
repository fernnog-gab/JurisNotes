/* ================================================
   ESTADO GLOBAL DA APLICAÇÃO
   ================================================ */
let topicos              = [];     // Array primário: [{ id, nome, cor, anotacoes: [] }]
let pdfDoc               = null;   // Documento PDF carregado pelo PDF.js
let currentPage          = 1;      // Página visível atual (atualizada pelo IntersectionObserver)
let modoRetomada         = false;  // Flag: true quando restaurando sessão existente (evita recriar backup)
let _encerrarTimer       = null;   // ID do setTimeout de confirmação do botão Encerrar
let _encerrarConfirmando = false;  // Flag: aguardando segundo clique para confirmar encerramento

let modoRecorteAtivo = false;
let startX, startY;
let cropBox          = null;

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

    // Desativar modo recorte se estiver ativo
    if (modoRecorteAtivo) alternarModoRecorte();

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
