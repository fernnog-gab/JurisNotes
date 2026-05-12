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

    /**
     * Converte um índice numérico (base-0) em identificador alfabético.
     * Suporta overflow: 0→A, 25→Z, 26→AA, 27→AB, etc.
     * @param {number} idx - Índice da sub-anotação.
     * @returns {string} Identificador de 1 ou 2 letras.
     */
    function gerarLetra(idx) {
        const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (idx < 26) return ABC[idx];
        return ABC[Math.floor(idx / 26) - 1] + ABC[idx % 26];
    }

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
        // Curva de Bézier cúbica remapeada para proporção 60% (card) / 40% (nós).
        // Card à esquerda: centro em x=30. Card à direita: centro em x=70.
        const pathD = isLeft
            ? 'M 30,0 C 30,50 70,50 70,100'  
            : 'M 70,0 C 70,50 30,50 30,100'; 

        return `
            <div class="connector-wrapper" aria-hidden="true">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path d="${pathD}" stroke="#d32f2f" stroke-width="2.5" fill="none" stroke-linecap="round" />
                </svg>
            </div>`;
    }
    /**
     * Fábrica de cards no formato de fluxograma alternado.
     * Retorna: card + bloco de sub-anotações (se houver) + conector SVG.
     * Os três fragmentos são irmãos diretos no .timeline-container,
     * garantindo que align-self funcione corretamente nas sub-anotações.
     */
    function criarCard(anotacao, index, arr) {
        const total    = arr.length;
        const numero   = index + 1;
        const tagClass = poloParaClasse(anotacao.polo);
        const idFormatado = anotacao.pjeId ? `Id. ${anotacao.pjeId} - ` : '';
        const metaTexto   = `(${idFormatado}fl. ${anotacao.pagina})`;

        const htmlConteudo = anotacao.tipo === 'texto'
            ? `<p class="card-texto">"${escaparHTML(anotacao.conteudo)}"</p>`
            : `<img class="card-imagem" src="${anotacao.conteudo}" alt="Recorte — Pág. ${anotacao.pagina}">`;

        const comentarioSeguro = escaparHTML(anotacao.comentario);
        const htmlComentario   = (anotacao.tipo === 'imagem' && comentarioSeguro)
            ? `<div class="card-comentario"><strong>Descrição:</strong> ${comentarioSeguro}</div>`
            : '';

        const isLeft     = index % 2 === 0;
        const alignClass = isLeft ? 'align-left' : 'align-right';
        const isLast     = index === total - 1;

        // Card Principal (O wrapper interno)
        const cardPrincipal = `
            <div class="main-card-wrapper">
                <div class="annotation-number-area">
                    <div class="timeline-number" title="Opções desta anotação" onclick="abrirMenuAnotacao('${activeTabId}', ${index}, event)">
                        ${numero}
                    </div>
                </div>
                <div class="annotation-card">
                    <div class="card-header">
                        <span class="polo-tag ${tagClass}">${anotacao.polo}</span>
                        <span class="card-meta" style="cursor:copy;" title="Clique para copiar" onclick="navigator.clipboard.writeText('${metaTexto}')">${metaTexto}</span>
                    </div>
                    ${htmlConteudo}
                    ${htmlComentario}
                </div>
            </div>`;

        // Nós de Ideia (Sub-anotações)
        let htmlSubAnotacoes = '';
        if (anotacao.subAnotacoes && anotacao.subAnotacoes.length > 0) {
            const subCardsHTML = anotacao.subAnotacoes.map((sub, sIdx) => {
                const label = `${numero}.${gerarLetra(sIdx)}`;
                return `
                    <div class="sub-annotation-item">
                        <div class="sub-connector-line"></div>
                        <div class="sub-annotation-card">
                            <div class="sub-badge">${label}</div>
                            ${escaparHTML(sub.texto)}
                        </div>
                    </div>`;
            }).join('');

            htmlSubAnotacoes = `<div class="sub-annotations-wrapper">${subCardsHTML}</div>`;
        }

        // Wrapper Master Flex (O pai da linha toda) - Sem inline styles
        const wrapperMaster = `
            <div class="timeline-item-master ${alignClass}" id="timeline-wrapper-${index}">
                ${cardPrincipal}
                ${htmlSubAnotacoes}
            </div>`;

        const conector = isLast ? '' : gerarSVGConector(isLeft);

        return wrapperMaster + conector;
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
