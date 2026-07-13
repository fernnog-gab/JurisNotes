/* ================================================
   annotation-actions.js
   Gerenciamento de Menus, Formatação Segura (Markdown) e Ações
   ================================================ */

let _menuAnotacaoCtx = null;
let _menuSubAnotacaoCtx = null;
let _editContext = null;
let _inputDiretrizCtx = null;

/* --- MENUS CONTEXTUAIS --- */
function abrirMenuAnotacao(topicoId, index, event) {
    event.stopPropagation();
    _menuAnotacaoCtx = { topicoId, index };
    _posicionarMenu('annotation-context-menu', event);
}

// HELPER PRIVADO (Resolução de Referência Universal)
function _resolverSubAlvo(topico, parentIndex, viewSource) {
    // 1. NÍVEL GLOBAL
    if (viewSource === 'global') {
        return { subAnotacoes: topico.diretrizesGlobais };
    }
    
    // 2. NÍVEL DE TESE
    if (typeof viewSource === 'string' && viewSource.startsWith('tese:')) {
        const nomeTese = viewSource.replace('tese:', '');
        return { subAnotacoes: topico.diretrizesPorTese[nomeTese] };
    }
    
    // 3. NÍVEL PROVA (Comportamento original preservado)
    const cardMestre = topico.anotacoes[parentIndex];
    if (viewSource === 'main') {
        return cardMestre;
    }
    const cIdx = parseInt(viewSource, 10);
    return cardMestre.itensCorrelacionados[cIdx];
}

window.toggleRevisaoNotaOculta = function(topicoId, parentIndex, viewSource, localIndex, event) {
    event.stopPropagation();
    
    const topico = topicos.find(t => t.id === topicoId);
    if (!topico) return;

    const alvo = _resolverSubAlvo(topico, parentIndex, viewSource);
    const sub = alvo.subAnotacoes[localIndex];

    sub.revisada = !sub.revisada;

    renderizarTopicos(); 
    salvarBackupAutomatico();
};

function adicionarDiretrizEstrutural(tipo, topicoId, teseNome, event) {
    event.stopPropagation();

    // 1. Prevenção de Perda de Dados (UX)
    const existing = document.getElementById('sub-input-active');
    if (existing) {
        const textareaAtual = document.getElementById('sub-input-text');
        if (textareaAtual && textareaAtual.value.trim() !== '') {
            exibirToast('Conclua ou cancele a anotação atual primeiro.', 'aviso');
            textareaAtual.focus();
            return;
        }
        existing.remove();
    }

    // 2. Armazenamento Seguro de Contexto em Memória
    _inputDiretrizCtx = { tipo, topicoId, teseNome };

    // 3. Construção do Painel (Sem dados do usuário no HTML)
    const painel = document.createElement('div');
    painel.id = 'sub-input-active'; 
    painel.className = 'sub-input-panel';
    
    painel.innerHTML = `
        <textarea id="sub-input-text" class="sub-input-textarea" placeholder="Digite a diretriz para a IA..." rows="3"></textarea>
        <div class="sub-input-actions">
            <button class="sub-input-btn-icon confirm" title="Confirmar (Ctrl+Enter)" onclick="confirmarDiretrizEstrutural()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
            <button class="sub-input-btn-icon cancel" title="Cancelar (Esc)" onclick="cancelarDiretrizEstrutural()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>`;

    // 4. Ancoragem Determinística (DOM Traversal via Event.Target)
    // CORREÇÃO: Utilizar event.target para subir (closest) a partir do ícone clicado, 
    // ignorando o currentTarget que na delegação é a barra de rolagem inteira.
    const mountPoint = event.target.closest('.main-card-wrapper');
    
    if (mountPoint) {
        mountPoint.appendChild(painel);
        const textarea = document.getElementById('sub-input-text');
        textarea.focus();
        
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') cancelarDiretrizEstrutural();
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') confirmarDiretrizEstrutural();
        });
    } else {
        console.error("Falha ao encontrar mountPoint para adicionar a diretriz. Event Target fora de contexto.");
    }
}

function cancelarDiretrizEstrutural() {
    const painel = document.getElementById('sub-input-active');
    if (painel) painel.remove();
    _inputDiretrizCtx = null;
}

function confirmarDiretrizEstrutural() {
    if (!_inputDiretrizCtx) return;

    const textarea = document.getElementById('sub-input-text');
    const texto = textarea ? textarea.value.trim() : '';
    
    if (!texto) {
        return exibirToast('Digite uma diretriz válida.', 'aviso');
    }

    const { tipo, topicoId, teseNome } = _inputDiretrizCtx;
    const topico = topicos.find(t => t.id === topicoId);
    
    const noIdeia = {
        uuid: 'id-' + Math.random().toString(36).substr(2, 9),
        texto: texto,
        intencao: 'premissa', // Default inicial
        revisada: false,
        timestamp: Date.now()
    };

    if (tipo === 'global') {
        if (!topico.diretrizesGlobais) topico.diretrizesGlobais = [];
        topico.diretrizesGlobais.push(noIdeia);
    } else if (tipo === 'tese') {
        if (!topico.diretrizesPorTese) topico.diretrizesPorTese = {};
        if (!topico.diretrizesPorTese[teseNome]) topico.diretrizesPorTese[teseNome] = [];
        topico.diretrizesPorTese[teseNome].push(noIdeia);
    }

    cancelarDiretrizEstrutural(); // Limpa DOM e Memória
    renderizarTopicos();
    salvarBackupAutomatico();
    exibirToast('Diretriz adicionada com sucesso.', 'sucesso');
}

function abrirMenuSubAnotacao(topicoId, parentIndex, viewSource, localIndex, event) {
    event.stopPropagation();
    
    const topico = topicos.find(t => t.id === topicoId);
    const alvo = _resolverSubAlvo(topico, parentIndex, viewSource);
    const sub = alvo.subAnotacoes[localIndex];

    // --- NOVA LÓGICA: SHIFT + CLICK ---
    if (event.shiftKey) {
        const naoClassificado = (sub.intencao === null || sub.intencao === undefined);
        if (naoClassificado) {
            exibirToast('Ação não classificada. Clique normalmente para definir a intenção para a IA.', 'aviso');
        } else {
            exibirTooltipRapido(sub.intencao, event);
        }
        return; // Impede a abertura do menu completo
    }

    const currentIntent = sub.intencao || 'premissa';
    
    document.querySelectorAll('#sub-annotation-context-menu .btn-intent').forEach(btn => {
        btn.classList.toggle('active-intent', btn.dataset.intent === currentIntent);
    });
    
    // NOVO CONTRATO: ctx exige viewSource e localIndex
    _menuSubAnotacaoCtx = { topicoId, parentIndex, viewSource, localIndex };
    _posicionarMenu('sub-annotation-context-menu', event);
}

function definirIntencaoSubAnotacao(intencaoStr) {
    if (!_menuSubAnotacaoCtx) return;
    
    window.Store.dispatch({
        type: 'UPDATE_ITEM',
        payload: {
            topicoId: _menuSubAnotacaoCtx.topicoId,
            tipo: 'sub',
            parentIndex: _menuSubAnotacaoCtx.parentIndex,
            viewSource: _menuSubAnotacaoCtx.viewSource,
            localIndex: _menuSubAnotacaoCtx.localIndex,
            campo: 'intencao',
            novoValor: intencaoStr
        }
    });
    
    const rotulos = { 
        'comando': 'Comando Direto', 
        'texto': 'Texto Fixo', 
        'nota': 'Nota Oculta', 
        'premissa': 'Premissa Padrão',
        'veredito': 'Veredito / Conclusão',
        'fundamentacao': 'Fundamentação Legal',
        'refutacao': 'Refutação (Mérito)',
        'preliminar': 'Filtro / Prejudicial'
    };
    exibirToast(`Classificado como: ${rotulos[intencaoStr]}`, 'sucesso');
    document.getElementById('sub-annotation-context-menu').style.display = 'none';
}

function _posicionarMenu(menuId, event) {
    const menu = document.getElementById(menuId);
    menu.style.display = 'flex'; menu.style.visibility = 'hidden';
    const { width: mW, height: mH } = menu.getBoundingClientRect();
    let x = event.clientX + 10; let y = event.clientY - 10;
    if (x + mW > window.innerWidth) x = window.innerWidth - mW - 8;
    if (y + mH > window.innerHeight) y = window.innerHeight - mH - 8;
    if (y < 0) y = 8; if (x < 0) x = 8;
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    menu.style.visibility = 'visible';
}

/* --- MODAL DE EDIÇÃO E NEGRITO (MARKDOWN) --- */
function editarAnotacao() {
    if (!_menuAnotacaoCtx) return;
    const anotacao = topicos.find(t => t.id === _menuAnotacaoCtx.topicoId).anotacoes[_menuAnotacaoCtx.index];
    if (anotacao.tipo !== 'texto' && anotacao.tipo !== 'audio') return exibirToast('Apenas anotações de texto e áudio podem ser editadas.', 'aviso');

    let textoContexto = anotacao.conteudo;
    if (anotacao.tipo === 'audio') {
        try { const d = JSON.parse(anotacao.conteudo); textoContexto = d.transcricao || ''; } catch(e){}
    }
    abrirModalEdicao({ tipo: 'main', topicoId: _menuAnotacaoCtx.topicoId, parentIndex: _menuAnotacaoCtx.index, tipoAnotacao: anotacao.tipo }, textoContexto, anotacao.comentario);
    document.getElementById('annotation-context-menu').style.display = 'none';
}

function editarSubAnotacao() {
    if (!_menuSubAnotacaoCtx) return;
    const topico = topicos.find(t => t.id === _menuSubAnotacaoCtx.topicoId);
    const alvo = _resolverSubAlvo(topico, _menuSubAnotacaoCtx.parentIndex, _menuSubAnotacaoCtx.viewSource);
    const sub = alvo.subAnotacoes[_menuSubAnotacaoCtx.localIndex];
    
    abrirModalEdicao({ 
        tipo: 'sub', 
        topicoId: _menuSubAnotacaoCtx.topicoId, 
        parentIndex: _menuSubAnotacaoCtx.parentIndex, 
        viewSource: _menuSubAnotacaoCtx.viewSource,
        localIndex: _menuSubAnotacaoCtx.localIndex 
    }, sub.texto);
    document.getElementById('sub-annotation-context-menu').style.display = 'none';
}

function editarItemCorrelacionado() {
    if (!_menuAnotacaoCtx || _menuAnotacaoCtx.cIdx === undefined) return;
    const topico = topicos.find(t => t.id === _menuAnotacaoCtx.topicoId);
    const item = topico.anotacoes[_menuAnotacaoCtx.index].itensCorrelacionados[_menuAnotacaoCtx.cIdx];

    if (item.tipo !== 'texto' && item.tipo !== 'audio') return exibirToast('Apenas anotações de texto e áudio podem ser editadas.', 'aviso');

    let textoContexto = item.conteudo;
    if (item.tipo === 'audio') {
        try { const d = JSON.parse(item.conteudo); textoContexto = d.transcricao || ''; } catch(e){}
    }
    abrirModalEdicao({ tipo: 'correlated', topicoId: _menuAnotacaoCtx.topicoId, parentIndex: _menuAnotacaoCtx.index, cIdx: _menuAnotacaoCtx.cIdx, tipoAnotacao: item.tipo }, textoContexto, item.comentario);
}

function abrirModalEdicao(contexto, textoAtual, comentarioAtual = '') {
    _editContext = contexto;
    const textarea = document.getElementById('edit-text-input');
    const commentArea = document.getElementById('edit-comentario-input');
    const toolbar = document.getElementById('edit-toolbar');
    const title = document.getElementById('edit-modal-title');

    textarea.value = textoAtual;

    if (_editContext.tipoAnotacao === 'audio') {
        textarea.placeholder = "Degravação literal do áudio...";
        commentArea.value = comentarioAtual || '';
        commentArea.style.display = 'block';
        if(toolbar) toolbar.style.display = 'none';
        title.innerHTML = '🎙️ Editar Áudio e Observação';
    } else {
        textarea.placeholder = "Selecione um trecho e aplique formatação...";
        if(commentArea) {
            commentArea.value = '';
            commentArea.style.display = 'none';
        }
        if(toolbar) toolbar.style.display = 'flex';
        title.innerHTML = '✏️ Editar Texto';
    }

    document.getElementById('text-edit-backdrop').style.display = 'block';
    document.getElementById('text-edit-modal').style.display = 'flex';
    setTimeout(() => textarea.focus(), 50);
}

function fecharModalEdicao() {
    _editContext = null;
    document.getElementById('text-edit-backdrop').style.display = 'none';
    document.getElementById('text-edit-modal').style.display = 'none';
}

function aplicarNegritoTextarea() {
    const textarea = document.getElementById('edit-text-input');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const texto = textarea.value;

    if (start === end) return exibirToast('Selecione um trecho para aplicar o negrito.', 'aviso');
    
    // Envolve o texto com asteriscos duplos (Padrão Markdown seguro)
    const novoTexto = texto.substring(0, start) + '**' + texto.substring(start, end) + '**' + texto.substring(end);
    textarea.value = novoTexto;
    textarea.focus();
    textarea.setSelectionRange(start + 2, end + 2);
}

// Suporte ao Atalho Ctrl+B
document.getElementById('edit-text-input').addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        aplicarNegritoTextarea();
    }
});

function salvarEdicaoTexto() {
    if (!_editContext) return;

    const topico = topicos.find(t => t.id === _editContext.topicoId);
    if (!topico) return;

    let novoTexto = document.getElementById('edit-text-input').value.trim();

    // LÓGICA DO PREÂMBULO
    if (_editContext.tipo === 'preambulo') {
        topico[_editContext.campo] = novoTexto;
        renderizarTopicos(); 
        salvarBackupAutomatico();
        exibirToast('Preâmbulo salvo.', 'sucesso');
        return fecharModalEdicao();
    }

    // [NOVO] Pipeline de Higienização Restrito para Edição
    // Bloqueia a limpeza em cards de áudio para evitar corrupção de JSON ou metadados
    const tiposPermitidosParaLimpeza = ['texto', 'sub', 'correlated'];
    if (tiposPermitidosParaLimpeza.includes(_editContext.tipo) || _editContext.tipoAnotacao === 'texto') {
        novoTexto = window.JurisUtils.limparTextoPDF(novoTexto);
    }

    // LÓGICA DE CARDS DE TEXTO
    if (_editContext.tipoAnotacao === 'texto' && !novoTexto) {
        return exibirToast('O texto da prova não pode ficar vazio.', 'aviso');
    }

    let alvo;
    if (_editContext.tipo === 'main') {
        alvo = topico.anotacoes[_editContext.parentIndex];
    } else if (_editContext.tipo === 'sub') {
        alvo = _resolverSubAlvo(topico, _editContext.parentIndex, _editContext.viewSource).subAnotacoes[_editContext.localIndex];
    } else if (_editContext.tipo === 'correlated') {
        alvo = topico.anotacoes[_editContext.parentIndex].itensCorrelacionados[_editContext.cIdx];
    }

    if (!alvo) return;

    // GRAVAÇÃO DE ESTADO
    if (_editContext.tipo === 'sub') {
        alvo.texto = novoTexto;
    } else if (_editContext.tipoAnotacao === 'audio') {
        const novoComentario = document.getElementById('edit-comentario-input').value.trim();
        try {
            const d = JSON.parse(alvo.conteudo);
            d.transcricao = novoTexto;
            alvo.conteudo = JSON.stringify(d);
        } catch(e) { console.error('Erro de parse', e); }
        alvo.comentario = novoComentario;
    } else {
        alvo.conteudo = novoTexto;
    }
    
    renderizarTopicos(); 
    salvarBackupAutomatico();
    exibirToast('Anotação atualizada!', 'sucesso');
    fecharModalEdicao();
}

window.abrirEdicaoPreambulo = function(topicoId, campo) {
    const topico = topicos.find(t => t.id === topicoId);
    const textoAtual = topico[campo] || '';
    abrirModalEdicao({ tipo: 'preambulo', topicoId: topicoId, campo: campo }, textoAtual);
};

function aplicarAumentoFonte(nivel) {
    const textarea = document.getElementById('edit-text-input');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const texto = textarea.value;

    if (start === end) {
        return exibirToast('Selecione um trecho para modificar a fonte.', 'aviso');
    }

    const prefixo = `[[size:${nivel}]]`;
    const sufixo = `[[/size]]`;

    // VERIFICAÇÃO DE TOGGLE (Idempotência)
    const trechoAnterior = texto.substring(start - prefixo.length, start);
    const trechoPosterior = texto.substring(end, end + sufixo.length);

    if (trechoAnterior === prefixo && trechoPosterior === sufixo) {
        // UNWRAP: Remove as tags existentes no entorno
        textarea.value = texto.substring(0, start - prefixo.length) + 
                         texto.substring(start, end) + 
                         texto.substring(end + sufixo.length);
        textarea.setSelectionRange(start - prefixo.length, end - prefixo.length);
    } else {
        // WRAP: Sanitiza sujeira interna antes de envelopar
        let trechoSelecionado = texto.substring(start, end);
        // Expurga tags de tamanho antigas de dentro da nova seleção para evitar aninhamento
        trechoSelecionado = trechoSelecionado.replace(/\[\[size:\d\]\]/g, '').replace(/\[\[\/size\]\]/g, '');

        textarea.value = texto.substring(0, start) + prefixo + trechoSelecionado + sufixo + texto.substring(end);
        textarea.setSelectionRange(start + prefixo.length, start + prefixo.length + trechoSelecionado.length);
    }
    textarea.focus();
}

/* --- FUNÇÕES INTEGRAIS MIGRADAS DO APP.JS --- */
function acionarNovoNoIdeia() {
    if (!_menuAnotacaoCtx) return;
    // Captura segura, assumindo null caso acionado a partir de card principal
    const { topicoId, index } = _menuAnotacaoCtx;
    const cIdx = _menuAnotacaoCtx.cIdx ?? null; 
    
    document.getElementById('annotation-context-menu').style.display = 'none';
    adicionarSubAnotacao(topicoId, index, cIdx);
}

function excluirAnotacao() {
    if (!_menuAnotacaoCtx) return;
    const { topicoId, index } = _menuAnotacaoCtx;
    const topico = topicos.find(t => t.id === topicoId);
    const cardAlvo = topico.anotacoes[index];

    const temCorrelacionados = cardAlvo.itensCorrelacionados && cardAlvo.itensCorrelacionados.length > 0;
    const temSub = cardAlvo.subAnotacoes && cardAlvo.subAnotacoes.length > 0;

    let isPromoting = false;
    if (temCorrelacionados) {
        if (!confirm('⚠️ ATENÇÃO: Esta prova agrupa outros itens.\n\nDeseja excluir apenas esta prova principal e PROMOVER a próxima do grupo para o seu lugar?')) return;
        isPromoting = true;
    } else {
        if (!confirm(temSub ? 'Excluir esta prova e todos os seus Nós de Ideia atrelados?' : 'Excluir esta prova? A ação não pode ser desfeita.')) return;
    }

    window.Store.dispatch({ type: 'DELETE_ITEM', payload: { topicoId, index, isPromoting } });
    
    exibirToast('Anotação excluída com sucesso.', 'sucesso');
    _menuAnotacaoCtx = null;
    const menuCtx = document.getElementById('annotation-context-menu');
    if (menuCtx) menuCtx.style.display = 'none';
}

let _reordenarCtx = null;

function reordenarAnotacao() {
    if (!_menuAnotacaoCtx) return;
    const { topicoId, index } = _menuAnotacaoCtx;
    const topico = topicos.find(t => t.id === topicoId);
    if (topico.anotacoes.length <= 1) return exibirToast('Apenas uma anotação existente.', 'aviso');

    abrirModalReordenar('main', topicoId, index, topico.anotacoes.length);
    document.getElementById('annotation-context-menu').style.display = 'none';
}

function excluirSubAnotacao() {
    if (!_menuSubAnotacaoCtx) return;
    if (!confirm('Excluir esta ideia secundária?')) return;
    
    window.Store.dispatch({ type: 'DELETE_SUB_ANNOTATION', payload: _menuSubAnotacaoCtx });
    
    renderizarTopicos(); 
    document.getElementById('sub-annotation-context-menu').style.display = 'none';
}

/* ================================================
   1. ATUALIZAÇÃO: REORDENAÇÃO DE SUB-NÓS (Integração)
   ================================================ */

// Função acionada pelo novo botão no menu contextual
function acionarReordenarSub() {
    if (!_menuSubAnotacaoCtx) return;
    
    const topico = topicos.find(t => t.id === _menuSubAnotacaoCtx.topicoId);
    const alvo = _resolverSubAlvo(topico, _menuSubAnotacaoCtx.parentIndex, _menuSubAnotacaoCtx.viewSource);
    const total = alvo.subAnotacoes.length;
    
    if (total <= 1) return exibirToast('Apenas uma anotação existente neste grupo.', 'aviso');
    
    abrirModalReordenar('sub', _menuSubAnotacaoCtx.topicoId, _menuSubAnotacaoCtx.parentIndex, total, _menuSubAnotacaoCtx.localIndex, _menuSubAnotacaoCtx.viewSource);
    document.getElementById('sub-annotation-context-menu').style.display = 'none';
}

function abrirModalReordenar(tipo, topicoId, index, total, subIndex = null, viewSource = null) {
    _reordenarCtx = { tipo, topicoId, index, total, subIndex, viewSource };
    const posAtual = tipo === 'main' ? index + 1 : subIndex + 1;

    document.getElementById('input-nova-posicao').value = posAtual;
    document.getElementById('input-nova-posicao').max = total;

    document.getElementById('reordenar-modal-backdrop').style.display = 'block';
    document.getElementById('modal-reordenar').style.display = 'flex';
}

function fecharModalReordenar() {
    document.getElementById('reordenar-modal-backdrop').style.display = 'none';
    document.getElementById('modal-reordenar').style.display = 'none';
    _reordenarCtx = null;
}

function confirmarReordenacaoPosicao() {
    if (!_reordenarCtx) return;
    const novaPos = parseInt(document.getElementById('input-nova-posicao').value, 10);

    if (isNaN(novaPos) || novaPos < 1 || novaPos > _reordenarCtx.total) {
        return exibirToast(`Posição inválida. Escolha entre 1 e ${_reordenarCtx.total}.`, 'erro');
    }

    window.Store.dispatch({
        type: 'REORDER_ITEM',
        payload: {
            tipo: _reordenarCtx.tipo, 
            topicoId: _reordenarCtx.topicoId, 
            index: _reordenarCtx.index, 
            subIndex: _reordenarCtx.subIndex, 
            viewSource: _reordenarCtx.viewSource,
            novaPos
        }
    });

    fecharModalReordenar();
    exibirToast('Item reposicionado com sucesso.', 'sucesso');
    _menuAnotacaoCtx = null;
    _menuSubAnotacaoCtx = null;
}

/* ================================================
   2. NOVA FUNCIONALIDADE: TRANSFERÊNCIA INTELIGENTE
   ================================================ */

function abrirModalTransferirSubAnotacao() {
    if (!_menuSubAnotacaoCtx) return;
    document.getElementById('sub-annotation-context-menu').style.display = 'none';
    
    document.getElementById('input-transferir-sub-destino').value = '';
    document.getElementById('transfer-sub-target-box').style.display = 'none';
    document.getElementById('select-transferir-sub-alvo').innerHTML = '';
    
    document.getElementById('transferir-sub-backdrop').style.display = 'block';
    document.getElementById('modal-transferir-sub').style.display = 'flex';
    
    setTimeout(() => document.getElementById('input-transferir-sub-destino').focus(), 50);
}

function fecharModalTransferirSub() {
    document.getElementById('transferir-sub-backdrop').style.display = 'none';
    document.getElementById('modal-transferir-sub').style.display = 'none';
}

// Helper: Extrai um snippet seguro para montar os rótulos do select
function _gerarSnippetCard(item) {
    const docTag = item.documento || item.polo || 'Item não nomeado';
    let snippet = '';
    
    if (item.tipo === 'texto') {
        // Remove quebras de linha e limita a 25 caracteres
        const limpo = item.conteudo.replace(/<[^>]*>?/gm, '').substring(0, 25);
        snippet = `[T] "${limpo}..."`;
    } else if (item.tipo === 'audio') {
        snippet = `[Áudio]`;
    } else if (item.tipo === 'imagem') {
        snippet = `[Imagem]`;
    }
    return `${docTag} - ${snippet}`;
}

function carregarSubAlvosTransferencia() {
    if (!_menuSubAnotacaoCtx) return;
    const topico = topicos.find(t => t.id === _menuSubAnotacaoCtx.topicoId);
    const inputVal = parseInt(document.getElementById('input-transferir-sub-destino').value, 10);
    
    const targetBox = document.getElementById('transfer-sub-target-box');
    const select = document.getElementById('select-transferir-sub-alvo');
    
    select.innerHTML = '';
    targetBox.style.display = 'none';

    if (isNaN(inputVal) || inputVal < 1 || inputVal > topico.anotacoes.length) return;

    const cardDestino = topico.anotacoes[inputVal - 1];
    
    // Identificou um Grupo. Requisita especificação do usuário com rótulos ricos.
    if (cardDestino.itensCorrelacionados && cardDestino.itensCorrelacionados.length > 0) {
        select.appendChild(new Option(`🌟 Mestre: ${_gerarSnippetCard(cardDestino)}`, 'main'));
        
        cardDestino.itensCorrelacionados.forEach((item, idx) => {
            select.appendChild(new Option(`↳ Anexo: ${_gerarSnippetCard(item)}`, idx));
        });
        
        targetBox.style.display = 'flex';
    }
}

function confirmarTransferenciaSub() {
    if (!_menuSubAnotacaoCtx) return;
    
    const topico = topicos.find(t => t.id === _menuSubAnotacaoCtx.topicoId);
    const destinoTarget = parseInt(document.getElementById('input-transferir-sub-destino').value, 10);
    
    if (isNaN(destinoTarget) || destinoTarget < 1 || destinoTarget > topico.anotacoes.length) {
        return exibirToast(`Destino inválido. Escolha um número entre 1 e ${topico.anotacoes.length}.`, 'erro');
    }
    
    const destinoIndex = destinoTarget - 1;
    const cardDestino = topico.anotacoes[destinoIndex];
    let alvoFinal = cardDestino; 
    let alvoViewSource = 'main';
    
    if (cardDestino.itensCorrelacionados && cardDestino.itensCorrelacionados.length > 0) {
        const selectVal = document.getElementById('select-transferir-sub-alvo').value;
        if (selectVal !== 'main') {
            alvoViewSource = selectVal;
            alvoFinal = cardDestino.itensCorrelacionados[parseInt(selectVal, 10)];
        }
    }

    const alvoOrigem = _resolverSubAlvo(topico, _menuSubAnotacaoCtx.parentIndex, _menuSubAnotacaoCtx.viewSource);

    // VALIDAÇÃO CRÍTICA: Auto-Colisão
    // Se a origem e o destino apontam para a exata mesma posição do array e sub-card
    if (destinoIndex === _menuSubAnotacaoCtx.parentIndex && alvoViewSource === String(_menuSubAnotacaoCtx.viewSource)) {
        fecharModalTransferirSub();
        return exibirToast('O nó já pertence a esta prova. Nenhuma alteração realizada.', 'aviso');
    }

    // Mutação Segura: Extrai da origem e injeta no destino
    const noTransferido = alvoOrigem.subAnotacoes.splice(_menuSubAnotacaoCtx.localIndex, 1)[0];
    
    if (!alvoFinal.subAnotacoes) alvoFinal.subAnotacoes = [];
    alvoFinal.subAnotacoes.push(noTransferido);
    
    fecharModalTransferirSub();
    renderizarTopicos();
    salvarBackupAutomatico();
    exibirToast(`Nó transferido com sucesso!`, 'sucesso');
    _menuSubAnotacaoCtx = null;
}

function excluirItemCorrelacionado(topicoId, parentIndex, correlacionadoIndex) {
    if (!confirm('Excluir este item correlacionado?')) return;
    topicos.find(t => t.id === topicoId).anotacoes[parentIndex].itensCorrelacionados.splice(correlacionadoIndex, 1);
    renderizarTopicos(); salvarBackupAutomatico();
    if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
    exibirToast('Item correlacionado excluído.', 'sucesso');
}

function adicionarSubAnotacao(topicoId, anotacaoIndex, cIdx = null) {
    const existing = document.getElementById('sub-input-active');
    if (existing) {
        const mesmoCont = existing.dataset.forTopico === topicoId && existing.dataset.forIndex === String(anotacaoIndex);
        existing.remove();
        if (mesmoCont) return;
    }
    
    const painel = document.createElement('div');
    painel.id = 'sub-input-active'; 
    painel.className = 'sub-input-panel';
    painel.dataset.forTopico = topicoId; 
    painel.dataset.forIndex = anotacaoIndex;
    
    // Tratamento de tipo seguro para injetar como string no HTML
    const argCidx = cIdx != null ? cIdx : 'null';
    
    painel.innerHTML = `
        <textarea id="sub-input-text" class="sub-input-textarea" placeholder="Digite a ideia secundária..." rows="3"></textarea>
        <div class="sub-input-actions">
            <button class="sub-input-btn-icon confirm" title="Confirmar (Ctrl+Enter)" onclick="confirmarSubAnotacao('${topicoId}', ${anotacaoIndex}, ${argCidx})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
            <button class="sub-input-btn-icon cancel" title="Cancelar (Esc)" onclick="document.getElementById('sub-input-active').remove()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>`;
        
    // Ancoragem dinâmica: anexa o input logo abaixo do card que gerou a ação
    const topicoTarget = topicos.find(t => t.id === topicoId);
    const uuidTarget = topicoTarget && topicoTarget.anotacoes[anotacaoIndex] ? topicoTarget.anotacoes[anotacaoIndex].uuid : null;
    const masterWrapper = document.getElementById(uuidTarget ? `timeline-wrapper-${uuidTarget}` : `timeline-wrapper-${anotacaoIndex}`);
    if (masterWrapper) {
        let mountPoint = masterWrapper.querySelector('.main-card-wrapper');
        if (cIdx != null) {
            const correlatedItem = mountPoint.querySelector(`.correlated-item-wrapper[data-cidx="${cIdx}"]`);
            if (correlatedItem) mountPoint = correlatedItem;
        }
        mountPoint.appendChild(painel); 
        
        const textarea = document.getElementById('sub-input-text');
        textarea.focus();
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') document.getElementById('sub-input-active').remove();
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') confirmarSubAnotacao(topicoId, anotacaoIndex, cIdx);
        });
    }
}

function confirmarSubAnotacao(topicoId, anotacaoIndex, cIdx = null) {
    const textarea = document.getElementById('sub-input-text');
    let texto = textarea ? textarea.value.trim() : '';
    texto = window.JurisUtils.limparTextoPDF(texto);
    
    if (!texto) return exibirToast('Digite uma observação.', 'aviso');
    
    const viewSource = cIdx !== null ? cIdx : 'main';
    const noIdeia = { 
        uuid: 'id-' + crypto.randomUUID(), texto, revisada: false, timestamp: Date.now() 
    };

    window.Store.dispatch({
        type: 'ADD_SUB_ANNOTATION',
        payload: { topicoId, parentIndex: anotacaoIndex, viewSource, noIdeia }
    });
    
    document.getElementById('sub-input-active').remove();
    renderizarTopicos(); 
    exibirToast('Observação secundária vinculada.', 'sucesso');
}

/* --- MODAL DE TESE --- */
let _ideiaContextoTese = null;

function abrirModalTese(topicoId, index) {
    _ideiaContextoTese = { topicoId, index };
    document.getElementById('tese-ideia-num').textContent = index + 1;
    const anotacao = topicos.find(t => t.id === topicoId).anotacoes[index];
    document.getElementById('input-texto-tese').value = anotacao.tese || '';
    
    document.getElementById('wizard-backdrop').style.display = 'block';
    document.getElementById('modal-editar-tese').style.display = 'flex';
}

function fecharModalTese() {
    document.getElementById('wizard-backdrop').style.display = 'none';
    document.getElementById('modal-editar-tese').style.display = 'none';
    _ideiaContextoTese = null;
}

function salvarTese() {
    if (!_ideiaContextoTese) return;
    const teseTxt = document.getElementById('input-texto-tese').value.trim();
    const topico = topicos.find(t => t.id === _ideiaContextoTese.topicoId);
    topico.anotacoes[_ideiaContextoTese.index].tese = teseTxt;
    
    renderizarTopicos(); salvarBackupAutomatico();
    exibirToast('Tese salva com sucesso!', 'sucesso');
    fecharModalTese();
}

/* --- MODAL DE SMART MOVE (REORDENAÇÃO INTELIGENTE) --- */
let _smartMoveCtx = null;

function toggleSmartMoveInput() {
    const isExistente = document.querySelector('input[name="smart_move_tipo"]:checked').value === 'existente';
    const input = document.getElementById('input-smart-move-destino');
    const hint = document.getElementById('smart-move-hint');
    
    input.style.display = 'block'; // Garante que fique visível
    input.value = ''; // Limpa o valor ao trocar a opção
    
    if (isExistente) {
        input.placeholder = "Nº da Ideia Destino (ex: 2)";
        hint.innerText = "Digite o número da ideia onde esta prova será agrupada:";
    } else {
        input.placeholder = "Nova Posição (opcional)";
        hint.innerText = "Deixe em branco para ir para o final, ou digite a posição exata:";
    }
}

function abrirModalSmartMove(topicoId, parentIndex, correlacionadoIndex = null) {
    _smartMoveCtx = { topicoId, parentIndex, correlacionadoIndex };
    document.getElementById('input-smart-move-destino').value = '';
    document.querySelector('input[name="smart_move_tipo"][value="nova"]').checked = true;
    toggleSmartMoveInput();
    
    document.getElementById('wizard-backdrop').style.display = 'block';
    document.getElementById('modal-smart-move').style.display = 'flex';
}

function fecharModalSmartMove() {
    document.getElementById('wizard-backdrop').style.display = 'none';
    document.getElementById('modal-smart-move').style.display = 'none';
    _smartMoveCtx = null;
}

function confirmarSmartMove() {
    const topico = topicos.find(t => t.id === _smartMoveCtx.topicoId);
    const isNova = document.querySelector('input[name="smart_move_tipo"]:checked').value === 'nova';
    const inputVal = document.getElementById('input-smart-move-destino').value;
    let destinoIdx = null;

    // 1. Validação Robusta para ambas as escolhas
    if (!isNova) {
        const destinoVal = parseInt(inputVal, 10);
        if (isNaN(destinoVal) || destinoVal < 1 || destinoVal > topico.anotacoes.length) {
            return exibirToast('Número de destino inválido.', 'erro');
        }
        destinoIdx = destinoVal - 1;
        if (_smartMoveCtx.correlacionadoIndex === null && destinoIdx === _smartMoveCtx.parentIndex) {
            return exibirToast('Não é possível mover a ideia para ela mesma.', 'erro');
        }
    } else {
        // Se escolheu Nova Ideia e digitou um número
        if (inputVal.trim() !== '') {
            const destinoVal = parseInt(inputVal, 10);
            if (isNaN(destinoVal) || destinoVal < 1 || destinoVal > topico.anotacoes.length + 1) {
                return exibirToast('Posição para a nova ideia é inválida.', 'erro');
            }
            destinoIdx = destinoVal - 1;
        }
    }

    // 2. Extração da Prova da sua Origem Original (Operação Isolada)
    let itemMovido;
    let arrayReduziu = false;

    if (_smartMoveCtx.correlacionadoIndex !== null) {
        // Cenário A: Movendo um filho (mantém comportamento original atômico via splice)
        itemMovido = topico.anotacoes[_smartMoveCtx.parentIndex].itensCorrelacionados.splice(_smartMoveCtx.correlacionadoIndex, 1)[0];
    } else {
        // Cenário B: Movendo o Card Principal
        const cardOriginal = topico.anotacoes[_smartMoveCtx.parentIndex];

        if (cardOriginal.itensCorrelacionados && cardOriginal.itensCorrelacionados.length > 0) {
            // FASE 1: CONSTRUÇÃO EM MEMÓRIA (Deep Clone para evitar mutação cruzada)
            const cloneProfundo = structuredClone(cardOriginal);
            
            // O "novo líder" será o primeiro item dos filhos clonados
            const novoMainCard = cloneProfundo.itensCorrelacionados.shift();
            
            // Transferindo a "coroa" (herança de estado) para o novo líder
            novoMainCard.tese = cloneProfundo.tese;
            novoMainCard.itensCorrelacionados = cloneProfundo.itensCorrelacionados;

            // Preparando o card que vai viajar.
            // Usamos defaults em vez de 'delete' para preservar a otimização da Hidden Class no V8
            itemMovido = structuredClone(cardOriginal);
            itemMovido.itensCorrelacionados = [];
            itemMovido.tese = ""; 

            // FASE 2: ESCRITA ATÔMICA (Commit no array oficial)
            topico.anotacoes[_smartMoveCtx.parentIndex] = novoMainCard;
            arrayReduziu = false; // A posição foi apenas substituída, o array não diminuiu
            
        } else {
            // Cenário C: Card Principal solteiro
            itemMovido = topico.anotacoes.splice(_smartMoveCtx.parentIndex, 1)[0];
            arrayReduziu = true;
        }
    }

    // Compensação matemática de índice de destino
    if (arrayReduziu && _smartMoveCtx.correlacionadoIndex === null) {
        if (!isNova && destinoIdx > _smartMoveCtx.parentIndex) destinoIdx--;
        if (isNova && destinoIdx !== null && destinoIdx > _smartMoveCtx.parentIndex) destinoIdx--; 
    }

    // 3. Inserção no Destino Final
    if (isNova) {
        if (!itemMovido.itensCorrelacionados) itemMovido.itensCorrelacionados = [];
        if (!itemMovido.subAnotacoes) itemMovido.subAnotacoes = [];
        
        if (destinoIdx !== null) {
            topico.anotacoes.splice(destinoIdx, 0, itemMovido); // Insere no meio
            exibirToast(`Prova transformada em Nova Ideia na posição ${destinoIdx + 1}.`, 'sucesso');
        } else {
            topico.anotacoes.push(itemMovido); // Joga pro final
            exibirToast('Prova transformada em Nova Ideia no final.', 'sucesso');
        }
    } else {
        const cardDestino = topico.anotacoes[destinoIdx];
        if (!cardDestino.itensCorrelacionados) cardDestino.itensCorrelacionados = [];
        cardDestino.itensCorrelacionados.push(itemMovido);
        exibirToast(`Prova agrupada à Ideia ${destinoIdx + 1}.`, 'sucesso');
    }

    renderizarTopicos(); 
    salvarBackupAutomatico(); 
    if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
    fecharModalSmartMove();
}

/* --- TEMA E DRAG & DROP --- */
window.toggleSubmenuTemas = function() {
    const submenu = document.getElementById('submenu-temas');
    submenu.style.display = submenu.style.display === 'none' ? 'flex' : 'none';
};

window.DnDManager = {
    draggedItem: null,

    dragStart: function(event, topicoId, parentIndex, cIdx) {
        event.stopPropagation();
        this.draggedItem = { topicoId, parentIndex, cIdx };
        
        const wrapper = cIdx === 'main' 
            ? event.currentTarget.closest('.main-card-wrapper')
            : event.currentTarget.closest('.correlated-item-wrapper');
            
        if (wrapper) wrapper.classList.add('dragging'); 
        
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', '');
    },

    dragOver: function(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    },

    dragEnter: function(event) {
        event.preventDefault();
        event.stopPropagation();
        const wrapper = event.currentTarget.closest('.correlated-item-wrapper') || event.currentTarget.closest('.main-card-wrapper');
        if (wrapper) wrapper.classList.add('drag-over');
    },

    dragLeave: function(event) {
        event.stopPropagation();
        const wrapper = event.currentTarget.closest('.correlated-item-wrapper') || event.currentTarget.closest('.main-card-wrapper');
        if (!wrapper) return;
        if (!wrapper.contains(event.relatedTarget)) {
            wrapper.classList.remove('drag-over');
        }
    },

    dragEnd: function(event) {
        event.currentTarget.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    },

    drop: function(event, targetTopicoId, targetParentIndex, targetCIdx) {
        event.preventDefault();
        event.stopPropagation();

        const wrapper = event.currentTarget.closest('.correlated-item-wrapper') || event.currentTarget.closest('.main-card-wrapper');
        if (wrapper) wrapper.classList.remove('drag-over');

        const src = this.draggedItem;
        if (!src || src.topicoId !== targetTopicoId || src.parentIndex !== targetParentIndex) {
            return exibirToast('Só é possível reordenar itens dentro do mesmo agrupamento.', 'aviso');
        }
        if (src.cIdx === targetCIdx) return;

        window.Store.dispatch({ type: 'DND_DROP_ITEM', payload: { targetTopicoId, targetParentIndex, targetCIdx, src } });
        exibirToast('Card reposicionado!', 'sucesso');
    }
};

function exibirTooltipRapido(intencao, event) {
    // Encapsulado para não poluir o namespace global
    const RESUMOS_IA = {
        'premissa': { titulo: 'Premissa Lógica', texto: 'A IA usará isso como verdade absoluta para deduzir o caso.' },
        'comando': { titulo: 'Comando Direto', texto: 'A IA obedecerá a esta ordem exata na hora de redigir.' },
        'texto': { titulo: 'Texto Fixo', texto: 'A IA fará um "copia e cola" desta redação na minuta.' },
        'nota': { titulo: 'Nota Oculta', texto: 'A IA NÃO lerá isso. É apenas um lembrete para você.' },
        'veredito': { titulo: 'Veredito / Conclusão', texto: 'Força a IA a concluir o tópico recursal com esta decisão.' },
        'fundamentacao': { titulo: 'Base Legal', texto: 'A IA priorizará esta lei/súmula acima de qualquer outra.' },
        'refutacao': { titulo: 'Refutação (Mérito)', texto: 'A IA usará este argumento para derrubar a tese da parte.' },
        'preliminar': { titulo: 'Filtro / Prejudicial', texto: 'A IA redigirá este tópico antes de entrar no mérito.' }
    };

    const dados = RESUMOS_IA[intencao];
    if (!dados) return;

    const tooltip = document.getElementById('quick-intent-tooltip');
    tooltip.innerHTML = `<strong>${dados.titulo}</strong>${dados.texto}`;

    // Posicionamento Anti-Race-Condition: Bloqueia display antes de medir
    tooltip.classList.remove('visible');
    tooltip.style.display = 'block';

    let x = event.clientX + 15;
    let y = event.clientY + 15;
    const rect = tooltip.getBoundingClientRect();

    if (x + rect.width > window.innerWidth) x = event.clientX - rect.width - 15;
    if (y + rect.height > window.innerHeight) y = event.clientY - rect.height - 15;

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;

    // Dispara a animação apenas no próximo frame
    requestAnimationFrame(() => {
        tooltip.classList.add('visible');
    });

    clearTimeout(tooltip._timer);
    tooltip._timer = setTimeout(() => fecharTooltipRapido(), 4500);
}

function fecharTooltipRapido() {
    const tooltip = document.getElementById('quick-intent-tooltip');
    if (tooltip && tooltip.classList.contains('visible')) {
        tooltip.classList.remove('visible');
        setTimeout(() => { tooltip.style.display = 'none'; }, 200);
    }
}

// NOVO: Função Global e Segura de Cópia da Degravação
window.copiarDegravacao = function(topicoId, uuidCard) {
    const topico = topicos.find(t => t.id === topicoId);
    if (!topico) return;
    
    let alvo = topico.anotacoes.find(a => a.uuid === uuidCard);
    if (!alvo) {
        topico.anotacoes.forEach(a => {
            if (a.itensCorrelacionados) {
                const enc = a.itensCorrelacionados.find(ic => ic.uuid === uuidCard);
                if (enc) alvo = enc;
            }
        });
    }

    if (alvo && alvo.tipo === 'audio') {
        try {
            const d = JSON.parse(alvo.conteudo);
            if (d.transcricao) {
                navigator.clipboard.writeText(d.transcricao).then(() => {
                    exibirToast('Degravação copiada para a área de transferência!', 'sucesso');
                });
            } else {
                exibirToast('Este áudio não possui degravação.', 'aviso');
            }
        } catch(e) { exibirToast('Erro ao ler dados do áudio.', 'erro'); }
    }
};

// window.SubDnDManager removido na refatoração de limpeza

/* ================================================
   ROTEADOR CENTRAL DE EVENTOS (DELEGAÇÃO)
   ================================================ */
window.TimelineEventDelegator = (function() {
    function init() {
        const container = document.getElementById('history-container');
        if (!container) return;

        container.addEventListener('click', function(e) {
            const targetEl = e.target.closest('[data-action]');
            if (!targetEl) return;

            e.preventDefault(); 
            
            const action = targetEl.dataset.action;
            const topicoId = targetEl.dataset.topico;
            
            // FASE 1: Data Sanitization Pipeline
            // Uso de Type Guards para garantir que apenas números reais cheguem ao roteador
            const rawIndex = targetEl.dataset.index;
            const index = (rawIndex !== undefined && rawIndex !== "") ? parseInt(rawIndex, 10) : null;
            
            const rawParent = targetEl.dataset.parent;
            const parent = (rawParent !== undefined && rawParent !== "") ? parseInt(rawParent, 10) : null;
            
            const rawCidx = targetEl.dataset.cidx;
            const cIdx = (rawCidx !== undefined && rawCidx !== "") ? parseInt(rawCidx, 10) : null;
            
            const rawLocal = targetEl.dataset.local;
            const localIndex = (rawLocal !== undefined && rawLocal !== "") ? parseInt(rawLocal, 10) : null;
            
            const viewSource = targetEl.dataset.view;

            // FASE 2: Lexical Scope Assignment e Blindagem contra NaN
            if (topicoId && index !== null && !Number.isNaN(index)) {
                // Removido "window." para respeitar o escopo protegido let do arquivo
                _menuAnotacaoCtx = { topicoId, index, cIdx };
            }

            // FASE 3: Dispatcher
            switch (action) {
                case 'edit-item': cIdx !== null ? editarItemCorrelacionado() : editarAnotacao(); break;
                case 'add-subnode': acionarNovoNoIdeia(); break;
                case 'smart-move': abrirModalSmartMove(topicoId, index, cIdx); break;
                case 'delete-item': cIdx !== null ? excluirItemCorrelacionado(topicoId, index, cIdx) : excluirAnotacao(); break;
                
                case 'open-submenu':
                    e.stopPropagation(); 
                    abrirMenuSubAnotacao(topicoId, index, viewSource, localIndex, e); 
                    break;
                case 'toggle-revision':
                    e.stopPropagation();
                    window.Store.dispatch({ type: 'TOGGLE_REVISION', payload: { topicoId, parentIndex: parent, viewSource, localIndex } });
                    renderizarTopicos();
                    break;
                case 'edit-thesis': abrirModalTese(topicoId, index); break;
                case 'add-directive':
                    e.stopPropagation();
                    adicionarDiretrizEstrutural(targetEl.dataset.dtype, topicoId, targetEl.dataset.tesenome || null, e); 
                    break;
                case 'edit-preamble': window.abrirEdicaoPreambulo(topicoId, targetEl.dataset.campo); break;
                case 'ai-trigger':
                    e.stopPropagation();
                    window.AIRecommendationManager.buscarModelosCompativeis(topicoId, decodeURIComponent(targetEl.dataset.conteudo)); 
                    break;
                default: console.warn(`[Juris Notes] Ação de delegação não mapeada: ${action}`);
            }
        });
    }
    return { init };
})();
