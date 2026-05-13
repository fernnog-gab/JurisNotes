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
    _posicionarMenu('sub-annotation-context-menu', event);
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
    const { topicoId, index } = _menuAnotacaoCtx;
    document.getElementById('annotation-context-menu').style.display = 'none';
    adicionarSubAnotacao(topicoId, index);
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

function reordenarAnotacao() {
    if (!_menuAnotacaoCtx) return;
    const { topicoId, index } = _menuAnotacaoCtx;
    const topico = topicos.find(t => t.id === topicoId);
    const posAtual = index + 1; const total = topico.anotacoes.length;
    if (total <= 1) return exibirToast('Apenas uma anotação existente.', 'aviso');
    const entrada = prompt(`Posição atual: ${posAtual} de ${total}\n\nMover para qual posição? (1 – ${total})`);
    if (!entrada) return;
    const novaPos = parseInt(entrada, 10);
    if (isNaN(novaPos) || novaPos < 1 || novaPos > total) return exibirToast('Posição inválida.', 'erro');
    const [item] = topico.anotacoes.splice(index, 1);
    topico.anotacoes.splice(novaPos - 1, 0, item);
    renderizarTopicos(); salvarBackupAutomatico();
    _menuAnotacaoCtx = null;
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
    const subAnotacoes = topicos.find(t => t.id === _menuSubAnotacaoCtx.topicoId).anotacoes[_menuSubAnotacaoCtx.parentIndex].subAnotacoes;
    const entrada = prompt(`Mover para qual posição? (1 – ${subAnotacoes.length})`);
    if (entrada) {
        const novaPos = parseInt(entrada, 10);
        const [item] = subAnotacoes.splice(_menuSubAnotacaoCtx.subIndex, 1);
        subAnotacoes.splice(novaPos - 1, 0, item);
        renderizarTopicos(); salvarBackupAutomatico();
    }
    document.getElementById('sub-annotation-context-menu').style.display = 'none';
}

function excluirItemCorrelacionado(topicoId, parentIndex, correlacionadoIndex) {
    if (!confirm('Excluir este item correlacionado?')) return;
    topicos.find(t => t.id === topicoId).anotacoes[parentIndex].itensCorrelacionados.splice(correlacionadoIndex, 1);
    renderizarTopicos(); salvarBackupAutomatico();
    exibirToast('Item correlacionado excluído.', 'sucesso');
}

function adicionarSubAnotacao(topicoId, anotacaoIndex) {
    const existing = document.getElementById('sub-input-active');
    if (existing) {
        const mesmoCont = existing.dataset.forTopico === topicoId && existing.dataset.forIndex === String(anotacaoIndex);
        existing.remove();
        if (mesmoCont) return;
    }
    const painel = document.createElement('div');
    painel.id = 'sub-input-active'; painel.className = 'sub-input-panel';
    painel.dataset.forTopico = topicoId; painel.dataset.forIndex = anotacaoIndex;
    painel.innerHTML = `
        <textarea id="sub-input-text" class="sub-input-textarea" placeholder="Digite a ideia secundária..." rows="3"></textarea>
        <div class="sub-input-actions">
            <button class="sub-input-btn-confirm" onclick="confirmarSubAnotacao('${topicoId}', ${anotacaoIndex})">✔ Confirmar</button>
            <button class="sub-input-btn-cancel" onclick="document.getElementById('sub-input-active').remove()">✕ Cancelar</button>
        </div>`;
    const wrapper = document.querySelector(`#timeline-wrapper-${anotacaoIndex} .main-card-wrapper`);
    if (wrapper) { wrapper.appendChild(painel); document.getElementById('sub-input-text').focus(); }
}

function confirmarSubAnotacao(topicoId, anotacaoIndex) {
    const textarea = document.getElementById('sub-input-text');
    const texto = textarea ? textarea.value.trim() : '';
    if (!texto) return exibirToast('Digite uma observação.', 'aviso');
    const anotacao = topicos.find(t => t.id === topicoId).anotacoes[anotacaoIndex];
    if (!anotacao.subAnotacoes) anotacao.subAnotacoes = [];
    anotacao.subAnotacoes.push({ texto, timestamp: Date.now() });
    document.getElementById('sub-input-active').remove();
    renderizarTopicos(); salvarBackupAutomatico();
    exibirToast('Observação secundária vinculada.', 'sucesso');
}
