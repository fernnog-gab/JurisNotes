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

    function renderizarMarkdownSeguro(strEscapada) {
        if (!strEscapada) return '';
        return strEscapada.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    }

    function escurecerCor(hex, fator = 0.65) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, Math.floor(((num >> 16) & 0xFF) * fator));
        const g = Math.min(255, Math.floor(((num >> 8) & 0xFF) * fator));
        const b = Math.min(255, Math.floor((num & 0xFF) * fator));
        return `rgb(${r},${g},${b})`;
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

    // Função estática gerarSVGConector removida (substituída pelo motor dinâmico desenharConexoes)

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
        const metaTexto = anotacao.pagina 
            ? `(${idFormatado}fl. ${anotacao.pagina})` 
            : (anotacao.tipo === 'audio' ? `(Oitiva)` : '');

        let htmlConteudo = '';
        let htmlComentario = '';

        if (anotacao.tipo === 'texto') {
            htmlConteudo = `<p class="card-texto">"${renderizarMarkdownSeguro(escaparHTML(anotacao.conteudo))}"</p>`;
        } else if (anotacao.tipo === 'imagem') {
            htmlConteudo = `<img class="card-imagem" src="${anotacao.conteudo}" alt="Recorte">`;
        } else if (anotacao.tipo === 'audio') {
            try {
                const dadosAudio = JSON.parse(anotacao.conteudo);
                htmlConteudo = `
                    <div class="card-audio">
                        <div class="audio-icon-box">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                            </svg>
                        </div>
                        <div class="audio-card-meta">
                            <strong>Orador:</strong> ${escaparHTML(dadosAudio.oradorStr)}<br>
                            <span>Trecho: ${dadosAudio.labelInicio} a ${dadosAudio.labelFim}</span>
                        </div>
                    </div>`;
            } catch (e) {
                htmlConteudo = `<p class="card-texto" style="color:#c62828;">[Erro: metadados do áudio corrompidos]</p>`;
            }
        }

        const comentarioSeguro = escaparHTML(anotacao.comentario);
        if (comentarioSeguro && (anotacao.tipo === 'imagem' || anotacao.tipo === 'audio')) {
            htmlComentario = `<div class="card-comentario"><strong>${anotacao.tipo === 'audio' ? 'Transcrição' : 'Descrição'}:</strong> ${comentarioSeguro}</div>`;
        }

        const isLeft     = index % 2 === 0;
        const alignClass = isLeft ? 'align-left' : 'align-right';
        const isLast     = index === total - 1;
        
        const docSeguro = anotacao.documento ? escaparHTML(anotacao.documento) : escaparHTML(anotacao.polo);
        const poloSeguro = (anotacao.documento && anotacao.polo) ? escaparHTML(anotacao.polo) : '';
        
        let tagsHtml = `<span class="polo-tag doc-tag">${docSeguro}</span>`;
        if (poloSeguro && poloSeguro !== docSeguro) {
            tagsHtml += ` <span class="polo-tag ${poloParaClasse(anotacao.polo)}">${poloSeguro}</span>`;
        }

        // Card Principal (Removido o código morto redundante do wrapper interno)

        // Nós de Ideia (Sub-anotações)
        let htmlSubAnotacoes = '';
        if (anotacao.subAnotacoes && anotacao.subAnotacoes.length > 0) {
            const subCardsHTML = anotacao.subAnotacoes.map((sub, sIdx) => {
                const label = `${numero}.${gerarLetra(sIdx)}`;
                return `
                    <div class="sub-annotation-item">
                        <div class="sub-annotation-card">
                            <div class="sub-badge"
                                 title="Opções desta ideia secundária"
                                 onclick="abrirMenuSubAnotacao('${activeTabId}', ${index}, ${sIdx}, event)">
                                ${label}
                            </div>
                            ${renderizarMarkdownSeguro(escaparHTML(sub.texto))}
                        </div>
                    </div>`;
            }).join('');

            htmlSubAnotacoes = `<div class="sub-annotations-wrapper">${subCardsHTML}</div>`;
        }

        // NOVO: Processar itens agrupados
        let htmlCorrelacionados = '';
        if (anotacao.itensCorrelacionados && anotacao.itensCorrelacionados.length > 0) {
            htmlCorrelacionados = anotacao.itensCorrelacionados.map((item, cIdx) => {
                const itemTag = poloParaClasse(item.polo);
                const idFormt = item.pjeId ? `Id. ${item.pjeId} - ` : '';
                const itemMeta = `(${idFormt}fl. ${item.pagina})`;
                
                const cConteudo = item.tipo === 'texto'
                    ? `<p class="card-texto">"${renderizarMarkdownSeguro(escaparHTML(item.conteudo))}"</p>`
                    : `<img class="card-imagem" src="${item.conteudo}" alt="Recorte de Agrupamento">`;
                    
                const cComent = (item.tipo === 'imagem' && item.comentario)
                    ? `<div class="card-comentario"><strong>Descrição:</strong> ${escaparHTML(item.comentario)}</div>`
                    : '';
                    
                return `
                <div class="correlated-item-wrapper">
                    <div class="two-way-arrow-container">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l-4-4m4 4l4-4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <div class="annotation-card correlated-card">
                        <button class="btn-excluir-correlacionado" title="Remover item agrupado" onclick="excluirItemCorrelacionado('${activeTabId}', ${index}, ${cIdx})">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                        <div class="card-header">
                            <div style="display:flex; gap:6px;">
                                <span class="polo-tag doc-tag">${item.documento ? escaparHTML(item.documento) : escaparHTML(item.polo)}</span>
                                ${(item.documento && item.polo && item.polo !== item.documento) ? `<span class="polo-tag ${itemTag}">${escaparHTML(item.polo)}</span>` : ''}
                            </div>
                            <span class="card-meta" style="cursor:pointer;" title="Clique p/ copiar | Shift+Clique p/ editar folha" onclick="handleMetaClick(event, '${activeTabId}', ${index}, true, ${cIdx})">${itemMeta}</span>
                        </div>
                        ${cConteudo}
                        ${cComent}
                    </div>
                </div>`;
            }).join('');
        }

        // Wrapper Master Flex atualizado para envelopar a hierarquia inteira
        const wrapperMaster = `
            <div class="timeline-item-master ${alignClass}" id="timeline-wrapper-${index}">
                <div class="main-card-wrapper">
                    <div class="annotation-number-area">
                        <div class="timeline-number" title="Opções desta anotação" onclick="abrirMenuAnotacao('${activeTabId}', ${index}, event)">
                            ${numero}
                        </div>
                    </div>
                    <div class="annotation-card">
                        <div class="card-header">
                            <div style="display:flex; gap:6px;">${tagsHtml}</div>
                            <span class="card-meta" style="cursor:pointer;" title="Clique p/ copiar | Shift+Clique p/ editar folha" onclick="handleMetaClick(event, '${activeTabId}', ${index}, false)">${metaTexto}</span>
                        </div>
                        ${htmlConteudo}
                        ${htmlComentario}
                    </div>
                    ${htmlCorrelacionados}
                </div>
                ${htmlSubAnotacoes}
            </div>`;

        return wrapperMaster; // Sem o conector anexado aqui
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
                btn.style.border = `3px solid ${escurecerCor(topico.cor)}`;
                btn.style.borderBottom = 'none';
                btn.style.color = escurecerCor(topico.cor, 0.4);
                contentEl.style.borderTop = `3px solid ${escurecerCor(topico.cor)}`;
                contentEl.style.backgroundColor = '#ffffff';
            } else {
                btn.style.border = '1px solid #dde3ea';
                btn.style.borderBottom = 'none';
                btn.style.color = '#555';
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
            // Injetamos o SVG absoluto no fundo do container
            contentEl.innerHTML = `
                <div class="timeline-container" id="timeline-container">
                    <svg id="connections-canvas"></svg>
                    ${cardsHTML}
                </div>`;
                
            // Dispara o cálculo de linhas após o DOM renderizar
            requestAnimationFrame(() => desenharConexoes());
        }
    }

    /**
     * Motor Dinâmico de Conexões Sinuosas
     * Lê as coordenadas absolutas dos cards e desenha curvas de Bézier SVG entre eles.
     */
    function desenharConexoes() {
        const container = document.getElementById('timeline-container');
        const svg = document.getElementById('connections-canvas');
        if (!container || !svg) return;

        const containerRect = container.getBoundingClientRect();
        // Captura todos os wrappers principais renderizados
        const wrappers = Array.from(container.querySelectorAll('.main-card-wrapper'));
        let svgContent = '';

        for (let i = 0; i < wrappers.length - 1; i++) {
            // Selecionamos o primeiro .annotation-card de cada wrapper (ignora cards correlacionados)
            const cardAtual = wrappers[i].querySelector('.annotation-card');
            const cardProx = wrappers[i+1].querySelector('.annotation-card');

            if (!cardAtual || !cardProx) continue;

            const rectAtual = cardAtual.getBoundingClientRect();
            const rectProx = cardProx.getBoundingClientRect();

            // Ponto de Origem: Centro da borda INFERIOR do Card atual
            const startX = (rectAtual.left + rectAtual.width / 2) - containerRect.left;
            const startY = rectAtual.bottom - containerRect.top;

            // Ponto de Destino: Centro da borda SUPERIOR do PRÓXIMO Card
            const endX = (rectProx.left + rectProx.width / 2) - containerRect.left;
            const endY = rectProx.top - containerRect.top;

            // Ponto de Controle de Curvatura (suaviza o "S" sinuoso no eixo Y)
            const ctrlY = (startY + endY) / 2;

            // Gera a Curva de Bézier Cúbica e anexa ao conteúdo do SVG
            svgContent += `<path d="M ${startX},${startY} C ${startX},${ctrlY} ${endX},${ctrlY} ${endX},${endY}" stroke="#d32f2f" stroke-width="2.5" fill="none" stroke-linecap="round" />`;
        }

        // --- MOTOR DE CURVAS TRACEJADAS PARA NÓS DE IDEIA ---
        const masterItems = container.querySelectorAll('.timeline-item-master');
        masterItems.forEach(master => {
            const mainCardWrapper = master.querySelector('.main-card-wrapper');
            const subCards        = master.querySelectorAll('.sub-annotation-card');

            if (!mainCardWrapper || subCards.length === 0) return;

            const mainRect        = mainCardWrapper.getBoundingClientRect();
            const isRightAligned  = master.classList.contains('align-right');

            // Ancora vertical: calcula dinamicamente o centro vertical real do card principal
            const startY = (mainRect.top + mainRect.height / 2) - containerRect.top;

            subCards.forEach(sub => {
                const subRect = sub.getBoundingClientRect();

                // startX: borda do card principal que ENFRENTA os sub-cards
                const startX = isRightAligned
                    ? mainRect.left  - containerRect.left  // master à direita → sai pela borda esquerda
                    : mainRect.right - containerRect.left; // master à esquerda → sai pela borda direita

                // endX: borda do sub-card que ENFRENTA o card principal
                const endX = isRightAligned
                    ? subRect.right - containerRect.left   // sub-card à esquerda → entra pela borda direita
                    : subRect.left  - containerRect.left;  // sub-card à direita  → entra pela borda esquerda

                // Âncora vertical do sub-card (centro)
                const endY   = (subRect.top + subRect.height / 2) - containerRect.top;
                
                // Ponto de controle da curva de Bézier (centro do gap)
                const ctrlX  = (startX + endX) / 2;

                svgContent += `<path d="M ${startX},${startY} C ${ctrlX},${startY} ${ctrlX},${endY} ${endX},${endY}" stroke="#777" stroke-width="1.5" stroke-dasharray="5 4" fill="none" stroke-linecap="round"/>`;
            });
        });

        svg.innerHTML = svgContent;
    }

    // Listener de Responsividade: Recalcula as linhas se o usuário redimensionar a janela/painel
    const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => desenharConexoes());
    });
    
    // Aguarda o DOM carregar para plugar o observador
    document.addEventListener("DOMContentLoaded", () => {
        const historyContainer = document.getElementById('history-container');
        if(historyContainer) resizeObserver.observe(historyContainer);
    });

    // API pública do módulo
    return {
        obterCor,
        renderizarFichario,
        getActiveTabId: () => activeTabId,
        escaparHTML
    };

})();
