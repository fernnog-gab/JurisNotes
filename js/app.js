/* ================================================
   MÓDULO DA SPLASH SCREEN (GERENCIADOR DE ESTADO E EVENT LOOP)
   ================================================ */
window.SplashScreenManager = (function() {
    let splashEl = null;
    let textEl = null;
    const DEFAULT_TEXT = "Organizar ideias. Fazer justiça.";
    let initialLoadPromise = null;

    function init() {
        splashEl = document.getElementById('juris-splash');
        textEl = document.getElementById('splash-dynamic-text');
        
        // Garante que o first-load tenha no mínimo 1.5s para a animação rodar
        initialLoadPromise = new Promise(resolve => setTimeout(resolve, 1500));
    }

    /**
     * Exibe a splash. Utiliza double rAF + timeout para forçar o navegador
     * a pintar a tela antes de liberar a thread.
     */
    async function showWithYield(mensagem = DEFAULT_TEXT) {
        if (!splashEl) return;
        if (textEl) textEl.textContent = mensagem;
        
        splashEl.classList.remove('is-hidden');
        
        // Magia do Event Loop: Força o Paint na GPU antes de retornar
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setTimeout(resolve, 50); // Margem de segurança para layout thrashing
                });
            });
        });
    }

    /** Oculta a tela de forma segura. */
    function hide() {
        if (splashEl) splashEl.classList.add('is-hidden');
    }

    /** Usado apenas no carregamento da página. Aguarda o tempo mínimo psicológico. */
    async function hideInitialLoad() {
        if (initialLoadPromise) await initialLoadPromise;
        hide();
    }

    return { init, showWithYield, hide, hideInitialLoad };
})();

/* ================================================
   ESTADO GLOBAL DA APLICAÇÃO (ORQUESTRADOR)
   ================================================ */
let topicos              = [];     // Array primário: [{ id, nome, cor, anotacoes: [] }]
let modoRetomada         = false;  // Flag: true quando restaurando sessão existente
let _encerrarTimer       = null;   // ID do setTimeout de confirmação
let _encerrarConfirmando = false;  // Flag: aguardando segundo clique para encerramento
let _sessaoPossuiAudio   = false;  // Flag de restauração de áudio na retomada de sessão

let _tempHighlightState = {
    rects: null,
    paginaFisica: null
};

/* ================================================
   MOTOR GLOBAL DE SINCRONIZAÇÃO (Ponte)
   ================================================ */
window.sincronizarHighlightsGerais = function() {
    if (window.PdfEngine) window.PdfEngine.sincronizarHighlightsGerais();
};

/* ================================================
   MÓDULO DE ATALHOS FLUTUANTES (SHORTCUT MANAGER)
   ================================================ */
window.ShortcutManager = (function() {
    let state = { favorito: null, recursoAutora: null, recursoReu: null, recursoReu2: null, contestacao: null, contestacaoRe2: null, sentenca: null };
    let currentEditingType = null;
    
    const colors = { favorito: 'is-active-favorito', recursoAutora: 'is-active-autora', recursoReu: 'is-active-re', recursoReu2: 'is-active-re2', contestacao: 'is-active-re', contestacaoRe2: 'is-active-re2', sentenca: 'is-active-juizo' };
    const rotulos = { favorito: 'Favorito (Coringa)', recursoAutora: 'Recurso (Autora)', recursoReu: 'Recurso (Ré 1)', recursoReu2: 'Recurso (Ré 2)', contestacao: 'Contestação (Ré 1)', contestacaoRe2: 'Contestação (Ré 2)', sentenca: 'Sentença/Acórdão' };

    function updateUI() {
        Object.keys(state).forEach(type => {
            const btn = document.getElementById(getFabId(type));
            if (!btn) return;
            
            btn.classList.remove('is-empty', 'is-active-favorito', 'is-active-autora', 'is-active-re', 'is-active-re2', 'is-active-juizo');
            
            if (state[type] === null) {
                btn.classList.add('is-empty');
                btn.title = `Marcar página: ${rotulos[type]}`;
            } else {
                btn.classList.add(colors[type]);
                btn.title = `${rotulos[type]} (Pág. ${state[type]})\n[Shift + Clique] para editar`;
            }
        });
    }

    function handleClick(type, event) {
        if (!window.PdfEngine || !PdfEngine.getPdfDoc()) {
            exibirToast('Carregue um documento primeiro.', 'aviso'); return;
        }
        if (state[type] === null || event.shiftKey) {
            abrirModal(type);
        } else {
            PdfEngine.goToPage(state[type]);
        }
    }

    function abrirModal(type) {
        currentEditingType = type;
        document.getElementById('shortcut-modal-title').textContent = `Página para: ${rotulos[type]}`;
        const input = document.getElementById('shortcut-page-input');
        input.value = state[type] || '';
        
        document.getElementById('shortcut-modal-backdrop').style.display = 'block';
        document.getElementById('shortcut-modal').style.display = 'flex';
        setTimeout(() => input.focus(), 50);
    }

    function fecharModal() {
        currentEditingType = null;
        document.getElementById('shortcut-modal-backdrop').style.display = 'none';
        document.getElementById('shortcut-modal').style.display = 'none';
    }

    async function salvarModal() {
        if (!currentEditingType) return;
        const val = document.getElementById('shortcut-page-input').value.trim();
        const parsed = parseInt(val, 10);
        
        if (val === '') {
            state[currentEditingType] = null;
            exibirToast('Atalho removido.', 'sucesso');
        } else if (!isNaN(parsed) && parsed > 0) {
            state[currentEditingType] = parsed;
            exibirToast('Atalho salvo com sucesso!', 'sucesso');
        } else {
            exibirToast('Número de página inválido.', 'erro');
            return;
        }
        
        fecharModal();
        updateUI();
        if (typeof salvarBackupAutomatico === 'function') await salvarBackupAutomatico();
    }

    function getFabId(type) {
        const map = { favorito: 'fab-favorito', recursoAutora: 'fab-recurso-autora', recursoReu: 'fab-recurso-re', recursoReu2: 'fab-recurso-re2', contestacao: 'fab-contestacao', contestacaoRe2: 'fab-contestacao-re2', sentenca: 'fab-sentenca' };
        return map[type];
    }

    return { 
        handleClick, updateUI, fecharModal, salvarModal,
        getState: () => state,
        setState: (newState) => { if (newState) { state = { ...state, ...newState }; updateUI(); } },
        reset: () => { state = { favorito: null, recursoAutora: null, recursoReu: null, recursoReu2: null, contestacao: null, contestacaoRe2: null, sentenca: null }; updateUI(); },
        toggleVisibility: (show) => {
            Object.keys(state).forEach(type => {
                const btn = document.getElementById(getFabId(type));
                if (btn) btn.style.display = show ? 'flex' : 'none';
            });
        }
    };
})();

/* ================================================
   INICIALIZAÇÃO E INJEÇÃO DE DEPENDÊNCIAS
   ================================================ */
document.addEventListener("DOMContentLoaded", () => {
    // Definir estado inicial de aba para o CSS Engine
    document.body.dataset.activeTab = 'leitura';
    
    SplashScreenManager.init();
    
    if (window.PdfEngine) {
        PdfEngine.init({
            getTopicos: () => topicos,
            exibirToast: exibirToast,
            atualizarDisplayPaginador: atualizarDisplayPaginador,
            validarPdf: (buffer) => BackupManager.validarPdf(buffer),
            iniciarSessaoBackup: (name, buffer) => BackupManager.iniciarSessao(name, buffer),
            habilitarFerramentas: habilitarFerramentasDeTrabalho,
            onPdfCarregado: async (isRetomada) => {
                if (isRetomada) {
                    modoRetomada = false;
                    trocarAba('leitura');
                    exibirToast('PDF validado e carregado. Sessão retomada com sucesso. ✓');
                    
                    if (_sessaoPossuiAudio && typeof window.AudioManager?.prepararRetomada === 'function') {
                        window.AudioManager.prepararRetomada();
                    }
                } else {
                    // CORREÇÃO: Força a interface a acordar a barra lateral para PDFs novos.
                    // Isso resolve o bug onde o container de botões nascia invisível (display: none).
                    trocarAba('leitura');

                    // 1. Libera a Interface Imediatamente para o usuário
                    console.log("[JURIS LOG] PDF renderizado. Exibindo modal de backup.");
                    document.getElementById('backup-modal-backdrop').style.display = 'block';
                    document.getElementById('modal-ativar-backup').style.display = 'flex';

                    // 2. Processamento Assíncrono em Background (Fire and Forget)
                    if (window.PjeParser && window.PdfEngine && PdfEngine.getPdfDoc()) {
                        exibirToast('Analisando sumário do processo em segundo plano...', 'aviso');
                        
                        PjeParser.mapearAtalhos(PdfEngine.getPdfDoc())
                            .then(async (atalhos) => {
                                if (atalhos.contestacao || atalhos.contestacaoRe2 || atalhos.sentenca) {
                                    // Atualiza a numeração interna e as cores
                                    window.ShortcutManager.setState({
                                        contestacao: atalhos.contestacao || null,
                                        contestacaoRe2: atalhos.contestacaoRe2 || null,
                                        sentenca: atalhos.sentenca || null
                                    });
                                    
                                    // FORÇA DE SEGURANÇA: Garante que os botões fiquem visíveis na tela
                                    window.ShortcutManager.toggleVisibility(true);
                                    
                                    // Salva os atalhos encontrados diretamente no backup do usuário
                                    if (typeof salvarBackupAutomatico === 'function') {
                                        await salvarBackupAutomatico();
                                    }
                                    
                                    exibirToast('Atalhos da Contestação/Sentença preenchidos com sucesso!', 'sucesso');
                                } else {
                                    // Caso o sumário não exista ou o robô não encontre os itens
                                    exibirToast('Análise concluída: Sumário padrão não encontrado.', 'aviso');
                                }
                            })
                            .catch(e => console.warn('[Juris Notes] Erro não-bloqueante no Parser PJe:', e));
                    }
                }
            }
        });
    }

    const savedThemeProcesso = localStorage.getItem('theme-processo') || 'jasmine';
    const savedThemeAnotacoes = localStorage.getItem('theme-anotacoes') || 'white';
    document.body.classList.add(`theme-processo-${savedThemeProcesso}`);
    document.body.classList.add(`theme-anotacoes-${savedThemeAnotacoes}`);

    if (window.AudioManager) {
        AudioManager.init({ getTopicos: () => topicos, exibirToast, salvarAnotacao });
    }

    if (window.ExportManager) {
        ExportManager.init({
            getTopicos: () => topicos,
            exibirToast: exibirToast,
            getActiveTabId: () => TopicsManager.getActiveTabId()
        });
    }

    const historyContainer = document.getElementById('history-container');
    if (historyContainer) historyContainer.addEventListener('scroll', checkScrollFabState, { passive: true });
    
    const pdfContainer = document.getElementById('pdf-container');
    if (pdfContainer) {
        pdfContainer.addEventListener('scroll', checkScrollFabState, { passive: true });
        pdfContainer.addEventListener('click', (e) => {
            const linkAncorado = e.target.closest('.linkAnnotation a');
            if (linkAncorado && !e.defaultPrevented) {
                console.error('🔴 ALERTA: O PDF.js rejeitou a vinculação do evento! O clique vazou.');
                e.preventDefault(); 
            }
        }, true);
    }

    SplashScreenManager.hideInitialLoad();
});

/* ================================================
   GERENCIAMENTO DE INTERFACE E SCROLL DISPATCHER
   ================================================ */
function atualizarDisplayPaginador(pageNum) {
    if (window.PdfEngine && PdfEngine.getCurrentPage() === pageNum) {
        const displayLabel = PdfEngine.getDisplayLabel(pageNum);
        document.getElementById('current-page-display').textContent = displayLabel;
    }
}

window.aplicarTema = function(alvo, tema) { 
    // Remove qualquer classe de tema anterior do respectivo alvo
    const regex = alvo === 'processo' ? /^theme-processo-/ : /^theme-anotacoes-/;
    document.body.className = document.body.className.split(' ').filter(c => !regex.test(c)).join(' ');
    
    // Aplica o novo tema no Body
    document.body.classList.add(`theme-${alvo}-${tema}`);
    
    // Persistência
    localStorage.setItem(`theme-${alvo}`, tema);
    
    const menu = document.getElementById('juris-menu');
    if (menu) menu.style.display = 'none';
    
    exibirToast(`Fundo ${tema === 'white' ? 'Branco' : 'Jasmine'} aplicado a ${alvo}.`, 'sucesso');
};

function getActiveScrollContainer() {
    return document.getElementById('tab-leitura').classList.contains('active') 
        ? document.getElementById('pdf-container') 
        : document.getElementById('history-container');
}

function trocarAba(aba) {
    // 1. ELEVAÇÃO DE ESTADO (State Hoisting)
    // Informa ao CSS de toda a aplicação qual é a aba atual
    document.body.dataset.activeTab = aba;

    document.getElementById('pdf-container').style.display     = aba === 'leitura'   ? 'flex'  : 'none';
    document.getElementById('history-container').style.display = aba === 'historico' ? 'block' : 'none';
    document.getElementById('tab-leitura').classList.toggle('active',   aba === 'leitura');
    document.getElementById('tab-historico').classList.toggle('active', aba === 'historico');

    const btnExportar = document.getElementById('btn-exportar-topico');
    if (btnExportar) btnExportar.style.display = (aba === 'historico' && topicos.length > 0) ? 'flex' : 'none';

    const fabContainer = document.getElementById('scroll-fab-container');
    if (fabContainer) {
        fabContainer.style.display = 'flex';
        setTimeout(checkScrollFabState, 60);
    }

    if (window.ShortcutManager) {
        const temPdf = (window.PdfEngine && PdfEngine.getPdfDoc());
        window.ShortcutManager.toggleVisibility(aba === 'leitura' && temPdf);
    }
}

function checkScrollFabState() {
    const hc     = getActiveScrollContainer();
    const btnTop = document.getElementById('btn-scroll-top');
    const btnBot = document.getElementById('btn-scroll-bottom');
    if (!hc || !btnTop || !btnBot) return;

    const scrollable = hc.scrollHeight > hc.clientHeight + 10;
    const atTop      = hc.scrollTop < 50;
    const atBottom   = hc.scrollTop + hc.clientHeight >= hc.scrollHeight - 30;

    btnTop.classList.toggle('is-hidden', atTop);
    btnBot.classList.toggle('is-hidden', !scrollable || atBottom);
}

function rolarParaTopo() {
    const hc = getActiveScrollContainer();
    if (hc) hc.scrollTo({ top: 0, behavior: 'smooth' });
}

function rolarParaFinal() {
    const hc = getActiveScrollContainer();
    if (hc) hc.scrollTo({ top: hc.scrollHeight, behavior: 'smooth' });
}

function exibirToast(mensagem, tipo = 'sucesso') {
    const toast = document.getElementById('toast-feedback');
    toast.textContent = mensagem;
    toast.className   = `toast-feedback toast-${tipo} visivel`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('visivel'), 2800);
}

function atualizarStatusBackup(texto, ativa = false) {
    if (texto.includes('Restaurada') || texto.includes('Erro')) {
        exibirToast(`Sistema: ${texto}`, ativa ? 'sucesso' : 'erro');
    }
}

function habilitarFerramentasDeTrabalho() {
    ['btn-ferramenta-recorte', 'btn-ferramenta-texto', 'btn-novo-topico', 'btn-encerrar-sessao', 'btn-ferramenta-audio']
        .forEach(id => document.getElementById(id).disabled = false);
    
    if (window.ShortcutManager && document.getElementById('tab-leitura').classList.contains('active')) {
        window.ShortcutManager.toggleVisibility(true);
        window.ShortcutManager.updateUI();
    }
}

function encerrarSessao() {
    const btn = document.getElementById('btn-encerrar-sessao');

    if (!_encerrarConfirmando) {
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

    clearTimeout(_encerrarTimer);
    _encerrarConfirmando = false;

    if (typeof modoRecorteAtivo !== 'undefined' && modoRecorteAtivo) desativarOverlayRecorte();
    if (typeof fecharTudoWizard === 'function') fecharTudoWizard();
    if (typeof fecharPopupClassificacao === 'function') fecharPopupClassificacao();
    if (window.AudioManager) window.AudioManager.encerrar();

    topicos      = [];
    modoRetomada = false;
    sessionStorage.removeItem('juris_active_session');
    
    if (window.PdfEngine) window.PdfEngine.encerrar();
    BackupManager.encerrar();
    if (window.ShortcutManager) window.ShortcutManager.reset();

    const wrapper = document.getElementById('pdf-wrapper');
    wrapper.innerHTML     = '';
    wrapper.style.display = 'none';
    document.getElementById('pdf-placeholder').style.display = 'flex';
    document.getElementById('floating-page-panel').style.display = 'none';
    document.getElementById('btn-exportar-topico').style.display = 'none';
    document.getElementById('current-page-display').textContent  = '1';
    document.getElementById('pdf-upload').value = '';

    ['btn-ferramenta-recorte', 'btn-ferramenta-texto', 'btn-novo-topico', 'btn-encerrar-sessao', 'btn-ferramenta-audio']
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
   API DE SISTEMA DE ARQUIVOS E PROCESSO
   ================================================ */
/* Função iniciarSessaoSalvamento() removida arquiteturalmente (Fluxo invertido para novoProcesso) */

async function retomarProcesso() {
    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{ description: 'Arquivo de Backup', accept: { 'application/json': ['.json'] } }]
        });

        // 1. Exibe a tela e cede a thread (GARANTE A RENDERIZAÇÃO)
        await window.SplashScreenManager.showWithYield("Restaurando mapa mental...");

        let pacote;
        try {
            pacote = await BackupManager.carregarJson(handle);
        } catch {
            window.SplashScreenManager.hide();
            exibirToast('O arquivo selecionado não é um backup válido ou está corrompido.', 'erro');
            return;
        }

        const permissao = await handle.requestPermission({ mode: 'readwrite' });

        topicos      = pacote.dados;
        modoRetomada = true;
        _sessaoPossuiAudio = pacote.metadata.possuiAudio ?? false;

        // 2. Trabalho Pesado Bloqueante ocorre com a tela seguramente coberta
        renderizarTopicos();
        habilitarFerramentasDeTrabalho();
        trocarAba('historico');
        
        // 3. Remove a tela e notifica
        window.SplashScreenManager.hide();

        const isLegado = pacote.metadata.versaoApp === '1.0';
        const msgHash  = isLegado ? ' Backup legado.' : ' O PDF será validado por SHA-256.';

        atualizarStatusBackup(permissao === 'granted' ? 'Sessão Restaurada ✓' : 'Restaurada (sem auto-save)', true);
        exibirToast(`Anotações restauradas.${msgHash} Selecione agora o PDF do processo.`);

        document.getElementById('pdf-upload').click();
    } catch (err) {
        if (window.SplashScreenManager) window.SplashScreenManager.hide();
        modoRetomada = false;
        if (err.name !== 'AbortError') exibirToast('Erro ao restaurar a sessão.', 'erro');
    }
}

async function salvarBackupAutomatico() {
    if (!BackupManager.isAtivo()) return;
    try {
        await BackupManager.salvar(topicos);
    } catch (err) {
        exibirToast('Não foi possível atualizar o backup automático.', 'aviso');
    }
}

async function novoProcesso(event) {
    if ((topicos.length > 0 || (window.PdfEngine && PdfEngine.getPdfDoc())) && !modoRetomada) {
        const continuar = confirm('Iniciar um novo processo irá apagar as anotações em memória não salvas.\nDeseja continuar?');
        if (!continuar) {
            event.target.value = '';
            return;
        }
        if (window.AudioManager) window.AudioManager.encerrar();
        topicos = [];
        BackupManager.encerrar(); 
        if (window.ShortcutManager) window.ShortcutManager.reset();
        renderizarTopicos();
        atualizarStatusBackup('Aguardando...');
    }

    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
        exibirToast('Selecione um arquivo PDF válido.', 'erro');
        return;
    }
    
    // Armazenamos o nome sugerido globalmente para usar no modal depois
    window._nomeArquivoSugerido = file.name.replace(/\.[^/.]+$/, "").toLowerCase() + ".json";

    if (window.PdfEngine) {
        // Exibe a tela informando o carregamento pesado
        await window.SplashScreenManager.showWithYield("Processando arquivo PDF...");
        
        console.log("[JURIS LOG] Iniciando leitura do PDF:", file.name);
        await PdfEngine.carregarPDF(file, modoRetomada);
        
        // A ocultação da splash será gerida pelo callback onPdfCarregado (onde o modal de backup abre)
        window.SplashScreenManager.hide();
    }
}

/* ================================================
   GESTÃO DE TÓPICOS E ANOTAÇÕES
   ================================================ */
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
    topicos.push({ id: 'topico-' + Date.now(), nome: nomeLimpo, cor, anotacoes: [] });

    renderizarTopicos();
    salvarBackupAutomatico();
    trocarAba('historico');
    exibirToast(`Tópico "${nomeLimpo}" criado.`);
}

function renderizarTopicos() {
    TopicsManager.renderizarFichario(topicos);
}

function capturarTrechoSelecionado() {
    const selection = window.getSelection();
    const selecaoTexto = selection.toString().trim();

    if (selecaoTexto.length <= 5) {
        exibirToast('Selecione um trecho válido no documento.', 'aviso');
        return;
    }

    const node = selection.anchorNode;
    if (!node) return;

    const element = node.nodeType === 3 ? node.parentNode : node;
    const pageContainer = element.closest('.pdf-page-container');

    if (!pageContainer) {
        exibirToast('A seleção deve estar dentro do PDF.', 'aviso');
        return;
    }

    const anchorPage = parseInt(pageContainer.dataset.pageNumber, 10);
    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects());
    const containerRect = pageContainer.getBoundingClientRect();

    _tempHighlightState.rects = rects.map(r => ({
        top: r.top - containerRect.top,
        left: r.left - containerRect.left,
        width: r.width,
        height: r.height
    }));
    _tempHighlightState.paginaFisica = anchorPage;

    if (typeof exibirPopupClassificacao === 'function') {
        exibirPopupClassificacao('texto', selecaoTexto, rects[0].left, rects[0].bottom + 10, anchorPage);
    }
}

function identificarFaseMetodologica(docNome) {
    if (!docNome) return 4; 
    if (typeof DOC_CONFIG !== 'undefined') {
        const conf = DOC_CONFIG.find(d => d.label === docNome);
        if (conf) return conf.fase;
    }
    const upper = docNome.toUpperCase();
    if (upper.includes('RECURSO') || upper.includes('CONTRARRAZÕES')) return 1;
    if (upper.includes('INICIAL') || upper.includes('CONTEST') || upper.includes('IMPUGNAÇÃO')) return 2;
    if (upper.includes('SENTENÇA') || upper.includes('ACÓRDÃO') || upper.includes('DECISÃO') || upper.includes('EMBARGOS')) return 3;
    return 4; 
}

async function salvarAnotacao(tipo, conteudo, documento, polo, topicoId, comentario = '', targetParentIndex = null, anchorPageOverride = null) {
    const capturedHighlights = (tipo === 'texto' || tipo === 'imagem') && _tempHighlightState.rects 
        ? structuredClone(_tempHighlightState.rects) : null;
    const capturedPagina = _tempHighlightState.paginaFisica;

    const topicoAlvo = topicos.find(t => t.id === topicoId);
    if (!topicoAlvo) return;

    const pageTarget = anchorPageOverride || (capturedPagina ? capturedPagina : (window.PdfEngine ? PdfEngine.getCurrentPage() : 1));
    let metaDaPagina = { pjeId: null, flsNum: null };
    
    if (window.PdfEngine) {
        metaDaPagina = await PdfEngine.extrairMetadadosDaPagina(pageTarget);
    }
    
    const novaExtracao = {
        tipo,
        documento,
        polo,
        pagina: window.PdfEngine ? PdfEngine.obterRotuloPagina(pageTarget) : pageTarget, 
        paginaFisica: pageTarget, 
        timestamp: Date.now(),
        conteudo: conteudo,
        pjeId: metaDaPagina.pjeId,
        comentario: comentario
    };

    if (capturedHighlights) novaExtracao.highlightRects = capturedHighlights;

    const faseNova = identificarFaseMetodologica(documento);

    if (targetParentIndex !== null && targetParentIndex !== '') {
        const parentNode = topicoAlvo.anotacoes[targetParentIndex];
        if (!parentNode.itensCorrelacionados) parentNode.itensCorrelacionados = [];
        parentNode.itensCorrelacionados.push(novaExtracao);
        exibirToast(`Item agrupado à Ideia ${parseInt(targetParentIndex) + 1}.`);
    } else {
        novaExtracao.subAnotacoes = [];
        novaExtracao.itensCorrelacionados = [];
        
        const temFase2 = topicoAlvo.anotacoes.some(a => identificarFaseMetodologica(a.documento) === 2);
        if (faseNova === 3 && !temFase2) {
            exibirToast("Atenção: Você avançou para a Sentença. Já verificou a Inicial/Contestação?", "aviso");
        } else {
            exibirToast(`Anotação salva em "${topicoAlvo.nome}".`);
        }

        let insertIndex = topicoAlvo.anotacoes.length;
        for (let i = 0; i < topicoAlvo.anotacoes.length; i++) {
            if (identificarFaseMetodologica(topicoAlvo.anotacoes[i].documento) > faseNova) {
                insertIndex = i;
                break;
            }
        }
        topicoAlvo.anotacoes.splice(insertIndex, 0, novaExtracao);
    }

    if (capturedHighlights && capturedPagina) {
        if (window.getSelection) window.getSelection().removeAllRanges();
    }
    
    if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
    renderizarTopicos();
    salvarBackupAutomatico();
}

/* ================================================
   NAVEGAÇÃO E UTILITÁRIOS DA INTERFACE
   ================================================ */
function irParaPagina() {
    const input = document.getElementById('goto-page-input');
    const termoBusca = input.value.trim().toLowerCase();
    
    if (!window.PdfEngine || !PdfEngine.getPdfDoc()) {
        exibirToast('Carregue um documento primeiro.', 'aviso');
        return;
    }
    
    if (!termoBusca) return;

    const targetPage = PdfEngine.resolverPagina(termoBusca);

    if (targetPage) {
        PdfEngine.goToPage(targetPage);
        input.value = '';
    } else {
        exibirToast(`Página não encontrada. Digite um número ou rótulo válido.`, 'erro');
    }
}

document.getElementById('goto-page-input')?.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') irParaPagina();
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        if (typeof fecharPopupClassificacao === 'function') fecharPopupClassificacao();
        if (typeof cancelarRecorteWizard === 'function') cancelarRecorteWizard();
    }
});

document.addEventListener('click', function (e) {
    const popup = document.getElementById('classification-popup');
    if (popup && popup.style.display === 'flex' && !popup.contains(e.target) && !e.target.closest('.icon-btn')) {
        if (typeof fecharPopupClassificacao === 'function') fecharPopupClassificacao();
    }
    const menu = document.getElementById('annotation-context-menu');
    if (menu) menu.style.display = 'none';

    const menuSub = document.getElementById('sub-annotation-context-menu');
    if (menuSub) menuSub.style.display = 'none';

    const menuJuris = document.getElementById('juris-menu');
    if (menuJuris && menuJuris.style.display === 'flex' && !menuJuris.contains(e.target) && !e.target.closest('.sidebar-logo-container')) {
        menuJuris.style.display = 'none';
    }
});

/* ================================================
   MENU JURIS NOTES E GESTÃO DE ABAS
   ================================================ */
function abrirMenuJuris(event) {
    event.stopPropagation();
    const menu = document.getElementById('juris-menu');
    menu.style.display = 'flex';
    menu.style.left = (event.clientX + 10) + 'px';
    menu.style.top = (event.clientY + 20) + 'px';
}

function abrirModalGerenciarAbas() {
    document.getElementById('juris-menu').style.display = 'none';
    const container = document.getElementById('lista-abas-gerenciador');
    container.innerHTML = '';

    if(topicos.length === 0) {
        container.innerHTML = '<p class="popup-label" style="text-align:center;">Nenhuma aba criada.</p>';
    } else {
        let htmlAcumulado = '';
        topicos.forEach((t, index) => {
            const nomeSeguro = TopicsManager.escaparHTML(t.nome);
            htmlAcumulado += `
                <div class="aba-manager-item" draggable="true" 
                     data-index="${index}"
                     ondragstart="AbaDnD.start(event)"
                     ondragover="AbaDnD.over(event)"
                     ondrop="AbaDnD.drop(event)"
                     ondragenter="AbaDnD.enter(event)"
                     ondragleave="AbaDnD.leave(event)"
                     ondragend="AbaDnD.end(event)"
                     style="cursor: grab; transition: opacity 0.2s;">
                    <span class="aba-manager-nome" title="${nomeSeguro}">
                        <span style="color:#ccc; margin-right:6px; font-size:1.1rem; vertical-align: middle;">⋮⋮</span> ${nomeSeguro}
                    </span>
                    <div class="aba-manager-actions">
                        <button class="ann-action-btn" title="Editar Nome" onclick="renomearAba('${t.id}')">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="ann-action-btn ann-action-delete" title="Excluir Aba" onclick="solicitarExclusaoAba(this, '${t.id}')">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>`;
        });
        container.innerHTML = htmlAcumulado;
    }

    document.getElementById('abas-modal-backdrop').style.display = 'block';
    document.getElementById('modal-gerenciar-abas').style.display = 'flex';
}

function fecharModalGerenciarAbas() {
    document.getElementById('abas-modal-backdrop').style.display = 'none';
    document.getElementById('modal-gerenciar-abas').style.display = 'none';
}

function renomearAba(id) {
    const topico = topicos.find(t => t.id === id);
    if (!topico) return;
    const novoNome = prompt('Digite o novo nome para a aba:', topico.nome);
    if (novoNome && novoNome.trim() !== '') {
        topico.nome = novoNome.trim();
        renderizarTopicos();
        salvarBackupAutomatico();
        abrirModalGerenciarAbas(); 
        exibirToast('Aba renomeada com sucesso!', 'sucesso');
    }
}

function solicitarExclusaoAba(btnEl, id) {
    if (btnEl.dataset.confirming === "true") {
        topicos = topicos.filter(t => t.id !== id);
        renderizarTopicos();
        salvarBackupAutomatico();
        if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
        abrirModalGerenciarAbas(); 
        exibirToast('Aba excluída.', 'sucesso');
    } else {
        btnEl.dataset.confirming = "true";
        const svgOriginal = btnEl.innerHTML;
        btnEl.innerHTML = "<span style='font-size:0.75rem; font-weight:bold;'>Confirma?</span>";
        btnEl.style.color = "#c62828";
        btnEl.style.backgroundColor = "#ffebee";
        
        setTimeout(() => {
            if (document.body.contains(btnEl)) {
                btnEl.dataset.confirming = "false";
                btnEl.innerHTML = svgOriginal;
                btnEl.style.color = "";
                btnEl.style.backgroundColor = "";
            }
        }, 3500);
    }
}

window.handleMetaClick = function(event, topicoId, index, isCorrelated = false, cIdx = null) {
    // 1. Resgate de Estado
    const topico = topicos.find(t => t.id === topicoId);
    if (!topico) return;

    const anotacao = isCorrelated 
        ? topico.anotacoes[index].itensCorrelacionados[cIdx] 
        : topico.anotacoes[index];

    // 2. Roteamento de Intenção do Usuário
    if (event.shiftKey) {
        // --- FLUXO 1: EDIÇÃO MANUAL ---
        const novaPagina = prompt(`Editar folha (Atual: ${anotacao.pagina || 'vazio'}):`, anotacao.pagina || '');
        if (novaPagina !== null) {
            anotacao.pagina = novaPagina;
            renderizarTopicos();
            salvarBackupAutomatico();
            exibirToast('Numeração de página atualizada!', 'sucesso');
        }

    } else if (event.ctrlKey && !event.shiftKey) {
        // --- FLUXO 2: NAVEGAÇÃO DIRETA PARA A PROVA ---
        event.preventDefault();
        event.stopPropagation(); // Previne fechamento acidental de menus globais

        // Validação estrita contra heurísticas (Usa apenas o dado físico garantido)
        const targetPage = anotacao.paginaFisica;

        if (!targetPage || isNaN(targetPage)) {
            exibirToast('Esta anotação foi capturada em uma versão antiga e não possui âncora física.', 'aviso');
            return;
        }

        if (!window.PdfEngine || !PdfEngine.getPdfDoc()) {
            exibirToast('Carregue o PDF do processo para acessar a folha correspondente.', 'aviso');
            return;
        }

        // Mutação Idempotente: Só troca a aba se realmente estiver fora dela
        const isAbaProcessoAtiva = document.getElementById('tab-leitura').classList.contains('active');
        if (!isAbaProcessoAtiva) {
            trocarAba('leitura');
        }

        // Double-rAF: Aguarda o término da mutação de Layout (display: none -> flex) 
        // antes de solicitar ao motor o cálculo de rolagem.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                PdfEngine.goToPage(targetPage);
            });
        });

    } else {
        // --- FLUXO 3: CÓPIA PARA ÁREA DE TRANSFERÊNCIA ---
        let textoParaCopiar = event.target.innerText;

        if (anotacao.tipo === 'audio') {
            try {
                const dados = JSON.parse(anotacao.conteudo);
                textoParaCopiar = `(${dados.labelInicio} a ${dados.labelFim} da gravação da audiência)`;
            } catch (e) {
                console.warn("[Juris Notes] Falha ao processar metadados de áudio.", e);
            }
        }

        navigator.clipboard.writeText(textoParaCopiar).then(() => {
            exibirToast('Referência copiada para a área de transferência.', 'sucesso');
        }).catch(() => {
            exibirToast('Falha ao copiar texto.', 'erro');
        });
    }
};

function abrirModalAjuda() {
    const menuJuris = document.getElementById('juris-menu');
    if (menuJuris) menuJuris.style.display = 'none';
    document.getElementById('ajuda-modal-backdrop').style.display = 'block';
    document.getElementById('modal-ajuda-intencoes').style.display = 'flex';
}

function fecharModalAjuda() {
    document.getElementById('ajuda-modal-backdrop').style.display = 'none';
    document.getElementById('modal-ajuda-intencoes').style.display = 'none';
}

window.AbaDnD = {
    draggedIndex: null,
    start: function(e) {
        this.draggedIndex = parseInt(e.currentTarget.dataset.index);
        e.currentTarget.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
    },
    over: function(e) { 
        e.preventDefault(); 
        e.dataTransfer.dropEffect = 'move'; 
    },
    enter: function(e) { 
        const item = e.currentTarget;
        item._dragCount = (item._dragCount || 0) + 1;
        item.style.borderTop = '3px dashed var(--trt-blue-mid)';
    },
    leave: function(e) { 
        const item = e.currentTarget;
        item._dragCount = (item._dragCount || 1) - 1;
        if (item._dragCount <= 0) {
            item.style.borderTop = '1px solid var(--border-color)';
            item._dragCount = 0;
        }
    },
    drop: function(e) {
        e.preventDefault();
        const targetElement = e.currentTarget.closest('.aba-manager-item');
        if (!targetElement) return;
        
        const targetIndex = parseInt(targetElement.dataset.index);
        if (this.draggedIndex === targetIndex) return;

        const [movido] = topicos.splice(this.draggedIndex, 1);
        topicos.splice(targetIndex, 0, movido);

        renderizarTopicos();
        salvarBackupAutomatico();
        exibirToast('Abas reordenadas com sucesso!', 'sucesso');
    },
    end: function(e) {
        e.currentTarget.style.opacity = '1';
        document.querySelectorAll('.aba-manager-item').forEach(el => {
            el.style.borderTop = '1px solid var(--border-color)';
            el._dragCount = 0;
        });
        if (typeof abrirModalGerenciarAbas === 'function') abrirModalGerenciarAbas(); 
    }
};

/* Mecanismo de Detecção de Memory Discard e Re-render de GPU */
window.addEventListener('pageshow', (event) => {
    if (event.persisted && window.TopicsManager && topicos.length > 0) {
        TopicsManager.renderizarFichario(topicos);
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (sessionStorage.getItem('juris_active_session') === 'true' && topicos.length === 0) {
            exibirToast('O navegador suspendeu esta aba e limpou a memória. Clique em "Retomar Processo" para carregar seu arquivo de backup.', 'erro');
            sessionStorage.removeItem('juris_active_session'); 
            return;
        }

        if (window.PdfEngine && PdfEngine.getPdfDoc() && topicos.length > 0) {
            const visiveis = document.querySelectorAll('.pdf-page-container');
            visiveis.forEach(container => {
                const rect = container.getBoundingClientRect();
                if (rect.top < window.innerHeight && rect.bottom > 0) {
                    const canvas = container.querySelector('canvas');
                    if (!canvas || canvas.width === 0) {
                        container.dataset.loaded = 'false';
                    }
                }
            });
            TopicsManager.renderizarFichario(topicos);
        }
    }
});

/* ================================================
   CRIAÇÃO EXPLÍCITA DE BACKUP (Resolve erro de ativação)
   ================================================ */
async function acionarCriacaoBackup() {
    console.log("[JURIS LOG] Usuário clicou em criar backup. Iniciando FileSystem API...");
    
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: window._nomeArquivoSugerido || 'backup_processo.json',
            types: [{ description: 'Arquivo de Backup Juris Notes', accept: { 'application/json': ['.json'] } }]
        });
        
        console.log("[JURIS LOG] Permissão concedida pelo usuário. Handle capturado.");
        
        BackupManager.setFileHandle(handle);
        atualizarStatusBackup('Sessão Ativa ✓', true);
        sessionStorage.setItem('juris_active_session', 'true');
        
        // Salva os dados iniciais vazios para confirmar que o arquivo foi criado
        await salvarBackupAutomatico();
        
        // Fecha o modal e avisa o usuário
        document.getElementById('backup-modal-backdrop').style.display = 'none';
        document.getElementById('modal-ativar-backup').style.display = 'none';
        exibirToast('Backup ancorado! Salvamento automático ativado.', 'sucesso');
        
    } catch (err) {
        // RASTREAMENTO DETALHADO DO ERRO
        console.error("[JURIS LOG FATAL] Falha ao criar arquivo de backup:");
        console.error("Nome do Erro:", err.name);
        console.error("Mensagem:", err.message);
        
        if (err.name === 'AbortError') {
            console.log("[JURIS LOG] O usuário cancelou a janela de salvar.");
            exibirToast('Você cancelou a criação do backup. Clique novamente para tentar.', 'aviso');
        } else if (err.name === 'SecurityError' || err.name === 'NotAllowedError') {
            exibirToast('O navegador bloqueou a gravação. Verifique as permissões de download.', 'erro');
        } else {
            exibirToast('Erro desconhecido ao tentar criar o arquivo.', 'erro');
        }
    }
}