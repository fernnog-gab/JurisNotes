/* ================================================
   pdf-highlighter.js
   Módulo de injeção visual de Highlights e Marcadores
   ================================================ */
window.PdfHighlighter = (function () {
    'use strict';

    /**
     * Calcula as coordenadas relativas de uma seleção de texto
     */
    function capturarCoordenadasSelecao(pageContainer) {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return null;

        const range = selection.getRangeAt(0);
        const rects = Array.from(range.getClientRects());
        const containerRect = pageContainer.getBoundingClientRect();

        return rects.map(rect => ({
            top: rect.top - containerRect.top,
            left: rect.left - containerRect.left,
            width: rect.width,
            height: rect.height
        }))
        // FILTRO CRÍTICO: Ignora rects colapsados (Bug do PDF.js com fontes embarcadas)
        .filter(r => r.width > 2 && r.height > 2);
    }

    /**
     * Desenha as marcações em uma página física específica.
     */
    function aplicarMarcacoesNaPagina(pageNum, pageContainer, topicosGlobais) {
        if (!pageContainer || !topicosGlobais) return;

        pageContainer.querySelectorAll('.pdf-highlight, .pdf-marker').forEach(el => el.remove());

        // Arrays de Rastreio Espacial Absoluto
        const posOcupadasEsq = [];
        const posOcupadasDir = [];

        topicosGlobais.forEach(topico => {
            topico.anotacoes.forEach(anotacao => {
                _desenharAnotacao(anotacao, topico, pageNum, pageContainer, posOcupadasEsq, posOcupadasDir);
                if (anotacao.itensCorrelacionados) {
                    anotacao.itensCorrelacionados.forEach(corr => {
                        _desenharAnotacao(corr, topico, pageNum, pageContainer, posOcupadasEsq, posOcupadasDir);
                    });
                }
            });
        });
    }

    function _desenharAnotacao(item, topico, pageNumAtual, container, posOcupadasEsq, posOcupadasDir) {
        if (!item.coordenadas || item.paginaFisica !== pageNumAtual) return;

        // Reaproveita heurística já existente no app.js
        const fase = (typeof identificarFaseMetodologica === 'function') 
            ? identificarFaseMetodologica(item.documento) 
            : 4;

        const rects = item.coordenadas.rects;
        if (!rects || rects.length === 0) return;

        // 1. Renderiza o Sublinhado
        if (item.tipo === 'texto') {
            rects.forEach(rect => {
                const highlight = document.createElement('div');
                highlight.className = `pdf-highlight highlight-fase-${fase}`;
                highlight.style.top = `${rect.top}px`;
                highlight.style.left = `${rect.left}px`;
                highlight.style.width = `${rect.width}px`;
                highlight.style.height = `${rect.height}px`;
                container.appendChild(highlight);
            });
        }

        // 2. Formata o Tooltip Inteligente
        const primeiroRect = rects[0];
        let docLabel = item.documento || '';
        
        // Aplica o mapeamento solicitado pelo usuário (Fase 4 = Prova Documental)
        if (!docLabel && fase === 4) docLabel = 'Prova Documental';
        else if (!docLabel) docLabel = 'Documento Extraído';

        const poloLabel = item.polo ? ` (${item.polo})` : '';
        const descricao = item.comentario ? `\n\n📌 Obs: ${item.comentario}` : '';
        const textoTooltip = `📚 Aba: ${topico.nome}\n📁 Doc: ${docLabel}${poloLabel}${descricao}`;

        const marker = document.createElement('div');
        marker.className = 'pdf-marker';
        marker.style.backgroundColor = topico.cor;
        marker.setAttribute('data-tooltip', textoTooltip);

        // 3. Motor Anti-Colisão (Cálculo Absoluto)
        const ESPACAMENTO = 18; 
        const RAIO_COLISAO = 14; 
        const Y_BASE = primeiroRect.top;

        if (item.tipo === 'texto') {
            // Posiciona à esquerda
            let absX = primeiroRect.left - 12; // Inicia fora do texto
            
            while (posOcupadasEsq.some(p => Math.abs(p.y - Y_BASE) < RAIO_COLISAO && Math.abs(p.x - absX) < RAIO_COLISAO)) {
                absX -= ESPACAMENTO; // Empurra mais para a esquerda
            }
            posOcupadasEsq.push({ y: Y_BASE, x: absX });
            marker.style.left = `${absX}px`;
        } else {
            // Posiciona à direita
            let absX = primeiroRect.left + primeiroRect.width + 12; 
            
            while (posOcupadasDir.some(p => Math.abs(p.y - Y_BASE) < RAIO_COLISAO && Math.abs(p.x - absX) < RAIO_COLISAO)) {
                absX += ESPACAMENTO; // Empurra mais para a direita
            }
            posOcupadasDir.push({ y: Y_BASE, x: absX });
            marker.style.left = `${absX}px`;
        }

        marker.style.top = `${Y_BASE}px`;
        container.appendChild(marker);
    }

    // Expõe a função de sincronização para uso global seguro
    function atualizarMarcacoesVisiveisGlobais() {
        if (typeof topicos === 'undefined') return;
        document.querySelectorAll('.pdf-page-container[data-loaded="true"]').forEach(container => {
            const pageNum = parseInt(container.dataset.pageNumber, 10);
            aplicarMarcacoesNaPagina(pageNum, container, topicos);
        });
    }

    return {
        capturarCoordenadasSelecao,
        aplicarMarcacoesNaPagina,
        atualizarMarcacoesVisiveisGlobais
    };
})();
