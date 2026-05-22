/* ================================================
   ESTADO GLOBAL DA APLICAÇÃO
   ================================================ */
let topicos              = [];     // Array primário: [{ id, nome, cor, anotacoes: [] }]
let pdfDoc               = null;   // Documento PDF carregado pelo PDF.js
let currentPage          = 1;      // Página visível atual (atualizada pelo IntersectionObserver)
let modoRetomada         = false;  // Flag: true quando restaurando sessão existente (evita recriar backup)
let _encerrarTimer       = null;   // ID do setTimeout de confirmação do botão Encerrar
let _encerrarConfirmando = false;  // Flag: aguardando segundo clique para confirmar encerramento

// Observers separados para resolver o conflito entre Lazy Loading (Buffer) e UI (Crachá)
let pdfRenderObserver = null;   // Observer para pré-renderização (lazy loading)
let pdfReadTracker    = null;   // Observer para o crachá de leitura (UI)

let _sessaoPossuiAudio = false; // Flag de restauração de áudio na retomada de sessão

/* ================================================
   1. NOVO ESTADO GLOBAL (Marcações / Highlights)
   ================================================ */
let _tempHighlightState = {
    rects: null,
    paginaFisica: null
};

/* ================================================
   MOTOR LOCAL DE HIGHLIGHTS E BADGES (DOM isolado)
   ================================================ */
function _renderizarHighlightsDaPagina(pageNum, highlightLayerDiv) {
    highlightLayerDiv.innerHTML = ''; // Limpa a camada para repintura segura
    
    topicos.forEach(topico => {
        const borderCor = topico.cor;

        const desenharMarcacoes = (itens, parentIndex) => {
            if (!itens) return;
            itens.forEach((item, idx) => {
                const numIdeia = (parentIndex !== undefined ? parentIndex : idx) + 1;

                if ((item.tipo === 'texto' || item.tipo === 'imagem') && item.paginaFisica === pageNum && item.highlightRects && item.highlightRects.length > 0) {
                    
                    const firstRect = item.highlightRects[0];
                    const badge = document.createElement('div');
                    badge.className = 'pdf-annotation-badge';
                    badge.style.backgroundColor = topico.cor;
                    badge.innerText = numIdeia;

                    if (item.tipo === 'texto') {
                        // 1. Desenha as linhas sublinhadas (Apenas para texto)
                        item.highlightRects.forEach(rect => {
                            const marker = document.createElement('div');
                            marker.className = 'pdf-highlight-rect';
                            marker.style.top = rect.top + 'px';
                            marker.style.left = rect.left + 'px';
                            marker.style.width = rect.width + 'px';
                            marker.style.height = rect.height + 'px';
                            marker.style.borderBottom = `2.5px solid ${borderCor}`;
                            highlightLayerDiv.appendChild(marker);
                        });
                        
                        // 2. Crachá do Texto: Centralizado à Direita
                        badge.style.top = (firstRect.top + (firstRect.height / 2)) + 'px';
                        badge.style.transform = 'translateY(-50%)'; 
                        // Mantém o 'right: 4px' padrão do CSS (.pdf-annotation-badge)
                    } 
                    else if (item.tipo === 'imagem') {
                        // 2. Crachá da Imagem: Topo à Esquerda da área recortada
                        badge.style.top = firstRect.top + 'px';
                        badge.style.right = 'auto'; // Anula o posicionamento direito do CSS
                        // Evita vazar da tela com Math.max (garante mínimo 4px da borda esquerda)
                        badge.style.left = Math.max(4, firstRect.left - 28) + 'px';
                    }
                    
                    // 3. Sistema de Tooltip Otimizado (reaproveitando DOM nativo da aplicação)
                    badge.addEventListener('mouseenter', (e) => {
                        const tooltip = document.getElementById('quick-intent-tooltip');
                        if (!tooltip) return;
                        tooltip.innerHTML = `<strong>Tópico Vinculado</strong>${topico.nome}`;
                        
                        // Lógica de posicionamento anti-overflow
                        tooltip.style.display = 'block';
                        tooltip.classList.remove('visible');
                        
                        let x = e.clientX + 15;
                        let y = e.clientY + 15;
                        const rect = tooltip.getBoundingClientRect();
                        if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - 15;
                        if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - 15;
                        
                        tooltip.style.left = `${x}px`;
                        tooltip.style.top = `${y}px`;
                        
                        requestAnimationFrame(() => tooltip.classList.add('visible'));
                    });
                    
                    badge.addEventListener('mouseleave', () => {
                        const tooltip = document.getElementById('quick-intent-tooltip');
                        if (tooltip) {
                            tooltip.classList.remove('visible');
                            setTimeout(() => { tooltip.style.display = 'none'; }, 200);
                        }
                    });

                    highlightLayerDiv.appendChild(badge);
                }
                
                // Mapeamento recursivo para agrupar provas (mantém numeração do pai)
                if (item.itensCorrelacionados) {
                    desenharMarcacoes(item.itensCorrelacionados, parentIndex !== undefined ? parentIndex : idx);
                }
            });
        };
        desenharMarcacoes(topico.anotacoes);
    });
}

/* ================================================
   MOTOR GLOBAL DE SINCRONIZAÇÃO (Invocado apenas por mutações de estado)
   ================================================ */
window.sincronizarHighlightsGerais = function() {
    document.querySelectorAll('.pdf-page-container').forEach(container => {
        if (container.dataset.loaded === 'true') {
            const pageNum = parseInt(container.dataset.pageNumber);
            const highlightLayerDiv = container.querySelector('.highlightLayer');
            if (highlightLayerDiv) {
                _renderizarHighlightsDaPagina(pageNum, highlightLayerDiv);
            }
        }
    });
};

/* ================================================
   MOCK COMPLETO DO LINKSERVICE (Compatível PDF.js V4)
   ================================================ */
const jurisLinkService = {
    externalLinkEnabled: true,
    externalLinkRel: 'noopener noreferrer nofollow',
    externalLinkTarget: 2,
    
    goToDestination: async function(dest) {
        console.group('🔵 [Diagnóstico LinkService] Gatilho Acionado!');
        console.log('Tipo de destino recebido:', typeof dest);
        console.log('Conteúdo do destino (Bruto):', dest);

        if (!pdfDoc) {
            console.error('Falha: Documento PDF não está disponível no escopo.');
            console.groupEnd();
            return;
        }
        
        try {
            let explicitDest = dest;
            // Auditoria estrita de Named Destinations comuns em PJe
            if (typeof dest === 'string') {
                console.warn('⚠️ O PJe usou um Named Destination. Tentando resolver a string via pdfDoc...');
                explicitDest = await pdfDoc.getDestination(dest);
                console.log('Resultado da resolução:', explicitDest);
            }
            
            if (Array.isArray(explicitDest)) {
                const pageRef = explicitDest[0];
                let pageNum;
                
                if (typeof pageRef === 'object' && pageRef !== null) {
                    const pageIndex = await pdfDoc.getPageIndex(pageRef);
                    pageNum = pageIndex + 1; 
                } else if (Number.isInteger(pageRef)) {
                    pageNum = pageRef + 1;
                }
                
                console.log('Página matemática calculada com sucesso:', pageNum);
                
                if (pageNum) {
                    this.goTo(pageNum);
                }
            } else {
                console.error('Falha Arquitetural: O destino resolvido não é um Array válido do PDF.js.');
            }
        } catch (e) {
            console.error('Exceção crítica na resolução do link:', e);
        }
        console.groupEnd();
    },
    
    // Motor Centralizado de Rolagem Matemática
    goTo: function(pageNum) {
        const pageContainer = document.querySelector(`.pdf-page-container[data-page-number="${pageNum}"]`);
        const scrollContainer = document.getElementById('pdf-container');
        
        if (pageContainer && scrollContainer) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const pageRect = pageContainer.getBoundingClientRect();
            
            // Cálculo absoluto de posição previne bugs de DOM aninhado
            const targetScrollTop = scrollContainer.scrollTop + (pageRect.top - containerRect.top) - 16;
            
            // Salto instantâneo ('auto') previne colapso da Main Thread pelos Observers
            scrollContainer.scrollTo({ top: targetScrollTop, behavior: 'auto' });
            
            if (typeof exibirToast === 'function') {
                exibirToast(`Acessando fl. ${pageNum} via sumário.`, 'sucesso');
            }
        } else {
            if (typeof exibirToast === 'function') {
                exibirToast('Página alvo não encontrada no DOM.', 'erro');
            }
        }
    },
    
    // Stubs necessários 
    getDestinationHash: function(dest) { return ''; }, // Retorno vazio evita acúmulo de hashes na URL
    getAnchorUrl: function(hash) { return ''; },
    setDocument: function(doc) {},
    executeNamedAction: function(action) { console.log('[JurisNotes] Ação interna:', action); }
};

/* ================================================
   METADADOS LÓGICOS DO PDF (PJe)
   ================================================ */
let pageLabelsGlobais = null; // Armazena a numeração oficial (PJe/Foxit)

// NOVO: Cache unificado e performático usando Map nativo
const _pageMetadataCache = new Map(); 

/**
 * Atualiza o painel superior garantindo a SOBERANIA do marcador "Fls.:"
 */
function atualizarDisplayPaginador(pageNum) {
    if (currentPage !== pageNum) return; // Evita bugs de rolagem rápida

    const meta = _pageMetadataCache.get(pageNum);
    
    // 1. PRIORIDADE ABSOLUTA: O número impresso capturado pela força bruta
    let displayLabel = meta && meta.flsNum ? meta.flsNum : null;
    
    // 2. FALLBACK 1: Metadado lógico invisível do PDF (apenas se a folha não tiver carimbo)
    if (!displayLabel && pageLabelsGlobais && pageLabelsGlobais[pageNum - 1]) {
        displayLabel = pageLabelsGlobais[pageNum - 1];
    }
    
    // 3. FALLBACK 2: Número físico da página (último recurso)
    if (!displayLabel) {
        displayLabel = pageNum;
    }
    
    document.getElementById('current-page-display').textContent = displayLabel;
}

/**
 * Função usada na hora de exportar a prova (Salvar Anotação).
 * Garante que a âncora exportada seja baseada no marcador impresso.
 */
function obterRotuloPagina(paginaFisica) {
    const meta = _pageMetadataCache.get(paginaFisica);
    // Prioridade 1: Marcação Física ("Fls.:")
    if (meta && meta.flsNum) return meta.flsNum;
    // Prioridade 2: Marcação Digital (Metadados)
    if (pageLabelsGlobais && pageLabelsGlobais[paginaFisica - 1]) return pageLabelsGlobais[paginaFisica - 1];
    // Prioridade 3: Posição no Array
    return paginaFisica;
}

/* ================================================
   TEMA DO PDF (JASMINE / BRANCO)
   ================================================ */
function aplicarTemaPDF(tema) { // 'jasmine' | 'white'
    // Aplica a classe no body baseada na escolha
    document.body.classList.toggle('theme-white', tema === 'white');
    
    // Salva a preferência no navegador do usuário
    localStorage.setItem('pdf-theme', tema);
    
    // Fecha o menu após clicar
    const menu = document.getElementById('juris-menu');
    if (menu) menu.style.display = 'none';
    
    exibirToast(`Fundo ${tema === 'white' ? 'Branco' : 'Jasmine'} ativado.`, 'sucesso');
}

document.addEventListener("DOMContentLoaded", () => {
    // Carrega o tema salvo ou aplica o jasmine como padrão
    const savedTheme = localStorage.getItem('pdf-theme') || 'jasmine';
    aplicarTemaPDF(savedTheme);

    // Injeção de dependência dinâmica para o gerenciador de áudio
    if (window.AudioManager) {
        AudioManager.init({
            getTopicos: () => topicos, 
            exibirToast: exibirToast,
            salvarAnotacao: salvarAnotacao
        });
    }

    // Injeção de dependência padronizada para o exportador
    if (window.ExportManager) {
        ExportManager.init({
            getTopicos: () => topicos,
            exibirToast: exibirToast,
            getActiveTabId: () => TopicsManager.getActiveTabId()
        });
    }

    // Listener de scroll para os FABs — passivo para não bloquear a renderização
    const historyContainer = document.getElementById('history-container');
    if (historyContainer) {
        historyContainer.addEventListener('scroll', checkScrollFabState, { passive: true });
    }
    
    // NOVO: Listener de scroll para os FABs na aba PDF
    const pdfContainer = document.getElementById('pdf-container');
    if (pdfContainer) {
        pdfContainer.addEventListener('scroll', checkScrollFabState, { passive: true });
    }

    // [DIAGNÓSTICO CORRIGIDO]: Auditoria de Event Bubbling no Container Pai
    const pdfContainer = document.getElementById('pdf-container');
    if (pdfContainer) {
        pdfContainer.addEventListener('click', (e) => {
            const linkAncorado = e.target.closest('.linkAnnotation a');
            if (linkAncorado) {
                console.warn('⚠️ [Auditoria de Clique] Clique capturado no contêiner raiz.');
                
                // Se defaultPrevented for FALSE, significa que o PDF.js V4 não assumiu 
                // o controle do link (provavelmente rejeitou nosso Mock).
                console.log('O PDF.js assumiu controle do evento? (defaultPrevented):', e.defaultPrevented);
                
                if (!e.defaultPrevented) {
                    console.error('🔴 ALERTA: O PDF.js rejeitou a vinculação do evento! O clique vazou para o navegador.');
                    e.preventDefault(); // Evita que o navegador tente abrir a URL nula e quebre a página
                }
            }
        }, true);
    }
});

/* ================================================
   PALETA DE CORES E RENDERIZAÇÃO
   Gerenciada pelo módulo isolado TopicsManager (topics-manager.js)
   ================================================ */

/* ================================================
   GERENCIAMENTO DE INTERFACE E SCROLL DISPATCHER
   ================================================ */

function getActiveScrollContainer() {
    return document.getElementById('tab-leitura').classList.contains('active') 
        ? document.getElementById('pdf-container') 
        : document.getElementById('history-container');
}

function trocarAba(aba) {
    document.getElementById('pdf-container').style.display     = aba === 'leitura'   ? 'flex'  : 'none';
    document.getElementById('history-container').style.display = aba === 'historico' ? 'block' : 'none';
    document.getElementById('tab-leitura').classList.toggle('active',   aba === 'leitura');
    document.getElementById('tab-historico').classList.toggle('active', aba === 'historico');

    // Botão de exportação: visível apenas na aba Anotações e somente se houver tópicos
    const btnExportar = document.getElementById('btn-exportar-topico');
    if (btnExportar) {
        btnExportar.style.display = (aba === 'historico' && topicos.length > 0) ? 'flex' : 'none';
    }

    // FABs de navegação: exibe em ambas as abas, confia na checagem de conteúdo
    const fabContainer = document.getElementById('scroll-fab-container');
    if (fabContainer) {
        fabContainer.style.display = 'flex';
        // Pequeno delay para garantir que o display das abas já foi aplicado
        setTimeout(checkScrollFabState, 60);
    }
}

/* ================================================
   NAVEGAÇÃO POR FABs (INTELIGENTE)
   ================================================ */

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
    // Bloqueia poluição visual de status ordinários, emitindo apenas eventos críticos
    if (texto.includes('Restaurada') || texto.includes('Erro')) {
        exibirToast(`Sistema: ${texto}`, ativa ? 'sucesso' : 'erro');
    }
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
    document.getElementById('btn-ferramenta-audio').disabled   = false;
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

    if (window.AudioManager) window.AudioManager.encerrar();

    // Reset de estado
    topicos      = [];
    pdfDoc       = null;
    modoRetomada = false;
    pageLabelsGlobais = null; // Fix: Evita vazamento entre sessões
    _pageMetadataCache.clear(); // O(1) memory cleanup
    BackupManager.encerrar();

    if (pdfRenderObserver) {
        pdfRenderObserver.disconnect();
        pdfRenderObserver = null;
    }
    if (pdfReadTracker) {
        pdfReadTracker.disconnect();
        pdfReadTracker = null;
    }

    // Reset visual
    const wrapper = document.getElementById('pdf-wrapper');
    wrapper.innerHTML     = '';
    wrapper.style.display = 'none';
    document.getElementById('pdf-placeholder').style.display = 'flex';
    document.getElementById('floating-page-panel').style.display = 'none';
    document.getElementById('btn-exportar-topico').style.display = 'none';
    document.getElementById('current-page-display').textContent  = '1';
    document.getElementById('pdf-upload').value = '';

    // Desabilitar todas as ferramentas de trabalho
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
        _sessaoPossuiAudio = pacote.metadata.possuiAudio ?? false;

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
        if (window.AudioManager) window.AudioManager.encerrar();
        topicos = [];
        BackupManager.encerrar(); // Substitui: fileHandleBackup = null
        renderizarTopicos();
        atualizarStatusBackup('Aguardando...');
    }

    await carregarPDF(event);
}

/* ================================================
   CARREGAMENTO DO PDF E LAZY LOADING
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

                // Alimenta o badge "Pág. X de Y" com o total físico de páginas do documento
                document.getElementById('total-page-display').textContent = pdf.numPages;

                // --- NOVO: Extração de Metadados Lógicos ---
                try {
                    pageLabelsGlobais = await pdf.getPageLabels();
                    console.log('Metadados lógicos de página carregados com sucesso.');
                } catch (e) {
                    console.warn('PDF não possui rótulos lógicos. Usando numeração física.');
                    pageLabelsGlobais = null; // Limpa resquícios de sessão anterior
                }
                // -------------------------------------------

                habilitarFerramentasDeTrabalho();

                const wrapper = document.getElementById('pdf-wrapper');
                wrapper.innerHTML = '';
                wrapper.style.display = 'flex';
                document.getElementById('pdf-placeholder').style.display = 'none';
                document.getElementById('floating-page-panel').style.display = 'flex';

                // 1. Observer de Pré-Renderização (Lazy Loading - Mantém a tela fluida)
                if (pdfRenderObserver) pdfRenderObserver.disconnect();
                pdfRenderObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting && entry.target.dataset.loaded === 'false') {
                            const pageNum = parseInt(entry.target.dataset.pageNumber);
                            renderizarPaginaElemento(pageNum, entry.target);
                            entry.target.dataset.loaded = 'true';
                        }
                    });
                }, { 
                    root: document.getElementById('pdf-container'), 
                    rootMargin: '600px 0px', 
                    threshold: 0 
                });

                // 2. Observer de Rastreamento de Leitura (Atualiza o Crachá Visual)
                if (pdfReadTracker) pdfReadTracker.disconnect();
                pdfReadTracker = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const pageNum = parseInt(entry.target.dataset.pageNumber);
                            currentPage = pageNum;
                            atualizarDisplayPaginador(currentPage);
                        }
                    });
                }, { 
                    root: document.getElementById('pdf-container'), 
                    rootMargin: '-15% 0px -80% 0px', 
                    threshold: 0 
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
                        background-color: var(--pdf-bg-color);
                        box-shadow: var(--shadow-md);
                    `;
                    wrapper.appendChild(pageContainer);
                    
                    pdfRenderObserver.observe(pageContainer);
                    pdfReadTracker.observe(pageContainer);
                }

                // — Gestão de sessão pós-carregamento ——————————————
                if (modoRetomada) {
                    modoRetomada = false;
                    trocarAba('leitura');
                    exibirToast('PDF validado e carregado. Sessão retomada com sucesso. ✓');
                    
                    if (_sessaoPossuiAudio && window.AudioManager) {
                        window.AudioManager.solicitarMp3Retomada();
                    }
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
   RENDERIZAÇÃO DINÂMICA (PÁGINA INDIVIDUAL) — v4.x
   ================================================ */
async function renderizarPaginaElemento(num, container) {
    if (!pdfDoc) return;

    // 1. Previne sobreposição e ghosting em re-renderizações durante navegação extrema
    if (container._renderTask) {
        container._renderTask.cancel();
    }
    container.innerHTML = '';

    const page = await pdfDoc.getPage(num);
    const dpr  = window.devicePixelRatio || 1;
    const scale = 1.5;

    const viewport = page.getViewport({ scale: scale });

    // Redimensiona o container ao tamanho real desta página específica
    container.style.width  = Math.floor(viewport.width)  + 'px';
    container.style.height = Math.floor(viewport.height) + 'px';

    // --- 2. Canvas HD (desenho da página) ---
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    
    canvas.width  = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block;';
    container.appendChild(canvas);

    // Ajuste nativo de nitidez para telas Retina via transform
    const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;

    // --- 3. Camada de Texto Selecionável ---
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    // A MAGIA DA V4: Alinhamento milimétrico dependente desta variável CSS nativa
    textLayer.style.setProperty('--scale-factor', viewport.scale);
    container.appendChild(textLayer);

    // --- 4. Renderização Sequencial Segura ---
    const renderContext = {
        canvasContext: ctx,
        transform: transform,
        viewport: viewport
    };

    container._renderTask = page.render(renderContext);

    try {
        await container._renderTask.promise;
        
        // 1. Renderiza o texto
        const textContent = await page.getTextContent();
        const tl = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textLayer,
            viewport: viewport
        });
        await tl.render();

        // --- RENDERIZAÇÃO DA CAMADA DE HIGHLIGHTS ---
        const highlightLayerDiv = document.createElement('div');
        highlightLayerDiv.className = 'highlightLayer';
        highlightLayerDiv.style.setProperty('--scale-factor', viewport.scale);
        container.appendChild(highlightLayerDiv);

        // Renderiza atômicamente apenas a página atual (O(1))
        _renderizarHighlightsDaPagina(num, highlightLayerDiv);
        // --- FIM DA CAMADA DE HIGHLIGHTS ---

        // 2. Extração de Metadados (já existente)
        if (!_pageMetadataCache.has(num)) {
            extrairMetadadosDaPagina(num, textContent).then((meta) => {
                atualizarDisplayPaginador(num);
            });
        }

        // --- 3. IMPLEMENTAÇÃO SEGURA DA CAMADA DE ANOTAÇÕES (LINKS) ---
        const annotationData = await page.getAnnotations();
        
        if (annotationData && annotationData.length > 0 && container.contains(textLayer)) {
            const annotationLayerDiv = document.createElement('div');
            annotationLayerDiv.className = 'annotationLayer';
            annotationLayerDiv.style.setProperty('--scale-factor', viewport.scale);
            container.appendChild(annotationLayerDiv);

            // 1. Construtor V4 (Setup Base)
            const annotationLayer = new pdfjsLib.AnnotationLayer({
                page: page,
                viewport: viewport,
                div: annotationLayerDiv,
                linkService: jurisLinkService,
                renderInteractiveForms: false 
            });

            // 2. Renderização V4 (Injeção de Dados Obrigatória)
            await annotationLayer.render({ 
                annotations: annotationData, // <-- A CORREÇÃO ESTÁ AQUI
                viewport: viewport, 
                intent: 'display',
                linkService: jurisLinkService 
            });
            
            // [DIAGNÓSTICO CORRIGIDO]: Introspecção Pós-Renderização
            const links = annotationData.filter(a => a.subtype === 'Link');
            if (links.length > 0) {
                const domLinks = annotationLayerDiv.querySelectorAll('.linkAnnotation > a');
                console.group(`[Diagnóstico PDF] Pág ${num} - Renderização Concluída`);
                console.log(`Links no Binário: ${links.length} | Links no HTML: ${domLinks.length}`);
                if (domLinks.length > 0) {
                    console.log('Exemplo de destino do 1º link:', links[0].dest || links[0].unsafeUrl);
                }
                console.groupEnd();
            }
        }

    } catch (err) {
        if (err.name === 'RenderingCancelledException') {
            console.log(`Renderização da pág ${num} cancelada de forma segura.`);
        } else {
            console.error('Erro ao renderizar página PDF:', err);
        }
    } finally {
        container._renderTask = null;
    }
}

/* ================================================
   GESTÃO DE TÓPICOS RECURSAIS
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

function renderizarTopicos() {
    TopicsManager.renderizarFichario(topicos);
}

/* ================================================
   CAPTURA MANUAL DE TEXTO SELECIONADO E SNAPSHOT
   ================================================ */
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

    // Salva a normalização geométrica no estado global
    _tempHighlightState.rects = rects.map(r => ({
        top: r.top - containerRect.top,
        left: r.left - containerRect.left,
        width: r.width,
        height: r.height
    }));
    _tempHighlightState.paginaFisica = anchorPage;

    // Chamada (mantendo a assinatura antiga para retrocompatibilidade)
    exibirPopupClassificacao('texto', selecaoTexto, rects[0].left, rects[0].bottom + 10, anchorPage);
}

/* ================================================

/* ================================================
   MOTOR HEURÍSTICO DE FASES METODOLÓGICAS
   ================================================ */
function identificarFaseMetodologica(docNome) {
    if (!docNome) return 4; // Elementos não nomeados ou áudios caem em provas
    
    // 1. Tenta correspondência exata
    const conf = DOC_CONFIG.find(d => d.label === docNome);
    if (conf) return conf.fase;
    
    // 2. Fallback robusto para nomes customizados do legado
    const upper = docNome.toUpperCase();
    if (upper.includes('RECURSO') || upper.includes('CONTRARRAZÕES')) return 1;
    if (upper.includes('INICIAL') || upper.includes('CONTEST') || upper.includes('IMPUGNAÇÃO')) return 2;
    if (upper.includes('SENTENÇA') || upper.includes('ACÓRDÃO') || upper.includes('DECISÃO') || upper.includes('EMBARGOS')) return 3;
    
    return 4; // Quesitos, Laudos, Documentos genéricos
}

/* ================================================
   PERSISTÊNCIA DE ANOTAÇÕES
   ================================================ */
async function salvarAnotacao(tipo, conteudo, documento, polo, topicoId, comentario = '', targetParentIndex = null, anchorPageOverride = null) {
    
    // 🔥 DEFESA SÍNCRONA CRÍTICA: Captura os dados antes de qualquer await!
    // Garante que o fechamento instantâneo do popup não destrua os dados desta execução.
    const capturedHighlights = (tipo === 'texto' || tipo === 'imagem') && _tempHighlightState.rects 
        ? structuredClone(_tempHighlightState.rects) 
        : null;
    const capturedPagina = _tempHighlightState.paginaFisica;

    const topicoAlvo = topicos.find(t => t.id === topicoId);
    if (!topicoAlvo) return;

    // A partir daqui ocorre a suspensão (await), mas nossos dados já estão seguros no escopo local.
    const pageTarget = anchorPageOverride || (capturedPagina ? capturedPagina : currentPage);
    const metaDaPagina = await extrairMetadadosDaPagina(pageTarget);
    
    const novaExtracao = {
        tipo,
        documento,
        polo,
        pagina: obterRotuloPagina(pageTarget), 
        paginaFisica: pageTarget, 
        timestamp: Date.now(),
        conteudo: conteudo,
        pjeId: metaDaPagina.pjeId,
        comentario: comentario
    };

    if (capturedHighlights) {
        novaExtracao.highlightRects = capturedHighlights;
    }

    const faseNova = identificarFaseMetodologica(documento);

    if (targetParentIndex !== null && targetParentIndex !== '') {
        const parentNode = topicoAlvo.anotacoes[targetParentIndex];
        if (!parentNode.itensCorrelacionados) parentNode.itensCorrelacionados = [];
        parentNode.itensCorrelacionados.push(novaExtracao);
        exibirToast(`Item agrupado à Ideia ${parseInt(targetParentIndex) + 1}.`);
    } else {
        novaExtracao.subAnotacoes = [];
        novaExtracao.itensCorrelacionados = [];
        
        // ALERTA DE SALTO METODOLÓGICO
        const temFase2 = topicoAlvo.anotacoes.some(a => identificarFaseMetodologica(a.documento) === 2);
        if (faseNova === 3 && !temFase2) {
            exibirToast("Atenção: Você avançou para a Sentença. Já verificou a Inicial/Contestação?", "aviso");
        } else {
            exibirToast(`Anotação salva em "${topicoAlvo.nome}".`);
        }

        // SMART SORT (Cronologia Lógica)
        let insertIndex = topicoAlvo.anotacoes.length;
        for (let i = 0; i < topicoAlvo.anotacoes.length; i++) {
            if (identificarFaseMetodologica(topicoAlvo.anotacoes[i].documento) > faseNova) {
                insertIndex = i;
                break;
            }
        }
        topicoAlvo.anotacoes.splice(insertIndex, 0, novaExtracao);
    }

    // INÍCIO DA INJEÇÃO VISUAL EM TEMPO REAL
    if (capturedHighlights && capturedPagina) {
        if (window.getSelection) window.getSelection().removeAllRanges();
    }
    // Sincroniza as camadas do PDF com o novo estado de dados
    if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
    // FIM DA INJEÇÃO VISUAL EM TEMPO REAL

    renderizarTopicos();
    salvarBackupAutomatico();
}

// Fechar popup e desativar modo recorte com Escape
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        fecharPopupClassificacao(); // Fecha o popup de texto, se estiver aberto
        cancelarRecorteWizard();    // Fecha o wizard e desativa o overlay (seguro chamar mesmo em IDLE)
    }
});

/* ================================================
   GERENCIAMENTO DE ANOTAÇÕES
   ================================================ */

document.addEventListener('click', function (e) {
    // 1. Fecha o popup de classificação se o clique foi fora dele
    const popup = document.getElementById('classification-popup');
    if (
        popup &&
        popup.style.display === 'flex' &&
        !popup.contains(e.target) &&
        !e.target.closest('.icon-btn')
    ) {
        // Usa chamada global (fecharPopupClassificacao está em interaction-tools.js)
        if (typeof fecharPopupClassificacao === 'function') fecharPopupClassificacao();
    }

    // 2. Fecha o menu contextual das anotações principais
    const menu = document.getElementById('annotation-context-menu');
    if (menu) menu.style.display = 'none';

    // 3. Fecha o menu contextual das sub-anotações
    const menuSub = document.getElementById('sub-annotation-context-menu');
    if (menuSub) menuSub.style.display = 'none';

    // 4. Fecha o menu Juris Notes
    const menuJuris = document.getElementById('juris-menu');
    if (menuJuris && menuJuris.style.display === 'flex' && !menuJuris.contains(e.target) && !e.target.closest('.sidebar-logo-container')) {
        menuJuris.style.display = 'none';
    }
});

/* ================================================
   NAVEGAÇÃO DIRETA DE PÁGINA (COM BUSCA REVERSA)
   ================================================ */
function irParaPagina() {
    const input = document.getElementById('goto-page-input');
    const termoBusca = input.value.trim().toLowerCase();
    
    if (!pdfDoc) {
        exibirToast('Carregue um documento primeiro.', 'aviso');
        return;
    }
    
    if (!termoBusca) return;

    let pageNum = parseInt(termoBusca, 10);

    // 1. Busca reversa no cache de folhas impressas (O(n) suportável para Map pequeno)
    let encontradoNoCache = false;
    for (const [key, value] of _pageMetadataCache.entries()) {
        if (value.flsNum === termoBusca) {
            pageNum = key;
            encontradoNoCache = true;
            break;
        }
    }

    // 2. Fallback para os metadados lógicos do PDF
    if (!encontradoNoCache && pageLabelsGlobais) {
        const indexEncontrado = pageLabelsGlobais.findIndex(label => 
            label && label.toString().trim().toLowerCase() === termoBusca
        );
        if (indexEncontrado !== -1) {
            pageNum = indexEncontrado + 1;
        }
    }

    if (isNaN(pageNum) || pageNum < 1 || pageNum > pdfDoc.numPages) {
        exibirToast(`Página não encontrada. Digite um número ou rótulo válido.`, 'erro');
        return;
    }

    // NOVA LÓGICA: Delega a ação para o barramento centralizado
    jurisLinkService.goTo(pageNum);
    
    if (input) input.value = ''; // Limpa o input por questão de UX após o sucesso
}

document.getElementById('goto-page-input')?.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') irParaPagina();
});

/* ================================================
   EXTRATOR DE METADADOS (PJe e Numeração Fls.)
   ================================================ */
async function extrairMetadadosDaPagina(pageNum, textContentPreCarregado = null) {
    if (_pageMetadataCache.has(pageNum)) return _pageMetadataCache.get(pageNum);
    
    try {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = textContentPreCarregado || await page.getTextContent();
        
        // Pega as dimensões físicas reais da página (Largura e Altura)
        const viewport = page.getViewport({ scale: 1.0 });

        const items = textContent.items;

        // 1. Hash PJe (Extraído de todo o texto, pois é um ID muito longo e único)
        const fullTextNormal = items.map(item => item.str).join(' ');
        const regexPje = /\d{2}:\d{2}:\d{2}\s*-\s*([a-f0-9]{7,})\b/i;
        const matchPje = fullTextNormal.match(regexPje);
        const pjeId = matchPje ? matchPje[1].toLowerCase() : null;
        
        // ==========================================
        // 2. RADAR ESPACIAL: Quadrante Superior Direito
        // No sistema de coordenadas do PDF, (0,0) fica no canto inferior esquerdo.
        // Portanto, Y alto significa "Topo da página" e X alto significa "Direita".
        // ==========================================
        const topRightItems = items.filter(item => {
            const x = item.transform[4]; // Posição Horizontal
            const y = item.transform[5]; // Posição Vertical
            
            // Verifica se o texto está na metade direita (> 40% da largura)
            // E na parte superior (> 60% da altura da folha)
            const isRightHalf = x > (viewport.width * 0.4);
            const isTopHalf   = y > (viewport.height * 0.6);
            
            return isRightHalf && isTopHalf;
        });

        // Junta apenas os textos que caíram na nossa "malha fina" geométrica
        const topRightText = topRightItems.map(item => item.str).join(' ');

        // Aplica o seu padrão estrito do carimbo oficial
        const regexFlsRigida = /\bfls\.?\s*:\s*(\d+)\b/i;
        const matchFls = topRightText.match(regexFlsRigida);

        const flsNum = matchFls ? matchFls[1] : null;

        const resultado = { pjeId, flsNum };
        
        // Salva na memória oficial do sistema (Cache O(1))
        _pageMetadataCache.set(pageNum, resultado);
        
        return resultado;
    } catch (err) {
        console.error('Falha ao extrair metadados físicos da página:', err);
        return { pjeId: null, flsNum: null };
    }
}

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
        abrirModalGerenciarAbas(); // Atualiza a lista no modal
        exibirToast('Aba renomeada com sucesso!', 'sucesso');
    }
}

function solicitarExclusaoAba(btnEl, id) {
    if (btnEl.dataset.confirming === "true") {
        // Segundo clique confirmado
        topicos = topicos.filter(t => t.id !== id);
        renderizarTopicos();
        salvarBackupAutomatico();
        if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
        abrirModalGerenciarAbas(); 
        exibirToast('Aba excluída.', 'sucesso');
    } else {
        // Primeiro clique (Aviso visual)
        btnEl.dataset.confirming = "true";
        const svgOriginal = btnEl.innerHTML;
        btnEl.innerHTML = "<span style='font-size:0.75rem; font-weight:bold;'>Confirma?</span>";
        btnEl.style.color = "#c62828";
        btnEl.style.backgroundColor = "#ffebee";
        
        // Retorna ao estado original após 3.5 segundos
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

/* ================================================
   EDIÇÃO DE METADADOS (PÁGINA/ID PJe)
   ================================================ */
window.handleMetaClick = function(event, topicoId, index, isCorrelated = false, cIdx = null) {
    const topico = topicos.find(t => t.id === topicoId);
    if (!topico) return;

    const anotacao = isCorrelated ? topico.anotacoes[index].itensCorrelacionados[cIdx] : topico.anotacoes[index];

    if (event.shiftKey) {
        // Modo Edição: Altera manualmente a folha
        const novaPagina = prompt(`Editar folha (Atual: ${anotacao.pagina || 'vazio'}):`, anotacao.pagina || '');
        if (novaPagina !== null) {
            anotacao.pagina = novaPagina;
            renderizarTopicos();
            salvarBackupAutomatico();
            exibirToast('Numeração de página atualizada!', 'sucesso');
        }
    } else {
        // Modo Cópia: Formatação inteligente e desacoplada
        let textoParaCopiar = event.target.innerText;

        // Regra de formatação dedicada para Oitivas
        if (anotacao.tipo === 'audio') {
            try {
                const dados = JSON.parse(anotacao.conteudo);
                // Gera: (00'34'' a 01'58'' da gravação da audiência)
                textoParaCopiar = `(${dados.labelInicio} a ${dados.labelFim} da gravação da audiência)`;
            } catch (e) {
                console.warn("[Juris Notes] Falha ao processar metadados de áudio para cópia. Usando texto nativo.", e);
            }
        }

        navigator.clipboard.writeText(textoParaCopiar).then(() => {
            exibirToast('Referência copiada para a área de transferência.', 'sucesso');
        }).catch(() => {
            exibirToast('Falha ao copiar texto.', 'erro');
        });
    }
};

/* ================================================
   CONTROLES DO GUIA METODOLÓGICO (AJUDA)
   ================================================ */
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

/* ================================================
   MOTOR DRAG & DROP — GERENCIAMENTO DE ABAS
   ================================================ */
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

        // Reordena o array global de tópicos
        const [movido] = topicos.splice(this.draggedIndex, 1);
        topicos.splice(targetIndex, 0, movido);

        // Salva e atualiza o estado em background (sem destruir o DOM ainda)
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
        // Recarrega a interface do modal de forma segura após o encerramento do arrasto
        if (typeof abrirModalGerenciarAbas === 'function') abrirModalGerenciarAbas(); 
    }
};
