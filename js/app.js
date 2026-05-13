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

    // Botão de impressão: visível apenas na aba Anotações e somente se houver tópicos
    const btnImprimir = document.getElementById('btn-imprimir-topico');
    if (btnImprimir) {
        btnImprimir.style.display = (aba === 'historico' && topicos.length > 0) ? 'flex' : 'none';
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
    wrapper.innerHTML     = '';
    wrapper.style.display = 'none';
    document.getElementById('pdf-placeholder').style.display = 'flex';
    document.getElementById('floating-page-panel').style.display = 'none';
    document.getElementById('btn-imprimir-topico').style.display = 'none';
    document.getElementById('current-page-display').textContent  = '1';
    document.getElementById('pdf-upload').value = '';

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
                document.getElementById('floating-page-panel').style.display = 'flex';

                if (pdfObserver) pdfObserver.disconnect();
                pdfObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        const pageNum = parseInt(entry.target.dataset.pageNumber);
                        if (entry.isIntersecting && entry.intersectionRatio > 0.4) {
                            currentPage = pageNum;
                            document.getElementById('current-page-display').textContent = currentPage;
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
   PERSISTÊNCIA DE ANOTAÇÕES
   CORREÇÃO: não troca de aba automaticamente (evita regressão de UX).
   Usa toast não-intrusivo como feedback.
   ================================================ */
async function salvarAnotacao(tipo, conteudo, polo, topicoId, comentario = '', targetParentIndex = null) {
    const topicoAlvo = topicos.find(t => t.id === topicoId);
    if (!topicoAlvo) return;

    const pjeId = await extrairIdPjeDaPagina(currentPage);
    const novaExtracao = {
        tipo,
        polo,
        pagina: currentPage,
        timestamp: Date.now(),
        conteudo: conteudo,
        pjeId: pjeId,
        comentario: comentario
    };

    if (targetParentIndex !== null && targetParentIndex !== '') {
        const parentNode = topicoAlvo.anotacoes[targetParentIndex];
        if (!parentNode.itensCorrelacionados) parentNode.itensCorrelacionados = [];
        parentNode.itensCorrelacionados.push(novaExtracao);
        exibirToast(`Item agrupado à Ideia ${parseInt(targetParentIndex) + 1}.`);
    } else {
        novaExtracao.subAnotacoes = [];
        novaExtracao.itensCorrelacionados = [];
        topicoAlvo.anotacoes.push(novaExtracao);
        exibirToast(`Anotação salva em "${topicoAlvo.nome}".`);
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

/**
 * Acionada pelo menu de contexto para criar um novo nó de ideia.
 */
function acionarNovoNoIdeia() {
    if (!_menuAnotacaoCtx) return;
    const { topicoId, index } = _menuAnotacaoCtx;
    
    // Fecha o menu de contexto
    document.getElementById('annotation-context-menu').style.display = 'none';
    
    // Dispara a criação do painel
    adicionarSubAnotacao(topicoId, index);
}

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
   GERENCIAMENTO DE SUB-ANOTAÇÕES (NÓS DE IDEIA)
   Menu contextual, exclusão e reordenamento.
   ================================================ */

/** Referência à sub-anotação cujo menu está aberto. */
let _menuSubAnotacaoCtx = null;

/**
 * Abre o menu de ações para sub-anotações (nós de ideia secundários).
 * Posicionamento inteligente com detecção de colisão idêntica ao menu principal.
 *
 * @param {string} topicoId    - ID do tópico pai.
 * @param {number} parentIndex - Índice do card raiz no array anotacoes[].
 * @param {number} subIndex    - Índice da sub-anotação no array subAnotacoes[].
 * @param {MouseEvent} event   - Evento de clique nativo para posicionamento.
 */
function abrirMenuSubAnotacao(topicoId, parentIndex, subIndex, event) {
    event.stopPropagation();

    _menuSubAnotacaoCtx = { topicoId, parentIndex, subIndex };

    const menu = document.getElementById('sub-annotation-context-menu');

    menu.style.display    = 'flex';
    menu.style.visibility = 'hidden';

    const { width: mW, height: mH } = menu.getBoundingClientRect();

    let x = event.clientX + 10;
    let y = event.clientY - 10;

    if (x + mW > window.innerWidth)  x = window.innerWidth  - mW - 8;
    if (y + mH > window.innerHeight) y = window.innerHeight - mH - 8;
    if (y < 0) y = 8;
    if (x < 0) x = 8;

    menu.style.left       = x + 'px';
    menu.style.top        = y + 'px';
    menu.style.visibility = 'visible';
}

/**
 * Remove a sub-anotação referenciada e dispara re-render + backup.
 */
function excluirSubAnotacao() {
    if (!_menuSubAnotacaoCtx) return;

    const { topicoId, parentIndex, subIndex } = _menuSubAnotacaoCtx;
    const topico = topicos.find(t => t.id === topicoId);
    if (!topico) return;

    if (!confirm('Excluir esta ideia secundária? A ação não pode ser desfeita.')) return;

    topico.anotacoes[parentIndex].subAnotacoes.splice(subIndex, 1);

    renderizarTopicos();
    salvarBackupAutomatico();
    exibirToast('Ideia secundária excluída.', 'sucesso');
    _menuSubAnotacaoCtx = null;
    document.getElementById('sub-annotation-context-menu').style.display = 'none';
}

/**
 * Reordena a sub-anotação dentro do mesmo card pai.
 * Usa prompt() para manter consistência com reordenarAnotacao().
 */
function reordenarSubAnotacao() {
    if (!_menuSubAnotacaoCtx) return;

    const { topicoId, parentIndex, subIndex } = _menuSubAnotacaoCtx;
    const topico = topicos.find(t => t.id === topicoId);
    if (!topico) return;

    const subAnotacoes = topico.anotacoes[parentIndex].subAnotacoes;
    const posAtual     = subIndex + 1;
    const total        = subAnotacoes.length;

    if (total <= 1) {
        exibirToast('Existe apenas uma ideia secundária neste nó.', 'aviso');
        return;
    }

    const entrada = prompt(
        `Posição atual: ${posAtual} de ${total}\n\nMover para qual posição? (1 – ${total})`
    );

    if (entrada === null || entrada.trim() === '') return;

    const novaPos = parseInt(entrada, 10);

    if (isNaN(novaPos) || novaPos < 1 || novaPos > total) {
        exibirToast(`Posição inválida. Digite um número entre 1 e ${total}.`, 'erro');
        return;
    }

    if (novaPos === posAtual) {
        exibirToast('A ideia secundária já se encontra nessa posição.', 'aviso');
        return;
    }

    const [item] = subAnotacoes.splice(subIndex, 1);
    subAnotacoes.splice(novaPos - 1, 0, item);

    renderizarTopicos();
    salvarBackupAutomatico();
    exibirToast(`Ideia secundária movida para a posição ${novaPos}.`, 'sucesso');
    _menuSubAnotacaoCtx = null;
    document.getElementById('sub-annotation-context-menu').style.display = 'none';
}

function editarSubAnotacao() {
    if (!_menuSubAnotacaoCtx) return;
    const { topicoId, parentIndex, subIndex } = _menuSubAnotacaoCtx;
    const topico = topicos.find(t => t.id === topicoId);
    if (!topico) return;
    
    const sub = topico.anotacoes[parentIndex].subAnotacoes[subIndex];
    const novoTexto = prompt('Edite a ideia secundária:', sub.texto);
    
    if (novoTexto !== null && novoTexto.trim() !== '') {
        sub.texto = novoTexto.trim();
        renderizarTopicos();
        salvarBackupAutomatico();
        exibirToast('Ideia secundária atualizada com sucesso.', 'sucesso');
    }
    
    _menuSubAnotacaoCtx = null;
    document.getElementById('sub-annotation-context-menu').style.display = 'none';
}

function excluirItemCorrelacionado(topicoId, parentIndex, correlacionadoIndex) {
    if (!confirm('Excluir este item correlacionado?')) return;
    const topico = topicos.find(t => t.id === topicoId);
    if (!topico) return;
    
    topico.anotacoes[parentIndex].itensCorrelacionados.splice(correlacionadoIndex, 1);
    renderizarTopicos();
    salvarBackupAutomatico();
    exibirToast('Item correlacionado excluído.', 'sucesso');
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
function adicionarSubAnotacao(topicoId, anotacaoIndex) {
    const existing = document.getElementById('sub-input-active');

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
        <textarea id="sub-input-text" class="sub-input-textarea" placeholder="Digite a ideia secundária..." rows="3"></textarea>
        <div class="sub-input-actions">
            <button class="sub-input-btn-confirm" onclick="confirmarSubAnotacao('${topicoId}', ${anotacaoIndex})">✔ Confirmar</button>
            <button class="sub-input-btn-cancel" onclick="document.getElementById('sub-input-active').remove()">✕ Cancelar</button>
        </div>`;

    // Localiza estritamente o wrapper do card principal alvo
    const mainCardWrapper = document.querySelector(`#timeline-wrapper-${anotacaoIndex} .main-card-wrapper`);
    if (mainCardWrapper) {
        // Anexa O painel DENTRO do wrapper do card principal, logo abaixo da anotação
        mainCardWrapper.appendChild(painel);
        document.getElementById('sub-input-text').focus();
    }
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

/* ================================================
   GERAÇÃO DE RELATÓRIO PDF (IMPRESSÃO NATIVA)
   Usa window.open + document.write para gerar um
   documento HTML limpo e acionar o diálogo de
   impressão nativo do navegador (Salvar como PDF).
   Não requer bibliotecas externas.
   ================================================ */
function imprimirTopicoAtivo() {
    const activeId = TopicsManager.getActiveTabId();

    if (!activeId) {
        exibirToast('Selecione um tópico antes de gerar o documento.', 'aviso');
        return;
    }

    const topico = topicos.find(t => t.id === activeId);

    if (!topico) {
        exibirToast('Tópico não encontrado. Tente novamente.', 'erro');
        return;
    }

    if (topico.anotacoes.length === 0) {
        exibirToast('Este tópico está vazio. Adicione anotações antes de imprimir.', 'aviso');
        return;
    }

    const janela = window.open('', '_blank');
    if (!janela) {
        exibirToast('O navegador bloqueou o pop-up. Libere pop-ups para este site e tente novamente.', 'erro');
        return;
    }

    // Alias local para o sanitizador exposto pelo módulo
    const esc = TopicsManager.escaparHTML;

    // ── Construção do documento de impressão ──────────────
    let html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Minuta — ${esc(topico.nome)}</title>
    <style>
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            color: #222;
            padding: 28px 36px;
            max-width: 820px;
            margin: 0 auto;
            font-size: 14px;
        }
        h1 {
            font-size: 1.3rem;
            color: #1a3a5c;
            border-bottom: 3px solid ${esc(topico.cor)};
            padding-bottom: 10px;
            margin-bottom: 24px;
        }
        .anotacao {
            border: 1px solid #ddd;
            border-left: 5px solid ${esc(topico.cor)};
            padding: 14px 16px;
            margin-bottom: 18px;
            border-radius: 4px;
            page-break-inside: avoid;
            background: #fafafa;
        }
        .meta {
            font-size: 0.78em;
            color: #555;
            font-weight: 700;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .texto {
            font-style: italic;
            line-height: 1.7;
            color: #333;
        }
        .comentario {
            margin-top: 12px;
            font-size: 0.88em;
            background: #f0f4f8;
            padding: 8px 10px;
            border-radius: 4px;
            line-height: 1.6;
        }
        img {
            max-width: 100%;
            height: auto;
            border: 1px solid #ccc;
            border-radius: 3px;
            margin-top: 8px;
            display: block;
        }
        .sub-anotacao {
            margin-top: 12px;
            padding: 8px 12px;
            border-left: 3px dashed #aaa;
            font-size: 0.88em;
            color: #444;
            background: #fff;
            border-radius: 0 4px 4px 0;
        }
        .sub-label {
            font-weight: 700;
            color: #1a3a5c;
            margin-right: 6px;
        }
        .rodape {
            margin-top: 40px;
            padding-top: 12px;
            border-top: 1px solid #ddd;
            font-size: 0.76em;
            color: #999;
            text-align: right;
        }
        @media print {
            body { padding: 0; }
            .anotacao { border-left-width: 4px; }
        }
    </style>
</head>
<body>
    <h1>Tópico: ${esc(topico.nome)}</h1>`;

    topico.anotacoes.forEach((an, index) => {
        const num         = index + 1;
        const idFormatado = an.pjeId ? `Id. ${esc(an.pjeId)} — ` : '';
        const meta        = `[Item ${num}] &nbsp;|&nbsp; Polo: ${esc(an.polo)} &nbsp;|&nbsp; ${idFormatado}Fl. ${esc(String(an.pagina))}`;

        html += `\n    <div class="anotacao">
        <div class="meta">${meta}</div>`;

        if (an.tipo === 'texto') {
            html += `\n        <div class="texto">"${esc(an.conteudo)}"</div>`;
        } else if (an.tipo === 'imagem') {
            html += `\n        <img src="${an.conteudo}" alt="Recorte — Pág. ${esc(String(an.pagina))}">`;
            if (an.comentario) {
                html += `\n        <div class="comentario"><strong>Descrição:</strong> ${esc(an.comentario)}</div>`;
            }
        }

        if (an.subAnotacoes && an.subAnotacoes.length > 0) {
            const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            an.subAnotacoes.forEach((sub, sIdx) => {
                const label = `${num}.${sIdx < 26 ? ABC[sIdx] : ABC[Math.floor(sIdx/26)-1] + ABC[sIdx%26]}`;
                html += `\n        <div class="sub-anotacao"><span class="sub-label">${label}</span>${esc(sub.texto)}</div>`;
            });
        }
        
        if (an.itensCorrelacionados && an.itensCorrelacionados.length > 0) {
            an.itensCorrelacionados.forEach((item) => {
                const idFmtItem = item.pjeId ? `Id. ${esc(item.pjeId)} — ` : '';
                const metaItem  = `[Correlacionado] &nbsp;|&nbsp; Polo: ${esc(item.polo)} &nbsp;|&nbsp; ${idFmtItem}Fl. ${esc(String(item.pagina))}`;
                
                html += `\n        <div class="anotacao" style="margin-top:10px; margin-left: 20px; border-left-color: #888;">
            <div class="meta">${metaItem}</div>`;
                
                if (item.tipo === 'texto') {
                    html += `\n            <div class="texto">"${esc(item.conteudo)}"</div>`;
                } else if (item.tipo === 'imagem') {
                    html += `\n            <img src="${item.conteudo}" alt="Recorte Agrupado — Pág. ${esc(String(item.pagina))}">`;
                    if (item.comentario) {
                        html += `\n            <div class="comentario"><strong>Descrição:</strong> ${esc(item.comentario)}</div>`;
                    }
                }
                html += `\n        </div>`;
            });
        }

        html += `\n    </div>`;
    });

    const dataGeracao = new Date().toLocaleString('pt-BR');
    html += `\n    <div class="rodape">Documento gerado em ${dataGeracao} — ${topico.anotacoes.length} item(ns).</div>`;

    // setTimeout é mais confiável que window.onload em documentos criados via document.write,
    // especialmente no Firefox/Safari onde onload pode não disparar neste contexto.
    html += `\n    <script>setTimeout(function(){ window.print(); }, 250);<\/script>
</body>
</html>`;

    janela.document.write(html);
    janela.document.close();
}
