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

    // Paleta Neon / Vibrante para as abas de tópicos e linhas de conexão
    const CORES_TOPICOS = [
        '#00FFFF', // Ciano Neon
        '#FF00FF', // Magenta Neon
        '#39FF14', // Verde Neon
        '#FF3131', // Vermelho Neon
        '#FFFF00', // Amarelo Elétrico
        '#BC13FE', // Roxo Neon
        '#FF1493', // Rosa Choque (Deep Pink)
        '#00FF66', // Verde Primavera (Spring Green)
        '#FF6600', // Laranja Neon
        '#CCFF00', // Limão Elétrico (Electric Lime)
        '#08E8DE', // Teal Brilhante
        '#FF007F', // Rosa Brilhante (Rose Bright)
        '#8A2BE2', // Violeta Azulado
        '#00BFFF', // Azul Céu Profundo
        '#FFD700'  // Ouro Brilhante
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
            htmlConteudo = `
            <div class="image-resize-wrapper" title="Arraste o canto inferior direito para redimensionar">
                <img class="card-imagem" src="${anotacao.conteudo}" alt="Recorte">
            </div>`;
        } else if (anotacao.tipo === 'audio') {
            try {
                const dadosAudio = JSON.parse(anotacao.conteudo);
                
                // Lógica retrocompatível e estilizada
                const nomePapel = dadosAudio.role || dadosAudio.oradorStr;
                const classePolo = dadosAudio.poloTag ? poloParaClasse(dadosAudio.poloTag) : 'doc-tag';
                let tagVisual = `<span class="polo-tag ${classePolo}">${escaparHTML(nomePapel)}</span>`;
                
                // Agrupamento de tag (Ex: [Testemunha] [Parte Autora])
                if ((dadosAudio.role === 'Testemunha' || dadosAudio.role === 'Advogado') && dadosAudio.poloTag) {
                    tagVisual = `<span class="polo-tag doc-tag">${escaparHTML(dadosAudio.role)}</span> <span class="polo-tag ${classePolo}">${escaparHTML(dadosAudio.poloTag)}</span>`;
                }

                htmlConteudo = `
                    <div class="card-audio">
                        <div class="audio-icon-box">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                            </svg>
                        </div>
                        <div class="audio-card-meta">
                            <strong>Trecho da oitiva:</strong> ${tagVisual}<br>
                            <span style="display:inline-block; margin-top: 4px;">⏱️ ${dadosAudio.labelInicio} a ${dadosAudio.labelFim}</span>
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
        
        const faseDoCard = typeof identificarFaseMetodologica === 'function' ? identificarFaseMetodologica(anotacao.documento) : 4;
        const bgZoneClass = `fase-${faseDoCard}`;
        
        const docSeguro = anotacao.documento ? escaparHTML(anotacao.documento) : escaparHTML(anotacao.polo);
        const poloSeguro = (anotacao.documento && anotacao.polo) ? escaparHTML(anotacao.polo) : '';
        
        let tagsHtml = `<span class="polo-tag doc-tag">${docSeguro}</span>`;
        if (poloSeguro && poloSeguro !== docSeguro) {
            tagsHtml += ` <span class="polo-tag ${poloParaClasse(anotacao.polo)}">${poloSeguro}</span>`;
        }

        function gerarBarraAcoes(isCorrelacionado, cIdx) {
            // Injeção segura do cIdx no contexto do botão (resolve o bug da falta de índice)
            const ctxCidx = isCorrelacionado && cIdx != null ? `, cIdx: ${cIdx}` : '';
            
            // Verifica o tipo do item na hierarquia correta (principal vs correlacionado)
            const tipoDoItem = isCorrelacionado && cIdx != null ? anotacao.itensCorrelacionados[cIdx].tipo : anotacao.tipo;
            
            // Direciona para a função de edição adequada
            const acaoEditar = isCorrelacionado ? 'editarItemCorrelacionado()' : 'editarAnotacao()';
            
            const btnEditar = tipoDoItem === 'texto' ? `<button title="Editar Texto" onclick="_menuAnotacaoCtx={topicoId:'${activeTabId}', index:${index}${ctxCidx}}; ${acaoEditar}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>` : '';
            
            const paramMove = isCorrelacionado ? `'${activeTabId}', ${index}, ${cIdx}` : `'${activeTabId}', ${index}, null`;
            
            return `
            <div class="card-actions-bar">
                ${btnEditar}
                <button title="Adicionar Nó de Ideia" onclick="_menuAnotacaoCtx={topicoId:'${activeTabId}', index:${index}${ctxCidx}}; acionarNovoNoIdeia()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
                <button title="Mover / Reordenar" onclick="abrirModalSmartMove(${paramMove})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><polyline points="8 7 12 3 16 7"></polyline><line x1="12" y1="12" x2="12" y2="3"></line></svg></button>
                <button class="delete-btn" title="Excluir" onclick="${isCorrelacionado ? `excluirItemCorrelacionado('${activeTabId}', ${index}, ${cIdx})` : `_menuAnotacaoCtx={topicoId:'${activeTabId}', index:${index}}; excluirAnotacao()`}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>`;
        }

        // Card Principal (Removido o código morto redundante do wrapper interno)

        // Nós de Ideia (Sub-anotações)
        let htmlSubAnotacoes = '';
        if (anotacao.subAnotacoes && anotacao.subAnotacoes.length > 0) {
            const subCardsHTML = anotacao.subAnotacoes.map((sub, sIdx) => {
                const intencao = sub.intencao || 'premissa';
                const isHasIntent = true; // Garante o design em pílula para TODAS as intenções
                let iconSVG = '';

                if (intencao === 'comando') {
                    iconSVG = `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle></svg>`;
                } else if (intencao === 'texto') {
                    iconSVG = `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
                } else if (intencao === 'nota') {
                    iconSVG = `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
                } else if (intencao === 'premissa') {
                    iconSVG = `<svg class="intencao-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>`;
                }

                const badgeClass = isHasIntent ? `sub-badge has-intent intencao-${intencao}` : 'sub-badge';
                const label = isHasIntent ? `${iconSVG} ${numero}.${gerarLetra(sIdx)}` : `${numero}.${gerarLetra(sIdx)}`;
                
                const textoFormatado = renderizarMarkdownSeguro(escaparHTML(sub.texto));
                const sourceRef = sub.sourceRef ?? 'main'; // Recupera a origem do JSON
                
                // Cálculo seguro da fase com fallback para 'main'
                let faseSub = faseDoCard;
                if (sourceRef !== 'main' && anotacao.itensCorrelacionados) {
                    const idx = parseInt(sourceRef, 10);
                    if (!isNaN(idx) && anotacao.itensCorrelacionados[idx]) {
                         faseSub = typeof identificarFaseMetodologica === 'function' ? identificarFaseMetodologica(anotacao.itensCorrelacionados[idx].documento) : 4;
                    }
                }
                const bordaFaseClass = `borda-fase-${faseSub}`;

                return `
                    <div class="sub-annotation-item" data-source="${sourceRef}">
                        <div class="sub-annotation-card ${bordaFaseClass}">
                            <div class="${badgeClass}"
                                 title="Opções desta ideia secundária"
                                 onclick="abrirMenuSubAnotacao('${activeTabId}', ${index}, ${sIdx}, event)">
                                ${label}
                            </div>
                            <div class="sub-text-content">${textoFormatado}</div>
                            <button class="btn-expand-text" style="display:none;" onclick="TopicsManager.toggleTextExpansion(this)">
                                Ler texto completo ▾
                            </button>
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
                    : `
                    <div class="image-resize-wrapper" title="Arraste o canto inferior direito para redimensionar">
                        <img class="card-imagem" src="${item.conteudo}" alt="Recorte de Agrupamento">
                    </div>`;
                    
                const cComent = (item.tipo === 'imagem' && item.comentario)
                    ? `<div class="card-comentario"><strong>Descrição:</strong> ${escaparHTML(item.comentario)}</div>`
                    : '';
                    
                return `
                <div class="correlated-item-wrapper" data-cidx="${cIdx}"
                     draggable="true"
                     ondragstart="DnDManager.dragStart(event, '${activeTabId}', ${index}, ${cIdx})"
                     ondragover="DnDManager.dragOver(event)"
                     ondrop="DnDManager.drop(event, '${activeTabId}', ${index}, ${cIdx})"
                     ondragenter="DnDManager.dragEnter(event)"
                     ondragleave="DnDManager.dragLeave(event)"
                     ondragend="DnDManager.dragEnd(event)">
                    <div class="two-way-arrow-container correlated-drag-handle" title="Arraste para reordenar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l-4-4m4 4l4-4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <div class="annotation-card correlated-card fase-${typeof identificarFaseMetodologica === 'function' ? identificarFaseMetodologica(item.documento) : 4}">
                        <div class="card-header">
                            <div style="display:flex; gap:6px;">
                                <span class="polo-tag doc-tag">${item.documento ? escaparHTML(item.documento) : escaparHTML(item.polo)}</span>
                                ${(item.documento && item.polo && item.polo !== item.documento) ? `<span class="polo-tag ${itemTag}">${escaparHTML(item.polo)}</span>` : ''}
                            </div>
                            <span class="card-meta" style="cursor:pointer;" title="Clique p/ copiar | Shift+Clique p/ editar folha" onclick="handleMetaClick(event, '${activeTabId}', ${index}, true, ${cIdx})">${itemMeta}</span>
                        </div>
                        ${cConteudo}
                        ${cComent}
                        ${gerarBarraAcoes(true, cIdx)}
                    </div>
                </div>`;
            }).join('');
        }

        // Wrapper Master Flex atualizado para envelopar a hierarquia inteira
        const wrapperMaster = `
            <div class="timeline-item-master ${alignClass}" id="timeline-wrapper-${index}">
                <div class="main-card-wrapper">
                    <div class="annotation-number-area">
                        <div class="timeline-number" title="Nomear Tese / Legenda" onclick="abrirModalTese('${activeTabId}', ${index})">
                            ${numero}
                        </div>
                    </div>
                    <div class="annotation-card ${bgZoneClass}">
                        <div class="card-header">
                            <div style="display:flex; gap:6px;">${tagsHtml}</div>
                            <span class="card-meta" style="cursor:pointer;" title="Clique p/ copiar | Shift+Clique p/ editar folha" onclick="handleMetaClick(event, '${activeTabId}', ${index}, false)">${metaTexto}</span>
                        </div>
                        ${htmlConteudo}
                        ${htmlComentario}
                        ${gerarBarraAcoes(false, null)}
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
            let sumarioHtml = '';
            const tesesValidas = topicoAtivo.anotacoes.filter(an => an.tese && an.tese.trim() !== '');
            if (tesesValidas.length > 0) {
                sumarioHtml = `
                <div class="thesis-summary-panel">
                    <div class="thesis-legend">
                        <span class="legend-dot" style="background: var(--fase-1-color);"></span> 1. Recurso
                        <span class="legend-dot" style="background: var(--fase-2-color);"></span> 2. Gênese
                        <span class="legend-dot" style="background: var(--fase-3-color);"></span> 3. Sentença
                        <span class="legend-dot" style="background: var(--fase-4-color);"></span> 4. Provas
                    </div>`;

                topicoAtivo.anotacoes.forEach((an, idx) => {
                    if (an.tese && an.tese.trim() !== '') {
                        const fasesPresentes = new Set();
                        
                        // Coleta a fase do card pai
                        fasesPresentes.add(typeof identificarFaseMetodologica === 'function' ? identificarFaseMetodologica(an.documento) : 4);
                        
                        // Coleta fases dos itens agrupados
                        if (an.itensCorrelacionados?.length) {
                            an.itensCorrelacionados.forEach(ic => fasesPresentes.add(typeof identificarFaseMetodologica === 'function' ? identificarFaseMetodologica(ic.documento) : 4));
                        }

                        // Coleta fases das sub-anotações (resolve falha de subestimação)
                        if (an.subAnotacoes?.length) {
                            an.subAnotacoes.forEach(sub => {
                                if (sub.sourceRef !== 'main' && an.itensCorrelacionados) {
                                    const cIdx = parseInt(sub.sourceRef, 10);
                                    if (!isNaN(cIdx) && an.itensCorrelacionados[cIdx]) {
                                        fasesPresentes.add(typeof identificarFaseMetodologica === 'function' ? identificarFaseMetodologica(an.itensCorrelacionados[cIdx].documento) : 4);
                                    }
                                }
                            });
                        }

                        const cores = [];
                        if(fasesPresentes.has(1)) cores.push('var(--fase-1-bg)');
                        if(fasesPresentes.has(2)) cores.push('var(--fase-2-bg)');
                        if(fasesPresentes.has(3)) cores.push('var(--fase-3-bg)');
                        if(fasesPresentes.has(4)) cores.push('var(--fase-4-bg)');
                        
                        let bgStyle = '';
                        if(cores.length > 0) {
                            const step = 100 / cores.length;
                            const gradients = cores.map((cor, i) => `${cor} ${i * step}%, ${cor} ${(i + 1) * step}%`);
                            bgStyle = `style="background: linear-gradient(to right, ${gradients.join(', ')}), #ffffff;"`; 
                        }

                        const matureClass = fasesPresentes.size === 4 ? 'mature' : '';
                        const txt = escaparHTML(an.tese);

                        sumarioHtml += `
                            <div class="thesis-badge ${matureClass}" onclick="abrirModalTese('${activeTabId}', ${idx})">
                                <div class="thesis-badge-inner" ${bgStyle}>
                                    <span class="num">${idx + 1}</span> 
                                    <span class="texto-tese">${txt}</span>
                                </div>
                            </div>`;
                    }
                });
                sumarioHtml += '</div>';
            }
            const cardsHTML = topicoAtivo.anotacoes.map(criarCard).join('');
            // Injetamos o SVG absoluto no fundo do container e o sumário acima
            contentEl.innerHTML = sumarioHtml + `
                <div class="timeline-container" id="timeline-container">
                    <svg id="connections-canvas"></svg>
                    ${cardsHTML}
                </div>`;
                
            // Avalia expansão e redesenha conexões
            requestAnimationFrame(() => {
                document.querySelectorAll('.sub-text-content').forEach(el => {
                    const btn = el.parentElement.querySelector('.btn-expand-text');
                    // Guarda de segurança para evitar erro caso o DOM perca o botão
                    if (btn && el.scrollHeight > el.clientHeight) {
                        btn.style.display = 'inline-flex';
                    }
                });
                
                // Dispara o recálculo dos SVGs durante o redimensionamento nativo das imagens
                document.querySelectorAll('.image-resize-wrapper').forEach(wrapper => {
                    wrapper.addEventListener('mouseup', () => desenharConexoes());
                    wrapper.addEventListener('mouseleave', () => desenharConexoes());
                });

                desenharConexoes();
            });
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
            const mainCard = master.querySelector('.main-card-wrapper > .annotation-card');
            const subItems = master.querySelectorAll('.sub-annotation-item');

            if (!mainCard || subItems.length === 0) return;

            const containerRect = container.getBoundingClientRect();
            const isRightAligned = master.classList.contains('align-right');

            subItems.forEach(subItem => {
                const subCard = subItem.querySelector('.sub-annotation-card');
                const subRect = subCard.getBoundingClientRect();
                
                // 1. Identifica a origem baseada no data-source
                const sourceRef = subItem.dataset.source;
                let sourceCard = mainCard; 
                
                if (sourceRef !== 'main') {
                    const correlatedWrapper = master.querySelector(`.correlated-item-wrapper[data-cidx="${sourceRef}"]`);
                    if (correlatedWrapper) {
                        sourceCard = correlatedWrapper.querySelector('.annotation-card');
                    }
                }
                
                const sourceRect = sourceCard.getBoundingClientRect();

                // 2. Coordenadas X ancoradas na face correspondente
                const startX = isRightAligned
                    ? sourceRect.left  - containerRect.left
                    : sourceRect.right - containerRect.left;

                const endX = isRightAligned
                    ? subRect.right - containerRect.left
                    : subRect.left  - containerRect.left;

                // 3. Âncoras verticais cirúrgicas no centro do card gerador específico
                const startY = (sourceRect.top + sourceRect.height / 2) - containerRect.top;
                const endY   = (subRect.top + subRect.height / 2) - containerRect.top;
                
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

    /**
     * Alterna a expansão do texto longo e re-desenha as linhas dinamicamente
     */
    function toggleTextExpansion(btn) {
        const content = btn.parentElement.querySelector('.sub-text-content');
        if (!content) return;

        const isExpanded = content.classList.toggle('expanded');
        btn.innerHTML = isExpanded ? 'Ocultar detalhes ▴' : 'Ler texto completo ▾';
        
        // Garante que as linhas acompanhem o redesenho pós repintura da scrollbar
        requestAnimationFrame(() => desenharConexoes());
        setTimeout(() => desenharConexoes(), 50); 
    }

    // API pública do módulo
    return {
        obterCor,
        renderizarFichario,
        getActiveTabId: () => activeTabId,
        escaparHTML,
        toggleTextExpansion
    };

})();
