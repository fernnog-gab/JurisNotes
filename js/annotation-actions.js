/* ================================================
   annotation-actions.js
   Gerenciamento de Menus, Formatação Segura (Markdown) e Ações
   ================================================ */

let _menuAnotacaoCtx = null;
let _menuSubAnotacaoCtx = null;
let _editContext = null;

/* --- MENUS CONTEXTUAIS --- */
function abrirMenuAnotacao(topicoId, index, event) {
    event.stopPropagation();
    _menuAnotacaoCtx = { topicoId, index };
    _posicionarMenu('annotation-context-menu', event);
}

function abrirMenuSubAnotacao(topicoId, parentIndex, subIndex, event) {
    event.stopPropagation();
    _menuSubAnotacaoCtx = { topicoId, parentIndex, subIndex };
    
    // UX: Marca o item ativo no menu com base no estado atual
    const topico = topicos.find(t => t.id === topicoId);
    const sub = topico.anotacoes[parentIndex].subAnotacoes[subIndex];
    const currentIntent = sub.intencao || 'premissa';
    
    document.querySelectorAll('#sub-annotation-context-menu .btn-intent').forEach(btn => {
        btn.classList.toggle('active-intent', btn.dataset.intent === currentIntent);
    });

    _posicionarMenu('sub-annotation-context-menu', event);
}

function definirIntencaoSubAnotacao(intencaoStr) {
    if (!_menuSubAnotacaoCtx) return;
    
    const topico = topicos.find(t => t.id === _menuSubAnotacaoCtx.topicoId);
    if (!topico) return;
    
    const sub = topico.anotacoes[_menuSubAnotacaoCtx.parentIndex].subAnotacoes[_menuSubAnotacaoCtx.subIndex];
    
    // Atualiza o estado
    sub.intencao = intencaoStr;
    
    renderizarTopicos(); 
    salvarBackupAutomatico();
    
    const rotulos = { 'comando': 'Comando Direto', 'texto': 'Texto Fixo', 'nota': 'Nota Oculta', 'premissa': 'Premissa Padrão' };
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
    const sub = topicos.find(t => t.id === _menuSubAnotacaoCtx.topicoId).anotacoes[_menuSubAnotacaoCtx.parentIndex].subAnotacoes[_menuSubAnotacaoCtx.subIndex];
    abrirModalEdicao({ tipo: 'sub', topicoId: _menuSubAnotacaoCtx.topicoId, parentIndex: _menuSubAnotacaoCtx.parentIndex, subIndex: _menuSubAnotacaoCtx.subIndex }, sub.texto);
    document.getElementById('sub-annotation-context-menu').style.display = 'none';
}

function abrirModalEdicao(contexto, textoAtual) {
    _editContext = contexto;
    const textarea = document.getElementById('edit-text-input');
    textarea.value = textoAtual;
    document.getElementById('wizard-backdrop').style.display = 'block';
    document.getElementById('text-edit-modal').style.display = 'flex';
    setTimeout(() => textarea.focus(), 50);
}

function fecharModalEdicao() {
    _editContext = null;
    document.getElementById('wizard-backdrop').style.display = 'none';
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
    if (!novoTexto) return exibirToast('O texto não pode ficar vazio.', 'aviso');

    const topico = topicos.find(t => t.id === _editContext.topicoId);
    if (_editContext.tipo === 'main') topico.anotacoes[_editContext.parentIndex].conteudo = novoTexto;
    else topico.anotacoes[_editContext.parentIndex].subAnotacoes[_editContext.subIndex].texto = novoTexto;
    
    renderizarTopicos(); salvarBackupAutomatico();
    exibirToast('Anotação salva com sucesso!', 'sucesso');
    fecharModalEdicao();
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
    topico.anotacoes.splice(index, 1);
    renderizarTopicos(); salvarBackupAutomatico();
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
    topicos.find(t => t.id === _menuSubAnotacaoCtx.topicoId).anotacoes[_menuSubAnotacaoCtx.parentIndex].subAnotacoes.splice(_menuSubAnotacaoCtx.subIndex, 1);
    renderizarTopicos(); salvarBackupAutomatico();
    document.getElementById('sub-annotation-context-menu').style.display = 'none';
}

function reordenarSubAnotacao() {
    if (!_menuSubAnotacaoCtx) return;
    const { topicoId, parentIndex, subIndex } = _menuSubAnotacaoCtx;
    const subAnotacoes = topicos.find(t => t.id === topicoId).anotacoes[parentIndex].subAnotacoes;
    if (subAnotacoes.length <= 1) return exibirToast('Apenas uma ideia secundária.', 'aviso');

    abrirModalReordenar('sub', topicoId, parentIndex, subAnotacoes.length, subIndex);
    document.getElementById('sub-annotation-context-menu').style.display = 'none';
}

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
    } else {
        const subAnotacoes = topico.anotacoes[_reordenarCtx.index].subAnotacoes;
        const [item] = subAnotacoes.splice(_reordenarCtx.subIndex, 1);
        subAnotacoes.splice(novaPos - 1, 0, item);
    }

    renderizarTopicos(); salvarBackupAutomatico();
    fecharModalReordenar();
    exibirToast('Item reposicionado com sucesso.', 'sucesso');
    _menuAnotacaoCtx = null;
    _menuSubAnotacaoCtx = null;
}

function excluirItemCorrelacionado(topicoId, parentIndex, correlacionadoIndex) {
    if (!confirm('Excluir este item correlacionado?')) return;
    topicos.find(t => t.id === topicoId).anotacoes[parentIndex].itensCorrelacionados.splice(correlacionadoIndex, 1);
    renderizarTopicos(); salvarBackupAutomatico();
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
    const masterWrapper = document.getElementById(`timeline-wrapper-${anotacaoIndex}`);
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
    
    const anotacao = topicos.find(t => t.id === topicoId).anotacoes[anotacaoIndex];
    if (!anotacao.subAnotacoes) anotacao.subAnotacoes = [];
    
    // Grava no arquivo .json a referência exata da origem
    anotacao.subAnotacoes.push({ 
        texto, 
        timestamp: Date.now(),
        sourceRef: cIdx != null ? cIdx : 'main'
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
    document.getElementById('input-smart-move-destino').style.display = isExistente ? 'block' : 'none';
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
    let destinoIdx = null;

    // 1. Validação Antecipada (Evita Perda de Dados)
    if (!isNova) {
        const destinoVal = parseInt(document.getElementById('input-smart-move-destino').value, 10);
        if (isNaN(destinoVal) || destinoVal < 1 || destinoVal > topico.anotacoes.length) {
            return exibirToast('Número de destino inválido.', 'erro');
        }
        destinoIdx = destinoVal - 1;
        if (_smartMoveCtx.correlacionadoIndex === null && destinoIdx === _smartMoveCtx.parentIndex) {
            return exibirToast('Não é possível mover a ideia para ela mesma.', 'erro');
        }
    }

    // 2. Extração Segura do Item
    let itemMovido;
    if (_smartMoveCtx.correlacionadoIndex !== null) {
        itemMovido = topico.anotacoes[_smartMoveCtx.parentIndex].itensCorrelacionados.splice(_smartMoveCtx.correlacionadoIndex, 1)[0];
    } else {
        itemMovido = topico.anotacoes.splice(_smartMoveCtx.parentIndex, 1)[0];
        // Compensação de índice se a origem foi removida e ficava antes do destino
        if (!isNova && destinoIdx > _smartMoveCtx.parentIndex) destinoIdx--;
    }

    // 3. Inserção Segura e Normalização de Schema
    if (isNova) {
        if (!itemMovido.itensCorrelacionados) itemMovido.itensCorrelacionados = [];
        if (!itemMovido.subAnotacoes) itemMovido.subAnotacoes = [];
        topico.anotacoes.push(itemMovido);
        exibirToast('Prova transformada em Nova Ideia.', 'sucesso');
    } else {
        const cardDestino = topico.anotacoes[destinoIdx];
        if (!cardDestino.itensCorrelacionados) cardDestino.itensCorrelacionados = [];
        cardDestino.itensCorrelacionados.push(itemMovido);
        exibirToast(`Prova agrupada à Ideia ${destinoIdx + 1}.`, 'sucesso');
    }

    renderizarTopicos(); salvarBackupAutomatico(); fecharModalSmartMove();
}

/* --- TEMA E DRAG & DROP --- */
window.toggleSubmenuTemas = function() {
    const submenu = document.getElementById('submenu-temas');
    submenu.style.display = submenu.style.display === 'none' ? 'flex' : 'none';
};

window.DnDManager = {
    draggedItem: null,

    dragStart: function(event, topicoId, parentIndex, cIdx) {
        this.draggedItem = { topicoId, parentIndex, cIdx };
        event.currentTarget.classList.add('dragging'); 
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', ''); // Essencial para Firefox
    },

    dragOver: function(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    },

    dragEnter: function(event) {
        event.preventDefault();
        const wrapper = event.currentTarget.closest('.correlated-item-wrapper');
        if (wrapper) wrapper.classList.add('drag-over');
    },

    dragLeave: function(event) {
        const wrapper = event.currentTarget.closest('.correlated-item-wrapper');
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

        const wrapper = event.currentTarget.closest('.correlated-item-wrapper');
        if (!wrapper) return; // Segurança contra crashes se o alvo for o SVG interno
        wrapper.classList.remove('drag-over');

        const src = this.draggedItem;
        if (!src || src.topicoId !== targetTopicoId || src.parentIndex !== targetParentIndex) {
            exibirToast('Só é possível reordenar itens dentro do mesmo agrupamento.', 'aviso');
            return;
        }
        if (src.cIdx === targetCIdx) return; // Não mudou de posição

        const topico = topicos.find(t => t.id === targetTopicoId);
        const grupo = topico.anotacoes[targetParentIndex].itensCorrelacionados;

        const [itemMovido] = grupo.splice(src.cIdx, 1);
        grupo.splice(targetCIdx, 0, itemMovido);

        renderizarTopicos();
        salvarBackupAutomatico();
        exibirToast('Ordem atualizada!', 'sucesso');
    }
};
