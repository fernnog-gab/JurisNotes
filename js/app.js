/* ================================================
   ESTADO GLOBAL DA APLICAÇÃO
   ================================================ */
let topicos              = [];     // Array primário: [{ id, nome, cor, anotacoes: [] }]
let pdfDoc               = null;   // Documento PDF carregado pelo PDF.js
let currentPage          = 1;      // Página visível atual (atualizada pelo IntersectionObserver)
let modoRetomada         = false;  // Flag: true quando restaurando sessão existente (evita recriar backup)
let _encerrarTimer       = null;   // ID do setTimeout de confirmação do botão Encerrar
let _encerrarConfirmando = false;  // Flag: aguardando segundo clique para confirmar encerramento

let pdfObserver      = null;   // IntersectionObserver para lazy loading
let _sessaoPossuiAudio = false; // Flag de restauração de áudio na retomada de sessão

/* ================================================
   METADADOS LÓGICOS DO PDF (PJe)
   ================================================ */
let pageLabelsGlobais = null; // Armazena a numeração oficial (PJe/Foxit)

/**
 * Função utilitária para obter o rótulo lógico da página.
 * Retorna o rótulo se existir, ou faz o fallback seguro para o número físico.
 */
function obterRotuloPagina(paginaFisica) {
    if (pageLabelsGlobais && pageLabelsGlobais[paginaFisica - 1]) {
        return pageLabelsGlobais[paginaFisica - 1];
    }
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
});

/* ================================================
   PALETA DE CORES E RENDERIZAÇÃO
   Gerenciada pelo módulo isolado TopicsManager (topics-manager.js)
   ================================================ */

/* ================================================
   GERENCIAMENTO DE INTERFACE (ABAS)
   ================================================ */
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
    BackupManager.encerrar();

    if (pdfObserver) {
        pdfObserver.disconnect();
        pdfObserver = null;
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

                if (pdfObserver) pdfObserver.disconnect();
                pdfObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        const pageNum = parseInt(entry.target.dataset.pageNumber);
                        if (entry.isIntersecting && entry.intersectionRatio > 0.4) {
                            currentPage = pageNum;
                            // Utiliza a função utilitária para exibir o rótulo oficial
                            document.getElementById('current-page-display').textContent = obterRotuloPagina(currentPage);
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
                        background-color: var(--pdf-bg-color);
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
   CORREÇÃO: não troca de aba automaticamente (evita regressão de UX).
   Usa toast não-intrusivo como feedback.
   ================================================ */
async function salvarAnotacao(tipo, conteudo, documento, polo, topicoId, comentario = '', targetParentIndex = null) {
    const topicoAlvo = topicos.find(t => t.id === topicoId);
    if (!topicoAlvo) return;

    const pjeId = await extrairIdPjeDaPagina(currentPage);
    const novaExtracao = {
        tipo,
        documento,
        polo,
        pagina: obterRotuloPagina(currentPage), // Aplica a sincronização lógica aqui
        timestamp: Date.now(),
        conteudo: conteudo,
        pjeId: pjeId,
        comentario: comentario
    };

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
   Menu contextual, exclusão e reordenamento.
   ================================================ */

/**
 * Handler global de clique — fecha todos os menus e popups flutuantes.
 * Centralizado aqui para evitar múltiplos listeners no document.
 */
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

    // Engenharia Reversa: Procurar no array de rótulos o índice físico correspondente
    if (pageLabelsGlobais) {
        const indexEncontrado = pageLabelsGlobais.findIndex(label => 
            label && label.toString().trim().toLowerCase() === termoBusca
        );
        
        if (indexEncontrado !== -1) {
            pageNum = indexEncontrado + 1; // Array é 0-based, PDF.js é 1-based
        }
    }

    if (isNaN(pageNum) || pageNum < 1 || pageNum > pdfDoc.numPages) {
        exibirToast(`Página não encontrada. Digite um número ou rótulo válido.`, 'erro');
        return;
    }

    const pageContainer = document.querySelector(`.pdf-page-container[data-page-number="${pageNum}"]`);
    if (pageContainer) {
        pageContainer.scrollIntoView({ behavior: 'smooth' });
        input.value = ''; // Limpa o input por questão de UX após o sucesso
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
   FUNÇÃO DE IMPRESSÃO REMOVIDA
   A exportação agora é delegada ao módulo ExportManager.
   ================================================ */

/* ================================================
   MENU JURIS NOTES E GESTÃO DE ABAS (Resolve Alertas 3 e 4)
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

// Implementação de exclusão segura em "Dois Cliques" (Resolve Alerta 4)
function solicitarExclusaoAba(btnEl, id) {
    if (btnEl.dataset.confirming === "true") {
        // Segundo clique confirmado
        topicos = topicos.filter(t => t.id !== id);
        renderizarTopicos();
        salvarBackupAutomatico();
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
        // Modo Cópia: Mantém o padrão atual (copia exatamente o que é visto, com os parênteses)
        const textoParaCopiar = event.target.innerText;
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
