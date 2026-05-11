/* ================================================
   topics-manager.js  —  v2.0
   Gerenciador do Fichário de Tópicos e Anotações
   ================================================ */
window.TopicsManager = (function () {
    'use strict';

    /**
     * Sanitizador de HTML — previne XSS ao interpolar dados do usuário
     * em template literals. Escapa os 5 metacaracteres fundamentais do HTML.
     * @param {string} str - String bruta (input do usuário ou dado de backup).
     * @returns {string} String segura para inserção em innerHTML.
     */
    function escaparHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Paleta de 25 cores suaves para as abas de tópicos
    const CORES_TOPICOS = [
        '#E3F2FD', '#F3E5F5', '#FBE9E7', '#E8F5E9', '#FFF3E0',
        '#E0F7FA', '#FCE4EC', '#F1F8E9', '#EFEBE9', '#FFF8E1',
        '#EDF2F4', '#FADADD', '#D5E8D4', '#FFE6CC', '#E1D5E7',
        '#DAE8FC', '#FFF2CC', '#F8CECC', '#E6D0DE', '#D0CEE2',
        '#CDEBFA', '#D9E0F2', '#EAE5D9', '#F5D0A9', '#D1E8E2'
    ];

    let activeTabId = null;

    /**
     * Retorna uma cor da paleta com suporte a módulo (infinitos tópicos).
     */
    function obterCor(index) {
        return CORES_TOPICOS[index % CORES_TOPICOS.length];
    }

    /**
     * Converte a string do polo em uma classe CSS válida.
     */
    function poloParaClasse(polo) {
        return 'tag-' + polo
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') 
            .replace(/[^a-z0-9]+/g, '-')     
            .replace(/^-|-$/g, '');          
    }

    /**
     * Gera o SVG de conexão sinuosa entre dois cards consecutivos.
     * @param {boolean} isLeft - true se o card de origem está à esquerda.
     * @returns {string} HTML do bloco conector.
     */
    function gerarSVGConector(isLeft) {
        // Curva de Bézier cúbica.
        // Âncoras calculadas para cards de 70% de largura:
        //   Card esquerdo: ocupa 0–70% → centro em x=35
        //   Card direito:  ocupa 30–100% → centro em x=65
        const pathD = isLeft
            ? 'M 35,0 C 35,50 65,50 65,100'  // Esquerda → Direita
            : 'M 65,0 C 65,50 35,50 35,100'; // Direita → Esquerda

        return `
            <div class="connector-wrapper" aria-hidden="true">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path
                        d="${pathD}"
                        stroke="#d32f2f"
                        stroke-width="2.5"
                        fill="none"
                        stroke-linecap="round"
                    />
                </svg>
            </div>`;
    }

    /**
     * Fábrica de cards no formato de fluxograma alternado.
     * Assinatura compatível com Array.prototype.map — não requer alteração
     * na chamada .map(criarCard) existente em renderizarFichario().
     *
     * @param {Object} anotacao - Objeto da anotação.
     * @param {number} index    - Índice corrente (fornecido pelo .map).
     * @param {Array}  arr      - Array completo (fornecido pelo .map).
     */
    function criarCard(anotacao, index, arr) {
        const total    = arr.length;
        const numero   = index + 1;
        const tagClass = poloParaClasse(anotacao.polo);
        
        // Substituição do horário pela meta-informação inteligente do PJe
        const idFormatado = anotacao.pjeId ? `Id. ${anotacao.pjeId} - ` : '';
        const metaTexto   = `(${idFormatado}fl. ${anotacao.pagina})`;

        const htmlConteudo = anotacao.tipo === 'texto'
            ? `<p class="card-texto">"${escaparHTML(anotacao.conteudo)}"</p>`
            : `<img class="card-imagem" src="${anotacao.conteudo}" alt="Recorte — Pág. ${anotacao.pagina}">`;

        // Renderiza o bloco de comentário apenas para imagens que possuam texto.
        // Backups antigos sem a chave 'comentario' retornam undefined → escaparHTML('')
        // retorna '' → a condição falha → nenhum elemento espúrio é renderizado.
        const comentarioSeguro = escaparHTML(anotacao.comentario);
        const htmlComentario = (anotacao.tipo === 'imagem' && comentarioSeguro)
            ? `<div class="card-comentario"><strong>Descrição:</strong> ${comentarioSeguro}</div>`
            : '';

        // Pares (0, 2, 4…) ficam à esquerda; ímpares (1, 3, 5…) à direita.
        const isLeft      = index % 2 === 0;
        const alignClass  = isLeft ? 'align-left' : 'align-right';
        const isLast      = index === total - 1;

        const card = `
            <div class="timeline-item ${alignClass}">
                <div class="timeline-number"
                     title="Opções desta anotação"
                     onclick="abrirMenuAnotacao('${activeTabId}', ${index}, event)">
                    ${numero}
                </div>
                <div class="annotation-card">
                    <div class="card-header">
                        <span class="polo-tag ${tagClass}">${anotacao.polo}</span>
                        <span class="card-meta" style="cursor: copy;" title="Clique para copiar" onclick="navigator.clipboard.writeText('${metaTexto}')">${metaTexto}</span>
                    </div>
                    ${htmlConteudo}
                    ${htmlComentario}
                </div>
            </div>`;

        // O conector só é gerado entre cards consecutivos; o último não tem.
        const conector = isLast ? '' : gerarSVGConector(isLeft);

        return card + conector;
    }

    /**
     * Re-renderiza o fichário inteiro.
     */
    function renderizarFichario(topicosArray) {
        const headerEl  = document.getElementById('topics-tabs-header');
        const contentEl = document.getElementById('topics-tab-content');

        if (!headerEl || !contentEl) return;

        // Estado vazio: nenhum tópico criado ainda
        if (topicosArray.length === 0) {
            headerEl.innerHTML = '';
            contentEl.innerHTML = `
                <p class="empty-state">
                    Nenhum tópico criado.<br>
                    Use o botão <strong>+</strong> na barra lateral para criar um Tópico Recursal.
                </p>`;
            contentEl.style.borderTop       = 'none';
            contentEl.style.backgroundColor = 'transparent';
            return;
        }

        // Resiliência: garante que sempre há uma aba ativa válida
        if (!activeTabId || !topicosArray.some(t => t.id === activeTabId)) {
            activeTabId = topicosArray[0].id;
        }

        // 1. Construir as abas do fichário
        headerEl.innerHTML = '';
        topicosArray.forEach(topico => {
            const isActive = topico.id === activeTabId;
            const btn      = document.createElement('div');

            btn.className        = `topic-tab-btn ${isActive ? 'active' : ''}`;
            btn.textContent      = topico.nome;
            btn.title            = topico.nome; 
            btn.style.backgroundColor = topico.cor;

            if (isActive) {
                contentEl.style.borderTop       = `3px solid ${topico.cor}`;
                contentEl.style.backgroundColor = '#ffffff';
            }

            btn.onclick = () => {
                activeTabId = topico.id;
                renderizarFichario(topicosArray);
            };

            headerEl.appendChild(btn);
        });

        // 2. Construir o conteúdo do tópico ativo
        const topicoAtivo = topicosArray.find(t => t.id === activeTabId);
        if (!topicoAtivo) return;

        if (topicoAtivo.anotacoes.length === 0) {
            contentEl.innerHTML = `
                <p class="empty-state" style="margin-top: 20px;">
                    Tópico vazio. Adicione extrações do documento.
                </p>`;
        } else {
            const cardsHTML = topicoAtivo.anotacoes.map(criarCard).join('');
            contentEl.innerHTML = `<div class="timeline-container">${cardsHTML}</div>`;
        }
    }

    // API pública do módulo
    return {
        obterCor,
        renderizarFichario
    };

})();
