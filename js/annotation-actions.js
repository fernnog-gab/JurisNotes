/* ================================================
   annotation-actions.js
   Gerenciamento de Menus, Formatação Segura (Markdown) e Ações
   ================================================ */

var _menuAnotacaoCtx = null;
var _menuSubAnotacaoCtx = null;
var _editContext = null;

/* --- MENUS CONTEXTUAIS --- */
function abrirMenuAnotacao(topicoId, index, event) {
    event.stopPropagation();
    _menuAnotacaoCtx = { topicoId, index };
    _posicionarMenu('annotation-context-menu', event);
}

// HELPER PRIVADO (Resolução de Referência)
function _resolverSubAlvo(topico, parentIndex, viewSource) {
    const cardMestre = topico.anotacoes[parentIndex];
    if (viewSource === 'main') {
        return cardMestre;
    }
    const cIdx = parseInt(viewSource, 10);
    return cardMestre.itensCorrelacionados[cIdx];
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
    
    const topico = topicos.find(t => t.id === _menuSubAnotacaoCtx.topicoId);
    if (!topico) return;
    
    const alvo = _resolverSubAlvo(topico, _menuSubAnotacaoCtx.parentIndex, _menuSubAnotacaoCtx.viewSource);
    const sub = alvo.subAnotacoes[_menuSubAnotacaoCtx.localIndex];
    
    // Atualiza o estado
    sub.intencao = intencaoStr;
    
    renderizarTopicos(); 
    salvarBackupAutomatico();
    
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
    if (anotacao.tipo !== 'texto') return exibirToast('Apenas anotações de texto podem ser editadas.', 'aviso');
    abrirModalEdicao({ tipo: 'main', topicoId: _menuAnotacaoCtx.topicoId, parentIndex: _menuAnotacaoCtx.index }, anotacao.conteudo);
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
    
    if (item.tipo !== 'texto') return exibirToast('Apenas anotações de texto podem ser editadas.', 'aviso');
    
    abrirModalEdicao({ 
        tipo: 'correlated', 
        topicoId: _menuAnotacaoCtx.topicoId, 
        parentIndex: _menuAnotacaoCtx.index, 
        cIdx: _menuAnotacaoCtx.cIdx 
    }, item.conteudo);
}

function abrirModalEdicao(contexto, textoAtual) {
    _editContext = contexto;
    const textarea = document.getElementById('edit-text-input');
    textarea.value = textoAtual;
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
    const novoTexto = document.getElementById('edit-text-input').value.trim();
    if (!novoTexto && _editContext.tipo !== 'preambulo') return exibirToast('O texto não pode ficar vazio.', 'aviso');

    // O DOM "mastiga" sua própria estrutura e despacha uma intenção de negócio pura
    if (_editContext.tipo === 'preambulo') {
        window.Store.dispatch({
            type: 'UPDATE_TOPIC_PREAMBLE',
            payload: { topicoId: _editContext.topicoId, campo: _editContext.campo, novoTexto }
        });
    } else if (_editContext.tipo === 'main') {
        window.Store.dispatch({
            type: 'UPDATE_MAIN_ANNOTATION',
            payload: { topicoId: _editContext.topicoId, parentIndex: _editContext.parentIndex, novoTexto }
        });
    } else if (_editContext.tipo === 'sub') {
        window.Store.dispatch({
            type: 'UPDATE_SUB_ANNOTATION',
            payload: { topicoId: _editContext.topicoId, parentIndex: _editContext.parentIndex, viewSource: _editContext.viewSource, localIndex: _editContext.localIndex, novoTexto }
        });
    } else if (_editContext.tipo === 'correlated') {
        window.Store.dispatch({
            type: 'UPDATE_CORRELATED_ITEM',
            payload: { topicoId: _editContext.topicoId, parentIndex: _editContext.parentIndex, cIdx: _editContext.cIdx, novoTexto }
        });
    }
    
    exibirToast('Anotação salva com sucesso!', 'sucesso');
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
    if (!confirm('Excluir esta anotação? A ação não pode ser desfeita.')) return;
    
    // Disparo para o Store (Transição arquitetural para Fase 4)
    if (window.Store) {
        window.Store.dispatch({ type: 'DELETE_ITEM', payload: { topicoId, index } });
    } else {
        // Fallback imediato mantendo a funcionalidade nativa
        topico.anotacoes.splice(index, 1);
        renderizarTopicos(); salvarBackupAutomatico();
        if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
    }
    
    exibirToast('Anotação excluída.', 'sucesso');
    _menuAnotacaoCtx = null;
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
    
    const topico = topicos.find(t => t.id === _menuSubAnotacaoCtx.topicoId);
    const alvo = _resolverSubAlvo(topico, _menuSubAnotacaoCtx.parentIndex, _menuSubAnotacaoCtx.viewSource);
    
    alvo.subAnotacoes.splice(_menuSubAnotacaoCtx.localIndex, 1);
    
    renderizarTopicos(); salvarBackupAutomatico();
    document.getElementById('sub-annotation-context-menu').style.display = 'none';
}

// Função reordenarSubAnotacao removida arquiteturalmente (Automação Inteligente de Distribuição)

function abrirModalReordenar(tipo, topicoId, index, total, subIndex = null) {
    _reordenarCtx = { tipo, topicoId, index, total, subIndex };
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
    const topico = topicos.find(t => t.id === _reordenarCtx.topicoId);
    const novaPos = parseInt(document.getElementById('input-nova-posicao').value, 10);

    if (isNaN(novaPos) || novaPos < 1 || novaPos > _reordenarCtx.total) {
        return exibirToast(`Posição inválida. Escolha entre 1 e ${_reordenarCtx.total}.`, 'erro');
    }

    if (_reordenarCtx.tipo === 'main') {
        const [item] = topico.anotacoes.splice(_reordenarCtx.index, 1);
        topico.anotacoes.splice(novaPos - 1, 0, item);
    }

    renderizarTopicos(); salvarBackupAutomatico();
    if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
    fecharModalReordenar();
    exibirToast('Item reposicionado com sucesso.', 'sucesso');
    _menuAnotacaoCtx = null;
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
    const texto = textarea ? textarea.value.trim() : '';
    if (!texto) return exibirToast('Digite uma observação.', 'aviso');
    
    const topico = topicos.find(t => t.id === topicoId);
    const viewSource = cIdx !== null ? cIdx : 'main';
    const alvo = _resolverSubAlvo(topico, anotacaoIndex, viewSource);
    
    if (!alvo.subAnotacoes) alvo.subAnotacoes = [];
    alvo.subAnotacoes.push({ 
        uuid: 'id-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36),
        texto, 
        timestamp: Date.now() 
    });
    
    document.getElementById('sub-input-active').remove();
    renderizarTopicos(); 
    salvarBackupAutomatico();
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
        event.stopPropagation(); // CRÍTICO: Isola o evento de Bubbling do DOM
        this.draggedItem = { topicoId, parentIndex, cIdx };
        
        // Aplica o feedback visual no container correspondente
        const wrapper = cIdx === 'main' 
            ? event.currentTarget.closest('.main-card-wrapper')
            : event.currentTarget.closest('.correlated-item-wrapper');
            
        if (wrapper) wrapper.classList.add('dragging'); 
        
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', ''); // Necessário p/ Firefox
    },

    dragOver: function(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    },

    dragEnter: function(event) {
        event.preventDefault();
        event.stopPropagation(); // Bloqueia Bubbling
        const wrapper = event.currentTarget.closest('.correlated-item-wrapper') || event.currentTarget.closest('.main-card-wrapper');
        if (wrapper) wrapper.classList.add('drag-over');
    },

    dragLeave: function(event) {
        event.stopPropagation(); // Bloqueia Bubbling
        const wrapper = event.currentTarget.closest('.correlated-item-wrapper') || event.currentTarget.closest('.main-card-wrapper');
        if (!wrapper) return;
        // Evita o efeito pisca-pisca caso o mouse passe por elementos internos
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
        event.stopPropagation(); // CRÍTICO: Bloqueia acionamento de áreas parentais

        const wrapper = event.currentTarget.closest('.correlated-item-wrapper') || event.currentTarget.closest('.main-card-wrapper');
        if (wrapper) wrapper.classList.remove('drag-over');

        const src = this.draggedItem;
        if (!src || src.topicoId !== targetTopicoId || src.parentIndex !== targetParentIndex) {
            exibirToast('Só é possível reordenar itens dentro do mesmo agrupamento.', 'aviso');
            return;
        }
        if (src.cIdx === targetCIdx) return; // Nenhuma movimentação real

        const topico = topicos.find(t => t.id === targetTopicoId);
        const cardOriginal = topico.anotacoes[targetParentIndex];
        
        if (targetCIdx === 'main' && src.cIdx !== null && src.cIdx !== 'main') {
            // FLUXO 1: PROMOVER FILHO A MESTRE (Arrastar de baixo para cima)
            const estadoClonado = structuredClone(cardOriginal);
            const itemArrastado = estadoClonado.itensCorrelacionados.splice(src.cIdx, 1)[0];
            
            const oldMain = structuredClone(estadoClonado);
            oldMain.itensCorrelacionados = []; oldMain.tese = "";
            
            estadoClonado.itensCorrelacionados.unshift(oldMain);
            
            itemArrastado.itensCorrelacionados = estadoClonado.itensCorrelacionados;
            itemArrastado.tese = estadoClonado.tese;

            topico.anotacoes[targetParentIndex] = itemArrastado;
            exibirToast('Prova promovida a Card Principal!', 'sucesso');
            
        } else if (src.cIdx === 'main' && targetCIdx !== 'main' && targetCIdx !== null) {
            // FLUXO 2: REBAIXAR MESTRE A FILHO (Arrastar mestre para baixo)
            const estadoClonado = structuredClone(cardOriginal);
            const novoMestre = estadoClonado.itensCorrelacionados.splice(targetCIdx, 1)[0];
            
            const oldMain = structuredClone(estadoClonado);
            oldMain.itensCorrelacionados = []; oldMain.tese = "";
            
            novoMestre.itensCorrelacionados = estadoClonado.itensCorrelacionados;
            novoMestre.tese = estadoClonado.tese;
            
            novoMestre.itensCorrelacionados.splice(targetCIdx, 0, oldMain);
            
            topico.anotacoes[targetParentIndex] = novoMestre;
            exibirToast('Card Mestre substituído!', 'sucesso');
            
        } else {
            // FLUXO 3: REORDENAÇÃO ENTRE FILHOS
            const grupo = cardOriginal.itensCorrelacionados;
            const [itemMovido] = grupo.splice(src.cIdx, 1);
            grupo.splice(targetCIdx, 0, itemMovido);
            exibirToast('Ordem atualizada!', 'sucesso');
        }

        renderizarTopicos();
        salvarBackupAutomatico();
        if (window.sincronizarHighlightsGerais) window.sincronizarHighlightsGerais();
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

// window.SubDnDManager removido na refatoração de limpeza
